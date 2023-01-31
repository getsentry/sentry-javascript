import { NextTestEnv } from './utils/helpers';

describe('Excluded API Endpoints', () => {
  it('Should exclude API endpoint via RegExp', async () => {
    const env = await NextTestEnv.init();
    const url = `${env.url}/api/excludedEndpoints/excludedWithRegExp`;

    const count = await env.countEnvelopes({
      url,
      envelopeType: 'event',
      timeout: 3000,
    });

    expect(count).toBe(0);
  });

  it('Should exclude API endpoint via string', async () => {
    const env = await NextTestEnv.init();
    const url = `${env.url}/api/excludedEndpoints/excludedWithString`;

    const count = await env.countEnvelopes({
      url,
      envelopeType: 'event',
      timeout: 3000,
    });

    expect(count).toBe(0);
  });
});
