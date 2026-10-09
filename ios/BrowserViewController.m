#import "BrowserViewController.h"
#import "AppDelegate.h"

static NSString *const kVDHandler = @"vd";
static const NSInteger kMaxTabs = 10;          // Q016
static const CGFloat kChromeHeight = 460.0;    // bottom overlay; tune with UI
static NSString *const kJobMetaDefaultsKey = @"vd.jobmeta";   // Stage E: job title/ext/url across relaunch
static NSString *const kBackgroundSessionID = @"com.maurinex.videodownloader.bg";

@interface BrowserViewController () <WKNavigationDelegate, WKScriptMessageHandler, NSURLSessionDownloadDelegate>
@property (nonatomic, strong) NSMutableArray<WKWebView *> *tabs;
@property (nonatomic, assign) NSInteger activeTabIndex;
@property (nonatomic, strong) ChromeWebView *chrome;
@property (nonatomic, strong) NSURLSession *downloadSession;
@property (nonatomic, strong) NSMutableDictionary<NSNumber *, NSString *> *taskJobMap;
@property (nonatomic, strong) NSMutableDictionary<NSString *, NSURLSessionDownloadTask *> *jobTaskMap;
// Stage E: per-job metadata (title, ext, url, resumeData) kept across relaunches.
@property (nonatomic, strong) NSMutableDictionary<NSString *, NSDictionary *> *jobMetaMap;
// Jobs the UI asked to pause — progress events are suppressed for these.
@property (nonatomic, strong) NSMutableDictionary<NSString *, NSNumber *> *pausedJobs;
// Speed estimation (EMA) per job.
@property (nonatomic, strong) NSMutableDictionary<NSString *, NSNumber *> *lastTickAt;
@property (nonatomic, strong) NSMutableDictionary<NSString *, NSNumber *> *lastTickBytes;
@property (nonatomic, strong) NSMutableDictionary<NSString *, NSNumber *> *lastSpeed;
@end

@implementation BrowserViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = UIColor.blackColor;
    self.tabs = [NSMutableArray array];
    self.activeTabIndex = 0;
    self.taskJobMap = [NSMutableDictionary dictionary];
    self.jobTaskMap = [NSMutableDictionary dictionary];
    self.jobMetaMap = [NSMutableDictionary dictionary];
    self.pausedJobs = [NSMutableDictionary dictionary];
    self.lastTickAt = [NSMutableDictionary dictionary];
    self.lastTickBytes = [NSMutableDictionary dictionary];
    self.lastSpeed = [NSMutableDictionary dictionary];

    NSDictionary *savedMeta = [[NSUserDefaults standardUserDefaults] dictionaryForKey:kJobMetaDefaultsKey];
    if (savedMeta) {
        [self.jobMetaMap addEntriesFromDictionary:savedMeta];
    }

    // Background session configuration for continuous downloads (Q020)
    NSURLSessionConfiguration *config = [NSURLSessionConfiguration backgroundSessionConfigurationWithIdentifier:kBackgroundSessionID];
    config.allowsCellularAccess = YES;
    // Rebind surviving background tasks after relaunch so progress and file
    // moves keep working (D048 rehydration).
    __weak typeof(self) weakSelf = self;
    self.downloadSession = [NSURLSession sessionWithConfiguration:config
                                                         delegate:self
                                                    delegateQueue:[NSOperationQueue mainQueue]];
    [self.downloadSession getAllTasksWithCompletionHandler:^(NSArray<__kindof NSURLSessionTask *> *tasks) {
        dispatch_async(dispatch_get_main_queue(), ^{
            for (NSURLSessionTask *task in tasks) {
                NSString *jobId = task.taskDescription;
                if (!jobId.length) continue;
                weakSelf.taskJobMap[@(task.taskIdentifier)] = jobId;
                weakSelf.jobTaskMap[jobId] = (NSURLSessionDownloadTask *)task;
                if (task.state == NSURLSessionTaskStateSuspended) {
                    [task resume];
                }
                if (!weakSelf.pausedJobs[jobId]) {
                    [weakSelf sendToChrome:@{
                        @"source": @"vd-native",
                        @"type": @"download-progress",
                        @"payload": @{ @"id": jobId, @"status": @"downloading" },
                    }];
                }
            }
        });
    }];

    [self setupBrowsingTab];
    [self setupChrome];
}

