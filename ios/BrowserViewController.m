#import "BrowserViewController.h"

static NSString *const kVDHandler = @"vd";
static const NSInteger kMaxTabs = 10;          // Q016
static const CGFloat kChromeHeight = 460.0;    // bottom overlay; tune with UI

@interface BrowserViewController () <WKNavigationDelegate, WKScriptMessageHandler>
@property (nonatomic, strong) NSMutableArray<WKWebView *> *tabs;
@property (nonatomic, assign) NSInteger activeTabIndex;
@property (nonatomic, strong) ChromeWebView *chrome;
@property (nonatomic, strong) WKWebView *browsingContainerHost; // unused placeholder for layout clarity
@end

@implementation BrowserViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = UIColor.blackColor;
    self.tabs = [NSMutableArray array];
    self.activeTabIndex = 0;

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

#pragma mark - Native -> chrome (bridge.ts envelope)

- (void)sendToChrome:(NSDictionary *)envelope {
    NSData *data = [NSJSONSerialization dataWithJSONObject:envelope options:0 error:NULL];
    if (!data) return;
    NSString *json = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    NSString *js = [NSString stringWithFormat:
        @"window.postMessage(%@, '*');", json];
    [self.chrome evaluateJavaScript:js completionHandler:nil];
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

#pragma mark - chrome -> native

- (void)userContentController:(WKUserContentController *)controller
      didReceiveScriptMessage:(WKScriptMessage *)message {
    if (![message.name isEqualToString:kVDHandler]) return;
    NSDictionary *body = [message.body isKindOfClass:NSDictionary.class] ? message.body : nil;
    NSString *type = [body[@"type"] isKindOfClass:NSString.class] ? body[@"type"] : nil;

    if ([type isEqualToString:@"detect"]) {
        // Browsing-webview sniffer -> chrome (active tab only, Q046).
        WKWebView *sender = message.webView;
        if (sender && sender == [self activeTab]) {
            [self forwardDetection:body fromWebView:sender];
        }
        return;
    }

    if ([type isEqualToString:@"navigate"]) {
        NSString *url = [body[@"payload"] isKindOfClass:NSDictionary.class]
            ? [body[@"payload"][@"url"] isKindOfClass:NSString.class] ? body[@"payload"][@"url"] : nil
            : nil;
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
        NSString *url = [body[@"payload"] isKindOfClass:NSDictionary.class] && [body[@"payload"][@"url"] isKindOfClass:NSString.class]
            ? body[@"payload"][@"url"] : nil;
        [self addTabWithURL:url];
    } else if ([type isEqualToString:@"selectTab"]) {
        NSNumber *index = [body[@"payload"] isKindOfClass:NSDictionary.class] && [body[@"payload"][@"index"] isKindOfClass:NSNumber.class]
            ? body[@"payload"][@"index"] : nil;
        if (index) [self selectTabAtIndex:index.integerValue];
    }
    // startDownload / player / settings arrive with later phases (spec §4, §7).
}

@end
