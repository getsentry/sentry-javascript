import { getWebpackBuildFunctionCalled } from './util';

/**
 * TODO
 */
export async function afterProductionBuild(buildInfo: { distDir: string }, options: { debug: boolean }): Promise<void> {
  // The afterProductionBuild function is only relevant if we are using Turbopack instead of Webpack, meaning we noop if we detect that we did any webpack logic
  if (getWebpackBuildFunctionCalled()) {
    if (options.debug) {
      // eslint-disable-next-line no-console
      console.debug('[@sentry/nextjs] Not running afterProductionBuild logic because Webpack context was ran.');
    }
    return;
  }

  // Create release? Maybe before this hook? Add release info like env, commits etc.
  // Finalize release?
  // Upload everything in distDir (consider org, project, authToken, sentryUrl)
  // Delete sourcemaps after upload?
  // Emit telemetry?
}
