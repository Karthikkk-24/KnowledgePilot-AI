'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';

export default function SettingsPage() {
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<Awaited<ReturnType<typeof api.getSettings>> | null>(null);
  const [me, setMe] = useState<Awaited<ReturnType<typeof api.getMe>> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [settings, identity] = await Promise.all([api.getSettings(), api.getMe()]);
      setData(settings);
      setMe(identity);
      setName(settings.tenant.name);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onSave() {
    setSaving(true);
    try {
      await api.updateTenantName(name);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update tenant');
    } finally {
      setSaving(false);
    }
  }

  const canEdit = me?.role === 'admin' || me?.role === 'owner';

  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', marginTop: 0 }}>Settings</h1>
      <p style={{ color: 'var(--muted)' }}>
        Tenant profile and membership roles. Auth is stub-local by default; set Clerk keys for
        production.
      </p>

      {error ? <p style={{ color: '#b91c1c' }}>{error}</p> : null}

      {me ? (
        <section
          style={{
            background: 'var(--panel)',
            border: '1px solid var(--line)',
            borderRadius: 12,
            padding: '1rem',
            marginBottom: '1rem',
          }}
        >
          <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>You</h2>
          <p style={{ margin: 0 }}>
            {me.name || me.email || me.userId} · role <strong>{me.role}</strong>
          </p>
          <p style={{ margin: '0.35rem 0 0', color: 'var(--muted)', fontSize: '0.85rem' }}>
            tenant {me.tenantId}
          </p>
        </section>
      ) : null}

      {data ? (
        <>
          <section
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--line)',
              borderRadius: 12,
              padding: '1rem',
              marginBottom: '1rem',
              display: 'grid',
              gap: '0.75rem',
            }}
          >
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Tenant</h2>
            <label style={{ display: 'grid', gap: 4, fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--muted)' }}>Name</span>
              <input
                value={name}
                disabled={!canEdit || saving}
                onChange={(e) => setName(e.target.value)}
                style={{
                  borderRadius: 10,
                  border: '1px solid var(--line)',
                  padding: '0.55rem 0.7rem',
                }}
              />
            </label>
            <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>slug: {data.tenant.slug}</div>
            {canEdit ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void onSave()}
                style={{
                  justifySelf: 'start',
                  border: 0,
                  borderRadius: 10,
                  padding: '0.55rem 0.9rem',
                  background: 'var(--accent)',
                  color: '#fff',
                }}
              >
                {saving ? 'Saving…' : 'Save name'}
              </button>
            ) : null}
          </section>

          <section
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--line)',
              borderRadius: 12,
              padding: '1rem',
            }}
          >
            <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Members</h2>
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {data.members.map((member) => (
                <div
                  key={member.userId}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    fontSize: '0.95rem',
                  }}
                >
                  <span>{member.name || member.email || member.userId}</span>
                  <span style={{ color: 'var(--muted)' }}>{member.role}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
