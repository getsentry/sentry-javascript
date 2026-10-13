import type { CSSProperties, ReactNode } from 'react';

const box: CSSProperties = {
  padding: '8px 12px',
  margin: '12px 0',
  borderRadius: 8,
};

const badge: CSSProperties = {
  display: 'inline-block',
  fontSize: 12,
  fontWeight: 600,
  color: '#fff',
  padding: '1px 8px',
  borderRadius: 4,
};

export function CachedBox({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section style={{ ...box, border: '2px solid #7c3aed', background: '#f5f3ff' }}>
      <span style={{ ...badge, background: '#7c3aed' }}>Cached · {label}</span>
      {children}
    </section>
  );
}

export function DynamicBox({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section style={{ ...box, border: '2px dashed #2563eb', background: '#eff6ff' }}>
      <span style={{ ...badge, background: '#2563eb' }}>Dynamic · {label}</span>
      {children}
    </section>
  );
}
