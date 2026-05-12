'use strict';

/**
 * Retries until Postgres accepts connections. `docker compose up --wait` can report healthy
 * before the port forward on the host is ready (flaky on busy CI).
 */
async function waitForPostgres(sql, maxWaitMs = 60_000) {
  const deadline = Date.now() + maxWaitMs;
  for (;;) {
    try {
      await sql`SELECT 1`;
      return;
    } catch {
      if (Date.now() > deadline) {
        throw new Error('Timed out waiting for Postgres to accept connections');
      }
      await new Promise(r => setTimeout(r, 250));
    }
  }
}

module.exports = { waitForPostgres };
