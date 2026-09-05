import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = ["/login"];

export default async function proxy(request: NextRequest) {
  const session = await auth();
  const isAuthenticated = Boolean(session?.user);
  const { pathname } = request.nextUrl;

  const isPublicPath = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );

  if (isPublicPath) {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL("/dashboard", request.nextUrl));
    }
    return NextResponse.next();
  }

  if (!isAuthenticated) {
    const loginUrl = new URL("/login", request.nextUrl);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};