import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogContainerEnvelopeItem, createLogEnvelope } from '../../../src/logs/envelope';
import type { DsnComponents } from '../../../src/types-hoist/dsn';
import type { SerializedLog } from '../../../src/types-hoist/log';
import type { SdkMetadata } from '../../../src/types-hoist/sdkmetadata';
import * as utilsDsn from '../../../src/utils/dsn';
import * as utilsEnvelope from '../../../src/utils/envelope';

// Mock utils functions
vi.mock('../../../src/utils/dsn', () => ({
  dsnToString: vi.fn(dsn => `https://${dsn.publicKey}@${dsn.host}/`),
}));
vi.mock('../../../src/utils/envelope', () => ({
  createEnvelope: vi.fn((_headers, items) => [_headers, items]),
}));

describe('createLogContainerEnvelopeItem', () => {
  it('creates an envelope item with correct structure', () => {
    const mockLog: SerializedLog = {
      timestamp: 1713859200,
      level: 'error',
      body: 'Test error message',
    };

    const result = createLogContainerEnvelopeItem([mockLog, mockLog]);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ type: 'log', item_count: 2, content_type: 'application/vnd.sentry.items.log+json' });
    expect(result[1]).toEqual({ items: [mockLog, mockLog] });
  });
});

describe('createLogEnvelope', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2023-01-01T12:00:00Z'));

    // Reset mocks
    vi.mocked(utilsEnvelope.createEnvelope).mockClear();
    vi.mocked(utilsDsn.dsnToString).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates an envelope with basic headers', () => {
    const mockLogs: SerializedLog[] = [
      {
        timestamp: 1713859200,
        level: 'info',
        body: 'Test log message',
      },
    ];

    const result = createLogEnvelope(mockLogs);

    expect(result[0]).toEqual({});

    // Verify createEnvelope was called with the right parameters
    expect(utilsEnvelope.createEnvelope).toHaveBeenCalledWith({}, expect.any(Array));
  });

  it('includes SDK info when metadata is provided', () => {
    const mockLogs: SerializedLog[] = [
      {
        timestamp: 1713859200,
        level: 'info',
        body: 'Test log message',
      },
    ];

    const metadata: SdkMetadata = {
      sdk: {
        name: 'sentry.javascript.node',
        version: '7.0.0',
      },
    };

    const result = createLogEnvelope(mockLogs, metadata);

    expect(result[0]).toEqual({
      sdk: {
        name: 'sentry.javascript.node',
        version: '7.0.0',
      },
    });
  });

  it('includes DSN when tunnel and DSN are provided', () => {
    const mockLogs: SerializedLog[] = [
      {
        timestamp: 1713859200,
        level: 'info',
        body: 'Test log message',
      },
    ];

    const dsn: DsnComponents = {
      host: 'example.sentry.io',
      path: '/',
      projectId: '123',
      port: '',
      protocol: 'https',
      publicKey: 'abc123',
    };

    const result = createLogEnvelope(mockLogs, undefined, 'https://tunnel.example.com', dsn);

    expect(result[0]).toHaveProperty('dsn');
    expect(utilsDsn.dsnToString).toHaveBeenCalledWith(dsn);
  });

  it('maps each log to an envelope item', () => {
    const mockLogs: SerializedLog[] = [
      {
        timestamp: 1713859200,
        level: 'info',
        body: 'First log message',
      },
      {
        timestamp: 1713859200,
        level: 'error',
        body: 'Second log message',
      },
    ];

    createLogEnvelope(mockLogs);

    // Check that createEnvelope was called with a single container item containing all logs
    expect(utilsEnvelope.createEnvelope).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([
        expect.arrayContaining([
          { type: 'log', item_count: 2, content_type: 'application/vnd.sentry.items.log+json' },
          { items: mockLogs },
        ]),
      ]),
    );
  });
});
