import { execSync } from 'node:child_process';
import { join } from 'node:path';
import type { Envelope } from '@sentry/core';
import { beforeAll, expect, it } from 'vitest';
import { createRunner } from '../../runner';

beforeAll(() => {
  // Generate the Prisma client (including the WASM query engine used on Workers) before wrangler
  // bundles the worker. The generated client (output: "./generated") is gitignored.
  execSync(`yarn prisma generate --schema ${join(__dirname, 'schema.prisma')}`, { cwd: __dirname, stdio: 'inherit' });
}, 120_000);

function envelopeItemType(envelope: Envelope): string | undefined {
  return envelope[1][0]?.[0]?.type as string | undefined;
}

function envelopeItem(envelope: Envelope): Record<string, unknown> {
  return envelope[1][0]![1] as Record<string, unknown>;
}

it('captures a transaction with Prisma spans for a D1 query via the @sentry/cloudflare/nodejs_compat prismaIntegration', async ({
  signal,
}) => {
  const runner = createRunner(__dirname)
    .ignore('event')
    .expect((envelope: Envelope) => {
      expect(envelopeItemType(envelope)).toBe('transaction');

      const transaction = envelopeItem(envelope);
      const trace = (transaction.contexts as Record<string, Record<string, unknown>> | undefined)?.trace;

      expect(transaction.transaction).toBe('GET /users');
      expect(trace?.op).toBe('http.server');
      expect(trace?.origin).toBe('auto.http.cloudflare');
      expect(trace?.status).toBe('ok');

      const createUserTableQuery =
        'CREATE TABLE IF NOT EXISTS User (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, name TEXT)';
      const selectUsersQuery =
        'SELECT `main`.`User`.`id`, `main`.`User`.`email`, `main`.`User`.`name` FROM `main`.`User` WHERE 1=1 LIMIT ? OFFSET ?';

      // Only the span shape is stable here - ids, timestamps, and parent ids are not.
      const spans = ((transaction.spans as Array<Record<string, unknown>>) || []).map(span => ({
        description: span.description,
        op: span.op,
        origin: span.origin,
      }));

      expect(spans).toHaveLength(16);
      expect(spans).toEqual(
        expect.arrayContaining([
          {
            description: createUserTableQuery,
            op: 'db.query',
            origin: 'auto.db.cloudflare.d1',
          },
          {
            description: expect.stringMatching(
              /^SELECT `main`\.`User`\.`id`, `main`\.`User`\.`email`, `main`\.`User`\.`name` FROM `main`\.`User` WHERE 1=1 LIMIT \? OFFSET \? \/\* traceparent='00-[\da-f]{32}-[\da-f]{16}-01' \*\/$/,
            ),
            op: 'db.query',
            origin: 'auto.db.cloudflare.d1',
          },
          { description: 'prisma:client:connect', op: undefined, origin: 'auto.db.otel.prisma' },
          { description: 'prisma:client:load_engine', op: undefined, origin: 'auto.db.otel.prisma' },
          { description: 'prisma:client:operation', op: undefined, origin: 'auto.db.otel.prisma' },
          { description: 'prisma:client:serialize', op: undefined, origin: 'auto.db.otel.prisma' },
          { description: 'prisma:engine:connect', op: undefined, origin: 'auto.db.otel.prisma' },
          { description: 'prisma:engine:connection', op: undefined, origin: 'auto.db.otel.prisma' },
          { description: 'prisma:engine:query', op: undefined, origin: 'auto.db.otel.prisma' },
          { description: selectUsersQuery, op: undefined, origin: 'auto.db.otel.prisma' },
          { description: 'prisma:engine:js:query:args', op: undefined, origin: 'auto.db.otel.prisma' },
          { description: 'prisma:engine:js:query:sql', op: undefined, origin: 'auto.db.otel.prisma' },
          { description: 'prisma:engine:js:query:result', op: undefined, origin: 'auto.db.otel.prisma' },
          { description: 'prisma:engine:serialize', op: undefined, origin: 'auto.db.otel.prisma' },
          { description: 'prisma:engine:response_json_serialization', op: undefined, origin: 'auto.db.otel.prisma' },
        ]),
      );
      expect(spans.filter(span => span.description === 'prisma:engine:connection')).toHaveLength(2);
    })
    .start(signal);

  await runner.makeRequest('get', '/users');
  await runner.completed();
});
