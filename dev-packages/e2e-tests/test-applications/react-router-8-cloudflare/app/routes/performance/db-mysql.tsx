import mysql from 'mysql';
import type { Route } from './+types/db-mysql';

// These queries produce `db` spans from the build-time orchestrion transform alone — workerd can't
// monkey-patch requires, so there's no OTel hook involved.
export async function loader(): Promise<{ status: string }> {
  // Connect inside the loader: workerd forbids I/O in global scope.
  const connection = mysql.createConnection({
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: 'docker',
  });

  // Swallow socket-level errors so they don't fail the request for reasons unrelated to the spans.
  connection.on('error', () => {
    // no-op
  });

  try {
    // The nested query runs in a fresh async context (mysql dispatches callbacks from its socket
    // handler), so it only lands on this transaction if the subscriber restored the parent span.
    await new Promise<void>((resolve, reject) => {
      connection.query('SELECT 1 + 1 AS solution', err1 => {
        if (err1) return reject(err1);
        connection.query('SELECT NOW()', err2 => {
          if (err2) return reject(err2);
          resolve();
        });
      });
    });
    return { status: 'ok' };
  } finally {
    connection.end();
  }
}

export default function DbMysql(_props: Route.ComponentProps) {
  return <div>db-mysql</div>;
}
