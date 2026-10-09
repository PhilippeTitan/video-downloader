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

// Background downloads finishing while the app is suspended relaunch it here (Q020).
- (void)application:(UIApplication *)application
    handleEventsForBackgroundURLSession:(NSString *)identifier
                      completionHandler:(void (^)(void))completionHandler {
    if ([identifier isEqualToString:@"com.maurinex.videodownloader.bg"]) {
        self.backgroundSessionCompletionHandler = completionHandler;
    }
}

@end
