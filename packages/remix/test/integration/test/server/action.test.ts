import { assertSentryTransaction, assertSentryEvent, RemixTestEnv } from './utils/helpers';

const useV2 = process.env.REMIX_VERSION === '2';

jest.spyOn(console, 'error').mockImplementation();

// Repeat tests for each adapter
describe.each(['builtin', 'express'])('Remix API Actions with adapter = %s', adapter => {
  it('correctly instruments a parameterized Remix API action', async () => {
    const env = await RemixTestEnv.init(adapter);
    const url = `${env.url}/action-json-response/123123`;
    const envelope = await env.getEnvelopeRequest({ url, method: 'post', envelopeType: 'transaction' });
    const transaction = envelope[2];

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
          host: 'localhost:8000',
        },
      },
    });
  });

  it('reports an error thrown from the action', async () => {
    const env = await RemixTestEnv.init(adapter);
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
          tags: {
            'http.status_code': '500',
          },
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
                function: useV2 ? 'remix.server' : 'action',
              },
              handled: true,
              type: 'instrument',
            },
          },
        ],
      },
    });
  });

  it('includes request data in transaction and error events', async () => {
    const env = await RemixTestEnv.init(adapter);
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
          host: 'localhost:8000',
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
          host: 'localhost:8000',
        },
      },
    });
  });

  it('handles a thrown 500 response', async () => {
    const env = await RemixTestEnv.init(adapter);
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
          tags: {
            method: 'POST',
            'http.status_code': '302',
          },
          data: {
            'http.response.status_code': 302,
          },
        },
      },
      tags: {
        transaction: `routes/action-json-response${useV2 ? '.' : '/'}$id`,
      },
    });

    assertSentryTransaction(transaction_2[2], {
      contexts: {
        trace: {
          op: 'http.server',
          status: 'internal_error',
          tags: {
            method: 'GET',
            'http.status_code': '500',
          },
          data: {
            'http.response.status_code': 500,
          },
        },
      },
      tags: {
        transaction: `routes/action-json-response${useV2 ? '.' : '/'}$id`,
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
                function: useV2 ? 'remix.server' : 'loader',
              },
              handled: true,
              type: 'instrument',
            },
          },
        ],
      },
    });
  });

  it('handles a thrown `json()` error response with `statusText`', async () => {
    const env = await RemixTestEnv.init(adapter);
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
          tags: {
            method: 'POST',
            'http.status_code': '500',
          },
          data: {
            'http.response.status_code': 500,
          },
        },
      },
      tags: {
        transaction: `routes/action-json-response${useV2 ? '.' : '/'}$id`,
      },
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
                function: useV2 ? 'ErrorResponse' : 'action',
              },
              handled: true,
              type: 'instrument',
            },
          },
        ],
      },
    });
  });

  it('handles a thrown `json()` error response without `statusText`', async () => {
    const env = await RemixTestEnv.init(adapter);
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
          tags: {
            method: 'POST',
            'http.status_code': '500',
          },
          data: {
            'http.response.status_code': 500,
          },
        },
      },
      tags: {
        transaction: `routes/action-json-response${useV2 ? '.' : '/'}$id`,
      },
    });

    assertSentryEvent(event[2], {
      exception: {
        values: [
          {
            type: 'Error',
            value: useV2
              ? 'Non-Error exception captured with keys: data, internal, status, statusText'
              : 'Non-Error exception captured with keys: data',
            stacktrace: expect.any(Object),
            mechanism: {
              data: {
                function: useV2 ? 'ErrorResponse' : 'action',
              },
              handled: true,
              type: 'instrument',
            },
          },
        ],
      },
    });
  });

  it('handles a thrown `json()` error response with string body', async () => {
    const env = await RemixTestEnv.init(adapter);
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
          tags: {
            method: 'POST',
            'http.status_code': '500',
          },
          data: {
            'http.response.status_code': 500,
          },
        },
      },
      tags: {
        transaction: `routes/action-json-response${useV2 ? '.' : '/'}$id`,
      },
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
                function: useV2 ? 'ErrorResponse' : 'action',
              },
              handled: true,
              type: 'instrument',
            },
          },
        ],
      },
    });
  });

  it('handles a thrown `json()` error response with an empty object', async () => {
    const env = await RemixTestEnv.init(adapter);
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
          tags: {
            method: 'POST',
            'http.status_code': '500',
          },
          data: {
            'http.response.status_code': 500,
          },
        },
      },
      tags: {
        transaction: `routes/action-json-response${useV2 ? '.' : '/'}$id`,
      },
    });

    assertSentryEvent(event[2], {
      exception: {
        values: [
          {
            type: 'Error',
            value: useV2
              ? 'Non-Error exception captured with keys: data, internal, status, statusText'
              : 'Non-Error exception captured with keys: [object has no keys]',
            stacktrace: expect.any(Object),
            mechanism: {
              data: {
                function: useV2 ? 'ErrorResponse' : 'action',
              },
              handled: true,
              type: 'instrument',
            },
          },
        ],
      },
    });
  });
});