#pragma mark - Setup

- (WKWebViewConfiguration *)browsingConfiguration {
    WKWebViewConfiguration *config = [WKWebViewConfiguration new];
    config.allowsInlineMediaPlayback = YES;
    config.mediaTypesRequiringUserActionForPlayback = WKAudiovisualMediaTypeNone;

    NSString *snifferPath = [NSBundle.mainBundle pathForResource:@"Sniffer" ofType:@"js"];
    NSString *sniffer = snifferPath ? [NSString stringWithContentsOfFile:snifferPath
                                                               encoding:NSUTF8StringEncoding
                                                                  error:NULL] : nil;
    if (sniffer.length) {
        WKUserScript *script = [[WKUserScript alloc] initWithSource:sniffer
                                                      injectionTime:WKUserScriptInjectionTimeAtDocumentEnd
                                                   forMainFrameOnly:YES];
        [config.userContentController addUserScript:script];
    }
    // Handler removed in dealloc per webview (cycle break).
    [config.userContentController addScriptMessageHandler:self name:kVDHandler];
    return config;
}

- (void)setupBrowsingTab {
    WKWebView *web = [[WKWebView alloc] initWithFrame:self.view.bounds
                                        configuration:[self browsingConfiguration]];
    web.navigationDelegate = self;
    web.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    [self.view addSubview:web];
    [self.tabs addObject:web];
    [web loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:@"about:blank"]]];
}

- (void)setupChrome {
    WKWebViewConfiguration *config = [WKWebViewConfiguration new];
    [config.userContentController addScriptMessageHandler:self name:kVDHandler];

    CGRect frame = CGRectMake(0, 0, self.view.bounds.size.width, kChromeHeight);
    self.chrome = [[ChromeWebView alloc] initWithFrame:frame configuration:config];

    NSString *wwwIndex = [NSBundle.mainBundle pathForResource:@"index" ofType:@"html" inDirectory:@"www"];
    if (!wwwIndex) {
        wwwIndex = [NSBundle.mainBundle pathForResource:@"index" ofType:@"html"];
    }
    if (wwwIndex) {
        [self.chrome loadFileURL:[NSURL fileURLWithPath:wwwIndex]
       allowingReadAccessToURL:[NSURL fileURLWithPath:wwwIndex.stringByDeletingLastPathComponent]];
    }

    self.chrome.translatesAutoresizingMaskIntoConstraints = NO;
    [self.view addSubview:self.chrome];
    [NSLayoutConstraint activateConstraints:@[
        [self.chrome.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor],
        [self.chrome.trailingAnchor constraintEqualToAnchor:self.view.trailingAnchor],
        [self.chrome.bottomAnchor constraintEqualToAnchor:self.view.bottomAnchor],
        [self.chrome.heightAnchor constraintEqualToConstant:kChromeHeight],
    ]];
}

- (void)dealloc {
    for (WKWebView *web in _tabs) {
        [web.configuration.userContentController removeScriptMessageHandlerForName:kVDHandler];
        [web stopLoading];
    }
    [_chrome.configuration.userContentController removeScriptMessageHandlerForName:kVDHandler];
}

#pragma mark - Tabs (Q016, Q046)

- (WKWebView *)activeTab {
    if (self.activeTabIndex < 0 || self.activeTabIndex >= (NSInteger)self.tabs.count) {
        return self.tabs.firstObject;
    }
    return self.tabs[self.activeTabIndex];
}

- (void)selectTabAtIndex:(NSInteger)index {
    if (index < 0 || index >= (NSInteger)self.tabs.count || index == self.activeTabIndex) return;
    WKWebView *previous = self.tabs[self.activeTabIndex];
    WKWebView *next = self.tabs[index];
    [previous removeFromSuperview];
    [self.view insertSubview:next belowSubview:self.chrome];
    next.frame = self.view.bounds;
    self.activeTabIndex = index;
}

