#import "BrowserViewController.h"
#import "AppDelegate.h"
#import <QuartzCore/QuartzCore.h>

static NSString *const kVDHandler = @"vd";
static const NSInteger kMaxTabs = 10;          // Q016
static NSString *const kJobMetaDefaultsKey = @"vd.jobmeta";   // Stage E: job title/ext/url across relaunch
static NSString *const kBackgroundSessionID = @"com.maurinex.videodownloader.bg";
// Real iPad Safari identifies as desktop Mac Safari (iPadOS desktop-class
// browsing) — YouTube then serves the desktop layout without the sticky
// mini-player. Matches the Expo shell's SAFARI_UA.
static NSString *const kSafariDesktopUA =
    @"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 "
    @"(KHTML, like Gecko) Version/17.7 Safari/605.1.15";

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
// Framed browsing pane helpers — implemented below, called from the tab code.
- (void)resetPaneForWebView:(WKWebView *)web;
- (void)applyBrowserPane:(NSDictionary *)payload;
- (void)setPaneVisible:(BOOL)visible onView:(UIView *)view animated:(BOOL)animated;
// Clip container for the static-frame wipe (holds the browsing WebView at its
// full-slot frame while the container itself follows the clipped pane rect).
@property (nonatomic, strong) UIView *paneContainer;
// YES while the placed pane is revealed to the user (fade-in done, not yet faded).
@property (nonatomic, assign) BOOL paneRevealed;
// Chevron enablement + live URL per tab, relayed to the chrome as `navState`.
- (void)relayNavStateForWebView:(WKWebView *)web;
// Native nav rail + magnet FAB (Expo-harness parity): left chip column above
// every WebView layer, auto-hiding on page interaction with a > restore handle;
// draggable download FAB stuck to the right edge.
@property (nonatomic, strong) UIView *rail;
@property (nonatomic, strong) UIView *railHomeBtn;
@property (nonatomic, strong) UIView *railDownBtn;
@property (nonatomic, strong) UIView *railLibBtn;
@property (nonatomic, strong) CAShapeLayer *railHomeIcon;
@property (nonatomic, strong) CAShapeLayer *railDownIcon;
@property (nonatomic, strong) CAShapeLayer *railLibIcon;
@property (nonatomic, strong) UILabel *railBadge;
@property (nonatomic, strong) UIView *railLibDot;
@property (nonatomic, strong) UIView *railHandle;
@property (nonatomic, strong) CAShapeLayer *railHandleIcon;
@property (nonatomic, strong) UIView *fab;
@property (nonatomic, strong) CAShapeLayer *fabIcon;
@property (nonatomic, strong) UIView *fabDot;
@property (nonatomic, assign) BOOL railHidden;
@property (nonatomic, copy) NSString *railScreen;   // 'browse' | 'down' | 'lib'
@property (nonatomic, assign) NSInteger railDlActive;
@property (nonatomic, assign) BOOL railDlFailed;
@property (nonatomic, assign) BOOL railLibNew;
@property (nonatomic, assign) BOOL railDlDot;
// FAB drag state: base position (right:20, bottom:200) + current Y offset.
@property (nonatomic, assign) CGPoint fabBaseCenter;
@property (nonatomic, assign) CGFloat fabOffsetY;
@property (nonatomic, assign) CGPoint fabDragOrigin;
@property (nonatomic, assign) BOOL fabMoved;
- (void)setupRailAndFab;
- (void)hideRail;
- (void)showRail;
- (void)bringRailToFront;
- (void)applyRailState:(NSDictionary *)payload;
- (void)refreshRailChrome;
+ (UIBezierPath *)globeIconPath;
+ (UIBezierPath *)railDownloadIconPath;
+ (UIBezierPath *)libraryIconPath;
+ (UIBezierPath *)fabDownloadIconPath;
+ (UIBezierPath *)chevronIconPath;
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
    [self setupRailAndFab];
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

    NSString *pullPath = [NSBundle.mainBundle pathForResource:@"Pull" ofType:@"js"];
    NSString *pull = pullPath ? [NSString stringWithContentsOfFile:pullPath
                                                          encoding:NSUTF8StringEncoding
                                                             error:NULL] : nil;
    if (pull.length) {
        WKUserScript *script = [[WKUserScript alloc] initWithSource:pull
                                                      injectionTime:WKUserScriptInjectionTimeAtDocumentStart
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
    web.customUserAgent = kSafariDesktopUA;
    web.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    [self.view addSubview:web];
    [self.tabs addObject:web];
    [web loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:@"about:blank"]]];
}

- (void)setupChrome {
    WKWebViewConfiguration *config = [WKWebViewConfiguration new];
    [config.userContentController addScriptMessageHandler:self name:kVDHandler];

    // Full-screen chrome OVER the browsing webview (S001 / v1-spec §1:
    // "browsing WKWebView sits under transparent native chrome"). The page
    // area clears itself via body.is-browsing when a search session runs.
    self.chrome = [[ChromeWebView alloc] initWithFrame:self.view.bounds configuration:config];

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
        [self.chrome.topAnchor constraintEqualToAnchor:self.view.topAnchor],
        [self.chrome.bottomAnchor constraintEqualToAnchor:self.view.bottomAnchor],
    ]];
}

