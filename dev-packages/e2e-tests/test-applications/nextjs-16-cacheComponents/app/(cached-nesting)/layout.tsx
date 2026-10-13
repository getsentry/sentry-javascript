import { Suspense, type ReactNode } from 'react';

// The Suspense boundary lets the nested layouts/pages below use request APIs (`headers()`,
// runtime params) without tripping the Cache Components prerender guards.
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div data-testid="cached-nesting-group">
      <Suspense fallback={<div>Loading...</div>}>{children}</Suspense>
    </div>
  );
}
