import mysql from 'mysql';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const connection = mysql.createConnection({
    user: 'root',
    password: 'docker',
  });

  return new Promise<Response>(resolve => {
    connection.query('SELECT 1 + 1 AS solution', () => {
      connection.query('SELECT NOW()', ['1', '2'], () => {
        connection.end();
        resolve(NextResponse.json({ status: 'ok' }));
      });
    });
  });
}
