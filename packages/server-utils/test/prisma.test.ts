import { afterEach, describe, expect, it } from 'vitest';
import { instrumentPrisma } from '../src/prisma';
import type { TracingHelper } from '../src/prisma/types';

type PrismaGlobal = typeof globalThis & {
  PRISMA_INSTRUMENTATION?: { helper?: TracingHelper };
  V7_PRISMA_INSTRUMENTATION?: { helper?: TracingHelper };
};

function getHelper(): (TracingHelper & { createEngineSpan?: unknown }) | undefined {
  return (globalThis as PrismaGlobal).PRISMA_INSTRUMENTATION?.helper;
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

  it('accepts the instrumentationConfig option', () => {
    expect(() =>
      instrumentPrisma({ instrumentationConfig: { ignoreSpanTypes: ['prisma:client:operation'] } }),
    ).not.toThrow();
    expect(getHelper()).toBeDefined();
  });
});
