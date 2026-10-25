'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';

type Doc = Awaited<ReturnType<typeof api.listDocuments>>[number];

export default function DocumentsPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setDocs(await api.listDocuments());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, [refresh]);

  async function onUpload(fileList: FileList | null) {
    if (!fileList?.[0]) return;
    setUploading(true);
    try {
      await api.uploadDocument(fileList[0]);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', marginTop: 0 }}>Document library</h1>
      <p style={{ color: 'var(--muted)' }}>Upload PDF, Markdown, TXT, or HTML. Ingestion runs asynchronously.</p>

      <label
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.85rem 1.1rem',
          border: '1px dashed var(--line)',
          borderRadius: 12,
          background: 'var(--panel)',
          cursor: 'pointer',
        }}
      >
        <input
          type="file"
          accept=".pdf,.md,.markdown,.txt,.html,.htm,application/pdf,text/plain,text/markdown,text/html"
          disabled={uploading}
          onChange={(e) => void onUpload(e.target.files)}
          style={{ display: 'none' }}
        />
        {uploading ? 'Uploading…' : 'Choose a file to upload'}
      </label>

      {error ? <p style={{ color: '#b91c1c' }}>{error}</p> : null}

      <div style={{ marginTop: '1.5rem', display: 'grid', gap: '0.75rem' }}>
        {docs.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>No documents yet.</p>
        ) : (
          docs.map((doc) => (
            <article
              key={doc.id}
              style={{
                background: 'var(--panel)',
                border: '1px solid var(--line)',
                borderRadius: 12,
                padding: '1rem 1.1rem',
                display: 'grid',
                gap: '0.35rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <strong>{doc.title}</strong>
                <span
                  style={{
                    fontSize: '0.85rem',
                    padding: '0.15rem 0.55rem',
                    borderRadius: 999,
                    background:
                      doc.status === 'ready'
                        ? '#dcfce7'
                        : doc.status === 'failed'
                          ? '#fee2e2'
                          : '#ffedd5',
                  }}
                >
                  {doc.status}
                </span>
              </div>
              <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
                {doc.originalFilename} · {(doc.byteSize / 1024).toFixed(1)} KB
              </div>
              {doc.errorMessage ? (
                <div style={{ color: '#b91c1c', fontSize: '0.9rem' }}>{doc.errorMessage}</div>
              ) : null}
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.35rem' }}>
                {doc.status === 'failed' ? (
                  <button
                    type="button"
                    onClick={() => void api.retryIngestion(doc.id).then(refresh)}
                    style={{ border: '1px solid var(--line)', background: '#fff', borderRadius: 8, padding: '0.35rem 0.7rem' }}
                  >
                    Retry ingestion
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void api.deleteDocument(doc.id).then(refresh)}
                  style={{ border: '1px solid var(--line)', background: '#fff', borderRadius: 8, padding: '0.35rem 0.7rem' }}
                >
                  Delete
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </main>
  );
}
