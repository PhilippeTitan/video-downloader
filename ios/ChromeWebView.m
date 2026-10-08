#import "ChromeWebView.h"

@implementation ChromeWebView

- (instancetype)initWithFrame:(CGRect)frame configuration:(WKWebViewConfiguration *)configuration {
    self = [super initWithFrame:frame configuration:configuration];
    if (self) {
        self.opaque = NO;
        self.backgroundColor = UIColor.clearColor;
        self.scrollView.backgroundColor = UIColor.clearColor;
        self.scrollView.bounces = NO;
        self.scrollView.contentInsetAdjustmentBehavior = UIScrollViewContentInsetAdjustmentNever;
    }
    return self;
}

@end
