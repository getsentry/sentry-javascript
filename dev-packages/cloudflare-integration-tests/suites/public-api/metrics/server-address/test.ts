import type { SerializedMetricContainer } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../../../runner';

it('should add server.address attribute to metrics when serverName is set', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const metric = envelope[1]?.[0]?.[1] as SerializedMetricContainer;

      expect(metric.items[0]).toEqual(
        expect.objectContaining({
          name: 'test.counter',
          type: 'counter',
          value: 1,
          span_id: expect.any(String),
          timestamp: expect.any(Number),
          trace_id: expect.any(String),
          attributes: {
            endpoint: {
              type: 'string',
              value: '/api/test',
            },
            'sentry.environment': {
              type: 'string',
              value: 'test',
            },
            'sentry.release': {
              type: 'string',
              value: expect.any(String),
            },
            'sentry.sdk.name': {
              type: 'string',
              value: 'sentry.javascript.cloudflare',
            },
            'sentry.sdk.version': {
              type: 'string',
              value: expect.any(String),
            },
            'server.address': {
              type: 'string',
              value: 'mi-servidor.com',
            },
          },
        }),
      );
    })
    .start(signal);
  await runner.makeRequest('get', '/');
  await runner.completed();
});
