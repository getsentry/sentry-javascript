/*
 * The upstream @opentelemetry/instrumentation-mysql2 suite runs against a real
 * mysql2 + MySQL server. Here we exercise the patched `query`/`execute` methods
 * against a fake mysql2 connection so the instrumentation logic (span name,
 * attributes, origin, error status, callback vs streamable signatures, parent
 * linking, patch/unpatch) can be unit tested without a database.
 */

import { EventEmitter } from 'node:events';
import type { SpanJSON } from '@sentry/core';
import { getClient, spanToJSON } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as Sentry from '../../../src';
import { MySQL2Instrumentation } from '../../../src/integrations/tracing/mysql2/vendored/instrumentation';
import { cleanupOtel, mockSdkInit } from '../../helpers/mockSdkInit';

type AnyFn = (...args: any[]) => any;

const ORIGIN = 'auto.db.otel.mysql2';

const CONFIG = { host: 'localhost', port: 3306, database: 'test', user: 'root' };
const ROWS = [{ solution: 2 }];

interface FakeMysql2 {
  Connection: any;
}

// Builds an original `query`/`execute` implementation mimicking mysql2: a trailing
// callback is invoked with `(err, rows)`, otherwise a streamable EventEmitter Query
// is returned that emits `result`/`error`.
function fakeQueryImpl({ reject = false }: { reject?: boolean } = {}): AnyFn {
  return function (this: unknown, _sql: unknown, valuesOrCallback?: unknown, callback?: unknown): unknown {
    const cb = (typeof valuesOrCallback === 'function' ? valuesOrCallback : callback) as AnyFn | undefined;
    const err = reject ? Object.assign(new Error('boom'), { code: 'ER_FAKE' }) : null;

    if (cb) {
      queueMicrotask(() => cb(err, reject ? undefined : ROWS));
      return undefined;
    }

    const query = new EventEmitter();
    queueMicrotask(() => {
      if (reject) {
        query.emit('error', err);
      } else {
        query.emit('result', ROWS);
      }
    });
    return query;
  };
}

function createFakeMysql2({ reject = false }: { reject?: boolean } = {}): FakeMysql2 {
  class Connection {
    public config = CONFIG;
  }

  (Connection.prototype as any).query = fakeQueryImpl({ reject });
  (Connection.prototype as any).execute = fakeQueryImpl({ reject });

  return { Connection };
}