- (void)addTabWithURL:(NSString *)urlString {
    if ((NSInteger)self.tabs.count >= kMaxTabs) return;
    WKWebView *web = [[WKWebView alloc] initWithFrame:self.view.bounds
                                        configuration:[self browsingConfiguration]];
    web.navigationDelegate = self;
    [self.view insertSubview:web belowSubview:self.chrome];
    [self.tabs addObject:web];
    [self selectTabAtIndex:(NSInteger)self.tabs.count - 1];
    if (urlString.length) {
        [web loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:urlString]]];
    }
}

- (void)closeTabAtIndex:(NSInteger)index {
    if (self.tabs.count <= 1 || index < 0 || index >= (NSInteger)self.tabs.count) return;
    BOOL wasActive = (index == self.activeTabIndex);
    WKWebView *target = self.tabs[index];
    [target stopLoading];
    [target.configuration.userContentController removeScriptMessageHandlerForName:kVDHandler];
    [target removeFromSuperview];
    [self.tabs removeObjectAtIndex:index];

    if (index < self.activeTabIndex) {
        self.activeTabIndex -= 1;
    }
    if (self.activeTabIndex >= (NSInteger)self.tabs.count) {
        self.activeTabIndex = self.tabs.count - 1;
    }
    if (wasActive) {
        WKWebView *next = self.tabs[self.activeTabIndex];
        next.frame = self.view.bounds;
        [self.view insertSubview:next belowSubview:self.chrome];
    }
}

#pragma mark - Native -> chrome (bridge.ts envelope)

- (void)sendToChrome:(NSDictionary *)envelope {
    NSData *data = [NSJSONSerialization dataWithJSONObject:envelope options:0 error:NULL];
    if (!data) return;
    NSString *json = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    NSString *js = [NSString stringWithFormat:@"window.postMessage(%@, '*');", json];
    dispatch_async(dispatch_get_main_queue(), ^{
        [self.chrome evaluateJavaScript:js completionHandler:nil];
    });
}

- (void)forwardDetection:(NSDictionary *)body fromWebView:(WKWebView *)web {
    if (web != [self activeTab]) return; // Q046: active tab only
    NSDictionary *payload = body[@"payload"];
    if (![payload isKindOfClass:NSDictionary.class]) return;
    [self sendToChrome:@{
        @"source": @"vd-native",
        @"type": @"detect",
        @"payload": payload,
    }];
}

#pragma mark - Storage & Downloads (Q013, Q020, Q031, Q042, Q070)

- (NSString *)privateDownloadDirectory {
    // Q031-B: Private container (Library/), not Files-app Documents
    NSString *libDir = NSSearchPathForDirectoriesInDomains(NSLibraryDirectory, NSUserDomainMask, YES).firstObject;
    NSString *downloads = [libDir stringByAppendingPathComponent:@"Downloads"];
    if (![NSFileManager.defaultManager fileExistsAtPath:downloads]) {
        [NSFileManager.defaultManager createDirectoryAtPath:downloads withIntermediateDirectories:YES attributes:nil error:NULL];
    }
    return downloads;
}

#pragma mark Job metadata (Stage E)

- (void)persistJobMeta {
    [[NSUserDefaults standardUserDefaults] setObject:self.jobMetaMap forKey:kJobMetaDefaultsKey];
}

- (void)setJobMeta:(NSDictionary *)meta forID:(NSString *)jobId {
    if (!jobId) return;
    if (meta) {
        self.jobMetaMap[jobId] = meta;
    } else {
        [self.jobMetaMap removeObjectForKey:jobId];
    }
    [self persistJobMeta];
}

- (NSString *)extensionForJob:(NSString *)jobId {
    NSString *ext = self.jobMetaMap[jobId][@"ext"];
    return ext.length ? ext : @"mp4";
}

- (void)clearJobTracking:(NSString *)jobId {
    [self.pausedJobs removeObjectForKey:jobId];
    [self.lastTickAt removeObjectForKey:jobId];
    [self.lastTickBytes removeObjectForKey:jobId];
    [self.lastSpeed removeObjectForKey:jobId];
    [self setJobMeta:nil forID:jobId];
}

#pragma mark Start / pause / resume / cancel / remove

