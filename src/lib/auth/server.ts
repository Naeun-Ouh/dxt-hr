import "server-only";
import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { authConfig } from "./config";
// React request scope only: never persist a user client in a module/global cache.
export const createAuthClient = cache(async () => {
  const config = authConfig();
  if (!config) return null;
  const cookieStore = await cookies();
  return createServerClient(config.url, config.key, { cookies: {
    getAll: () => cookieStore.getAll(),
    setAll(values) {
      try { values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
      catch { /* Server Components cannot write cookies. proxy.ts refreshes the session. */ }
    },
  } });
});
