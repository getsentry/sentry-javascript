import { describe, it } from 'vitest';
import { RemixTestEnv, assertSentryEvent, assertSentryTransaction } from '../utils/helpers';

describe('Remix API Actions', () => {
  it('correctly instruments a parameterized Remix API action', async () => {
    const env = await RemixTestEnv.init();
    const url = `${env.url}/action-json-response/123123`;
    const envelopes = await env.getMultipleEnvelopeRequest({
      url,
      method: 'post',
      envelopeType: 'transaction',
      count: 1,
    });
    const transaction = envelopes[0][2];

    assertSentryTransaction(transaction, {
      transaction: `POST action-json-response/:id`,
      spans: [
        {
          data: {
            'code.function': 'action',
            'sentry.op': 'action.remix',
            'match.route.id': 'routes/action-json-response.$id',
            'match.params.id': '123123',
          },
        },
        {
          data: {
            'code.function': 'loader',
            'sentry.op': 'loader.remix',
            'match.route.id': 'root',
            'match.params.id': '123123',
          },
        },
        {
          data: {
            'code.function': 'loader',
            'sentry.op': 'loader.remix',
            'match.route.id': 'routes/action-json-response.$id',
            'match.params.id': '123123',
          },
        },
      ],
      request: {
        method: 'POST',
        url,
        cookies: expect.any(Object),
        headers: {
          'user-agent': expect.any(String),
          host: expect.stringContaining('localhost:'),
        },
      },
    });
  });

  it('reports an error thrown from the action', async () => {
    const env = await RemixTestEnv.init();
    const url = `${env.url}/action-json-response/-1`;

    const envelopes = await env.getMultipleEnvelopeRequest({
      url,
      count: 2,
      method: 'post',
      envelopeType: ['transaction', 'event'],
    });

    const [transaction] = envelopes.filter(envelope => envelope[1].type === 'transaction');
    const [event] = envelopes.filter(envelope => envelope[1].type === 'event');

    assertSentryTransaction(transaction[2], {
      contexts: {
        trace: {
          status: 'internal_error',
          data: {
            'http.response.status_code': 500,
          },
        },
      },
    });

    assertSentryEvent(event[2], {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Unexpected Server Error',
            stacktrace: expect.any(Object),
            mechanism: {
              data: {
                function: 'remix.server.handleError',
              },
              handled: false,
              type: 'auto.function.remix.server',
            },
          },
        ],
      },
    });
  });

  it('includes request data in transaction and error events', async () => {
    const env = await RemixTestEnv.init();
    const url = `${env.url}/action-json-response/-1`;

    const envelopes = await env.getMultipleEnvelopeRequest({
      url,
      count: 2,
      method: 'post',
      envelopeType: ['transaction', 'event'],
    });

    const [transaction] = envelopes.filter(envelope => envelope[1].type === 'transaction');
    const [event] = envelopes.filter(envelope => envelope[1].type === 'event');

    assertSentryTransaction(transaction[2], {
      transaction: `POST action-json-response/:id`,
      request: {
        method: 'POST',
        url,
        cookies: expect.any(Object),
        headers: {
          'user-agent': expect.any(String),
          host: expect.stringContaining('localhost:'),
        },
      },
    });

    assertSentryEvent(event[2], {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Unexpected Server Error',
          },
        ],
      },
      request: {
        method: 'POST',
        url,
        cookies: expect.any(Object),
        headers: {
          'user-agent': expect.any(String),
          host: expect.stringContaining('localhost:'),
        },
      },
    });
  });

  it('handles an error-throwing redirection target', async () => {
    const env = await RemixTestEnv.init();
    const url = `${env.url}/action-json-response/-2`;

    const envelopes = await env.getMultipleEnvelopeRequest({
      url,
      count: 2,
      method: 'post',
      envelopeType: ['transaction', 'event'],
    });

    const [transaction] = envelopes.filter(envelope => envelope[1].type === 'transaction');
    const [event] = envelopes.filter(envelope => envelope[1].type === 'event');

    assertSentryTransaction(transaction[2], {
      contexts: {
        trace: {
          op: 'http.server',
          status: 'internal_error',
          data: {
            'http.response.status_code': 500,
          },
        },
      },
      transaction: `GET action-json-response/:id`,
    });

    assertSentryEvent(event[2], {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Unexpected Server Error',
            stacktrace: expect.any(Object),
            mechanism: {
              data: {
                function: 'remix.server.handleError',
              },
              handled: false,
              type: 'auto.function.remix.server',
            },
          },
        ],
      },
    });
  });

  it('handles a thrown `json()` error response with `statusText`', async () => {
    const env = await RemixTestEnv.init();
    const url = `${env.url}/action-json-response/-3`;

    const envelopes = await env.getMultipleEnvelopeRequest({
      url,
      count: 2,
      method: 'post',
      envelopeType: ['transaction', 'event'],
    });

    const [transaction] = envelopes.filter(envelope => envelope[1].type === 'transaction');
    const [event] = envelopes.filter(envelope => envelope[1].type === 'event');

    assertSentryTransaction(transaction[2], {
      contexts: {
        trace: {
          op: 'http.server',
          status: 'internal_error',
          data: {
            'http.response.status_code': 500,
          },
        },
      },
      transaction: `POST action-json-response/:id`,
    });

    assertSentryEvent(event[2], {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Sentry Test Error',
            stacktrace: expect.any(Object),
            mechanism: {
              data: {
                function: 'action',
              },
              handled: false,
              type: 'auto.function.remix.server',
            },
          },
        ],
      },
    });
  });

  it('handles a thrown `json()` error response without `statusText`', async () => {
    const env = await RemixTestEnv.init();
    const url = `${env.url}/action-json-response/-4`;

    const envelopes = await env.getMultipleEnvelopeRequest({
      url,
      count: 2,
      method: 'post',
      envelopeType: ['transaction', 'event'],
    });

    const [transaction] = envelopes.filter(envelope => envelope[1].type === 'transaction');
    const [event] = envelopes.filter(envelope => envelope[1].type === 'event');

    assertSentryTransaction(transaction[2], {
      contexts: {
        trace: {
          op: 'http.server',
          status: 'internal_error',
          data: {
            'http.response.status_code': 500,
          },
        },
      },
      transaction: `POST action-json-response/:id`,
    });

    assertSentryEvent(event[2], {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Object captured as exception with keys: data',
            stacktrace: expect.any(Object),
            mechanism: {
              data: {
                function: 'action',
              },
              handled: false,
              type: 'auto.function.remix.server',
            },
          },
        ],
      },
    });
  });

  it('handles a thrown `json()` error response with string body', async () => {
    const env = await RemixTestEnv.init();
    const url = `${env.url}/action-json-response/-5`;

    const envelopes = await env.getMultipleEnvelopeRequest({
      url,
      count: 2,
      method: 'post',
      envelopeType: ['transaction', 'event'],
    });

    const [transaction] = envelopes.filter(envelope => envelope[1].type === 'transaction');
    const [event] = envelopes.filter(envelope => envelope[1].type === 'event');

    assertSentryTransaction(transaction[2], {
      contexts: {
        trace: {
          op: 'http.server',
          status: 'internal_error',
          data: {
            'http.response.status_code': 500,
          },
        },
      },
      transaction: `POST action-json-response/:id`,
    });

    assertSentryEvent(event[2], {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Sentry Test Error [string body]',
            stacktrace: expect.any(Object),
            mechanism: {
              data: {
                function: 'action',
              },
              handled: false,
              type: 'auto.function.remix.server',
            },
          },
        ],
      },
    });
  });

  it('handles a thrown `json()` error response with an empty object', async () => {
    const env = await RemixTestEnv.init();
    const url = `${env.url}/action-json-response/-6`;

    const envelopes = await env.getMultipleEnvelopeRequest({
      url,
      count: 2,
      method: 'post',
      envelopeType: ['transaction', 'event'],
    });

    const [transaction] = envelopes.filter(envelope => envelope[1].type === 'transaction');
    const [event] = envelopes.filter(envelope => envelope[1].type === 'event');

    assertSentryTransaction(transaction[2], {
      contexts: {
        trace: {
          op: 'http.server',
          status: 'internal_error',
          data: {
            'http.response.status_code': 500,
          },
        },
      },
      transaction: `POST action-json-response/:id`,
    });

    assertSentryEvent(event[2], {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Object captured as exception with keys: [object has no keys]',
            stacktrace: expect.any(Object),
            mechanism: {
              data: {
                function: 'action',
              },
              handled: false,
              type: 'auto.function.remix.server',
            },
          },
        ],
      },
    });
  });

  it('handles thrown string (primitive) from an action', async () => {
    const env = await RemixTestEnv.init();
    const url = `${env.url}/server-side-unexpected-errors/-1`;

    const envelopes = await env.getMultipleEnvelopeRequest({
      url,
      count: 2,
      method: 'post',
      envelopeType: ['event', 'transaction'],
    });

    const [transaction] = envelopes.filter(envelope => envelope[1].type === 'transaction');
    const [event] = envelopes.filter(envelope => envelope[1].type === 'event');

    assertSentryTransaction(transaction[2], {
      contexts: {
        trace: {
          op: 'http.server',
          status: 'internal_error',
          data: {
            'http.response.status_code': 500,
          },
        },
      },
      transaction: `POST server-side-unexpected-errors/:id`,
    });

    assertSentryEvent(event[2], {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Thrown String Error',
            stacktrace: expect.any(Object),
            mechanism: {
              data: {
                function: 'remix.server.handleError',
              },
              handled: false,
              type: 'auto.function.remix.server',
            },
          },
        ],
      },
    });
  });

  it('handles thrown object from an action', async () => {
    const env = await RemixTestEnv.init();
    const url = `${env.url}/server-side-unexpected-errors/-2`;

    const envelopes = await env.getMultipleEnvelopeRequest({
      url,
      count: 2,
      method: 'post',
      envelopeType: ['event', 'transaction'],
    });

    const [transaction] = envelopes.filter(envelope => envelope[1].type === 'transaction');
    const [event] = envelopes.filter(envelope => envelope[1].type === 'event');

    assertSentryTransaction(transaction[2], {
      contexts: {
        trace: {
          op: 'http.server',
          status: 'internal_error',
          data: {
            'http.response.status_code': 500,
          },
        },
      },
      transaction: `POST server-side-unexpected-errors/:id`,
    });

    assertSentryEvent(event[2], {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Thrown Object Error',
            stacktrace: expect.any(Object),
            mechanism: {
              data: {
                function: 'remix.server.handleError',
              },
              handled: false,
              type: 'auto.function.remix.server',
            },
          },
        ],
      },
    });
  });
});
