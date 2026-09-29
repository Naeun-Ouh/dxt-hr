"use server";
import { redirect } from "next/navigation";
import { createAuthClient } from "@/lib/auth/server";
import { appOrigin } from "@/lib/auth/config";
import { safeReturnPath } from "@/lib/routes";
export async function signIn(formData: FormData) {
  const client = await createAuthClient();
  if (!client) redirect("/login?error=unavailable");
  const callback = new URL("/auth/callback", appOrigin());
  callback.searchParams.set("next", safeReturnPath(formData.get("next")));
  const { data, error } = await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback.toString() } });
  if (error || !data.url) redirect("/login?error=signin");
  redirect(data.url);
}
export async function signOut() {
  const client = await createAuthClient();
  if (client) {
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) redirect("/login?error=signout");
  }
  redirect("/login");
}
