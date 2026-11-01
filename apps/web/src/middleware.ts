import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const authProvider = process.env.NEXT_PUBLIC_AUTH_PROVIDER ?? 'stub';

export default async function middleware(req: NextRequest) {
  if (authProvider !== 'clerk') {
    return NextResponse.next();
  }

  const { clerkMiddleware, createRouteMatcher } = await import('@clerk/nextjs/server');
  const isProtected = createRouteMatcher([
    '/documents(.*)',
    '/chat(.*)',
    '/evaluation(.*)',
    '/settings(.*)',
    '/sources(.*)',
  ]);

  const handler = clerkMiddleware(async (auth, request) => {
    if (isProtected(request)) {
      await auth.protect();
    }
  });

  return handler(req, {} as never);
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
