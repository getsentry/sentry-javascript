import * as SentryCore from '@sentry/core';
import type { Database } from 'db0';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabasePlugin } from '../../../src/runtime/utils/instrumentDatabase';

const span = { setStatus: vi.fn() };

vi.mock('@sentry/core', async importOriginal => ({
  ...(await importOriginal<typeof SentryCore>()),
  captureException: vi.fn(),
  startSpan: vi.fn((_options, callback) => callback(span)),
}));

function createDatabase(prepare: Database['prepare']): Database {
  return { dialect: 'sqlite', prepare, sql: vi.fn(), exec: vi.fn() } as unknown as Database;
}

describe('createDatabasePlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('captures an error that `prepare` throws and rethrows it', () => {
    const error = new Error('no such table: missing');
    const db = createDatabase(() => {
      throw error;
    });

    createDatabasePlugin(() => db, { default: { connector: 'bun-sqlite' } });

    expect(() => db.prepare('SELECT * FROM missing')).toThrow(error);
    expect(SentryCore.startSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: expect.objectContaining({
          'db.query.text': 'SELECT * FROM missing',
          'db.system.name': 'sqlite',
          'sentry.origin': 'auto.db.nuxt',
        }),
      }),
      expect.any(Function),
    );
    expect(span.setStatus).toHaveBeenCalledWith({ code: SentryCore.SPAN_STATUS_ERROR, message: 'internal_error' });
    expect(SentryCore.captureException).toHaveBeenCalledWith(error, {
      mechanism: { handled: false, type: 'auto.db.nuxt' },
    });
  });

  it('names the database system after the dialect, not the connector', async () => {
    const statement = { all: vi.fn(), get: vi.fn(), run: vi.fn(), bind: vi.fn() };
    const db = createDatabase(() => statement as unknown as ReturnType<Database['prepare']>);

    createDatabasePlugin(() => db, { default: { connector: 'bun-sqlite' } });
    await db.prepare('SELECT 1').all();

    expect(SentryCore.startSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: expect.objectContaining({ 'db.system.name': 'sqlite', 'db.namespace': 'db.sqlite' }),
      }),
      expect.any(Function),
    );
  });
});
