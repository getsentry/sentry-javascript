import { RewriteFrames } from '@sentry/integrations';
import { Integration } from '@sentry/types';

const SOURCEMAP_FILENAME_REGEX = /^.*\/\.next\//;

export interface IntegrationFunction {
  (integrations: Integration[]): Integration[];
}

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
 * @param userIntegrations Integrations defined by the user.
 * @returns Final integrations, patched if necessary.
 */
export function getFinalServerIntegrations(
  userIntegrations: Integration[] | IntegrationFunction,
): Integration[] | IntegrationFunction {
  if (Array.isArray(userIntegrations)) {
    return getFinalIntegrationArray(userIntegrations);
  }

  return getFinalIntegrationFunction(userIntegrations);
}

/** Returns the patched integrations array. */
function getFinalIntegrationArray(userIntegrations: Integration[]): Integration[] {
  if (userIntegrations.map(integration => integration.name).includes(defaultRewriteFrames.name)) {
    return userIntegrations;
  }

  userIntegrations.push(defaultRewriteFrames);
  return userIntegrations;
}

/** Returns a function, patching the user's integrations function. */
function getFinalIntegrationFunction(userIntegrationsFunc: IntegrationFunction): IntegrationFunction {
  const integrationWrapper: IntegrationFunction = defaultIntegrations => {
    const userIntegrations = userIntegrationsFunc(defaultIntegrations);
    return getFinalIntegrationArray(userIntegrations);
  };
  return integrationWrapper;
}
