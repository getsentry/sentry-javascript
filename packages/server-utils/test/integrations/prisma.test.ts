import type { Client, Span, SpanAttributes } from '@sentry/core';
import {
  createTransport,
  getCurrentScope,
  initAndBind,
  resolvedSyncPromise,
  spanToJSON,
  startSpan,
  withActiveSpan,
} from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { instrumentPrisma } from '../../src/integrations/prisma';
import type { EngineSpan, TracingHelper } from '../../src/integrations/prisma/types';
import { TestClient } from '../mocks/client';

type PrismaGlobal = typeof globalThis & {
  PRISMA_INSTRUMENTATION?: { helper?: TracingHelper };
  V7_PRISMA_INSTRUMENTATION?: { helper?: TracingHelper };
};

function getHelper(): (TracingHelper & { createEngineSpan?: unknown }) | undefined {
  return (globalThis as PrismaGlobal).PRISMA_INSTRUMENTATION?.helper;
}

function initTestClient(): Client {
  getCurrentScope().setClient(undefined);
  return initAndBind(TestClient, {
    dsn: 'https://username@domain/123',
    integrations: [],
    sendClientReports: false,
    stackParser: () => [],
    tracesSampleRate: 1,
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, () => resolvedSyncPromise({})),
  });
}

/** Runs a `db_query` span through the installed helper and returns the span it created. */
function runDbQuerySpan(attributes: SpanAttributes): Span {
  let span: Span | undefined;
  startSpan({ name: 'parent' }, () => {
    getHelper()?.runInChildSpan({ name: 'db_query', attributes }, createdSpan => {
      span = createdSpan;
    });
  });
  return span!;
}

describe('instrumentPrisma', () => {
  afterEach(() => {
    getCurrentScope().setClient(undefined);
    const g = globalThis as PrismaGlobal;
    g.PRISMA_INSTRUMENTATION = undefined;
    g.V7_PRISMA_INSTRUMENTATION = undefined;
  });

  it('installs a tracing helper on both the versioned and fallback globals', () => {
    instrumentPrisma();

    const g = globalThis as PrismaGlobal;
    expect(g.PRISMA_INSTRUMENTATION?.helper).toBeDefined();
    expect(g.V7_PRISMA_INSTRUMENTATION?.helper).toBe(g.PRISMA_INSTRUMENTATION?.helper);
  });

  it('installs a helper that serves both the v5 and v6/v7 interfaces', () => {
    instrumentPrisma();

    const helper = getHelper();
    // v6/v7 interface
    expect(typeof helper?.dispatchEngineSpans).toBe('function');
    expect(typeof helper?.runInChildSpan).toBe('function');
    expect(typeof helper?.getTraceParent).toBe('function');
    // v5-only interface, backfilled so Prisma 5 doesn't crash calling a missing method
    expect(typeof helper?.createEngineSpan).toBe('function');
    expect(helper?.isEnabled()).toBe(true);
  });

  describe('engine spans', () => {
    const engineSpans: EngineSpan[] = [
      {
        id: 'engine-query',
        parentId: null,
        name: 'prisma:engine:query',
        kind: 'internal',
        startTime: [1, 0],
        endTime: [1, 1_000_000],
      },
      {
        id: 'db-query',
        parentId: 'engine-query',
        name: 'prisma:engine:db_query',
        kind: 'client',
        startTime: [1, 0],
        endTime: [1, 1_000_000],
        attributes: {
          'db.query.text': 'SELECT * FROM "User"',
          'db.system.name': 'postgresql',
        },
      },
    ];

    it('runs the callback without creating client or engine spans when no parent is active', () => {
      const client = initTestClient();
      instrumentPrisma();
      const spanStart = vi.fn();
      client.on('spanStart', spanStart);
      const helper = getHelper()!;
      const callback = vi.fn(() => {
        helper.dispatchEngineSpans(engineSpans);
        return 'query result';
      });

      const result = withActiveSpan(null, () => helper.runInChildSpan('operation', callback));

      expect(result).toBe('query result');
      expect(callback).toHaveBeenCalledExactlyOnceWith();
      expect(spanStart).not.toHaveBeenCalled();
    });

    it('attaches the engine batch to the active parent and preserves its child relationships', () => {
      const client = initTestClient();
      instrumentPrisma();
      const endedSpans: Span[] = [];
      client.on('spanEnd', span => endedSpans.push(span));
      const helper = getHelper()!;

      startSpan({ name: 'parent' }, parent => {
        helper.dispatchEngineSpans(engineSpans);

        const engineSpan = endedSpans.find(span => spanToJSON(span).name === 'prisma:engine:query')!;
        expect(
          endedSpans.map(span => ({
            name: spanToJSON(span).name,
            parentSpanId: spanToJSON(span).parent_span_id,
          })),
        ).toEqual([
          { name: 'SELECT "User"', parentSpanId: engineSpan.spanContext().spanId },
          { name: 'prisma:engine:query', parentSpanId: parent.spanContext().spanId },
        ]);
      });
    });
  });

  describe('db.query.summary', () => {
    it('summarizes a standard-dialect statement', () => {
      initTestClient();
      instrumentPrisma();

      const span = runDbQuerySpan({
        'db.system.name': 'postgresql',
        'db.query.text': 'SELECT * FROM "public"."User" WHERE "bio" = $1',
      });

      expect(spanToJSON(span).attributes['db.query.summary']).toBe('SELECT "public"."User"');
    });

    it.each(['mysql', 'mariadb'])('sanitizes double-quoted string literals as literals on %s', (system: string) => {
      initTestClient();
      instrumentPrisma();

      // On MySQL `"..."` is a string literal, so treating it as a quoted identifier would let the
      // `FROM` inside a user-supplied value read as a second table.
      const span = runDbQuerySpan({
        'db.system.name': system,
        'db.query.text': 'SELECT * FROM `User` WHERE bio = "x FROM secret_table"',
      });

      expect(spanToJSON(span).attributes['db.query.summary']).toBe('SELECT `User`');
    });
  });

  it('accepts the instrumentationConfig option', () => {
    expect(() =>
      instrumentPrisma({ instrumentationConfig: { ignoreSpanTypes: ['prisma:client:operation'] } }),
    ).not.toThrow();
    expect(getHelper()).toBeDefined();
  });
});
