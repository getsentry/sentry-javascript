import { RewriteFrames } from '@sentry/integrations';
import { Integration } from '@sentry/types';

const SOURCEMAP_FILENAME_REGEX = /^.*\/.next\//;

/** Default RewriteFrames integration to match filenames in Sentry. */
export const defaultRewriteFrames = new RewriteFrames({
  iteratee: frame => {
    frame.filename = frame.filename?.replace(SOURCEMAP_FILENAME_REGEX, 'app:///_next/');
    return frame;
  },
});

/**
 * Retrieves the patched integrations for the server.
 *
 * There must be a RewriteFrames integration.
 * If the user has defined one, there's nothing to patch.
 * If not, the default RewriteFrames integration is used.
 *
 * @param userIntegrations integrations defined by the user.
 * @returns final integrations, patched if necessary.
 */
export function getFinalServerIntegrations(
  userIntegrations: Integration[] | ((integrations: Integration[]) => Integration[]),
): Integration[] | ((integrations: Integration[]) => Integration[]) {
  if (Array.isArray(userIntegrations)) {
    return getFinalIntegrationArray(userIntegrations);
  } else {
    return getFinalIntegrationFunction(userIntegrations);
  }
}

/** Returns the patched integrations array. */
function getFinalIntegrationArray(userIntegrations: Integration[]): Integration[] {
  const rewriteFramesIntegration = defaultRewriteFrames;
  if (userIntegrations.map(integration => integration.name).includes(rewriteFramesIntegration.name)) {
    return userIntegrations;
  } else {
    userIntegrations.push(rewriteFramesIntegration);
    return userIntegrations;
  }
}

/** Returns a function, patching the user's integrations function. */
function getFinalIntegrationFunction(
  userIntegrationsFunc: (integrations: Integration[]) => Integration[],
): (integrations: Integration[]) => Integration[] {
  const integrationWrapper = (defaultIntegrations: Integration[]): Integration[] => {
    const userIntegrations = userIntegrationsFunc(defaultIntegrations);
    return getFinalIntegrationArray(userIntegrations);
  };
  return integrationWrapper;
}
