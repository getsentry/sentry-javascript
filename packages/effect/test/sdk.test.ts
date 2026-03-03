import { getClient, getCurrentScope, getIsolationScope } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EffectClient } from '../src/client';
import { init } from '../src/sdk';

const TEST_DSN = 'https://username@domain/123';

function getMockTransport() {
  return () => ({
    send: vi.fn().mockResolvedValue({}),
    flush: vi.fn().mockResolvedValue(true),
  });
}

describe('init', () => {
  beforeEach(() => {
    getCurrentScope().clear();
    getIsolationScope().clear();
    getCurrentScope().setClient(undefined);
  });

  afterEach(() => {
    getCurrentScope().setClient(undefined);
  });

  it('initializes Sentry client', () => {
    const client = init({
      dsn: TEST_DSN,
      transport: getMockTransport(),
    });

    expect(client).toBeDefined();
    expect(client).toBeInstanceOf(EffectClient);
  });

  it('returns client that can be retrieved with getClient', () => {
    const client = init({
      dsn: TEST_DSN,
      transport: getMockTransport(),
    });

    const retrievedClient = getClient();
    expect(retrievedClient).toBe(client);
  });

  it('applies SDK metadata', () => {
    const client = init({
      dsn: TEST_DSN,
      transport: getMockTransport(),
    });

    const options = client?.getOptions();
    expect(options?._metadata?.sdk?.name).toContain('effect');
  });

  it('initializes with custom integrations', () => {
    const mockIntegration = {
      name: 'TestIntegration',
      setupOnce: vi.fn(),
    };

    const client = init({
      dsn: TEST_DSN,
      transport: getMockTransport(),
      integrations: [mockIntegration],
    });

    expect(client).toBeDefined();
  });

  it('initializes with custom stack parser', () => {
    const mockStackParser = vi.fn().mockReturnValue([]);

    const client = init({
      dsn: TEST_DSN,
      transport: getMockTransport(),
      stackParser: mockStackParser,
    });

    expect(client).toBeDefined();
  });

  it('initializes with empty default integrations', () => {
    const client = init({
      dsn: TEST_DSN,
      transport: getMockTransport(),
      defaultIntegrations: [],
    });

    expect(client).toBeDefined();
  });

  it('initializes with tracing options', () => {
    const client = init({
      dsn: TEST_DSN,
      transport: getMockTransport(),
      tracesSampleRate: 1.0,
    });

    expect(client).toBeDefined();
    expect(client?.getOptions().tracesSampleRate).toBe(1.0);
  });

  it('initializes with environment and release', () => {
    const client = init({
      dsn: TEST_DSN,
      transport: getMockTransport(),
      environment: 'test',
      release: '1.0.0',
    });

    expect(client).toBeDefined();
    expect(client?.getOptions().environment).toBe('test');
    expect(client?.getOptions().release).toBe('1.0.0');
  });
});
