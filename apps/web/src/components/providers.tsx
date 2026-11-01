'use client';

import { ClerkProvider } from '@clerk/nextjs';
import type { ReactNode } from 'react';

const authProvider = process.env.NEXT_PUBLIC_AUTH_PROVIDER ?? 'stub';

export function Providers({ children }: { children: ReactNode }) {
  if (authProvider === 'clerk') {
    return <ClerkProvider>{children}</ClerkProvider>;
  }
  return children;
}
