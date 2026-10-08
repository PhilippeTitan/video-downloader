TARGET := iphone:clang:latest:16.0
INSTALL_TARGET_PROCESSES = VideoDownloader

include $(THEOS)/makefiles/common.mk

APPLICATION_NAME = VideoDownloader

VideoDownloader_FILES = main.m AppDelegate.m BrowserViewController.m ChromeWebView.m
VideoDownloader_FRAMEWORKS = UIKit WebKit AVFoundation AVKit Foundation Network UserNotifications
VideoDownloader_RESOURCE_FILES = Sniffer.js Icon-60@2x.png Icon-76.png Icon-76@2x.png Icon-83.5@2x.png Icon-1024.png
VideoDownloader_RESOURCE_DIRS = www
VideoDownloader_CFLAGS = -fobjc-arc
VideoDownloader_CODESIGN_FLAGS = -Sentitlements.plist

include $(THEOS)/makefiles/application.mk
