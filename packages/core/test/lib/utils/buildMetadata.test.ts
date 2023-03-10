import { buildMetadata } from '../../../src/utils/buildMetadata';
import { SDK_VERSION } from '../../../src/version';

describe('buildMetadata', () => {
  it('adds SDK name and packages to the passed options object', () => {
    const options = {};
    const sdkName = 'jQuery';

    buildMetadata(options, sdkName, ['jQuery', 'browser']);

    expect(options).toEqual({
      _metadata: {
        sdk: {
          name: `sentry.javascript.${sdkName}`,
          packages: [
            {
              name: 'npm:@sentry/jQuery',
              version: SDK_VERSION,
            },
            {
              name: 'npm:@sentry/browser',
              version: SDK_VERSION,
            },
          ],
          version: SDK_VERSION,
        },
      },
    });
  });

  it('does not overwrite existing SDK metadata', () => {
    const options = {
      _metadata: {
        sdk: {
          name: 'sentry.javascript.SomeSDK',
          version: '7.40.0',
        },
      },
    };

    buildMetadata(options, 'jQuery', ['jQuery', 'browser']);

    expect(options).toStrictEqual(options);
  });
});