- (void)dealloc {
    for (WKWebView *web in _tabs) {
        [web.configuration.userContentController removeScriptMessageHandlerForName:kVDHandler];
        [web stopLoading];
    }
    [_chrome.configuration.userContentController removeScriptMessageHandlerForName:kVDHandler];
}

#pragma mark - Native rail + magnet FAB (Expo-harness parity)

static UIColor *VDHexRGB(unsigned hex) {
    return [UIColor colorWithRed:((hex >> 16) & 0xff) / 255.0
                           green:((hex >> 8) & 0xff) / 255.0
                            blue:(hex & 0xff) / 255.0
                           alpha:1.0];
}
static UIColor *VDHexRGBA(unsigned hex, CGFloat a) {
    return [UIColor colorWithRed:((hex >> 16) & 0xff) / 255.0
                           green:((hex >> 8) & 0xff) / 255.0
                            blue:(hex & 0xff) / 255.0
                           alpha:a];
}

// Icon paths in the 24-unit SVG viewBox (same `d` strings as the Expo shell).
+ (UIBezierPath *)globeIconPath {
    UIBezierPath *p = [UIBezierPath bezierPathWithOvalInRect:CGRectMake(3, 3, 18, 18)];
    [p moveToPoint:CGPointMake(3, 12)];
    [p addLineToPoint:CGPointMake(21, 12)];
    [p moveToPoint:CGPointMake(12, 3)];
    [p addCurveToPoint:CGPointMake(12, 21) controlPoint1:CGPointMake(15, 6) controlPoint2:CGPointMake(15, 18)];
    [p moveToPoint:CGPointMake(12, 3)];
    [p addCurveToPoint:CGPointMake(12, 21) controlPoint1:CGPointMake(9, 6) controlPoint2:CGPointMake(9, 18)];
    return p;
}
+ (UIBezierPath *)railDownloadIconPath {
    UIBezierPath *p = [UIBezierPath bezierPath];
    [p moveToPoint:CGPointMake(12, 4)];
    [p addLineToPoint:CGPointMake(12, 16)];
    [p moveToPoint:CGPointMake(12, 16)];
    [p addLineToPoint:CGPointMake(7, 11)];
    [p moveToPoint:CGPointMake(12, 16)];
    [p addLineToPoint:CGPointMake(17, 11)];
    [p moveToPoint:CGPointMake(5, 20)];
    [p addLineToPoint:CGPointMake(19, 20)];
    return p;
}
+ (UIBezierPath *)libraryIconPath {
    UIBezierPath *p = [UIBezierPath bezierPathWithRoundedRect:CGRectMake(3, 5, 18, 14) cornerRadius:3];
    UIBezierPath *tri = [UIBezierPath bezierPath];
    [tri moveToPoint:CGPointMake(10, 9.5)];
    [tri addLineToPoint:CGPointMake(10, 14.5)];
    [tri addLineToPoint:CGPointMake(14.5, 12)];
    [tri closePath];
    [p appendPath:tri];
    return p;
}
+ (UIBezierPath *)fabDownloadIconPath {
    UIBezierPath *p = [UIBezierPath bezierPath];
    [p moveToPoint:CGPointMake(12, 3)];
    [p addLineToPoint:CGPointMake(12, 15)];
    [p moveToPoint:CGPointMake(7, 10)];
    [p addLineToPoint:CGPointMake(12, 15)];
    [p addLineToPoint:CGPointMake(17, 10)];
    UIBezierPath *tray = [UIBezierPath bezierPath];
    [tray moveToPoint:CGPointMake(4, 16.5)];
    [tray addLineToPoint:CGPointMake(4, 19)];
    [tray addArcWithCenter:CGPointMake(6, 19) radius:2 startAngle:M_PI endAngle:M_PI / 2 clockwise:NO];
    [tray addLineToPoint:CGPointMake(18, 21)];
    [tray addArcWithCenter:CGPointMake(18, 19) radius:2 startAngle:M_PI / 2 endAngle:0 clockwise:NO];
    [tray addLineToPoint:CGPointMake(20, 16.5)];
    [p appendPath:tray];
    return p;
}
+ (UIBezierPath *)chevronIconPath {
    UIBezierPath *p = [UIBezierPath bezierPath];
    [p moveToPoint:CGPointMake(9, 6)];
    [p addLineToPoint:CGPointMake(15, 12)];
    [p addLineToPoint:CGPointMake(9, 18)];
    return p;
}

