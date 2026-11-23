import '../../orpc/server';
import * as Sentry from '@sentry/nextjs';
import type { Metadata } from 'next';
import Link from 'next/link';
import { client } from '../../orpc/client';

export function generateMetadata(): Metadata {
  return {
    other: {
      ...Sentry.getTraceData(),
    },
  };
}

export default async function OrpcPage() {
  const planets = await client.planet.list({ limit: 10 });

  return (
    <main>
      <h1>Planets</h1>
      <ul>
        {planets.map(planet => (
          <li key={planet.id}>{planet.name}</li>
        ))}
      </ul>
      <Link href={'/orpc/client'}>Client</Link>
      <Link href={'/orpc/client-error'}>Error</Link>
    </main>
  );
}
