import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { DynamicBox } from '@/components/scenarioBox';

export default async function DynamicLayout({ children }: { children: ReactNode }) {
  await headers();
  return (
    <main>
      <h1>Dynamic layout, cached leaf</h1>
      <DynamicBox label="DynamicLayout · awaits headers">
        <p>request-time: {Date.now()}</p>
        {children}
      </DynamicBox>
    </main>
  );
}