/** Stroke-only CAShapeLayer for one icon, scaled from the 24 viewBox to `size`. */
- (CAShapeLayer *)makeIconLayer:(UIBezierPath *)path24
                            size:(CGFloat)size
                      strokeWidth:(CGFloat)sw
                           color:(UIColor *)color {
    CGFloat s = size / 24.0;
    UIBezierPath *scaled = [path24 copy];
    [scaled applyTransform:CGAffineTransformMakeScale(s, s)];
    CAShapeLayer *layer = [CAShapeLayer layer];
    layer.frame = CGRectMake(0, 0, size, size);
    layer.path = scaled.CGPath;
    layer.strokeColor = color.CGColor;
    layer.fillColor = UIColor.clearColor.CGColor;
    layer.lineWidth = sw;
    layer.lineCap = kCALineCapRound;
    layer.lineJoin = kCALineJoinRound;
    layer.contentsScale = UIScreen.mainScreen.scale;
    return layer;
}

/** 56x56 omnicolor chip: translucent dark card + hairline border + shadow. */
- (UIView *)makeChipWithTag:(NSInteger)tag {
    UIView *chip = [[UIView alloc] initWithFrame:CGRectMake(0, 0, 56, 56)];
    chip.layer.cornerRadius = 18;
    chip.layer.shadowColor = UIColor.blackColor.CGColor;
    chip.layer.shadowOpacity = 0.8;
    chip.layer.shadowRadius = 3;
    chip.layer.shadowOffset = CGSizeMake(0, 2);
    chip.userInteractionEnabled = YES;
    chip.tag = tag;
    UITapGestureRecognizer *tap =
        [[UITapGestureRecognizer alloc] initWithTarget:self action:@selector(railChipTapped:)];
    [chip addGestureRecognizer:tap];
    return chip;
}

- (void)applyChip:(UIView *)chip icon:(CAShapeLayer *)icon active:(BOOL)active {
    chip.backgroundColor = active ? VDHexRGB(0x3a2f78) : VDHexRGBA(0x161822, 0.78);
    chip.layer.borderColor = (active ? VDHexRGBA(0xb7a6ff, 0.5) : VDHexRGBA(0xffffff, 0.14)).CGColor;
    icon.strokeColor = (active ? VDHexRGB(0xd7ccff) : VDHexRGB(0xc9cfdb)).CGColor;
}

