import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // NOTE: JWT in IndexedDB is not accessible to Next.js Middleware directly.
  // We would normally use cookies for server-side redirection.
  // Given the offline-first requirement and JWT in IDB, 
  // we will handle most redirection in the client-side layouts/pages.
  
  // However, we can still use middleware for basic layout-level checks if we move JWT to cookies too.
  // For this MVP, we'll rely on client-side protection for IDB features.
  
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
