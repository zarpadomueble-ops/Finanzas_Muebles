import { NextResponse, type NextRequest } from "next/server";
import { isSafeInternalPath } from "@/features/auth/services/role.service";
import { refreshAuthSession } from "@/services/supabase/middleware-client";

const LOGIN_PATH = "/login";
const DEFAULT_AUTHENTICATED_PATH = "/dashboard";

function mergeResponseCookies(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach((cookie) => {
    target.cookies.set(cookie);
  });

  return target;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const { response, user } = await refreshAuthSession(request);

  const isLoginPath = pathname === LOGIN_PATH;

  if (!user && !isLoginPath) {
    const loginUrl = new URL(LOGIN_PATH, request.url);
    const requestedPath = `${pathname}${search}`;

    if (isSafeInternalPath(requestedPath)) {
      loginUrl.searchParams.set("next", requestedPath);
    }

    return mergeResponseCookies(response, NextResponse.redirect(loginUrl));
  }

  if (user && isLoginPath) {
    return mergeResponseCookies(response, NextResponse.redirect(new URL(DEFAULT_AUTHENTICATED_PATH, request.url)));
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
