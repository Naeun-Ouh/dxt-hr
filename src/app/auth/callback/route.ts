import { NextResponse, type NextRequest } from "next/server";
import { createAuthClient } from "@/lib/auth/server";
import { appOrigin } from "@/lib/auth/config";
import { safeReturnPath } from "@/lib/routes";
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const client = await createAuthClient();
  if (client && code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(safeReturnPath(request.nextUrl.searchParams.get("next")), appOrigin()));
  }
  return NextResponse.redirect(new URL("/login?error=signin", appOrigin()));
}
