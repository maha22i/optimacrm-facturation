import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === '/') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const token = request.cookies.get('token')?.value;
  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/reset-password');

  if (pathname.startsWith('/portal') && !token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (isAuthPage && token) {
    return NextResponse.redirect(new URL('/portal', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
