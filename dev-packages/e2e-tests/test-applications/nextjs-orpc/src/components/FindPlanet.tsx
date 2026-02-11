'use client';

import { client } from '~/orpc/client';
import { useEffect, useState } from 'react';

type Planet = {
  id: number;
  name: string;
  description?: string;
};

export function FindPlanet({ withError = false }: { withError?: boolean }) {
  const [planet, setPlanet] = useState<Planet>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPlanet() {
      const data = withError ? await client.planet.findWithError({ id: 1 }) : await client.planet.find({ id: 1 });
      setPlanet(data);
    }

    setLoading(true);
    fetchPlanet();
    setLoading(false);
  }, []);

  if (loading) {
    return <div>Loading planet...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div>
      <h1>Planet</h1>
      <div>{planet?.name}</div>
    </div>
  );
}
