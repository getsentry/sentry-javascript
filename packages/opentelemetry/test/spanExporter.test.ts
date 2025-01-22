import { ATTR_HTTP_RESPONSE_STATUS_CODE } from '@opentelemetry/semantic-conventions';
import { SDK_VERSION, SEMANTIC_ATTRIBUTE_SENTRY_OP, startInactiveSpan } from '@sentry/core';
import { createTransactionForOtelSpan } from '../src/spanExporter';
import { cleanupOtel, mockSdkInit } from './helpers/mockSdkInit';

describe('createTransactionForOtelSpan', () => {
  beforeEach(() => {
    mockSdkInit({
      tracesSampleRate: 1,
    });
  });

  afterEach(() => {
    cleanupOtel();
  });

  it('works with a basic span', () => {
    const span = startInactiveSpan({ name: 'test', startTime: 1733821670000 });
    span.end(1733821672000);

    const event = createTransactionForOtelSpan(span as any);
    // we do not care about this here
    delete event.sdkProcessingMetadata;

    expect(event).toEqual({
      contexts: {
        trace: {
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          data: {
            'sentry.source': 'custom',
            'sentry.sample_rate': 1,
            'sentry.origin': 'manual',
          },
          origin: 'manual',
          status: 'ok',
        },
        otel: {
          resource: {
            'service.name': 'opentelemetry-test',
            'telemetry.sdk.language': 'nodejs',
            'telemetry.sdk.name': 'opentelemetry',
            'telemetry.sdk.version': expect.any(String),
            'service.namespace': 'sentry',
            'service.version': SDK_VERSION,
          },
        },
      },
      spans: [],
      start_timestamp: 1733821670,
      timestamp: 1733821672,
      transaction: 'test',
      type: 'transaction',
      transaction_info: { source: 'custom' },
    });
  });

  it('works with a http.server span', () => {
    const span = startInactiveSpan({
      name: 'test',
      startTime: 1733821670000,
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.server',
        [ATTR_HTTP_RESPONSE_STATUS_CODE]: 200,
      },
    });
    span.end(1733821672000);

    const event = createTransactionForOtelSpan(span as any);
    // we do not care about this here
    delete event.sdkProcessingMetadata;

    expect(event).toEqual({
      contexts: {
        trace: {
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          data: {
            'sentry.source': 'custom',
            'sentry.sample_rate': 1,
            'sentry.origin': 'manual',
            'sentry.op': 'http.server',
            'http.response.status_code': 200,
          },
          origin: 'manual',
          status: 'ok',
          op: 'http.server',
        },
        otel: {
          resource: {
            'service.name': 'opentelemetry-test',
            'telemetry.sdk.language': 'nodejs',
            'telemetry.sdk.name': 'opentelemetry',
            'telemetry.sdk.version': expect.any(String),
            'service.namespace': 'sentry',
            'service.version': SDK_VERSION,
          },
        },
        response: {
          status_code: 200,
        },
      },
      spans: [],
      start_timestamp: 1733821670,
      timestamp: 1733821672,
      transaction: 'test',
      type: 'transaction',
      transaction_info: { source: 'custom' },
    });
  });
});
