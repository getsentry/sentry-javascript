import { Client } from 'pg';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'docker',
    database: 'postgres',
  });

  await client.connect();

  try {
    await client.query('SELECT 1 + 1 AS solution');
    await client.query('SELECT NOW()');
    return NextResponse.json({ status: 'ok' });
  } finally {
    await client.end();
  }
}
