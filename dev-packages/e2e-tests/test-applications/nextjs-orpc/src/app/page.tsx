import Link from 'next/link';
import { client } from '~/orpc/client';

export default async function Home() {
  const planets = await client.planet.list({ limit: 10 });

  return (
    <main>
      <h1>Planets</h1>
      <ul>
        {planets.map(planet => (
          <li key={planet.id}>{planet.name}</li>
        ))}
      </ul>
      <Link href={'/client'}>Client</Link>
      <Link href={'/client-error'}>Error</Link>
    </main>
  );
}