- (void)setupRailAndFab {
    self.railScreen = @"browse";

    self.rail = [[UIView alloc] initWithFrame:CGRectZero];
    self.rail.backgroundColor = UIColor.clearColor;

    self.railHomeBtn = [self makeChipWithTag:0];
    self.railHomeIcon = [self makeIconLayer:[BrowserViewController globeIconPath]
                                       size:26 strokeWidth:1.8 color:VDHexRGB(0xc9cfdb)];
    self.railHomeIcon.frame = CGRectMake(15, 15, 26, 26);
    [self.railHomeBtn.layer addSublayer:self.railHomeIcon];

    self.railDownBtn = [self makeChipWithTag:1];
    self.railDownIcon = [self makeIconLayer:[BrowserViewController railDownloadIconPath]
                                       size:26 strokeWidth:1.8 color:VDHexRGB(0xc9cfdb)];
    self.railDownIcon.frame = CGRectMake(15, 15, 26, 26);
    [self.railDownBtn.layer addSublayer:self.railDownIcon];
    self.railBadge = [[UILabel alloc] initWithFrame:CGRectZero];
    self.railBadge.font = [UIFont boldSystemFontOfSize:12];
    self.railBadge.textColor = VDHexRGB(0x06130d);
    self.railBadge.textAlignment = NSTextAlignmentCenter;
    self.railBadge.layer.cornerRadius = 10;
    self.railBadge.layer.masksToBounds = YES;
    self.railBadge.hidden = YES;
    [self.railDownBtn addSubview:self.railBadge];

    self.railLibBtn = [self makeChipWithTag:2];
    self.railLibIcon = [self makeIconLayer:[BrowserViewController libraryIconPath]
                                     size:26 strokeWidth:1.8 color:VDHexRGB(0xc9cfdb)];
    self.railLibIcon.frame = CGRectMake(15, 15, 26, 26);
    [self.railLibBtn.layer addSublayer:self.railLibIcon];
    self.railLibDot = [[UIView alloc] initWithFrame:CGRectMake(38, 8, 10, 10)];
    self.railLibDot.layer.cornerRadius = 5;
    self.railLibDot.backgroundColor = VDHexRGB(0x7c5cff);
    self.railLibDot.hidden = YES;
    [self.railLibBtn addSubview:self.railLibDot];

    [self.rail addSubview:self.railHomeBtn];
    [self.rail addSubview:self.railDownBtn];
    [self.rail addSubview:self.railLibBtn];
    [self.view addSubview:self.rail];

    // `>` restore handle — visible (and tappable) only while the rail is tucked.
    self.railHandle = [[UIView alloc] initWithFrame:CGRectZero];
    self.railHandle.backgroundColor = VDHexRGBA(0x161822, 0.82);
    self.railHandle.layer.cornerRadius = 16;
    self.railHandle.layer.maskedCorners = kCALayerMaxXMinYCorner | kCALayerMaxXMaxYCorner;
    self.railHandle.layer.borderColor = VDHexRGBA(0xffffff, 0.14).CGColor;
    self.railHandle.layer.borderWidth = 1;
    self.railHandle.layer.shadowColor = UIColor.blackColor.CGColor;
    self.railHandle.layer.shadowOpacity = 0.8;
    self.railHandle.layer.shadowRadius = 3;
    self.railHandle.layer.shadowOffset = CGSizeMake(2, 2);
    self.railHandleIcon = [self makeIconLayer:[BrowserViewController chevronIconPath]
                                         size:18 strokeWidth:2.4 color:VDHexRGB(0xe8eaf0)];
    self.railHandleIcon.frame = CGRectMake(6, 27, 18, 18);
    [self.railHandle.layer addSublayer:self.railHandleIcon];
    self.railHandle.alpha = 0;
    self.railHandle.userInteractionEnabled = NO;
    self.railHandle.hidden = YES;
    UITapGestureRecognizer *handleTap =
        [[UITapGestureRecognizer alloc] initWithTarget:self action:@selector(showRail)];
    [self.railHandle addGestureRecognizer:handleTap];
    [self.view addSubview:self.railHandle];

    // Magnet FAB — 70x70 card, draggable vertically, X snaps back to the edge.
    self.fab = [[UIView alloc] initWithFrame:CGRectMake(0, 0, 70, 70)];
    self.fab.userInteractionEnabled = YES;
    self.fab.layer.cornerRadius = 20;
    self.fab.backgroundColor = VDHexRGB(0x6c47eb);
    self.fab.layer.borderColor = VDHexRGBA(0xffffff, 0.22).CGColor;
    self.fab.layer.borderWidth = 1;
    self.fab.layer.shadowColor = VDHexRGB(0x7c5cff).CGColor;
    self.fab.layer.shadowOpacity = 0.45;
    self.fab.layer.shadowRadius = 12;
    self.fab.layer.shadowOffset = CGSizeMake(0, 8);
    self.fabIcon = [self makeIconLayer:[BrowserViewController fabDownloadIconPath]
                                  size:30 strokeWidth:2.2 color:UIColor.whiteColor];
    self.fabIcon.frame = CGRectMake(20, 20, 30, 30);
    [self.fab.layer addSublayer:self.fabIcon];
    self.fabDot = [[UIView alloc] initWithFrame:CGRectMake(60, -2, 12, 12)];
    self.fabDot.layer.cornerRadius = 6;
    self.fabDot.layer.borderColor = VDHexRGB(0x0e0f14).CGColor;
    self.fabDot.layer.borderWidth = 2;
    self.fabDot.backgroundColor = VDHexRGB(0x34d399);
    self.fabDot.hidden = YES;
    [self.fab addSubview:self.fabDot];
    UIPanGestureRecognizer *fabPan =
        [[UIPanGestureRecognizer alloc] initWithTarget:self action:@selector(fabPanned:)];
    [self.fab addGestureRecognizer:fabPan];
    // A pan recognizer never fires on a stationary touch (it stays `possible`
    // until movement, then fails on touch-up) — the tap needs its own recognizer.
    UITapGestureRecognizer *fabTap =
        [[UITapGestureRecognizer alloc] initWithTarget:self action:@selector(fabTapped)];
    [self.fab addGestureRecognizer:fabTap];
    [self.view addSubview:self.fab];

    [self refreshRailChrome];
    [self.view setNeedsLayout];
}

- (void)viewDidLayoutSubviews {
    [super viewDidLayoutSubviews];
    CGFloat w = self.view.bounds.size.width;
    CGFloat h = self.view.bounds.size.height;
    if (self.rail) {
        CGFloat colH = 56 * 3 + 14 * 2;   // three chips, 14pt gap
        // bounds+center, not frame — the rail carries a hide transform.
        self.rail.bounds = CGRectMake(0, 0, 56, colH);
        self.rail.center = CGPointMake(20 + 28, floor((h - colH) / 2) + colH / 2);
        self.railHomeBtn.frame = CGRectMake(0, 0, 56, 56);
        self.railDownBtn.frame = CGRectMake(0, 70, 56, 56);
        self.railLibBtn.frame = CGRectMake(0, 140, 56, 56);
    }
    if (self.railHandle) {
        self.railHandle.frame = CGRectMake(0, floor((h - 72) / 2), 30, 72);
    }
    if (self.fab) {
        self.fabBaseCenter = CGPointMake(w - 20 - 35, h - 200 - 35);
        CGFloat minY = 47;          // 12pt margin + half button
        CGFloat maxY = h - 47;
        CGFloat y = self.fabBaseCenter.y + self.fabOffsetY;
        if (y < minY) y = minY;
        if (y > maxY) y = maxY;
        self.fabOffsetY = y - self.fabBaseCenter.y;
        self.fab.center = CGPointMake(self.fabBaseCenter.x, y);
    }
}

- (void)railChipTapped:(UITapGestureRecognizer *)gesture {
    NSInteger tag = gesture.view.tag;
    NSString *item = tag == 0 ? @"home" : (tag == 1 ? @"down" : @"lib");
    [self sendToChrome:@{
        @"source": @"vd-native",
        @"type": @"rail",
        @"payload": @{ @"item": item },
    }];
}

