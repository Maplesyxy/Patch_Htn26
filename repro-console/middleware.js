import { NextResponse } from "next/server";
import { authEnabled, readSession, SESSION_COOKIE } from "./lib/auth";

export async function middleware(req) {
  if (!authEnabled()) return NextResponse.next();
  const cookie = req.cookies.get(SESSION_COOKIE);
  const session = await readSession(cookie && cookie.value);
  if (session) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  if (req.nextUrl.pathname !== "/") url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

// API routes authorise themselves (bearer token or session), so they are excluded here.
export const config = { matcher: ["/((?!api|login|_next/static|_next/image|favicon.ico).*)"] };
