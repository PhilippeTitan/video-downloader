#import <UIKit/UIKit.h>

@interface AppDelegate : UIResponder <UIApplicationDelegate>
@property (nonatomic, strong) UIWindow *window;
/** Background NSURLSession events finished; call to end the relaunch grace period. */
@property (nonatomic, copy) void (^backgroundSessionCompletionHandler)(void);
@end