- (void)startNativeDownloadWithID:(NSString *)jobId urlString:(NSString *)urlString title:(NSString *)title ext:(NSString *)ext {
    NSURL *url = [NSURL URLWithString:urlString];
    if (!url || !jobId) return;

    NSString *useExt = ext.length ? ext : @"mp4";

    // Surviving metadata from a previous attempt (relaunch or retry) keeps its
    // resumeData; everything else is refreshed from this request.
    NSMutableDictionary *meta = [NSMutableDictionary dictionaryWithDictionary:self.jobMetaMap[jobId] ?: @{}];
    meta[@"url"] = urlString;
    meta[@"ext"] = useExt;
    if (title.length) meta[@"title"] = title;
    [self setJobMeta:meta forID:jobId];
    [self.pausedJobs removeObjectForKey:jobId];

    NSURLSessionDownloadTask *task = nil;
    NSData *resumeData = meta[@"resumeData"];
    if ([resumeData isKindOfClass:NSData.class] && resumeData.length) {
        // D006: pick up where the failed attempt stopped.
        task = [self.downloadSession downloadTaskWithResumeData:resumeData];
        [meta removeObjectForKey:@"resumeData"];
        [self setJobMeta:meta forID:jobId];
    } else {
        NSMutableURLRequest *req = [NSMutableURLRequest requestWithURL:url];
        // Forward Safari UA and Referer per Q059
        [req setValue:@"Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" forHTTPHeaderField:@"User-Agent"];
        if ([self activeTab].URL.absoluteString) {
            [req setValue:[self activeTab].URL.absoluteString forHTTPHeaderField:@"Referer"];
        }
        task = [self.downloadSession downloadTaskWithRequest:req];
    }

    task.taskDescription = jobId;   // survives relaunch for rehydration
    self.taskJobMap[@(task.taskIdentifier)] = jobId;
    self.jobTaskMap[jobId] = task;
    self.lastTickAt[jobId] = nil;
    self.lastTickBytes[jobId] = nil;
    self.lastSpeed[jobId] = nil;
    [task resume];
}

- (void)pauseNativeDownloadWithID:(NSString *)jobId {
    if (!jobId) return;
    self.pausedJobs[jobId] = @YES;
    NSURLSessionDownloadTask *task = self.jobTaskMap[jobId];
    if (task && task.state == NSURLSessionTaskStateRunning) {
        [task suspend];
    }
}

- (void)resumeNativeDownloadWithID:(NSString *)jobId {
    if (!jobId) return;
    [self.pausedJobs removeObjectForKey:jobId];

    NSURLSessionDownloadTask *task = self.jobTaskMap[jobId];
    if (task && task.state != NSURLSessionTaskStateCompleted) {
        [task resume];
        [self sendToChrome:@{
            @"source": @"vd-native",
            @"type": @"download-progress",
            @"payload": @{ @"id": jobId, @"status": @"downloading" },
        }];
        return;
    }

    // Task is gone (relaunch/eviction) — restart from stored metadata.
    NSDictionary *meta = self.jobMetaMap[jobId];
    NSString *url = meta[@"url"];
    if (url.length) {
        [self startNativeDownloadWithID:jobId urlString:url title:meta[@"title"] ext:meta[@"ext"]];
        [self sendToChrome:@{
            @"source": @"vd-native",
            @"type": @"download-progress",
            @"payload": @{ @"id": jobId, @"status": @"downloading" },
        }];
    }
}

- (void)cancelNativeDownloadWithID:(NSString *)jobId {
    NSURLSessionDownloadTask *task = self.jobTaskMap[jobId];
    if (task) {
        // Drop the mapping first so didCompleteWithError ignores the cancel.
        [self.taskJobMap removeObjectForKey:@(task.taskIdentifier)];
        [task cancel];
        [self.jobTaskMap removeObjectForKey:jobId];
    }
    [self clearJobTracking:jobId];
}

- (void)removeNativeDownloadWithID:(NSString *)jobId {
    if (!jobId) return;
    NSURLSessionDownloadTask *task = self.jobTaskMap[jobId];
    if (task) {
        [self.taskJobMap removeObjectForKey:@(task.taskIdentifier)];
        [task cancel];
        [self.jobTaskMap removeObjectForKey:jobId];
    }
    // Delete the saved file(s): current ext plus the legacy .mp4 name.
    NSString *dir = [self privateDownloadDirectory];
    NSSet *candidates = [NSSet setWithObjects:
                         [NSString stringWithFormat:@"%@.%@", jobId, [self extensionForJob:jobId]],
                         [NSString stringWithFormat:@"%@.mp4", jobId],
                         [NSString stringWithFormat:@"%@.m4a", jobId], nil];
    for (NSString *name in candidates) {
        NSString *path = [dir stringByAppendingPathComponent:name];
        if ([NSFileManager.defaultManager fileExistsAtPath:path]) {
            [NSFileManager.defaultManager removeItemAtPath:path error:NULL];
        }
    }
    [self clearJobTracking:jobId];
    [self sendStorageInfo];
}

