import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { can, parseMembership, type Capability } from "../permissions";
import { createAuthClient } from "./server";
import { safeReturnPath } from "../routes";
export const currentPrincipal = cache(async () => {
  const client = await createAuthClient();
  if (!client) return null;
  // Validate with Auth; never trust session/user_metadata role claims.
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return null;
  const { data, error: membershipError } = await client.from("app_memberships")
    .select("display_name,status,roles,capabilities").eq("user_id", user.id).maybeSingle();
  if (membershipError) return null;
  return parseMembership(user.id, data);
});
export async function requireCapability(capability: Capability, returnPath = "/") {
  const principal = await currentPrincipal();
  if (!principal) redirect(`/login?next=${encodeURIComponent(safeReturnPath(returnPath))}`);
  if (!can(principal, capability)) notFound();
  return principal;
}
