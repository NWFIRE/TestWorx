import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getTenantBrandingSettings, updateTenantBranding } from "@testworx/lib/server/index";

export const runtime = "nodejs";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const BRAND_PRIMARY_COOKIE = "tradeworx_brand_primary";
const BRAND_ACCENT_COOKIE = "tradeworx_brand_accent";

function isAdminRole(role: string | undefined) {
  return role === "platform_admin" || role === "tenant_admin" || role === "office_admin";
}

function normalizeWebsiteInput(value: FormDataEntryValue | null) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return "";
  }

  return /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

async function fileToDataUrl(file: File | null, fallback: string) {
  if (!file || file.size === 0) {
    return fallback;
  }

  if (!file.type.startsWith("image/")) {
    throw new Error("Logos must be uploaded as image files.");
  }

  if (file.size > MAX_LOGO_BYTES) {
    throw new Error("Logo files must be 2 MB or smaller.");
  }

  return `data:${file.type || "application/octet-stream"};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.tenantId || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const logo = formData.get("logo");
    const currentBranding = await getTenantBrandingSettings({
      userId: session.user.id,
      role: session.user.role,
      tenantId: session.user.tenantId
    });
    const logoDataUrl = await fileToDataUrl(logo instanceof File ? logo : null, currentBranding.branding.logoDataUrl ?? "");
    const primaryColor = String(formData.get("primaryColor") ?? "#1E3A5F");
    const accentColor = String(formData.get("accentColor") ?? "#C2410C");

    await updateTenantBranding(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      {
        logoDataUrl,
        primaryColor,
        accentColor,
        legalBusinessName: String(formData.get("legalBusinessName") ?? ""),
        phone: String(formData.get("phone") ?? ""),
        email: String(formData.get("email") ?? ""),
        website: normalizeWebsiteInput(formData.get("website")),
        addressLine1: String(formData.get("addressLine1") ?? ""),
        addressLine2: String(formData.get("addressLine2") ?? ""),
        city: String(formData.get("city") ?? ""),
        state: String(formData.get("state") ?? ""),
        postalCode: String(formData.get("postalCode") ?? ""),
        billingEmail: String(formData.get("billingEmail") ?? ""),
        timezone: String(formData.get("timezone") ?? "")
      }
    );

    const response = NextResponse.json({ success: "Branding updated." });
    const cookieOptions = {
      httpOnly: false,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365
    };

    response.cookies.set(BRAND_PRIMARY_COOKIE, primaryColor, cookieOptions);
    response.cookies.set(BRAND_ACCENT_COOKIE, accentColor, cookieOptions);

    revalidatePath("/app/admin/settings");
    revalidatePath("/app/admin");
    revalidatePath("/app/tech");
    revalidatePath("/app/customer");
    revalidatePath("/login");
    revalidatePath("/accept-invite");
    revalidatePath("/reset-password");
    revalidatePath("/app", "layout");
    revalidatePath("/", "layout");

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update branding." },
      { status: 400 }
    );
  }
}