#pragma mark Storage info (D038 file sweep, D018 free space)

- (void)sendStorageInfo {
    NSString *dir = [self privateDownloadDirectory];
    NSArray<NSString *> *names = [NSFileManager.defaultManager contentsOfDirectoryAtPath:dir error:NULL] ?: @[];
    NSMutableArray *files = [NSMutableArray arrayWithCapacity:names.count];
    for (NSString *name in names) {
        NSDictionary *attrs = [NSFileManager.defaultManager attributesOfItemAtPath:[dir stringByAppendingPathComponent:name] error:NULL];
        [files addObject:@{
            @"name": name,
            @"sizeBytes": attrs[NSFileSize] ?: @0,
        }];
    }
    NSNumber *free = nil;
    NSDictionary *fsAttrs = [NSFileManager.defaultManager attributesOfFileSystemForPath:NSHomeDirectory() error:NULL];
    if ([fsAttrs[NSFileSystemFreeSize] isKindOfClass:NSNumber.class]) {
        free = fsAttrs[NSFileSystemFreeSize];
    }
    [self sendToChrome:@{
        @"source": @"vd-native",
        @"type": @"storage-info",
        @"payload": @{
            @"files": files,
            @"freeBytes": free ?: @0,
        }
    }];
}

#pragma mark - NSURLSessionDownloadDelegate (Q013, Q019, Q020)

- (void)URLSession:(NSURLSession *)session downloadTask:(NSURLSessionDownloadTask *)downloadTask
                                           didWriteData:(int64_t)bytesWritten
                                      totalBytesWritten:(int64_t)totalBytesWritten
                              totalBytesExpectedToWrite:(int64_t)totalBytesExpectedToWrite {
    NSString *jobId = self.taskJobMap[@(downloadTask.taskIdentifier)];
    if (!jobId) return;
    // Paused jobs stay paused in the UI even if suspend() is a no-op for
    // background-session tasks — just stop forwarding events.
    if (self.pausedJobs[jobId]) return;

    // Speed: EMA over throttled ticks (>= 250 ms apart).
    NSTimeInterval now = NSDate.date.timeIntervalSince1970;
    NSNumber *prevAt = self.lastTickAt[jobId];
    NSNumber *prevBytes = self.lastTickBytes[jobId];
    long long speed = self.lastSpeed[jobId].longLongValue;
    if (prevAt && prevBytes && now - prevAt.doubleValue >= 0.25) {
        double dt = now - prevAt.doubleValue;
        long long raw = (long long)((totalBytesWritten - prevBytes.longLongValue) / dt);
        if (raw < 0) raw = 0;
        speed = (long long)(speed * 0.7 + raw * 0.3);
        self.lastSpeed[jobId] = @(speed);
        self.lastTickAt[jobId] = @(now);
        self.lastTickBytes[jobId] = @(totalBytesWritten);
    } else if (!prevAt) {
        self.lastTickAt[jobId] = @(now);
        self.lastTickBytes[jobId] = @(totalBytesWritten);
    } else {
        // Too soon since the last send — skip this callback entirely.
        return;
    }

    long long expected = totalBytesExpectedToWrite > 0 ? totalBytesExpectedToWrite : 0;
    [self sendToChrome:@{
        @"source": @"vd-native",
        @"type": @"download-progress",
        @"payload": @{
            @"id": jobId,
            @"receivedBytes": @(totalBytesWritten),
            @"totalBytes": @(expected),
            @"speedBps": @(speed),
            @"stage": @"downloading",
            @"status": @"downloading",
        }
    }];
}

