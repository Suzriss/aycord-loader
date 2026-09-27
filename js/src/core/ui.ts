// UI helpers — resolve Discord's own React / RN pieces so our menu looks native.
import { find, findByProps, findByName } from "./metro";

export const React = (): any =>
  findByProps("createElement", "useState") || findByProps("createElement");

export const ReactNative = (): any =>
  findByProps("View", "Text", "ScrollView") || findByProps("Alert", "View");

export const Alert = (): any => findByProps("prompt", "alert") || findByProps("alert");

// Native-feeling menu: prefer Discord's action sheet, else a multi-button Alert.
export function actionSheet(title: string, options: { label: string; destructive?: boolean; onPress: () => void }[]) {
  try {
    const ass: any = findByProps("showSimpleActionSheet");
    if (ass?.showSimpleActionSheet) {
      ass.showSimpleActionSheet({
        key: "ayCORDMenu",
        header: { title, onClose: () => {} },
        options: options.map((o) => ({
          label: o.label,
          isDestructive: !!o.destructive,
          onPress: o.onPress,
        })),
      });
      return;
    }
  } catch (e) { console.log("[ayCORD] actionSheet fallback: " + e); }

  // Fallback: RN Alert with buttons (always available).
  const A: any = Alert();
  const buttons = options.map((o) => ({
    text: o.label,
    style: o.destructive ? "destructive" : "default",
    onPress: o.onPress,
  }));
  buttons.push({ text: "إغلاق", style: "cancel", onPress: () => {} } as any);
  A?.alert?.(title, undefined, buttons);
}

export function prompt(title: string, message: string, onSubmit: (v: string) => void, secure = false) {
  const A: any = Alert();
  A?.prompt?.(
    title, message,
    [
      { text: "إلغاء", style: "cancel", onPress: () => {} },
      { text: "تم", onPress: onSubmit },
    ],
    secure ? "secure-text" : "plain-text"
  );
}

// Settings overview screen — we inject our row at the very top of it.
export const SettingsOverview = (): any =>
  findByName("SettingsOverviewScreen") ||
  find((m) => m?.default && (m.default.name === "SettingsOverviewScreen"));
