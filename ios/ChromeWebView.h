#import <WebKit/WebKit.h>

/// Transparent overlay WebView hosting the app UI (React) above the
/// browsing WebView. v1: pinned bottom region; full-screen transparent
/// passthrough is a later refinement (spec §5).
@interface ChromeWebView : WKWebView
@end
