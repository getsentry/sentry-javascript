import { PrismaInstrumentation } from '@prisma/instrumentation';
import { INSTRUMENTED } from '@sentry/node-core';
import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { instrumentPrisma } from '../../../src/integrations/tracing/prisma';

vi.mock('@prisma/instrumentation');

describe('Prisma', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete INSTRUMENTED.Prisma;

    (PrismaInstrumentation as unknown as MockInstance).mockImplementation(() => {
      return {
        setTracerProvider: () => undefined,
        setMeterProvider: () => undefined,
        getConfig: () => ({}),
        setConfig: () => ({}),
        enable: () => undefined,
      };
    });
  });

  it('defaults are correct for instrumentPrisma', () => {
    instrumentPrisma();

    expect(PrismaInstrumentation).toHaveBeenCalledTimes(1);
    expect(PrismaInstrumentation).toHaveBeenCalledWith(undefined);
  });

  it('passes instrumentationConfig option to PrismaInstrumentation', () => {
    const config = { ignoreSpanTypes: [] };
    instrumentPrisma({ instrumentationConfig: config });

    expect(PrismaInstrumentation).toHaveBeenCalledTimes(1);
    expect(PrismaInstrumentation).toHaveBeenCalledWith(config);
  });
});
