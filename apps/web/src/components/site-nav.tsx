import Link from 'next/link';
import { APP_NAME } from '@knowledgepilot/shared';

const links = [
  { href: '/', label: 'Home' },
  { href: '/documents', label: 'Documents' },
  { href: '/chat', label: 'Chat' },
];

export function SiteNav() {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        padding: '1rem 1.5rem',
        borderBottom: '1px solid var(--line)',
        background: 'rgba(255,253,248,0.85)',
        backdropFilter: 'blur(8px)',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}
    >
      <Link href="/" style={{ textDecoration: 'none', color: 'inherit' }}>
        <strong style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem' }}>{APP_NAME}</strong>
      </Link>
      <nav style={{ display: 'flex', gap: '1rem' }}>
        {links.map((link) => (
          <Link key={link.href} href={link.href} style={{ textDecoration: 'none', color: 'var(--accent)' }}>
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
