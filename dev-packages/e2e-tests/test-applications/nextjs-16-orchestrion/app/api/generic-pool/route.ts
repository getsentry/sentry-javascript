import { createPool } from 'generic-pool';
import { NextResponse } from 'next/server';
import { Client } from 'pg';

export const dynamic = 'force-dynamic';

export async function GET() {
  const pool = createPool(
    {
      create: async () => {
        const client = new Client({
          host: 'localhost',
          port: 5432,
          user: 'postgres',
          password: 'docker',
          database: 'postgres',
        });
        await client.connect();
        return client;
      },
      destroy: async client => {
        await client.end();
      },
    },
    { max: 2, min: 0 },
  );

  try {
    const client = await pool.acquire();
    await client.query('SELECT 1 + 1 AS solution');
    await pool.release(client);
    return NextResponse.json({ status: 'ok' });
  } finally {
    await pool.drain();
    await pool.clear();
  }
}
