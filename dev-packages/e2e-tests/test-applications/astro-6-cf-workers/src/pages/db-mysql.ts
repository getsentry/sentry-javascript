import mysql from 'mysql';

// The `@sentry/astro` orchestrion transform injects the `orchestrion:mysql:query` diagnostics
// channel into the bundled `mysql` package at build time. On Cloudflare Workers the transform also
// registers the matching subscriber factory on the global marker, which `@sentry/cloudflare` reads
// in the `withSentry` wrap — so these queries produce `db` spans with no OTel require-hook, which
// wouldn't work in workerd anyway.
export async function GET() {
  // The connection is created inside the handler: workerd forbids I/O in global scope, and mysql
  // opens its socket lazily on the first query. Explicit host/port because workerd's default
  // resolution differs from Node's.
  const connection = mysql.createConnection({
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: 'docker',
  });

  // Swallow connection-level errors so a socket hiccup doesn't become an uncaught exception that
  // fails the request unrelated to the spans.
  connection.on('error', () => {
    // no-op
  });

  try {
    // The second query is NESTED inside the first's callback. mysql dispatches that callback from
    // its socket data handler (a fresh async context), so the nested query's span only lands on this
    // request's http.server transaction if the channel subscriber restored the parent span across
    // that async boundary.
    await new Promise<void>((resolve, reject) => {
      connection.query('SELECT 1 + 1 AS solution', err1 => {
        if (err1) return reject(err1);
        connection.query('SELECT NOW()', err2 => {
          if (err2) return reject(err2);
          resolve();
        });
      });
    });
    return new Response(JSON.stringify({ status: 'ok' }), { headers: { 'content-type': 'application/json' } });
  } finally {
    connection.end();
  }
}
