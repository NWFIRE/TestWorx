"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useTechnicianNotifications } from "./technician-notifications-client";

function extractAppPath(url: string) {
  const appIndex = url.indexOf("/app/");
  if (appIndex < 0) {
    return null;
  }

  return url.slice(appIndex);
}

export function NativeTechnicianBridge() {
  const router = useRouter();
  const { refresh } = useTechnicianNotifications();

  useEffect(() => {
    const removers: Array<() => Promise<void> | void> = [];

    async function startNativeBridge() {
      const [{ Capacitor }, { App }, { PushNotifications }] = await Promise.all([
        import("@capacitor/core"),
        import("@capacitor/app"),
        import("@capacitor/push-notifications")
      ]);

      if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") {
        return;
      }

      const appInfo = await App.getInfo().catch(() => null);

      const registrationHandle = await PushNotifications.addListener("registration", async (token) => {
        await fetch("/api/tech/devices", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          credentials: "same-origin",
          body: JSON.stringify({
            platform: "ios",
            token: token.value,
            deviceName: navigator.userAgent,
            appBuild: appInfo?.build ?? null,
            nativeAppVersion: appInfo?.version ?? null
          })
        }).catch(() => null);
      });
      removers.push(() => registrationHandle.remove());

      const receivedHandle = await PushNotifications.addListener("pushNotificationReceived", () => {
        void refresh();
      });
      removers.push(() => receivedHandle.remove());

      const actionHandle = await PushNotifications.addListener("pushNotificationActionPerformed", (event) => {
        const targetUrl = typeof event.notification.data?.url === "string"
          ? event.notification.data.url
          : typeof event.notification.data?.basePath === "string"
            ? event.notification.data.basePath
            : "/app/tech";
        router.push(targetUrl);
        void refresh();
      });
      removers.push(() => actionHandle.remove());

      const appUrlHandle = await App.addListener("appUrlOpen", (event) => {
        const path = extractAppPath(event.url);
        if (path) {
          router.push(path);
        }
      });
      removers.push(() => appUrlHandle.remove());

      const resumeHandle = await App.addListener("resume", () => {
        void refresh();
      });
      removers.push(() => resumeHandle.remove());

      const permissionStatus = await PushNotifications.requestPermissions();
      if (permissionStatus.receive === "granted") {
        await PushNotifications.register();
      }
    }

    void startNativeBridge();

    return () => {
      for (const remove of removers) {
        void remove();
      }
    };
  }, [refresh, router]);

  return null;
}
