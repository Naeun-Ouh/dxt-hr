export function authConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url, key } : null;
}
export function appOrigin(): string {
  const url = new URL(process.env.APP_ORIGIN || "http://localhost:3000");
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("APP_ORIGIN must use HTTPS in production");
  return url.origin;
}
