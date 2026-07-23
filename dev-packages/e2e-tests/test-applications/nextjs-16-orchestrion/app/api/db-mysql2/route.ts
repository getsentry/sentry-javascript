import mysql from 'mysql2/promise';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// `mysql2` reuses the same MySQL container as the legacy `mysql` driver — it supports both auth plugins.
export async function GET() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'docker',
  });

  try {
    await connection.query('SELECT 1 + 1 AS solution');
    await connection.execute('SELECT 42 AS answer');
    return NextResponse.json({ status: 'ok' });
  } finally {
    await connection.end();
  }
}
