// mock helper functions not tested directly in this file
import './mocks';

import {
  clientBuildContext,
  clientWebpackConfig,
  exportedNextConfig,
  serverBuildContext,
  serverWebpackConfig,
} from './fixtures';
import { materializeFinalWebpackConfig } from './testUtils';

describe('webpack loaders', () => {
  it('adds loader to server config', async () => {
    const finalWebpackConfig = await materializeFinalWebpackConfig({
      exportedNextConfig,
      incomingWebpackConfig: serverWebpackConfig,
      incomingWebpackBuildContext: serverBuildContext,
    });

    expect(finalWebpackConfig.module!.rules).toEqual(
      expect.arrayContaining([
        {
          test: expect.any(RegExp),
          use: [
            {
              loader: expect.any(String),
              // Having no criteria for what the object contains is better than using `expect.any(Object)`, because that
              // could be anything
              options: expect.objectContaining({}),
            },
          ],
        },
      ]),
    );
  });

  it("doesn't add loader to client config", async () => {
    const finalWebpackConfig = await materializeFinalWebpackConfig({
      exportedNextConfig,
      incomingWebpackConfig: clientWebpackConfig,
      incomingWebpackBuildContext: clientBuildContext,
    });

    expect(finalWebpackConfig.module).toBeUndefined();
  });
});

describe('`distDir` value in default server-side `RewriteFrames` integration', () => {
  describe('`RewriteFrames` ends up with correct `distDir` value', () => {
    // TODO: this, along with any number of other parts of the build process, should be tested with an integration
    // test which actually runs webpack and inspects the resulting bundles (and that integration test should test
    // custom `distDir` values with and without a `.`, to make sure the regex escaping is working)
  });
});
