import { NextTestEnv } from './utils/helpers';

describe('CommonJS API Endpoints', () => {
  it('should not intercept unwrapped request', async () => {
    const env = await NextTestEnv.init();
    const unwrappedRoute = '/api/wrapApiHandlerWithSentry/unwrapped/cjsExport';
    const url = `${env.url}${unwrappedRoute}`;

    const unwrappedEnvelope = await env.getEnvelopeRequest({
      url,
      envelopeType: 'transaction',
      endServer: false,
    });

    expect(unwrappedEnvelope[2]).toMatchObject({
      contexts: {
        trace: {
          op: 'http.server',
          status: 'ok',
          data: {
            'http.response.status_code': 200,
          },
        },
      },
      transaction: `GET ${unwrappedRoute}`,
      type: 'transaction',
      request: {
        url,
      },
    });

    const response = await env.getAPIResponse(url);

    expect(response).toMatchObject({
      success: true,
    });
  });

  it('should intercept wrapped request', async () => {
    const env = await NextTestEnv.init();
    const wrappedRoute = '/api/wrapApiHandlerWithSentry/wrapped/cjsExport';
    const url = `${env.url}${wrappedRoute}`;

    const wrappedEnvelope = await env.getEnvelopeRequest({
      url,
      envelopeType: 'transaction',
      endServer: false,
    });

    expect(wrappedEnvelope[2]).toMatchObject({
      contexts: {
        trace: {
          op: 'http.server',
          status: 'ok',
          data: {
            'http.response.status_code': 200,
          },
        },
      },
      transaction: `GET ${wrappedRoute}`,
      type: 'transaction',
      request: {
        url,
      },
    });

    const response = await env.getAPIResponse(url);

    expect(response).toMatchObject({
      success: true,
    });
  });

  it('should not mess up require statements', async () => {
    const env = await NextTestEnv.init();
    const route = '/api/requireTest';
    const url = `${env.url}${route}`;

    const wrappedEnvelope = await env.getEnvelopeRequest({
      url,
      envelopeType: 'transaction',
      endServer: false,
    });

    expect(wrappedEnvelope[2]).toMatchObject({
      contexts: {
        trace: {
          op: 'http.server',
          status: 'ok',
          data: {
            'http.response.status_code': 200,
          },
        },
      },
      transaction: `GET ${route}`,
      type: 'transaction',
      request: {
        url,
      },
    });

    const response = await env.getAPIResponse(url);

    expect(response).toMatchObject({
      success: true,
    });
  });
});
