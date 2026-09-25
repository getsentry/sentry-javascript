import type { ReactNode } from 'react';
import { headers } from 'next/headers';

export default async function DynamicLayout({ children }: { children: ReactNode }) {
  await headers();
  return <div data-testid="dynamic-layout">{children}</div>;
}
