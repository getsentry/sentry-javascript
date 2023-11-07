import { SDK_VERSION } from '@sentry/core';
import { RewriteFrames } from '@sentry/integrations';
import type { SdkMetadata } from '@sentry/types';
import { addOrUpdateIntegration, escapeStringForRegex, GLOBAL_OBJ } from '@sentry/utils';
import type { VercelEdgeOptions } from '@sentry/vercel-edge';
import { init as vercelEdgeInit } from '@sentry/vercel-edge';

export type EdgeOptions = VercelEdgeOptions;

const globalWithInjectedValues = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  __rewriteFramesDistDir__?: string;
};

/** Inits the Sentry NextJS SDK on the Edge Runtime. */
export function init(options: VercelEdgeOptions = {}): void {
  const opts = {
    _metadata: {} as SdkMetadata,
    ...options,
  };

  opts._metadata.sdk = opts._metadata.sdk || {
    name: 'sentry.javascript.nextjs',
    packages: [
      {
        name: 'npm:@sentry/nextjs',
        version: SDK_VERSION,
      },
    ],
    version: SDK_VERSION,
  };

  let integrations = opts.integrations || [];

  // This value is injected at build time, based on the output directory specified in the build config. Though a default
  // is set there, we set it here as well, just in case something has gone wrong with the injection.
  const distDirName = globalWithInjectedValues.__rewriteFramesDistDir__;
  if (distDirName) {
    const distDirAbsPath = distDirName.replace(/(\/|\\)$/, ''); // We strip trailing slashes because "app:///_next" also doesn't have one

    // Normally we would use `path.resolve` to obtain the absolute path we will strip from the stack frame to align with
    // the uploaded artifacts, however we don't have access to that API in edge so we need to be a bit more lax.
    const SOURCEMAP_FILENAME_REGEX = new RegExp(`.*${escapeStringForRegex(distDirAbsPath)}`);

    const defaultRewriteFramesIntegration = new RewriteFrames({
      iteratee: frame => {
        frame.filename = frame.filename?.replace(SOURCEMAP_FILENAME_REGEX, 'app:///_next');
        return frame;
      },
    });

    integrations = addOrUpdateIntegration(defaultRewriteFramesIntegration, integrations);
  }

  opts.integrations = integrations;

  vercelEdgeInit(opts);
}

/**
 * Just a passthrough in case this is imported from the client.
 */
export function withSentryConfig<T>(exportedUserNextConfig: T): T {
  return exportedUserNextConfig;
}

export * from '@sentry/vercel-edge';
export { Span, Transaction } from '@sentry/core';

// eslint-disable-next-line import/export
export * from '../common';

export {
  // eslint-disable-next-line deprecation/deprecation, import/export
  withSentryAPI,
  // eslint-disable-next-line import/export
  wrapApiHandlerWithSentry,
} from './wrapApiHandlerWithSentry';
