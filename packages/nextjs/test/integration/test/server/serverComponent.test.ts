import { NextTestEnv } from './utils/helpers';

describe('Loading the server component', () => {
  it('should capture an error event', async () => {
    const env = await NextTestEnv.init();
    const url = `${env.url}/servercomponent`;

    const envelope = await env.getEnvelopeRequest({
      url,
      envelopeType: 'event',
    });

    expect(envelope[2]).toMatchObject({
      exception: {
        values: [
          {
            type: 'Error',
            value: 'I am an Error captured inside a server component',
          },
        ],
      },
    });
  });
});