- (void)hideRail {
    if (self.railHidden || !self.rail) return;
    self.railHidden = YES;
    [UIView animateWithDuration:0.26
                          delay:0
                        options:UIViewAnimationOptionCurveEaseIn | UIViewAnimationOptionAllowUserInteraction
                     animations:^{
        self.rail.transform = CGAffineTransformMakeTranslation(-90, 0);
        self.railHandle.alpha = 1;
        self.railHandle.hidden = NO;
        self.railHandle.userInteractionEnabled = YES;
    } completion:nil];
}

- (void)showRail {
    if (!self.railHidden || !self.rail) return;
    self.railHidden = NO;
    [UIView animateWithDuration:0.45
                          delay:0
         usingSpringWithDamping:0.75
          initialSpringVelocity:0.3
                        options:UIViewAnimationOptionAllowUserInteraction
                     animations:^{
        self.rail.transform = CGAffineTransformIdentity;
        self.railHandle.alpha = 0;
        self.railHandle.userInteractionEnabled = NO;
    } completion:^(BOOL finished) {
        // Interrupted by a re-tuck — leave the handle visible for that state.
        if (!self.railHidden) self.railHandle.hidden = YES;
    }];
}

/** The pane container is brought to front on every browserPane message — the
 *  rail/handle/FAB must stay above it. */
- (void)bringRailToFront {
    if (self.rail) [self.view bringSubviewToFront:self.rail];
    if (self.railHandle) [self.view bringSubviewToFront:self.railHandle];
    if (self.fab) [self.view bringSubviewToFront:self.fab];
}

/** Rail state pushed by the web UI (`sendNativeAction('rail', ...)`). */
- (void)applyRailState:(NSDictionary *)payload {
    if ([payload[@"screen"] isKindOfClass:NSString.class]) self.railScreen = payload[@"screen"];
    if ([payload[@"dlActive"] isKindOfClass:NSNumber.class]) self.railDlActive = [payload[@"dlActive"] integerValue];
    if ([payload[@"dlFailed"] isKindOfClass:NSNumber.class]) self.railDlFailed = [payload[@"dlFailed"] boolValue];
    if ([payload[@"libNew"] isKindOfClass:NSNumber.class]) self.railLibNew = [payload[@"libNew"] boolValue];
    if ([payload[@"dlDot"] isKindOfClass:NSNumber.class]) self.railDlDot = [payload[@"dlDot"] boolValue];
    [self refreshRailChrome];
}

- (void)refreshRailChrome {
    if (!self.rail) return;
    [self applyChip:self.railHomeBtn icon:self.railHomeIcon active:[self.railScreen isEqualToString:@"browse"]];
    [self applyChip:self.railDownBtn icon:self.railDownIcon active:[self.railScreen isEqualToString:@"down"]];
    [self applyChip:self.railLibBtn icon:self.railLibIcon active:[self.railScreen isEqualToString:@"lib"]];
    self.railBadge.hidden = self.railDlActive <= 0;
    if (self.railDlActive > 0) {
        self.railBadge.text = [@(self.railDlActive) stringValue];
        self.railBadge.backgroundColor = self.railDlFailed ? VDHexRGB(0xff7a9c) : VDHexRGB(0x3ecf8e);
        [self.railBadge sizeToFit];
        CGRect f = self.railBadge.frame;
        CGFloat bw = MAX(20, ceil(f.size.width) + 8);
        self.railBadge.frame = CGRectMake(56 - bw, 0, bw, 20);
    }
    self.railLibDot.hidden = !self.railLibNew;
    self.fabDot.hidden = !self.railDlDot;
}

/** Magnet drag: free Y (clamped 12pt from the edges), X springs back on
 *  release; a still tap forwards `download` like the Expo FAB. */
- (void)fabPanned:(UIPanGestureRecognizer *)g {
    switch (g.state) {
        case UIGestureRecognizerStateBegan: {
            self.fabDragOrigin = self.fab.center;
            self.fabMoved = NO;
            break;
        }
        case UIGestureRecognizerStateChanged: {
            CGPoint t = [g translationInView:self.view];
            if (fabs(t.x) > 4 || fabs(t.y) > 4) self.fabMoved = YES;
            CGFloat minY = 47;
            CGFloat maxY = self.view.bounds.size.height - 47;
            CGFloat y = self.fabDragOrigin.y + t.y;
            if (y < minY) y = minY;
            if (y > maxY) y = maxY;
            self.fab.center = CGPointMake(self.fabDragOrigin.x + t.x, y);
            break;
        }
        case UIGestureRecognizerStateEnded:
        case UIGestureRecognizerStateCancelled: {
            self.fabOffsetY = self.fab.center.y - self.fabBaseCenter.y;
            [UIView animateWithDuration:0.45
                                  delay:0
                 usingSpringWithDamping:0.72
                  initialSpringVelocity:0.4
                                options:UIViewAnimationOptionAllowUserInteraction
                             animations:^{
                self.fab.center = CGPointMake(self.fabBaseCenter.x, self.fab.center.y);
            } completion:nil];
            break;
        }
        default:
            break;
    }
}

