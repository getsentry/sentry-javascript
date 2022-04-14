/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { onCreateWebpackConfig } from '../gatsby-node';

describe('onCreateWebpackConfig', () => {
  it('sets a webpack config', () => {
    const plugins = {
      define: jest.fn(),
    };

    const actions = {
      setWebpackConfig: jest.fn(),
    };

    const getConfig = jest.fn();

    onCreateWebpackConfig({ plugins, actions, getConfig });

    expect(plugins.define).toHaveBeenCalledTimes(1);
    expect(plugins.define).toHaveBeenLastCalledWith({
      __SENTRY_DSN__: expect.any(String),
      __SENTRY_RELEASE__: expect.any(String),
    });

    expect(actions.setWebpackConfig).toHaveBeenCalledTimes(1);
    expect(actions.setWebpackConfig).toHaveBeenLastCalledWith({ plugins: expect.any(Array) });
  });
});
