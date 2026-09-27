// ayCORD — substrate-free loader for Discord (React Native / Hermes).
// -----------------------------------------------------------------------------
// Built as a plain dylib with NO CydiaSubstrate dependency, so it loads on
// sideloaded / TrollStore / jailbroken devices alike. It swizzles ONE ObjC
// method using the Objective-C runtime (method_setImplementation) — no MSHook,
// no ElleKit, no external framework.
//
// After Discord's own JS bundle runs on the RN bridge, we evaluate our payload
// (aycord.js, shipped at the .app root) in the same JS context.
// Injection point: -[RCTCxxBridge executeApplicationScript:url:async:]
// -----------------------------------------------------------------------------

#import <Foundation/Foundation.h>
#import <objc/runtime.h>
#import <objc/message.h>

static BOOL gInjected = NO;
static void (*gOrigExec)(id, SEL, NSData *, NSURL *, BOOL) = NULL;

static NSString *AYCReadPayload(void) {
    NSString *path = [[NSBundle mainBundle] pathForResource:@"aycord" ofType:@"js"];
    if (!path) { NSLog(@"[ayCORD] aycord.js not found in app bundle"); return nil; }
    NSError *err = nil;
    NSString *src = [NSString stringWithContentsOfFile:path encoding:NSUTF8StringEncoding error:&err];
    if (err) { NSLog(@"[ayCORD] read payload failed: %@", err); return nil; }
    return src;
}

// Replacement for -[RCTCxxBridge executeApplicationScript:url:async:]
static void AYCExec(id self, SEL _cmd, NSData *script, NSURL *url, BOOL async) {
    if (gOrigExec) gOrigExec(self, _cmd, script, url, async);   // run Discord's bundle

    if (gInjected) return;
    gInjected = YES;

    NSString *src = AYCReadPayload();
    if (!src.length) { NSLog(@"[ayCORD] empty payload"); return; }

    // Guard: our payload can never crash Discord.
    NSString *wrapped = [NSString stringWithFormat:
        @"(function(){try{%@}catch(e){if(typeof nativeLoggingHook!=='undefined')"
         "nativeLoggingHook('[ayCORD] fatal: '+(e&&e.stack||e),3);}})();", src];

    NSData *data = [wrapped dataUsingEncoding:NSUTF8StringEncoding];
    NSURL *purl = [NSURL URLWithString:@"aycord://payload.js"];
    NSLog(@"[ayCORD] injecting payload (%lu bytes)", (unsigned long)data.length);
    if (gOrigExec) gOrigExec(self, _cmd, data, purl, async);
}

static BOOL AYCTryInstall(void) {
    Class cls = objc_getClass("RCTCxxBridge");
    if (!cls) return NO;
    SEL sel = NSSelectorFromString(@"executeApplicationScript:url:async:");
    Method m = class_getInstanceMethod(cls, sel);
    if (!m) { NSLog(@"[ayCORD] executeApplicationScript:url:async: not found on RCTCxxBridge"); return NO; }
    gOrigExec = (void *)method_getImplementation(m);
    method_setImplementation(m, (IMP)AYCExec);
    NSLog(@"[ayCORD] installed (substrate-free swizzle)");
    return YES;
}

// RCTCxxBridge is compiled into Discord's binary, so it is usually available at
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