- (void)URLSession:(NSURLSession *)session downloadTask:(NSURLSessionDownloadTask *)downloadTask
                              didFinishDownloadingToURL:(NSURL *)location {
    NSString *jobId = self.taskJobMap[@(downloadTask.taskIdentifier)];
    if (!jobId) return;

    NSString *destDir = [self privateDownloadDirectory];
    NSString *filename = [NSString stringWithFormat:@"%@.%@", jobId, [self extensionForJob:jobId]];
    NSString *destPath = [destDir stringByAppendingPathComponent:filename];

    // A retry after a partial move can leave a stale file behind.
    if ([NSFileManager.defaultManager fileExistsAtPath:destPath]) {
        [NSFileManager.defaultManager removeItemAtPath:destPath error:NULL];
    }
    [NSFileManager.defaultManager moveItemAtURL:location toURL:[NSURL fileURLWithPath:destPath] error:NULL];

    [self clearJobTracking:jobId];

    [self sendToChrome:@{
        @"source": @"vd-native",
        @"type": @"download-progress",
        @"payload": @{
            @"id": jobId,
            @"status": @"complete",
            @"filePath": destPath,
        }
    }];
    // Refresh free space + file-presence sweep right after a save (D018, D038).
    [self sendStorageInfo];
}

- (void)URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task didCompleteWithError:(NSError *)error {
    NSString *jobId = self.taskJobMap[@(task.taskIdentifier)];
    if (!jobId || !error) return;
    // User-initiated cancel already reported its own state (or is a pause).
    if ([error.domain isEqualToString:NSURLErrorDomain] && error.code == NSURLErrorCancelled) return;
    if (self.pausedJobs[jobId]) return;

    // Keep resume data so the next retry continues from this byte offset (D006).
    NSData *resumeData = error.userInfo[NSURLSessionDownloadTaskResumeData];
    NSDictionary *meta = self.jobMetaMap[jobId];
    if ([resumeData isKindOfClass:NSData.class] && resumeData.length && meta) {
        NSMutableDictionary *next = [NSMutableDictionary dictionaryWithDictionary:meta];
        next[@"resumeData"] = resumeData;
        [self setJobMeta:next forID:jobId];
    }

    [self sendToChrome:@{
        @"source": @"vd-native",
        @"type": @"download-progress",
        @"payload": @{
            @"id": jobId,
            @"status": @"error",
            @"error": error.localizedDescription ?: @"Download failed",
        }
    }];
}

- (void)URLSessionDidFinishEventsForBackgroundURLSession:(NSURLSession *)session {
    dispatch_async(dispatch_get_main_queue(), ^{
        AppDelegate *app = (AppDelegate *)UIApplication.sharedApplication.delegate;
        if ([app isKindOfClass:AppDelegate.class] && app.backgroundSessionCompletionHandler) {
            app.backgroundSessionCompletionHandler();
            app.backgroundSessionCompletionHandler = nil;
        }
    });
}

#pragma mark - Share & Export (Q042, Q070)

- (void)shareFileAtPath:(NSString *)path {
    if (!path.length || ![NSFileManager.defaultManager fileExistsAtPath:path]) return;
    NSURL *fileURL = [NSURL fileURLWithPath:path];
    UIActivityViewController *activity = [[UIActivityViewController alloc] initWithActivityItems:@[fileURL] applicationActivities:nil];
    if (UIDevice.currentDevice.userInterfaceIdiom == UIUserInterfaceIdiomPad) {
        activity.popoverPresentationController.sourceView = self.view;
        activity.popoverPresentationController.sourceRect = CGRectMake(self.view.bounds.size.width/2, self.view.bounds.size.height/2, 1, 1);
    }
    [self presentViewController:activity animated:YES completion:nil];
}

- (void)exportAllFiles {
    NSString *dir = [self privateDownloadDirectory];
    NSArray *files = [NSFileManager.defaultManager contentsOfDirectoryAtPath:dir error:NULL];
    NSMutableArray *items = [NSMutableArray array];
    for (NSString *file in files) {
        [items addObject:[NSURL fileURLWithPath:[dir stringByAppendingPathComponent:file]]];
    }
    if (items.count == 0) return;
    UIActivityViewController *activity = [[UIActivityViewController alloc] initWithActivityItems:items applicationActivities:nil];
    if (UIDevice.currentDevice.userInterfaceIdiom == UIUserInterfaceIdiomPad) {
        activity.popoverPresentationController.sourceView = self.view;
        activity.popoverPresentationController.sourceRect = CGRectMake(self.view.bounds.size.width/2, self.view.bounds.size.height/2, 1, 1);
    }
    [self presentViewController:activity animated:YES completion:nil];
}

