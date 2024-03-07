import { defineIntegration } from '@sentry/core';
import { rewriteFramesIntegration as originalRewriteFramesIntegration } from '@sentry/integrations';
import type { IntegrationFn, StackFrame } from '@sentry/types';
import { GLOBAL_OBJ } from '@sentry/utils';

const globalWithInjectedValues = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  __rewriteFramesAssetPrefixPath__: string;
};

type StackFrameIteratee = (frame: StackFrame) => StackFrame;

interface RewriteFramesOptions {
  root?: string;
  prefix?: string;
  iteratee?: StackFrameIteratee;
}

export const customRewriteFramesIntegration = ((options?: RewriteFramesOptions) => {
  // This value is injected at build time, based on the output directory specified in the build config. Though a default
  // is set there, we set it here as well, just in case something has gone wrong with the injection.
  const assetPrefixPath = globalWithInjectedValues.__rewriteFramesAssetPrefixPath__ || '';

  return originalRewriteFramesIntegration({
    // Turn `<origin>/<path>/_next/static/...` into `app:///_next/static/...`
    iteratee: frame => {
      try {
        const { origin } = new URL(frame.filename as string);
        frame.filename = frame.filename?.replace(origin, 'app://').replace(assetPrefixPath, '');
      } catch (err) {
        // Filename wasn't a properly formed URL, so there's nothing we can do
      }

      // We need to URI-decode the filename because Next.js has wildcard routes like "/users/[id].js" which show up as "/users/%5id%5.js" in Error stacktraces.
      // The corresponding sources that Next.js generates have proper brackets so we also need proper brackets in the frame so that source map resolving works.
      if (frame.filename && frame.filename.startsWith('app:///_next')) {
        frame.filename = decodeURI(frame.filename);
      }

      if (
        frame.filename &&
        frame.filename.match(
          /^app:\/\/\/_next\/static\/chunks\/(main-|main-app-|polyfills-|webpack-|framework-|framework\.)[0-9a-f]+\.js$/,
        )
      ) {
        // We don't care about these frames. It's Next.js internal code.
        frame.in_app = false;
      }

      return frame;
    },
    ...options,
  });
}) satisfies IntegrationFn;

export const rewriteFramesIntegration = defineIntegration(customRewriteFramesIntegration);
