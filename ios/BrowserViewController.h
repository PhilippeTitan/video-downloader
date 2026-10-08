#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>
#import "ChromeWebView.h"

/// Two-layer VidMate-style shell: browsing WKWebView under a chrome
/// WKWebView hosting the web UI. Bridge contract lives in web/src/bridge.ts.
@interface BrowserViewController : UIViewController
@end
