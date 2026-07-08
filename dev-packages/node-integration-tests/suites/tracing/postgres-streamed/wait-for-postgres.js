'use strict';

const { Client } = require('pg');

/**
 * Retries a real connection until Postgres accepts it. `docker compose up --wait` only blocks on the
 * in-container `pg_isready` healthcheck; on busy CI the host port-forward can still lag behind, so a
 * scenario's first `connect()` can hit `ECONNREFUSED`/`ECONNRESET` and flake the whole run.
 *
 * Must be awaited *before* opening the scenario's own span: the SDK requires a parent span, so this
 * probe (running with no active span) produces no spans/transactions and can't pollute the asserted
 * envelope. A fresh client is created per attempt because a `pg.Client` is single-use once its
 * connection fails.
 */
async function waitForPostgres(connectionConfig, maxWaitMs = 60_000) {
  const deadline = Date.now() + maxWaitMs;
  for (;;) {
    const client = new Client(connectionConfig);
    try {
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      return;
    } catch {
      await client.end().catch(() => {
        // ignore: the connection never opened
      });
      if (Date.now() > deadline) {
        throw new Error('Timed out waiting for Postgres to accept connections');
      }
      await new Promise(r => setTimeout(r, 250));
    }
  }
}

module.exports = { waitForPostgres };
