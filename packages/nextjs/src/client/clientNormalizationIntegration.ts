import { defineIntegration } from '@sentry/core';
import { rewriteFramesIntegration } from '@sentry/react';

export const nextjsClientStackFrameNormalizationIntegration = defineIntegration(
  ({
    assetPrefix,
    basePath,
    rewriteFramesAssetPrefixPath,
    experimentalThirdPartyOriginStackFrames,
  }: {
    assetPrefix?: string;
    basePath?: string;
    rewriteFramesAssetPrefixPath: string;
    experimentalThirdPartyOriginStackFrames: boolean;
  }) => {
    const rewriteFramesInstance = rewriteFramesIntegration({
      // Turn `<origin>/<path>/_next/static/...` into `app:///_next/static/...`
      iteratee: frame => {
        if (experimentalThirdPartyOriginStackFrames) {
          // Not sure why but access to global WINDOW from @sentry/Browser causes hideous ci errors
          // eslint-disable-next-line no-restricted-globals
          const windowOrigin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
          // A filename starting with the local origin and not ending with JS is most likely JS in HTML which we do not want to rewrite
          if (frame.filename?.startsWith(windowOrigin) && !frame.filename.endsWith('.js')) {
            return frame;
          }

          if (assetPrefix) {
            // If the user defined an asset prefix, we need to strip it so that we can match it with uploaded sourcemaps.
            // assetPrefix always takes priority over basePath.
            if (frame.filename?.startsWith(assetPrefix)) {
              frame.filename = frame.filename.replace(assetPrefix, 'app://');
            }
          } else if (basePath) {
            // If the user defined a base path, we need to strip it to match with uploaded sourcemaps.
            // We should only do this for same-origin filenames though, so that third party assets are not rewritten.
            try {
              const { origin: frameOrigin } = new URL(frame.filename as string);
              if (frameOrigin === windowOrigin) {
                frame.filename = frame.filename?.replace(frameOrigin, 'app://').replace(basePath, '');
              }
            } catch {
              // Filename wasn't a properly formed URL, so there's nothing we can do
            }
          }
        } else {
          try {
            const { origin } = new URL(frame.filename as string);
            frame.filename = frame.filename?.replace(origin, 'app://').replace(rewriteFramesAssetPrefixPath, '');
          } catch {
            // Filename wasn't a properly formed URL, so there's nothing we can do
          }
        }

        // We need to URI-decode the filename because Next.js has wildcard routes like "/users/[id].js" which show up as "/users/%5id%5.js" in Error stacktraces.
        // The corresponding sources that Next.js generates have proper brackets so we also need proper brackets in the frame so that source map resolving works.
        if (experimentalThirdPartyOriginStackFrames) {
          if (frame.filename?.includes('/_next')) {
            frame.filename = decodeURI(frame.filename);
          }

          if (
            frame.filename?.match(
              /\/_next\/static\/chunks\/(main-|main-app-|polyfills-|webpack-|framework-|framework\.)[0-9a-f]+\.js$/,
            )
          ) {
            // We don't care about these frames. It's Next.js internal code.
            frame.in_app = false;
          }
        } else {
          if (frame.filename?.startsWith('app:///_next')) {
            frame.filename = decodeURI(frame.filename);
          }

          if (
            frame.filename?.match(
              /^app:\/\/\/_next\/static\/chunks\/(main-|main-app-|polyfills-|webpack-|framework-|framework\.)[0-9a-f]+\.js$/,
            )
          ) {
            // We don't care about these frames. It's Next.js internal code.
            frame.in_app = false;
          }
        }

        return frame;
      },
    });

    return {
      ...rewriteFramesInstance,
      name: 'NextjsClientStackFrameNormalization',
    };
  },
);
