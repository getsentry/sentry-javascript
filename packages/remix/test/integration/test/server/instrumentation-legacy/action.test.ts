import { describe, it } from 'vitest';
import { RemixTestEnv, assertSentryEvent, assertSentryTransaction } from '../utils/helpers';

const useV2 = process.env.REMIX_VERSION === '2';

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
      transaction: `routes/action-json-response${useV2 ? '.' : '/'}$id`,
      spans: [
        {
          description: `routes/action-json-response${useV2 ? '.' : '/'}$id`,
          op: 'function.remix.action',
        },
        {
          description: 'root',
          op: 'function.remix.loader',
        },
        {
          description: `routes/action-json-response${useV2 ? '.' : '/'}$id`,
          op: 'function.remix.loader',
        },
        {
          description: `routes/action-json-response${useV2 ? '.' : '/'}$id`,
          op: 'function.remix.document_request',
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
      transaction: expect.stringMatching(/routes\/action-json-response(\/|\.)\$id/),
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Unexpected Server Error',
            stacktrace: expect.any(Object),
            mechanism: {
              data: {
                function: useV2 ? 'remix.server.handleError' : 'action',
              },
              handled: false,
              type: 'instrument',
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
      transaction: `routes/action-json-response${useV2 ? '.' : '/'}$id`,
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
      transaction: expect.stringMatching(/routes\/action-json-response(\/|\.)\$id/),
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
      count: 3,
      method: 'post',
      envelopeType: ['transaction', 'event'],
    });

    const [transaction_1, transaction_2] = envelopes.filter(envelope => envelope[1].type === 'transaction');
    const [event] = envelopes.filter(envelope => envelope[1].type === 'event');
    assertSentryTransaction(transaction_1[2], {
      contexts: {
        trace: {
          op: 'http.server',
          status: 'ok',
          data: {
            method: 'POST',
            'http.response.status_code': 302,
          },
        },
      },
      transaction: `routes/action-json-response${useV2 ? '.' : '/'}$id`,
    });

    assertSentryTransaction(transaction_2[2], {
      contexts: {
        trace: {
          op: 'http.server',
          status: 'internal_error',
          data: {
            method: 'GET',
            'http.response.status_code': 500,
          },
        },
      },
      transaction: `routes/action-json-response${useV2 ? '.' : '/'}$id`,
    });

    assertSentryEvent(event[2], {
      transaction: expect.stringMatching(/routes\/action-json-response(\/|\.)\$id/),
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Unexpected Server Error',
            stacktrace: expect.any(Object),
            mechanism: {
              data: {
                function: useV2 ? 'remix.server.handleError' : 'loader',
              },
              handled: false,
              type: 'instrument',
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
            method: 'POST',
            'http.response.status_code': 500,
          },
        },
      },
      transaction: `routes/action-json-response${useV2 ? '.' : '/'}$id`,
    });

    assertSentryEvent(event[2], {
      transaction: expect.stringMatching(/routes\/action-json-response(\/|\.)\$id/),
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
              type: 'instrument',
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
            method: 'POST',
            'http.response.status_code': 500,
          },
        },
      },
      transaction: `routes/action-json-response${useV2 ? '.' : '/'}$id`,
    });

    assertSentryEvent(event[2], {
      transaction: expect.stringMatching(/routes\/action-json-response(\/|\.)\$id/),
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
              type: 'instrument',
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
            method: 'POST',
            'http.response.status_code': 500,
          },
        },
      },
      transaction: `routes/action-json-response${useV2 ? '.' : '/'}$id`,
    });

    assertSentryEvent(event[2], {
      transaction: expect.stringMatching(/routes\/action-json-response(\/|\.)\$id/),
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
              type: 'instrument',
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
            method: 'POST',
            'http.response.status_code': 500,
          },
        },
      },
      transaction: `routes/action-json-response${useV2 ? '.' : '/'}$id`,
    });

    assertSentryEvent(event[2], {
      transaction: expect.stringMatching(/routes\/action-json-response(\/|\.)\$id/),
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
              type: 'instrument',
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
            method: 'POST',
            'http.response.status_code': 500,
          },
        },
      },
      transaction: `routes/server-side-unexpected-errors${useV2 ? '.' : '/'}$id`,
    });

    assertSentryEvent(event[2], {
      transaction: expect.stringMatching(/routes\/server-side-unexpected-errors(\/|\.)\$id/),
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Thrown String Error',
            stacktrace: expect.any(Object),
            mechanism: {
              data: {
                function: useV2 ? 'remix.server.handleError' : 'action',
              },
              handled: false,
              type: 'instrument',
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
            method: 'POST',
            'http.response.status_code': 500,
          },
        },
      },
      transaction: `routes/server-side-unexpected-errors${useV2 ? '.' : '/'}$id`,
    });

    assertSentryEvent(event[2], {
      transaction: expect.stringMatching(/routes\/server-side-unexpected-errors(\/|\.)\$id/),
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Thrown Object Error',
            stacktrace: expect.any(Object),
            mechanism: {
              data: {
                function: useV2 ? 'remix.server.handleError' : 'action',
              },
              handled: false,
              type: 'instrument',
            },
          },
        ],
      },
    });
  });
});
