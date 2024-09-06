import { onCreateWebpackConfig } from '../gatsby-node';
import { sentryWebpackPlugin } from '@sentry/webpack-plugin';

jest.mock('@sentry/webpack-plugin', () => ({
  sentryWebpackPlugin: jest.fn().mockReturnValue({
    apply: jest.fn(),
  }),
}));

describe('onCreateWebpackConfig', () => {
  let originalNodeEnv: string | undefined;

  beforeAll(() => {
    originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  afterEach(() => {
    jest.clearAllMocks();
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

  it('sets sourceMapFilesToDeleteAfterUpload when provided in options', () => {
    const actions = {
      setWebpackConfig: jest.fn(),
    };

    const getConfig = jest.fn();

    const filesToDelete = ['file1.js', 'file2.js'];
    onCreateWebpackConfig({ actions, getConfig }, { sourceMapFilesToDeleteAfterUpload: filesToDelete });

    expect(actions.setWebpackConfig).toHaveBeenCalledTimes(1);

    expect(sentryWebpackPlugin).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcemaps: expect.objectContaining({
          filesToDeleteAfterUpload: filesToDelete,
        }),
      })
    );
  });
});
