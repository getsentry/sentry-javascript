import { SDK_VERSION } from '@sentry/utils';
import * as SentryNode from '@sentry/node';

import { init as nestInit } from '../src/sdk';

const nodeInit = jest.spyOn(SentryNode, 'init');
const PUBLIC_DSN = 'https://username@domain/123';

describe('Initialize Nest SDK', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  })

  it('has the correct metadata', () => {
    nestInit({
      dsn: PUBLIC_DSN,
    });

    const expectedMetadata = {
      _metadata: {
        sdk: {
          name: 'sentry.javascript.nestjs',
          packages: [{ name: 'npm:@sentry/nestjs', version: SDK_VERSION }],
          version: SDK_VERSION,
        },
      },
    };

    expect(nodeInit).toHaveBeenCalledTimes(1);
    expect(nodeInit).toHaveBeenLastCalledWith(expect.objectContaining(expectedMetadata));
  })
})
