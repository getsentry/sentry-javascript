import { ProxyTracer } from '@opentelemetry/api';
import { SDK_VERSION } from '@sentry/core';

import { NodeExperimentalClient } from '../../src/sdk/client';
import { getDefaultNodeExperimentalClientOptions } from '../helpers/getDefaultNodePreviewClientOptions';

describe('NodeExperimentalClient', () => {
  it('sets correct metadata', () => {
    const options = getDefaultNodeExperimentalClientOptions();
    const client = new NodeExperimentalClient(options);

    expect(client.getOptions()).toEqual({
      integrations: [],
      transport: options.transport,
      stackParser: options.stackParser,
      _metadata: {
        sdk: {
          name: 'sentry.javascript.node-opentelemetry',
          packages: [
            {
              name: 'npm:@sentry/node-opentelemetry',
              version: SDK_VERSION,
            },
          ],
          version: SDK_VERSION,
        },
      },
      transportOptions: { textEncoder: expect.any(Object) },
      platform: 'node',
      runtime: { name: 'node', version: expect.any(String) },
      serverName: expect.any(String),
      tracesSampleRate: 1,
    });
  });

  it('exposes a tracer', () => {
    const client = new NodeExperimentalClient(getDefaultNodeExperimentalClientOptions());

    const tracer = client.tracer;
    expect(tracer).toBeDefined();
    expect(tracer).toBeInstanceOf(ProxyTracer);

    // Ensure we always get the same tracer instance
    const tracer2 = client.tracer;

    expect(tracer2).toBe(tracer);
  });
});
