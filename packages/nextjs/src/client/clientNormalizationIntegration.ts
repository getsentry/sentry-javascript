import { rewriteFramesIntegration } from '@sentry/browser';
import { defineIntegration } from '@sentry/core';

export const nextjsClientStackFrameNormalizationIntegration = defineIntegration(
  ({ assetPrefixPath }: { assetPrefixPath: string }) => {
    const rewriteFramesInstance = rewriteFramesIntegration({
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
    });

    return {
      ...rewriteFramesInstance,
      name: 'NextjsClientStackFrameNormalization',
    };
  },
);
