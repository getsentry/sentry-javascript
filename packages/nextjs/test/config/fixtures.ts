import type {
  BuildContext,
  EntryPropertyFunction,
  ExportedNextConfig,
  NextConfigObject,
  NextConfigObjectWithSentry,
  WebpackConfigObject,
} from '../../src/config/types';

export const SERVER_SDK_CONFIG_FILE = 'sentry.server.config.js';
export const CLIENT_SDK_CONFIG_FILE = 'sentry.client.config.js';

/** Mock next config object */
export const userNextConfig: NextConfigObject = {
  publicRuntimeConfig: { location: 'dogpark', activities: ['fetch', 'chasing', 'digging'] },
  webpack: (incomingWebpackConfig: WebpackConfigObject, _options: BuildContext) => ({
    ...incomingWebpackConfig,
    mode: 'universal-sniffing',
    entry: async () =>
      Promise.resolve({
        ...(await (incomingWebpackConfig.entry as EntryPropertyFunction)()),
        simulatorBundle: './src/simulator/index.ts',
      }),
  }),
};

/** Mocks of the arguments passed to `withSentryConfig` */
export const exportedNextConfig = userNextConfig as NextConfigObjectWithSentry;
export const userSentryWebpackPluginConfig = { org: 'squirrelChasers', project: 'simulator' };
process.env.SENTRY_AUTH_TOKEN = 'dogsarebadatkeepingsecrets';
process.env.SENTRY_RELEASE = 'doGsaREgReaT';

/** Mocks of the arguments passed to the result of `withSentryConfig` (when it's a function). */
export const defaultRuntimePhase = 'ball-fetching';
// `defaultConfig` is the defaults for all nextjs options (we don't use these at all in the tests, so for our purposes
// here the values don't matter)
export const defaultsObject = { defaultConfig: {} as NextConfigObject };

/** mocks of the arguments passed to `nextConfig.webpack` */
export const serverWebpackConfig: WebpackConfigObject = {
  entry: () =>
    Promise.resolve({
      'pages/_error': 'private-next-pages/_error.js',
      'pages/_app': 'private-next-pages/_app.js',
      'pages/sniffTour': ['./node_modules/smellOVision/index.js', 'private-next-pages/sniffTour.js'],
      'pages/api/_middleware': 'private-next-pages/api/_middleware.js',
      'pages/api/simulator/dogStats/[name]': { import: 'private-next-pages/api/simulator/dogStats/[name].js' },
      'pages/simulator/leaderboard': {
        import: ['./node_modules/dogPoints/converter.js', 'private-next-pages/simulator/leaderboard.js'],
      },
      'pages/api/tricks/[trickName]': {
        import: 'private-next-pages/api/tricks/[trickName].js',
        dependOn: 'treats',
      },
      treats: './node_modules/dogTreats/treatProvider.js',
    }),
  output: { filename: '[name].js', path: '/Users/Maisey/projects/squirrelChasingSimulator/.next' },
  target: 'node',
  context: '/Users/Maisey/projects/squirrelChasingSimulator',
  resolve: { alias: { 'private-next-pages': '/Users/Maisey/projects/squirrelChasingSimulator/pages' } },
};
export const clientWebpackConfig: WebpackConfigObject = {
  entry: () =>
    Promise.resolve({
      main: './src/index.ts',
      'pages/_app': 'next-client-pages-loader?page=%2F_app',
      'pages/_error': 'next-client-pages-loader?page=%2F_error',
      'pages/sniffTour': ['./node_modules/smellOVision/index.js', 'private-next-pages/sniffTour.js'],
      'pages/simulator/leaderboard': {
        import: ['./node_modules/dogPoints/converter.js', 'private-next-pages/simulator/leaderboard.js'],
      },
    }),
  output: { filename: 'static/chunks/[name].js', path: '/Users/Maisey/projects/squirrelChasingSimulator/.next' },
  target: 'web',
  context: '/Users/Maisey/projects/squirrelChasingSimulator',
};

/**
 * Return a mock build context, including the user's next config (which nextjs copies in in real life).
 *
 * @param buildTarget 'server' or 'client'
 * @param materializedNextConfig The user's next config
 * @param webpackVersion
 * @returns A mock build context for the given target
 */
export function getBuildContext(
  buildTarget: 'server' | 'client',
  materializedNextConfig: ExportedNextConfig,
  webpackVersion: string = '5.4.15',
): BuildContext {
  return {
    dev: false,
    buildId: 'sItStAyLiEdOwN',
    dir: '/Users/Maisey/projects/squirrelChasingSimulator',
    config: {
      // nextjs's default values
      target: 'server',
      distDir: '.next',
      ...materializedNextConfig,
    } as NextConfigObject,
    webpack: { version: webpackVersion },
    defaultLoaders: true,
    totalPages: 2,
    isServer: buildTarget === 'server',
  };
}

export const serverBuildContext = getBuildContext('server', exportedNextConfig);
export const clientBuildContext = getBuildContext('client', exportedNextConfig);