#pragma mark - Clear Browsing Data (Q055)

- (void)clearBrowsingData {
    NSSet *dataTypes = [WKWebsiteDataStore allWebsiteDataTypes];
    NSDate *dateFrom = [NSDate dateWithTimeIntervalSince1970:0];
    [[WKWebsiteDataStore defaultDataStore] removeDataOfTypes:dataTypes modifiedSince:dateFrom completionHandler:^{
        NSLog(@"Browsing data cleared successfully.");
    }];
}

#pragma mark - chrome -> native

- (void)userContentController:(WKUserContentController *)controller
      didReceiveScriptMessage:(WKScriptMessage *)message {
    if (![message.name isEqualToString:kVDHandler]) return;
    NSDictionary *body = [message.body isKindOfClass:NSDictionary.class] ? message.body : nil;
    NSString *type = [body[@"type"] isKindOfClass:NSString.class] ? body[@"type"] : nil;
    NSDictionary *payload = [body[@"payload"] isKindOfClass:NSDictionary.class] ? body[@"payload"] : nil;

    if ([type isEqualToString:@"detect"]) {
        WKWebView *sender = message.webView;
        if (sender && sender == [self activeTab]) {
            [self forwardDetection:body fromWebView:sender];
        }
        return;
    }

    if ([type isEqualToString:@"navigate"]) {
        NSString *url = payload[@"url"];
        if (url.length) {
            NSURL *parsed = [NSURL URLWithString:url];
            if (parsed) [[self activeTab] loadRequest:[NSURLRequest requestWithURL:parsed]];
        }
    } else if ([type isEqualToString:@"back"]) {
        [[self activeTab] goBack];
    } else if ([type isEqualToString:@"forward"]) {
        [[self activeTab] goForward];
    } else if ([type isEqualToString:@"reload"]) {
        [[self activeTab] reload];
    } else if ([type isEqualToString:@"newTab"]) {
        NSString *url = payload[@"url"];
        [self addTabWithURL:url];
    } else if ([type isEqualToString:@"closeTab"]) {
        NSNumber *index = [payload[@"index"] isKindOfClass:NSNumber.class] ? payload[@"index"] : nil;
        [self closeTabAtIndex:index ? index.integerValue : self.activeTabIndex];
    } else if ([type isEqualToString:@"switchTab"]) {
        NSNumber *index = [payload[@"index"] isKindOfClass:NSNumber.class] ? payload[@"index"] : nil;
        if (index) [self selectTabAtIndex:index.integerValue];
    } else if ([type isEqualToString:@"startDownload"]) {
        [self startNativeDownloadWithID:payload[@"id"] urlString:payload[@"url"] title:payload[@"title"] ext:payload[@"ext"]];
    } else if ([type isEqualToString:@"pauseDownload"]) {
        [self pauseNativeDownloadWithID:payload[@"id"]];
    } else if ([type isEqualToString:@"resumeDownload"]) {
        [self resumeNativeDownloadWithID:payload[@"id"]];
    } else if ([type isEqualToString:@"cancelDownload"]) {
        [self cancelNativeDownloadWithID:payload[@"id"]];
    } else if ([type isEqualToString:@"removeDownload"]) {
        [self removeNativeDownloadWithID:payload[@"id"]];
    } else if ([type isEqualToString:@"useCellular"]) {
        // Cellular is always allowed (config.allowsCellularAccess = YES); the
        // action exists for future Wi-Fi-only gating — acknowledge no-op.
    } else if ([type isEqualToString:@"storageInfo"]) {
        [self sendStorageInfo];
    } else if ([type isEqualToString:@"shareFile"]) {
        [self shareFileAtPath:payload[@"filePath"]];
    } else if ([type isEqualToString:@"exportAll"]) {
        [self exportAllFiles];
    } else if ([type isEqualToString:@"clearBrowsingData"]) {
        [self clearBrowsingData];
    }
}

@end
