import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createOtelLogEnvelope, createOtelLogEnvelopeItem } from '../../../src/logs/envelope';
import type { DsnComponents, SdkMetadata, SerializedOtelLog } from '../../../src/types-hoist';
import * as utilsDsn from '../../../src/utils-hoist/dsn';
import * as utilsEnvelope from '../../../src/utils-hoist/envelope';

// Mock utils-hoist functions
vi.mock('../../../src/utils-hoist/dsn', () => ({
  dsnToString: vi.fn(dsn => `https://${dsn.publicKey}@${dsn.host}/`),
}));
vi.mock('../../../src/utils-hoist/envelope', () => ({
  createEnvelope: vi.fn((_headers, items) => [_headers, items]),
}));

describe('createOtelLogEnvelopeItem', () => {
  it('creates an envelope item with correct structure', () => {
    const mockLog: SerializedOtelLog = {
      severityText: 'error',
      body: {
        stringValue: 'Test error message',
      },
    };

    const result = createOtelLogEnvelopeItem(mockLog);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ type: 'otel_log' });
    expect(result[1]).toBe(mockLog);
  });
});

describe('createOtelLogEnvelope', () => {
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
    const mockLogs: SerializedOtelLog[] = [
      {
        severityText: 'info',
        body: { stringValue: 'Test log message' },
      },
    ];

    const result = createOtelLogEnvelope(mockLogs);

    expect(result[0]).toEqual({});

    // Verify createEnvelope was called with the right parameters
    expect(utilsEnvelope.createEnvelope).toHaveBeenCalledWith({}, expect.any(Array));
  });

  it('includes SDK info when metadata is provided', () => {
    const mockLogs: SerializedOtelLog[] = [
      {
        severityText: 'info',
        body: { stringValue: 'Test log message' },
      },
    ];

    const metadata: SdkMetadata = {
      sdk: {
        name: 'sentry.javascript.node',
        version: '7.0.0',
      },
    };

    const result = createOtelLogEnvelope(mockLogs, metadata);

    expect(result[0]).toEqual({
      sdk: {
        name: 'sentry.javascript.node',
        version: '7.0.0',
      },
    });
  });

  it('includes DSN when tunnel and DSN are provided', () => {
    const mockLogs: SerializedOtelLog[] = [
      {
        severityText: 'info',
        body: { stringValue: 'Test log message' },
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

    const result = createOtelLogEnvelope(mockLogs, undefined, 'https://tunnel.example.com', dsn);

    expect(result[0]).toHaveProperty('dsn');
    expect(utilsDsn.dsnToString).toHaveBeenCalledWith(dsn);
  });

  it('maps each log to an envelope item', () => {
    const mockLogs: SerializedOtelLog[] = [
      {
        severityText: 'info',
        body: { stringValue: 'First log message' },
      },
      {
        severityText: 'error',
        body: { stringValue: 'Second log message' },
      },
    ];

    createOtelLogEnvelope(mockLogs);

    // Check that createEnvelope was called with an array of envelope items
    expect(utilsEnvelope.createEnvelope).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([
        expect.arrayContaining([{ type: 'otel_log' }, mockLogs[0]]),
        expect.arrayContaining([{ type: 'otel_log' }, mockLogs[1]]),
      ]),
    );
  });
});

describe('Trace context in logs', () => {
  it('correctly sets parent_span_id in trace context', () => {
    // Create a log with trace context
    const mockParentSpanId = 'abcdef1234567890';
    const mockTraceId = '00112233445566778899aabbccddeeff';

    const mockLog: SerializedOtelLog = {
      severityText: 'info',
      body: { stringValue: 'Test log with trace context' },
      traceId: mockTraceId,
      attributes: [
        {
          key: 'sentry.trace.parent_span_id',
          value: { stringValue: mockParentSpanId },
        },
        {
          key: 'some.other.attribute',
          value: { stringValue: 'test value' },
        },
      ],
    };

    // Create an envelope item from this log
    const envelopeItem = createOtelLogEnvelopeItem(mockLog);

    // Verify the parent_span_id is preserved in the envelope item
    expect(envelopeItem[1]).toBe(mockLog);
    expect(envelopeItem[1].traceId).toBe(mockTraceId);
    expect(envelopeItem[1].attributes).toContainEqual({
      key: 'sentry.trace.parent_span_id',
      value: { stringValue: mockParentSpanId },
    });

    // Create an envelope with this log
    createOtelLogEnvelope([mockLog]);

    // Verify the envelope preserves the trace information
    expect(utilsEnvelope.createEnvelope).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([
        expect.arrayContaining([
          { type: 'otel_log' },
          expect.objectContaining({
            traceId: mockTraceId,
            attributes: expect.arrayContaining([
              {
                key: 'sentry.trace.parent_span_id',
                value: { stringValue: mockParentSpanId },
              },
            ]),
          }),
        ]),
      ]),
    );
  });
});
