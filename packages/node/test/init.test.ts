import { SdkMetadata } from '@sentry/types';

import { getCurrentHub, init } from '../src';

describe('init()', () => {
  test('Ensure that with server side integrations, the sdk metadata options passed are not overidden on init', () => {
    const serverlessSDKMetadata: SdkMetadata = {
      sdk: {
        integrations: ['AWSLambda'],
        name: 'sentry.javascript.serverless',
        packages: [
          {
            name: 'npm:@sentry/serverless',
            version: '6.6.6',
          },
        ],
        version: '6.6.6',
      },
    };
    init({ _metadata: JSON.parse(JSON.stringify(serverlessSDKMetadata)) });
    expect(
      getCurrentHub()
        .getClient()
        ?.getOptions()._metadata,
    ).toEqual(expect.objectContaining(serverlessSDKMetadata));
  });
});