// Waits a macrotask so the queued microtask callback/event has fired and the span ended.
function tick(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

describe('mysql2 instrumentation', () => {
  let instrumentation: MySQL2Instrumentation;
  let finishedSpans: SpanJSON[];

  beforeEach(() => {
    mockSdkInit({ tracesSampleRate: 1 });
    instrumentation = new MySQL2Instrumentation();

    finishedSpans = [];
    getClient()?.on('spanEnd', span => {
      finishedSpans.push(spanToJSON(span));
    });
  });

  afterEach(() => {
    instrumentation.disable();
    cleanupOtel();
  });

  // Sets the `format` helper (top-level module) and patches the Connection prototype
  // through the real `mysql2/lib/connection.js` module-file patch.
  function patch(fake: FakeMysql2, { format }: { format?: AnyFn } = {}): FakeMysql2 {
    const definition = instrumentation.getModuleDefinitions()[0]!;
    if (format) {
      definition.patch!({ format });
    }
    const connectionFile = definition.files.find(file => file.name.includes('connection'))!;
    connectionFile.patch(fake.Connection);
    return fake;
  }

  function unpatch(fake: FakeMysql2): void {
    const definition = instrumentation.getModuleDefinitions()[0]!;
    const connectionFile = definition.files.find(file => file.name.includes('connection'))!;
    connectionFile.unpatch!(fake.Connection);
  }

  function mysqlSpans(): SpanJSON[] {
    return finishedSpans.filter(span => span.origin === ORIGIN);
  }

  function spanByDescription(description: string): SpanJSON | undefined {
    return mysqlSpans().find(span => span.description === description);
  }

  describe('callback signature', () => {
    it('creates a span with the expected name, attributes and origin', async () => {
      const { Connection } = patch(createFakeMysql2());
      const conn = new Connection();

      await Sentry.startSpan(
        { name: 'root' },
        () => new Promise<void>(resolve => conn.query('SELECT 1 + 1 AS solution', () => resolve())),
      );

      const span = spanByDescription('SELECT');
      expect(span).toBeDefined();
      expect(span!.origin).toBe(ORIGIN);
      expect(span!.data).toMatchObject({
        'db.system': 'mysql',
        'db.statement': 'SELECT 1 + 1 AS solution',
        'db.name': 'test',
        'db.user': 'root',
        'db.connection_string': 'jdbc:mysql://localhost:3306/test',
        'net.peer.name': 'localhost',
        'net.peer.port': 3306,
      });
      // op is derived downstream from `db.system`, not set by the instrumentation
      expect(span!.data['sentry.op']).toBeUndefined();
    });

    it('forwards the original callback result', async () => {
      const { Connection } = patch(createFakeMysql2());
      const conn = new Connection();

      const rows = await new Promise((resolve, reject) => {
        Sentry.startSpan({ name: 'root' }, () => {
          conn.query('SELECT 1', (err: Error | null, res?: unknown) => (err ? reject(err) : resolve(res)));
        });
      });

      expect(rows).toEqual(ROWS);
    });

    it('passes values through to the SQL formatter for `db.statement`', async () => {
      const format: AnyFn = (sql: string, values: unknown[]) => `${sql} -- ${JSON.stringify(values)}`;
      const { Connection } = patch(createFakeMysql2(), { format });
      const conn = new Connection();

      await Sentry.startSpan(
        { name: 'root' },
        () => new Promise<void>(resolve => conn.query('SELECT ?', ['1'], () => resolve())),
      );

      const span = spanByDescription('SELECT');
      expect(span!.data['db.statement']).toBe('SELECT ? -- ["1"]');
    });

    it('sets error status when the callback receives an error', async () => {
      const { Connection } = patch(createFakeMysql2({ reject: true }));
      const conn = new Connection();

      await new Promise<void>(resolve => {
        Sentry.startSpan({ name: 'root' }, () => {
          conn.query('SELECT 1', () => resolve());
        });
      });

      const span = spanByDescription('SELECT');
      expect(span).toBeDefined();
      expect(span!.status).toContain('boom');
    });
  });

  describe('execute', () => {
    it('instruments `execute` like `query`', async () => {
      const { Connection } = patch(createFakeMysql2());
      const conn = new Connection();

      await Sentry.startSpan(
        { name: 'root' },
        () => new Promise<void>(resolve => conn.execute('UPDATE users SET x = 1', () => resolve())),
      );

      const span = spanByDescription('UPDATE');
      expect(span).toBeDefined();
      expect(span!.data['db.system']).toBe('mysql');
    });
  });

  describe('streamable signature (no callback)', () => {
    it('creates a span and ends it on the `result` event', async () => {
      const { Connection } = patch(createFakeMysql2());
      const conn = new Connection();

      Sentry.startSpan({ name: 'root' }, () => {
        conn.query('SELECT NOW()');
      });
      await tick();

      const span = spanByDescription('SELECT');
      expect(span).toBeDefined();
      expect(span!.data['db.statement']).toBe('SELECT NOW()');
    });

    it('sets error status on the `error` event', async () => {
      const { Connection } = patch(createFakeMysql2({ reject: true }));
      const conn = new Connection();

      Sentry.startSpan({ name: 'root' }, () => {
        conn.query('SELECT NOW()');
      });
      await tick();

      const span = spanByDescription('SELECT');
      expect(span).toBeDefined();
      expect(span!.status).toContain('boom');
    });
  });

  describe('parent linking', () => {
    it('parents the query span to the active span', async () => {
      const { Connection } = patch(createFakeMysql2());
      const conn = new Connection();

      let rootSpanId: string | undefined;
      await Sentry.startSpan({ name: 'root' }, root => {
        rootSpanId = root.spanContext().spanId;
        return new Promise<void>(resolve => conn.query('SELECT 1', () => resolve()));
      });

      const span = spanByDescription('SELECT');
      expect(span).toBeDefined();
      expect(span!.parent_span_id).toBe(rootSpanId);
    });
  });

  describe('unpatch', () => {
    it('stops creating spans after unpatch', async () => {
      const fake = patch(createFakeMysql2());
      unpatch(fake);
      const conn = new fake.Connection();

      await Sentry.startSpan(
        { name: 'root' },
        () => new Promise<void>(resolve => conn.query('SELECT 1', () => resolve())),
      );

      expect(mysqlSpans()).toHaveLength(0);
    });
  });
});
