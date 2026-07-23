import { NextResponse } from 'next/server';
import postgres from 'postgres';

export const dynamic = 'force-dynamic';

// postgres.js reuses the same Postgres container as the `pg` driver.
export async function GET() {
  const sql = postgres({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'docker',
    database: 'postgres',
  });

  try {
    await sql`SELECT 1 + 1 AS solution`;
    await sql`SELECT * from generate_series(1, 3) as x`;
    return NextResponse.json({ status: 'ok' });
  } finally {
    await sql.end();
  }
}
