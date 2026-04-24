"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const allowedNativePrefixes = [
  "/app/tech",
  "/app/manuals"
];

export function NativeTechnicianRouteGuard({
  role
}: {
  role: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let mounted = true;

    async function guardRoute() {
      const { Capacitor } = await import("@capacitor/core");
      if (!mounted || !Capacitor.isNativePlatform()) {
        return;
      }

      if (role !== "technician") {
        router.replace("/login?nativeRole=technician_only");
        return;
      }

      const allowed = allowedNativePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
      if (!allowed) {
        router.replace("/app/tech");
      }
    }

    void guardRoute();

    return () => {
      mounted = false;
    };
  }, [pathname, role, router]);

  return null;
}
