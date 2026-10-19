import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { APP_NAME } from '@knowledgepilot/shared';
import './globals.css';

export const metadata: Metadata = {
  title: APP_NAME,
  description: 'Intelligent knowledge platform with verifiable evidence',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
