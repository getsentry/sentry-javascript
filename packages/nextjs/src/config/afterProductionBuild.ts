import type { SentryBuildOptions } from './types';
import { getWebpackBuildFunctionCalled } from './util';

/**
 * TODO
 */
export async function handleAfterProductionBuild(
  buildInfo: { distDir: string; releaseName: string | undefined },
  sentryBuildOptions: SentryBuildOptions,
): Promise<void> {
  // The handleAfterProductionBuild function is only relevant if we are using Turbopack instead of Webpack, meaning we noop if we detect that we did any webpack logic
  if (getWebpackBuildFunctionCalled()) {
    if (sentryBuildOptions.debug) {
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
