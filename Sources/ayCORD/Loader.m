// ayCORD — substrate-free loader for Discord (React Native / Hermes).
// -----------------------------------------------------------------------------
// Built as a plain dylib with NO CydiaSubstrate dependency, so it loads on
// sideloaded / TrollStore / jailbroken devices alike. It swizzles React Native's
// script-loading method via the Objective-C runtime (method_setImplementation) — no MSHook,
// no ElleKit, no external framework.
//
// After Discord's own JS bundle loads (bridge or bridgeless), we evaluate our payload
// (aycord.js, shipped at the .app root) in the same JS context.
// Injection points:
//   - Bridgeless / new arch (Discord 2xx+): -[RCTInstance _loadScriptFromSource:]
//   - Legacy bridge:                        -[RCTCxxBridge executeApplicationScript:url:async:]
// -----------------------------------------------------------------------------

#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <objc/runtime.h>
#import <objc/message.h>

static BOOL gInjected = NO;
static void (*gOrigExec)(id, SEL, NSData *, NSURL *, BOOL) = NULL;

// ---- Native proof-of-life ---------------------------------------------------
// A visible confirmation that runs entirely from the native side — no JS, no
// Metro — so a "nothing appears" report can be split into "dylib didn't load"
// vs. "payload/metro failed". Presented once, on the key window's root VC,
// retrying until UIKit has a window to present on. Fully guarded: can't crash.
static BOOL gNoticeShown = NO;

static UIViewController *AYCTopViewController(void) {
    UIWindow *key = nil;
    for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
        if (scene.activationState == UISceneActivationStateForegroundActive &&
            [scene isKindOfClass:UIWindowScene.class]) {
            for (UIWindow *w in ((UIWindowScene *)scene).windows) {
                if (w.isKeyWindow) { key = w; break; }
            }
            if (!key) key = ((UIWindowScene *)scene).windows.firstObject;
        }
        if (key) break;
    }
    UIViewController *vc = key.rootViewController;
    while (vc.presentedViewController) vc = vc.presentedViewController;
    return vc;
}

static void AYCNativeNotice(NSString *msg, int retriesLeft) {
    if (gNoticeShown) return;
    dispatch_async(dispatch_get_main_queue(), ^{
        if (gNoticeShown) return;
        UIViewController *top = AYCTopViewController();
        if (!top) {
            if (retriesLeft > 0) {
                dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.5 * NSEC_PER_SEC)),
                               dispatch_get_main_queue(), ^{ AYCNativeNotice(msg, retriesLeft - 1); });
            }
            return;
        }
        gNoticeShown = YES;
        @try {
            UIAlertController *a = [UIAlertController alertControllerWithTitle:@"ayCORD"
                                                                      message:msg
                                                               preferredStyle:UIAlertControllerStyleAlert];
            [a addAction:[UIAlertAction actionWithTitle:@"تمام" style:UIAlertActionStyleDefault handler:nil]];
            [top presentViewController:a animated:YES completion:nil];
        } @catch (NSException *e) {
            NSLog(@"[ayCORD] native notice failed: %@", e);
        }
    });
}

static NSString *AYCReadPayload(void) {
    NSString *path = [[NSBundle mainBundle] pathForResource:@"aycord" ofType:@"js"];
    if (!path) { NSLog(@"[ayCORD] aycord.js not found in app bundle"); return nil; }
    NSError *err = nil;
    NSString *src = [NSString stringWithContentsOfFile:path encoding:NSUTF8StringEncoding error:&err];
    if (err) { NSLog(@"[ayCORD] read payload failed: %@", err); return nil; }
    return src;
}

static NSData *AYCWrappedPayload(void) {
    NSString *src = AYCReadPayload();
    if (!src.length) { NSLog(@"[ayCORD] empty payload"); return nil; }
    // Guard: our payload can never crash Discord.
    NSString *wrapped = [NSString stringWithFormat:
        @"(function(){try{%@}catch(e){if(typeof nativeLoggingHook!=='undefined')"
         "nativeLoggingHook('[ayCORD] fatal: '+(e&&e.stack||e),3);}})();", src];
    return [wrapped dataUsingEncoding:NSUTF8StringEncoding];
}

