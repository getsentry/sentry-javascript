// mock helper functions not tested directly in this file
import './mocks';

import {
  clientBuildContext,
  clientWebpackConfig,
  exportedNextConfig,
  serverBuildContext,
  serverWebpackConfig,
  userSentryWebpackPluginConfig,
} from './fixtures';
import { materializeFinalWebpackConfig } from './testUtils';

type MatcherResult = { pass: boolean; message: () => string };

expect.extend({
  stringEndingWith(received: string, expectedEnding: string): MatcherResult {
    const failsTest = !received.endsWith(expectedEnding);
    const generateErrorMessage = () =>
      failsTest
        ? // Regular error message for match failing
          `expected string ending with '${expectedEnding}', but got '${received}'`
        : // Error message for the match passing if someone has called it with `expect.not`
          `expected string not ending with '${expectedEnding}', but got '${received}'`;

    return {
      pass: !failsTest,
      message: generateErrorMessage,
    };
  },
});

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Expect {
      stringEndingWith: (expectedEnding: string) => MatcherResult;
    }
  }
}

describe('webpack loaders', () => {
  describe('server loaders', () => {
    it('adds server `valueInjection` loader to server config', async () => {
      const finalWebpackConfig = await materializeFinalWebpackConfig({
        exportedNextConfig,
        incomingWebpackConfig: serverWebpackConfig,
        incomingWebpackBuildContext: serverBuildContext,
      });

      expect(finalWebpackConfig.module.rules).toContainEqual({
        test: /sentry\.server\.config\.(jsx?|tsx?)/,
        use: [
          {
            loader: expect.stringEndingWith('valueInjectionLoader.js'),
            options: expect.objectContaining({ values: expect.objectContaining({}) }),
          },
        ],
      });
    });
  });

  describe('client loaders', () => {
    it('adds `valueInjection` loader to client config', async () => {
      const finalWebpackConfig = await materializeFinalWebpackConfig({
        exportedNextConfig,
        incomingWebpackConfig: clientWebpackConfig,
        incomingWebpackBuildContext: clientBuildContext,
      });

      expect(finalWebpackConfig.module.rules).toContainEqual({
        test: /sentry\.client\.config\.(jsx?|tsx?)/,
        use: [
          {
            loader: expect.stringEndingWith('valueInjectionLoader.js'),
            options: expect.objectContaining({ values: expect.objectContaining({}) }),
          },
        ],
      });
    });
  });
});

describe('`distDir` value in default server-side `RewriteFrames` integration', () => {
  describe('`RewriteFrames` ends up with correct `distDir` value', () => {
    // TODO: this, along with any number of other parts of the build process, should be tested with an integration
    // test which actually runs webpack and inspects the resulting bundles (and that integration test should test
    // custom `distDir` values with and without a `.`, to make sure the regex escaping is working)
  });
});
