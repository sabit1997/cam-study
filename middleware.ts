import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/sign-in", "/sign-up"];

// Edge 런타임에서 서명 없이 exp 클레임만 확인.
// 서명 위조 차단은 백엔드 API 게이트웨이가 담당.
function isTokenValid(token: string): boolean {
  try {
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(b64));
    if (!payload.exp) return true;
    return Date.now() < payload.exp * 1000;
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  const token = request.cookies.get("AccessToken")?.value;
  const pathname = request.nextUrl.pathname.replace(/\/$/, "");
  const isPublic = PUBLIC_PATHS.includes(pathname);

  const isValid = !!token && isTokenValid(token);

  if (!isValid && !isPublic) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }
  if (isValid && isPublic) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|auth|_next/static|_next/image|favicon.ico).*)"],
};
