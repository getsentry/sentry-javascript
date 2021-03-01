import { expect } from 'chai';

import { SdkMetadata } from '@sentry/types';
import { init, getCurrentHub } from '../../src';

describe('init()', () => {
  it('Ensure that with browser side integrations, the sdk metadata options passed are not overidden on init', () => {
    const reactSDKMetadata: SdkMetadata = {
      sdk: {
        name: 'sentry.javascript.react',
        packages: [
          {
            name: 'npm:@sentry/react',
            version: '6.6.6',
          },
        ],
        version: '6.6.6',
      },
    };
    init({ _metadata: JSON.parse(JSON.stringify(reactSDKMetadata)) });
    expect(
      getCurrentHub()
        .getClient()
        ?.getOptions()._metadata,
    ).to.deep.equal(reactSDKMetadata);
  });
});
