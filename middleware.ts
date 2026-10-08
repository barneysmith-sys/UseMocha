import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname !== "/") return NextResponse.next();
  const params = request.nextUrl.searchParams;
  if (!params.get("at") && !params.get("auth_error")) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = "/auth/finish";
  return NextResponse.rewrite(url);
}

export const config = { matcher: "/" };
