import type { Span } from '@sentry/core';
import { Client, createTransport, initAndBind, resolvedSyncPromise, spanToJSON } from '@sentry/core';
import { afterEach, describe, expect, it } from 'vitest';
import { instrumentPrisma } from '../../src/integrations/prisma';
import type { TracingHelper } from '../../src/integrations/prisma/types';

type PrismaGlobal = typeof globalThis & {
  PRISMA_INSTRUMENTATION?: { helper?: TracingHelper };
  V7_PRISMA_INSTRUMENTATION?: { helper?: TracingHelper };
};

function getHelper(): (TracingHelper & { createEngineSpan?: unknown }) | undefined {
  return (globalThis as PrismaGlobal).PRISMA_INSTRUMENTATION?.helper;
}

class TestClient extends Client<any> {
  public eventFromException(): PromiseLike<any> {
    return resolvedSyncPromise({});
  }
  public eventFromMessage(): PromiseLike<any> {
    return resolvedSyncPromise({});
  }
}

function initTestClient(): void {
  initAndBind(TestClient, {
    dsn: 'https://username@domain/123',
    integrations: [],
    sendClientReports: false,
    stackParser: () => [],
    tracesSampleRate: 1,
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, () => resolvedSyncPromise({})),
  });
}

/** Runs a `db_query` span through the installed helper and returns the span it created. */
function runDbQuerySpan(attributes: Record<string, unknown>): Span {
  let span: Span | undefined;
  getHelper()?.runInChildSpan({ name: 'db_query', attributes }, createdSpan => {
    span = createdSpan;
  });
  return span!;
}

describe('instrumentPrisma', () => {
  afterEach(() => {
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
