import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAsyncLocalStorageAsyncContextStrategy } from '../src/async';
import { CloudflareClient, type CloudflareClientOptions } from '../src/client';

const MOCK_CLIENT_OPTIONS: CloudflareClientOptions = {
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  stackParser: () => [],
  integrations: [],
  transport: () => ({
    send: vi.fn().mockResolvedValue({}),
    flush: vi.fn().mockResolvedValue(true),
  }),
};

describe('CloudflareClient', () => {
  beforeAll(() => {
    setAsyncLocalStorageAsyncContextStrategy();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('dispose()', () => {
    it('clears hooks', () => {
      const client = new CloudflareClient(MOCK_CLIENT_OPTIONS);

      const hookCallback = vi.fn();
      client.on('beforeEnvelope', hookCallback);

      const privateClient = client as unknown as {
        _hooks: Record<string, Set<unknown> | undefined>;
      };

      const hooksWithSets = Object.values(privateClient._hooks).filter(v => v instanceof Set);
      expect(hooksWithSets.length).toBeGreaterThan(0);

      client.dispose();

      const hooksWithSetsAfter = Object.values(privateClient._hooks).filter(v => v instanceof Set);
      expect(hooksWithSetsAfter.length).toBe(0);
    });

    it('clears event processors', () => {
      const client = new CloudflareClient(MOCK_CLIENT_OPTIONS);

      client.addEventProcessor(event => event);

      const privateClient = client as unknown as {
        _eventProcessors: unknown[];
      };

      const initialLength = privateClient._eventProcessors.length;
      expect(initialLength).toBeGreaterThan(0);

      client.dispose();

      expect(privateClient._eventProcessors.length).toBe(0);
    });

    it('clears integrations', () => {
      const mockIntegration = {
        name: 'MockIntegration',
        setupOnce: vi.fn(),
      };

      const client = new CloudflareClient({
        ...MOCK_CLIENT_OPTIONS,
        integrations: [mockIntegration],
      });

      client.init();

      const privateClient = client as unknown as {
        _integrations: Record<string, unknown | undefined>;
      };

      expect(privateClient._integrations['MockIntegration']).toBeDefined();
      expect(privateClient._integrations['MockIntegration']).not.toBeUndefined();

      client.dispose();

      expect(privateClient._integrations['MockIntegration']).toBeUndefined();
    });

    it('clears transport reference', () => {
      const client = new CloudflareClient(MOCK_CLIENT_OPTIONS);

      const privateClient = client as unknown as {
        _transport?: unknown;
      };

      expect(privateClient._transport).toBeDefined();

      client.dispose();

      expect(privateClient._transport).toBeUndefined();
    });

    it('clears outcomes tracking', () => {
      const client = new CloudflareClient(MOCK_CLIENT_OPTIONS);

      const privateClient = client as unknown as {
        _outcomes: Record<string, number | undefined>;
      };

      privateClient._outcomes['reason:error:outcome1'] = 5;
      privateClient._outcomes['reason:error:outcome2'] = 10;

      const validOutcomes = Object.values(privateClient._outcomes).filter(v => v !== undefined);
      expect(validOutcomes.length).toBe(2);

      client.dispose();

      const validOutcomesAfter = Object.values(privateClient._outcomes).filter(v => v !== undefined);
      expect(validOutcomesAfter.length).toBe(0);
    });

    it('can be called multiple times safely', () => {
      const client = new CloudflareClient(MOCK_CLIENT_OPTIONS);

      expect(() => {
        client.dispose();
        client.dispose();
        client.dispose();
      }).not.toThrow();
    });
  });
});
