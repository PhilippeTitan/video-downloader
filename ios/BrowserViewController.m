#import "BrowserViewController.h"

static NSString *const kVDHandler = @"vd";
static NSString *const kVDScheme = @"vdapp";
static const NSInteger kMaxTabs = 10;          // Q016
static const CGFloat kChromeHeight = 460.0;    // bottom overlay; tune with UI

static NSString *VDMimeForExtension(NSString *ext) {
    static NSDictionary<NSString *, NSString *> *map;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        map = @{
            @"html": @"text/html",
            @"js": @"application/javascript",
            @"css": @"text/css",
            @"svg": @"image/svg+xml",
            @"json": @"application/json",
            @"png": @"image/png",
            @"jpg": @"image/jpeg",
            @"jpeg": @"image/jpeg",
            @"ico": @"image/x-icon",
            @"map": @"application/json",
            @"woff": @"font/woff",
            @"woff2": @"font/woff2",
        };
    });
    return map[ext.lowercaseString] ?: @"application/octet-stream";
}

@interface BrowserViewController () <WKNavigationDelegate, WKScriptMessageHandler, WKURLSchemeHandler, NSURLSessionDownloadDelegate>
@property (nonatomic, strong) NSMutableArray<WKWebView *> *tabs;
@property (nonatomic, assign) NSInteger activeTabIndex;
@property (nonatomic, strong) ChromeWebView *chrome;
@property (nonatomic, strong) NSURLSession *downloadSession;
@property (nonatomic, strong) NSMutableDictionary<NSNumber *, NSString *> *taskJobMap;
@property (nonatomic, strong) NSMutableDictionary<NSString *, NSURLSessionDownloadTask *> *jobTaskMap;
@end

@implementation BrowserViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = UIColor.blackColor;
    self.tabs = [NSMutableArray array];
    self.activeTabIndex = 0;
    self.taskJobMap = [NSMutableDictionary dictionary];
    self.jobTaskMap = [NSMutableDictionary dictionary];

    // Background session configuration for continuous downloads (Q020)
    NSURLSessionConfiguration *config = [NSURLSessionConfiguration backgroundSessionConfigurationWithIdentifier:@"com.maurinex.videodownloader.bg"];
    config.allowsCellularAccess = YES;
    self.downloadSession = [NSURLSession sessionWithConfiguration:config delegate:self delegateQueue:[NSOperationQueue mainQueue]];

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
    // file:// blocks ES modules (CORS); serve the bundle same-origin instead.
    [config setURLSchemeHandler:self forScheme:kVDScheme];

    CGRect frame = CGRectMake(0, 0, self.view.bounds.size.width, kChromeHeight);
    self.chrome = [[ChromeWebView alloc] initWithFrame:frame configuration:config];
    [self.chrome loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:@"vdapp://local/index.html"]]];

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

- (void)startNativeDownloadWithID:(NSString *)jobId urlString:(NSString *)urlString title:(NSString *)title ext:(NSString *)ext {
    NSURL *url = [NSURL URLWithString:urlString];
    if (!url || !jobId) return;

    NSMutableURLRequest *req = [NSMutableURLRequest requestWithURL:url];
    // Forward Safari UA and Referer per Q059
    [req setValue:@"Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" forHTTPHeaderField:@"User-Agent"];
    if ([self activeTab].URL.absoluteString) {
        [req setValue:[self activeTab].URL.absoluteString forHTTPHeaderField:@"Referer"];
    }

    NSURLSessionDownloadTask *task = [self.downloadSession downloadTaskWithRequest:req];
    self.taskJobMap[@(task.taskIdentifier)] = jobId;
    self.jobTaskMap[jobId] = task;
    [task resume];
}

- (void)cancelNativeDownloadWithID:(NSString *)jobId {
    NSURLSessionDownloadTask *task = self.jobTaskMap[jobId];
    if (task) {
        [task cancel];
        [self.jobTaskMap removeObjectForKey:jobId];
    }
}

#pragma mark - WKURLSchemeHandler (bundle asset serving)

