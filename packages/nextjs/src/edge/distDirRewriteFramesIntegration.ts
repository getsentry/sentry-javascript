import { defineIntegration, rewriteFramesIntegration } from '@sentry/core';
import { escapeStringForRegex } from '@sentry/utils';

export const distDirRewriteFramesIntegration = defineIntegration(({ distDirName }: { distDirName: string }) => {
  const distDirAbsPath = distDirName.replace(/(\/|\\)$/, ''); // We strip trailing slashes because "app:///_next" also doesn't have one

  // Normally we would use `path.resolve` to obtain the absolute path we will strip from the stack frame to align with
  // the uploaded artifacts, however we don't have access to that API in edge so we need to be a bit more lax.
  // eslint-disable-next-line @sentry-internal/sdk/no-regexp-constructor -- user input is escaped
  const SOURCEMAP_FILENAME_REGEX = new RegExp(`.*${escapeStringForRegex(distDirAbsPath)}`);

  const rewriteFramesIntegrationInstance = rewriteFramesIntegration({
    iteratee: frame => {
      frame.filename = frame.filename?.replace(SOURCEMAP_FILENAME_REGEX, 'app:///_next');
      return frame;
    },
  });

  return {
    ...rewriteFramesIntegrationInstance,
    name: 'DistDirRewriteFrames',
  };
});
