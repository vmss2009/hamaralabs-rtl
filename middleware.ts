import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ALLOWED_HOST = process.env.NEXT_PUBLIC_SITE_URL;

export function middleware(request: NextRequest) {
  const host = request.headers.get('origin');

  if (request.nextUrl.pathname.startsWith('/api')) {
    if (host !== ALLOWED_HOST) {
      return new NextResponse(JSON.stringify({ error: 'Forbidden host' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};