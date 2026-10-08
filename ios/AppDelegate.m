#import "AppDelegate.h"
#import "BrowserViewController.h"

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application
    didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
    self.window = [[UIWindow alloc] initWithFrame:UIScreen.mainScreen.bounds];
    self.window.rootViewController = [BrowserViewController new];
    [self.window makeKeyAndVisible];
    return YES;
}

@end