- (void)fabTapped {
    [self sendToChrome:@{
        @"source": @"vd-native",
        @"type": @"rail",
        @"payload": @{ @"item": @"download" },
    }];
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
    // Tab switches always resume the fullscreen-behind-chrome layout; the UI
    // re-sends browserPane for the pane window if it still wants one.
    [self resetPaneForWebView:next];
    [self.view insertSubview:next belowSubview:self.chrome];
    next.frame = self.view.bounds;
    self.activeTabIndex = index;
    [self relayNavStateForWebView:next];
}

- (void)addTabWithURL:(NSString *)urlString {
    if ((NSInteger)self.tabs.count >= kMaxTabs) return;
    WKWebView *web = [[WKWebView alloc] initWithFrame:self.view.bounds
                                        configuration:[self browsingConfiguration]];
    web.navigationDelegate = self;
    web.customUserAgent = kSafariDesktopUA;
    web.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
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
        [self resetPaneForWebView:next];
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

#pragma mark - Framed browsing pane (v1-spec §1, browser-slot)

/** Undo the pane treatment on a browsing view that is going away from the slot. */
- (void)resetPaneForWebView:(WKWebView *)web {
    if (!web) return;
    if (web.superview == _paneContainer) [web removeFromSuperview];
    web.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    web.layer.cornerRadius = 0;
    web.layer.masksToBounds = NO;
    // Fullscreen behind the chrome: visible, untransformed, touchable.
    self.paneRevealed = NO;
    [web.layer removeAllAnimations];
    web.alpha = 1.0;
    web.transform = CGAffineTransformIdentity;
    web.userInteractionEnabled = YES;
    if (_paneContainer) {
        [_paneContainer.layer removeAllAnimations];
        _paneContainer.transform = CGAffineTransformIdentity;
        _paneContainer.alpha = 1.0;
        _paneContainer.hidden = YES;
        _paneContainer.userInteractionEnabled = YES;
    }
}

/**
 * Reveal/hide the placed pane, mirroring the UI's animation (fade + 16pt
 * slide-in, 350 ms in / 220 ms out). The page keeps loading while hidden —
 * alpha, not `hidden`, so WebKit never suspends rendering.
 */
- (void)setPaneVisible:(BOOL)visible onView:(UIView *)view animated:(BOOL)animated {
    if (!view) return;
    if (self.paneRevealed == visible) {
        // Already there: pin the resting state (mid-flight frame changes can't drift).
        view.alpha = visible ? 1.0 : 0.0;
        view.hidden = NO;
        view.userInteractionEnabled = visible;
        return;
    }
    self.paneRevealed = visible;
    view.hidden = NO;
    view.userInteractionEnabled = visible;
    if (!animated) {
        [view.layer removeAllAnimations];
        view.alpha = visible ? 1.0 : 0.0;
        view.transform = visible ? CGAffineTransformIdentity : CGAffineTransformMakeTranslation(0, 16);
        return;
    }
    // Start from the far end so the slide always reads as motion.
    view.transform = visible ? CGAffineTransformMakeTranslation(0, 16) : CGAffineTransformIdentity;
    [UIView animateWithDuration:(visible ? 0.35 : 0.22)
                          delay:0
                        options:UIViewAnimationOptionCurveEaseOut | UIViewAnimationOptionAllowUserInteraction
                     animations:^{
        view.alpha = visible ? 1.0 : 0.0;
        view.transform = visible ? CGAffineTransformIdentity : CGAffineTransformMakeTranslation(0, 16);
    } completion:nil];
}

/**
 * Lifts the ACTIVE browsing WebView ABOVE the transparent chrome and pins it
 * to the rect the web UI reports for its `.browser-slot` element, so a search
 * opens its page inside our own shell instead of full-bleed behind it.
 *
 * The slot is reported in CSS pixels; with a width=device-width page one CSS
 * pixel is one point, and the chrome WebView has no content inset, so its
 * viewport origin equals self.view's origin.
 *
 * payload == nil (the UI outside the load window) drops the view back to
 * fullscreen BEHIND the chrome.
 */
- (void)applyBrowserPane:(NSDictionary *)payload {
    WKWebView *web = [self activeTab];
    if (!web) return;

    NSNumber *x = payload[@"x"];
    NSNumber *y = payload[@"y"];
    NSNumber *w = payload[@"w"];
    NSNumber *h = payload[@"h"];
    BOOL frameable = [x isKindOfClass:NSNumber.class] && [y isKindOfClass:NSNumber.class]
        && [w isKindOfClass:NSNumber.class] && [h isKindOfClass:NSNumber.class]
        && w.doubleValue >= 1 && h.doubleValue >= 1;

    if (!frameable) {
        [self resetPaneForWebView:web];
        if (web.superview) [self.view insertSubview:web belowSubview:self.chrome];
        web.frame = self.view.bounds;
        [self showRail];   // pane gone (home) — the rail returns
        return;
    }

    // `visible` false = placed but hidden (page loads behind the animation);
    // missing = legacy UI, which always wanted the pane shown.
    BOOL visible = ![payload[@"visible"] isKindOfClass:NSNumber.class]
        || [payload[@"visible"] boolValue];

    // Static-frame wipe: `frame` is the full slot — the WebView keeps that
    // size for the whole sweep (WK relayouts are what made the wipe lag and
    // reload Google pages). x/y/w/h is the currently visible clip rect that
    // the container follows; legacy payloads without `frame` fill it exactly.
    NSDictionary *frame = [payload[@"frame"] isKindOfClass:NSDictionary.class] ? payload[@"frame"] : nil;
    double fx = [frame[@"x"] isKindOfClass:NSNumber.class] ? [frame[@"x"] doubleValue] : x.doubleValue;
    double fy = [frame[@"y"] isKindOfClass:NSNumber.class] ? [frame[@"y"] doubleValue] : y.doubleValue;
    double fw = [frame[@"w"] isKindOfClass:NSNumber.class] ? [frame[@"w"] doubleValue] : w.doubleValue;
    double fh = [frame[@"h"] isKindOfClass:NSNumber.class] ? [frame[@"h"] doubleValue] : h.doubleValue;

    if (!self.paneContainer) {
        self.paneContainer = [[UIView alloc] initWithFrame:CGRectZero];
        self.paneContainer.backgroundColor = UIColor.clearColor;
    }
    if (!self.paneContainer.superview) [self.view addSubview:self.paneContainer];
    self.paneContainer.frame = CGRectMake(x.doubleValue, y.doubleValue, w.doubleValue, h.doubleValue);
    self.paneContainer.layer.cornerRadius = 18;
    self.paneContainer.layer.masksToBounds = YES;

    if (web.superview != self.paneContainer) {
        [self.paneContainer addSubview:web];
        web.autoresizingMask = UIViewAutoresizingNone;
        web.layer.cornerRadius = 0;   // the container clips — the webview never does
        web.layer.masksToBounds = NO;
        web.alpha = 1.0;             // the container fades, not the webview
        web.transform = CGAffineTransformIdentity;
        web.userInteractionEnabled = YES;
    }
    web.frame = CGRectMake(fx - x.doubleValue, fy - y.doubleValue, fw, fh);
    [self.view bringSubviewToFront:self.paneContainer]; // over the chrome, clipped to the rect
    [self setPaneVisible:visible onView:self.paneContainer animated:YES];
    [self bringRailToFront];   // overlays always above the pane
    if (!visible) [self showRail];   // pane leaving (home sweep) — rail returns
}

#pragma mark - Page-load relay (drives the UI's load -> done gate)

/** Tell the chrome this browsing tab changed load state. */
- (void)relayPageLoadState:(NSString *)state
                       url:(NSString *)url
                   message:(NSString *)message {
    NSMutableDictionary *payload = [NSMutableDictionary dictionary];
    payload[@"tabIndex"] = @(self.activeTabIndex);
    payload[@"state"] = state;
    if (url.length) payload[@"url"] = url;
    if (message.length) payload[@"message"] = message;
    [self sendToChrome:@{
        @"source": @"vd-native",
        @"type": @"pageLoad",
        @"payload": payload,
    }];
}

/** Tell the chrome the active tab's history state (chevron enablement). */
- (void)relayNavStateForWebView:(WKWebView *)web {
    if (!web || web != [self activeTab]) return;
    NSUInteger idx = [self.tabs indexOfObject:web];
    if (idx == NSNotFound) return;
    [self sendToChrome:@{
        @"source": @"vd-native",
        @"type": @"navState",
        @"payload": @{
            @"tabIndex": @(idx),
            @"url": web.URL.absoluteString ?: @"",
            @"canGoBack": @(web.canGoBack),
            @"canGoForward": @(web.canGoForward),
        },
    }];
}

/** Only the visible tab's loads matter; about:blank is the shell's own
 *  placeholder and must not flip the UI's gate before a search starts. */
- (BOOL)shouldRelayLoadForWebView:(WKWebView *)webView {
    if (webView != [self activeTab]) return NO;
    NSString *url = webView.URL.absoluteString;
    return !(url.length == 0 || [url isEqualToString:@"about:blank"]);
}

- (void)webView:(WKWebView *)webView didStartProvisionalNavigation:(WKNavigation *)navigation {
    if (![self shouldRelayLoadForWebView:webView]) return;
    [self relayPageLoadState:@"start" url:webView.URL.absoluteString message:nil];
}

// canGoBack/canGoForward flip at commit — relay before the page finishes
// loading so the chevrons respond right after a back/forward tap.
- (void)webView:(WKWebView *)webView didCommitNavigation:(WKNavigation *)navigation {
    if (webView != [self activeTab]) return;
    [self relayNavStateForWebView:webView];
}

- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation {
    if (![self shouldRelayLoadForWebView:webView]) return;
    [self relayPageLoadState:@"end" url:webView.URL.absoluteString message:nil];
    [self relayNavStateForWebView:webView];
}

- (void)webView:(WKWebView *)webView didFailProvisionalNavigation:(WKNavigation *)navigation
      withError:(NSError *)error {
    [self relayLoadFailure:error forWebView:webView];
}

- (void)webView:(WKWebView *)webView didFailNavigation:(WKNavigation *)navigation
      withError:(NSError *)error {
    [self relayLoadFailure:error forWebView:webView];
}

/** Cancelled (-999) is not a failure — it fires on redirects, stop, and on
 *  every superseded provisional load (meta-refresh pages hit it constantly). */
- (void)relayLoadFailure:(NSError *)error forWebView:(WKWebView *)webView {
    if (![self shouldRelayLoadForWebView:webView]) return;
    if (error.domain == NSURLErrorDomain && error.code == NSURLErrorCancelled) return;
    [self relayPageLoadState:@"error"
                         url:webView.URL.absoluteString
                     message:error.localizedDescription];
}

/** m.youtube.com serves the mobile site (sticky mini-player and all) no
 *  matter the UA — rewrite top-level loads to www, like the Expo shell.
 *  Custom schemes (youtube://, vnd.youtube://, itms-apps:// …) are CANCELLED:
 *  allowing them hands the URL to the system and iOS yanks the user out into
 *  the native app — an in-app browser must swallow those deep links. */
- (void)webView:(WKWebView *)webView
    decidePolicyForNavigationAction:(WKNavigationAction *)navigationAction
                    decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler {
    NSURL *url = navigationAction.request.URL;
    NSString *scheme = url.scheme.lowercaseString;
    static NSSet<NSString *> *webSchemes;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        webSchemes = [NSSet setWithObjects:@"http", @"https", @"about", @"blob", @"data", nil];
    });
    if (scheme.length && ![webSchemes containsObject:scheme]) {
        decisionHandler(WKNavigationActionPolicyCancel);
        return;
    }
    if (navigationAction.targetFrame.isMainFrame) {
        if ([url.host.lowercaseString isEqualToString:@"m.youtube.com"]) {
            NSURLComponents *comps = [NSURLComponents componentsWithURL:url resolvingAgainstBaseURL:NO];
            comps.host = @"www.youtube.com";
            NSURL *fixed = comps.URL;
            if (fixed) {
                [webView loadRequest:[NSURLRequest requestWithURL:fixed]];
                decisionHandler(WKNavigationActionPolicyCancel);
                return;
            }
        }
    }
    decisionHandler(WKNavigationActionPolicyAllow);
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
        [req setValue:@"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.7 Safari/605.1.15" forHTTPHeaderField:@"User-Agent"];
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
        if ([url isKindOfClass:NSString.class] && url.length) {
            NSURL *parsed = [NSURL URLWithString:url];
            if (!parsed) {
                // NSURL rejects raw spaces / non-ASCII — percent-encode the
                // illegal bytes (leaving the RFC3986 set intact) and retry,
                // so a sloppy URL never turns into a silently dropped search.
                static NSCharacterSet *urlLegal;
                static dispatch_once_t urlOnce;
                dispatch_once(&urlOnce, ^{
                    urlLegal = [NSCharacterSet characterSetWithCharactersInString:
                        @"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
                        @"-._~:/?#[]@!$&'()*+,;=%"];
                });
                NSString *encoded = [url stringByAddingPercentEncodingWithAllowedCharacters:urlLegal];
                parsed = encoded ? [NSURL URLWithString:encoded] : nil;
            }
            if (parsed) {
                [[self activeTab] loadRequest:[NSURLRequest requestWithURL:parsed]];
            } else {
                NSLog(@"[vd] navigate dropped (unparseable URL): %@", url);
            }
        }
    } else if ([type isEqualToString:@"back"] || [type isEqualToString:@"goBack"]) {
        [[self activeTab] goBack];
    } else if ([type isEqualToString:@"forward"] || [type isEqualToString:@"goForward"]) {
        [[self activeTab] goForward];
    } else if ([type isEqualToString:@"reload"]) {
        [[self activeTab] reload];
    } else if ([type isEqualToString:@"pull-refresh"]) {
        // Browsing page pulled down at its top — let the chrome run its
        // refresh flow (spinner + reload), same as the Expo shell.
        if (message.webView == [self activeTab]) {
            [self sendToChrome:@{ @"source": @"vd-native", @"type": @"pullRefresh", @"payload": @{} }];
        }
    } else if ([type isEqualToString:@"interact"]) {
        // Touch inside the active page tucks the native nav rail (throttled
        // in Sniffer.js); the > handle slides it back out.
        if (message.webView == [self activeTab]) {
            [self hideRail];
        }
    } else if ([type isEqualToString:@"rail"]) {
        // Rail state push from the chrome (screen + badges).
        [self applyRailState:payload];
    } else if ([type isEqualToString:@"browserPane"]) {
        [self applyBrowserPane:payload];
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