- (void)webView:(WKWebView *)webView startURLSchemeTask:(id<WKURLSchemeTask>)task {
    NSString *path = task.request.URL.path;
    if (path.length == 0 || [path isEqualToString:@"/"]) {
        path = @"/index.html";
    }
    NSString *rel = [path hasPrefix:@"/"] ? [path substringFromIndex:1] : path;
    if ([rel containsString:@".."]) {
        [task didFailWithError:[NSError errorWithDomain:@"vdapp" code:400
            userInfo:@{NSLocalizedDescriptionKey: @"Bad path"}]];
        return;
    }

    NSString *root = NSBundle.mainBundle.bundlePath;
    NSString *candidate = [root stringByAppendingPathComponent:rel];
    if (![NSFileManager.defaultManager fileExistsAtPath:candidate]) {
        candidate = [[root stringByAppendingPathComponent:@"www"] stringByAppendingPathComponent:rel];
    }

    NSData *data = [NSData dataWithContentsOfFile:candidate];
    if (!data) {
        [task didFailWithError:[NSError errorWithDomain:@"vdapp" code:404
            userInfo:@{NSLocalizedDescriptionKey: @"Not found"}]];
        return;
    }

    NSString *mime = VDMimeForExtension(candidate.pathExtension);
    NSURLResponse *response = [[NSURLResponse alloc] initWithURL:task.request.URL
                                                        MIMEType:mime
                                           expectedContentLength:data.length
                                                textEncodingName:@"utf-8"];
    [task didReceiveResponse:response];
    [task didReceiveData:data];
    [task didFinish];
}

- (void)webView:(WKWebView *)webView stopURLSchemeTask:(id<WKURLSchemeTask>)task {
}

#pragma mark - NSURLSessionDownloadDelegate (Q013, Q019, Q020)

- (void)URLSession:(NSURLSession *)session downloadTask:(NSURLSessionDownloadTask *)downloadTask
                                           didWriteData:(int64_t)bytesWritten
                                      totalBytesWritten:(int64_t)totalBytesWritten
                              totalBytesExpectedToWrite:(int64_t)totalBytesExpectedToWrite {
    NSString *jobId = self.taskJobMap[@(downloadTask.taskIdentifier)];
    if (!jobId) return;

    [self sendToChrome:@{
        @"source": @"vd-native",
        @"type": @"download-progress",
        @"payload": @{
            @"id": jobId,
            @"receivedBytes": @(totalBytesWritten),
            @"totalBytes": @(totalBytesExpectedToWrite),
            @"status": @"downloading",
        }
    }];
}

- (void)URLSession:(NSURLSession *)session downloadTask:(NSURLSessionDownloadTask *)downloadTask
                              didFinishDownloadingToURL:(NSURL *)location {
    NSString *jobId = self.taskJobMap[@(downloadTask.taskIdentifier)];
    if (!jobId) return;

    NSString *destDir = [self privateDownloadDirectory];
    NSString *filename = [NSString stringWithFormat:@"%@.mp4", jobId];
    NSString *destPath = [destDir stringByAppendingPathComponent:filename];

    [NSFileManager.defaultManager moveItemAtURL:location toURL:[NSURL fileURLWithPath:destPath] error:NULL];

    [self sendToChrome:@{
        @"source": @"vd-native",
        @"type": @"download-progress",
        @"payload": @{
            @"id": jobId,
            @"status": @"complete",
            @"filePath": destPath,
        }
    }];
}

- (void)URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task didCompleteWithError:(NSError *)error {
    NSString *jobId = self.taskJobMap[@(task.taskIdentifier)];
    if (jobId && error) {
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
        [self closeTabAtIndex:self.activeTabIndex];
    } else if ([type isEqualToString:@"switchTab"]) {
        NSNumber *index = [payload[@"index"] isKindOfClass:NSNumber.class] ? payload[@"index"] : nil;
        if (index) [self selectTabAtIndex:index.integerValue];
    } else if ([type isEqualToString:@"startDownload"]) {
        [self startNativeDownloadWithID:payload[@"id"] urlString:payload[@"url"] title:payload[@"title"] ext:payload[@"ext"]];
    } else if ([type isEqualToString:@"cancelDownload"]) {
        [self cancelNativeDownloadWithID:payload[@"id"]];
    } else if ([type isEqualToString:@"shareFile"]) {
        [self shareFileAtPath:payload[@"filePath"]];
    } else if ([type isEqualToString:@"exportAll"]) {
        [self exportAllFiles];
    } else if ([type isEqualToString:@"clearBrowsingData"]) {
        [self clearBrowsingData];
    }
}

@end
