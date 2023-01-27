import { NextTestEnv } from './utils/helpers';

describe('Loading the throwing server component', () => {
  it('should capture an error event via auto wrapping', async () => {
    if (process.env.USE_APPDIR !== 'true') {
      return;
    }

    const env = await NextTestEnv.init();
    const url = `${env.url}/throwing-servercomponent`;

    const envelope = await env.getEnvelopeRequest({
      url,
      envelopeType: 'event',
    });

    expect(envelope[2]).toMatchObject({
      exception: {
        values: [
          {
            type: 'Error',
            value: 'I am an Error thrown inside a server component',
          },
        ],
      },
    });
  });
});
