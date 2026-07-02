import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 비로그인 접근 허용 + 로그인 시 홈 리다이렉트
const AUTH_ONLY_PUBLIC = ["/sign-in", "/sign-up"];
// 로그인 여부 상관없이 항상 접근 허용
const OPEN_PATHS = ["/download"];

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

  if (OPEN_PATHS.includes(pathname)) return NextResponse.next();

  const isPublic = AUTH_ONLY_PUBLIC.includes(pathname);
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
  matcher: ["/((?!api|auth|_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.json).*)"],
};
