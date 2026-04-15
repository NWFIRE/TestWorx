import { redirect } from "next/navigation";

export default function AdminRootPage() {
  redirect("/app/admin/dashboard");
}
