import * as path from 'path';
import { defineIntegration, rewriteFramesIntegration } from '@sentry/core';
import { escapeStringForRegex } from '@sentry/utils';

export const distDirRewriteFramesIntegration = defineIntegration(({ distDirName }: { distDirName: string }) => {
  // nextjs always puts the build directory at the project root level, which is also where you run `next start` from, so
  // we can read in the project directory from the currently running process
  const distDirAbsPath = path.resolve(distDirName).replace(/(\/|\\)$/, ''); // We strip trailing slashes because "app:///_next" also doesn't have one

  // eslint-disable-next-line @sentry-internal/sdk/no-regexp-constructor -- user input is escaped
  const SOURCEMAP_FILENAME_REGEX = new RegExp(escapeStringForRegex(distDirAbsPath));

  const rewriteFramesInstance = rewriteFramesIntegration({
    iteratee: frame => {
      frame.filename = frame.filename?.replace(SOURCEMAP_FILENAME_REGEX, 'app:///_next');
      return frame;
    },
  });

  return {
    ...rewriteFramesInstance,
    name: 'DistDirRewriteFrames',
  };
});
