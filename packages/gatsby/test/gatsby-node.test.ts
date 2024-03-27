import { onCreateWebpackConfig } from '../gatsby-node';

describe('onCreateWebpackConfig', () => {
  let originalNodeEnv: string | undefined;

  beforeAll(() => {
    originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('sets a webpack config', () => {
    const actions = {
      setWebpackConfig: jest.fn(),
    };

    const getConfig = jest.fn();

    onCreateWebpackConfig({ actions, getConfig }, {});

    expect(actions.setWebpackConfig).toHaveBeenCalledTimes(1);
    expect(actions.setWebpackConfig).toHaveBeenLastCalledWith({ plugins: expect.any(Array) });
  });

  it('does not set a webpack config if enableClientWebpackPlugin is false', () => {
    const actions = {
      setWebpackConfig: jest.fn(),
    };

    const getConfig = jest.fn();

    onCreateWebpackConfig({ actions, getConfig }, { enableClientWebpackPlugin: false });

    expect(actions.setWebpackConfig).toHaveBeenCalledTimes(0);
  });
});