// ---- Legacy bridge ----------------------------------------------------------
// Replacement for -[RCTCxxBridge executeApplicationScript:url:async:]
static void AYCExec(id self, SEL _cmd, NSData *script, NSURL *url, BOOL async) {
    if (gOrigExec) gOrigExec(self, _cmd, script, url, async);   // run Discord's bundle

    if (gInjected) return;
    gInjected = YES;

    NSData *data = AYCWrappedPayload();
    if (!data) return;
    NSLog(@"[ayCORD] injecting payload via bridge (%lu bytes)", (unsigned long)data.length);
    if (gOrigExec) gOrigExec(self, _cmd, data, [NSURL URLWithString:@"aycord://payload.js"], async);
    AYCNativeNotice(@"اللودر اشتغل والحقن تم (bridge).\nإذا ما ظهر منيو ايكورد بالإعدادات، اكتب ‎.ayc بأي محادثة.", 40);
}

// ---- Bridgeless (RCTHost / RCTInstance) ---------------------------------------
// Replacement for -[RCTInstance _loadScriptFromSource:(RCTSource *)]. We let
// Discord's bundle load, then queue our payload as a second script on the same
// runtime (loadScript runs in order on the JS thread).
static void (*gOrigLoadSrc)(id, SEL, id) = NULL;

static void AYCLoadSrc(id self, SEL _cmd, id source) {
    if (gOrigLoadSrc) gOrigLoadSrc(self, _cmd, source);

    if (gInjected) return;
    gInjected = YES;

    NSData *data = AYCWrappedPayload();
    Class srcCls = objc_getClass("RCTSource");
    if (!data || !srcCls) { NSLog(@"[ayCORD] bridgeless: no payload or RCTSource"); return; }

    // RCTSource has readonly props (url/data/length) backed by ivars — fill via KVC.
    id ours = [[srcCls alloc] init];
    @try {
        [ours setValue:[NSURL URLWithString:@"aycord://payload.js"] forKey:@"url"];
        [ours setValue:data forKey:@"data"];
        [ours setValue:@(data.length) forKey:@"length"];
    } @catch (NSException *e) {
        NSLog(@"[ayCORD] bridgeless: building RCTSource failed: %@", e);
        return;
    }
    NSLog(@"[ayCORD] injecting payload via bridgeless (%lu bytes)", (unsigned long)data.length);
    gOrigLoadSrc(self, _cmd, ours);
    AYCNativeNotice(@"اللودر اشتغل والحقن تم (bridgeless).\nإذا ما ظهر منيو ايكورد بالإعدادات، اكتب ‎.ayc بأي محادثة.", 40);
}

static BOOL AYCTryInstall(void) {
    BOOL any = NO;

    Class inst = objc_getClass("RCTInstance");
    Method lm = inst ? class_getInstanceMethod(inst, NSSelectorFromString(@"_loadScriptFromSource:")) : NULL;
    if (lm && !gOrigLoadSrc) {
        gOrigLoadSrc = (void *)method_getImplementation(lm);
        method_setImplementation(lm, (IMP)AYCLoadSrc);
        NSLog(@"[ayCORD] hooked RCTInstance _loadScriptFromSource: (bridgeless)");
    }
    any |= gOrigLoadSrc != NULL;

    Class cls = objc_getClass("RCTCxxBridge");
    Method m = cls ? class_getInstanceMethod(cls, NSSelectorFromString(@"executeApplicationScript:url:async:")) : NULL;
    if (m && !gOrigExec) {
        gOrigExec = (void *)method_getImplementation(m);
        method_setImplementation(m, (IMP)AYCExec);
        NSLog(@"[ayCORD] hooked RCTCxxBridge executeApplicationScript (bridge)");
    }
    any |= gOrigExec != NULL;

    if (any) NSLog(@"[ayCORD] installed (substrate-free swizzle)");
    return any;
}

// RN classes are compiled into Discord's binary, so they are usually available at
// ctor time; retry a few times in case class realization lags.
static void AYCInstallWithRetries(int left) {
    if (AYCTryInstall() || left <= 0) return;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.25 * NSEC_PER_SEC)),
                   dispatch_get_main_queue(), ^{ AYCInstallWithRetries(left - 1); });
}

__attribute__((constructor))
static void AYCInit(void) {
    NSLog(@"[ayCORD] loader active");
    if (!AYCTryInstall()) AYCInstallWithRetries(40);   // ~10s worth of retries
}
