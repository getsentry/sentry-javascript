import type { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import { makeMain } from '@sentry/core';

import { NodeExperimentalClient } from '../../src/sdk/client';
import { NodeExperimentalHub } from '../../src/sdk/hub';
import { setupOtel } from '../../src/sdk/initOtel';
import { startSpan } from '../../src/sdk/trace';
import { setupEventContextTrace } from '../../src/utils/setupEventContextTrace';
import { getDefaultNodeExperimentalClientOptions } from '../helpers/getDefaultNodePreviewClientOptions';
import { cleanupOtel } from '../helpers/mockSdkInit';

const PUBLIC_DSN = 'https://username@domain/123';

describe('setupEventContextTrace', () => {
  const beforeSend = jest.fn(() => null);
  let client: NodeExperimentalClient;
  let hub: NodeExperimentalHub;
  let provider: BasicTracerProvider | undefined;

  beforeEach(() => {
    client = new NodeExperimentalClient(
      getDefaultNodeExperimentalClientOptions({
        sampleRate: 1,
        enableTracing: true,
        beforeSend,
        debug: true,
        dsn: PUBLIC_DSN,
      }),
    );

    hub = new NodeExperimentalHub(client);
    makeMain(hub);

    setupEventContextTrace(client);
    provider = setupOtel();
  });

  afterEach(() => {
    beforeSend.mockReset();
    cleanupOtel(provider);
  });

  afterAll(() => {
    jest.clearAllMocks();
  });

  it('works with no active span', async () => {
    const error = new Error('test');
    hub.captureException(error);
    await client.flush();

    expect(beforeSend).toHaveBeenCalledTimes(1);
    expect(beforeSend).toHaveBeenCalledWith(
      expect.objectContaining({
        contexts: expect.objectContaining({
          trace: {
            span_id: expect.any(String),
            trace_id: expect.any(String),
          },
        }),
      }),
      expect.objectContaining({
        event_id: expect.any(String),
        originalException: error,
        syntheticException: expect.any(Error),
      }),
    );
  });

  it('works with active span', async () => {
    const error = new Error('test');

    let outerId: string | undefined;
    let innerId: string | undefined;
    let traceId: string | undefined;

    startSpan({ name: 'outer' }, outerSpan => {
      outerId = outerSpan?.spanContext().spanId;
      traceId = outerSpan?.spanContext().traceId;

      startSpan({ name: 'inner' }, innerSpan => {
        innerId = innerSpan?.spanContext().spanId;
        hub.captureException(error);
      });
    });

    await client.flush();

    expect(outerId).toBeDefined();
    expect(innerId).toBeDefined();
    expect(traceId).toBeDefined();

    expect(beforeSend).toHaveBeenCalledTimes(1);
    expect(beforeSend).toHaveBeenCalledWith(
      expect.objectContaining({
        contexts: expect.objectContaining({
          trace: {
            span_id: innerId,
            parent_span_id: outerId,
            trace_id: traceId,
          },
        }),
      }),
      expect.objectContaining({
        event_id: expect.any(String),
        originalException: error,
        syntheticException: expect.any(Error),
      }),
    );
  });
});
