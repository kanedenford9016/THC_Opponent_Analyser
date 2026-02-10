import { NextResponse } from "next/server";

const protectedPrefixes = ["/analyze", "/admin"];

export function middleware(request) {
  const { pathname } = request.nextUrl;

  const isProtected = protectedPrefixes.some((p) =>
    pathname.startsWith(p)
  );

  if (!isProtected) {
    return NextResponse.next();
  }

  const authCookie = request.cookies.get("auth");

  if (!authCookie || !authCookie.value) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/analyze/:path*", "/admin/:path*"],
};
