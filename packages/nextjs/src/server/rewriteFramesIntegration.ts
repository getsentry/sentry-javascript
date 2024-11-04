import * as path from 'path';
import { defineIntegration, rewriteFramesIntegration as originalRewriteFramesIntegration } from '@sentry/core';
import type { IntegrationFn, StackFrame } from '@sentry/types';
import { escapeStringForRegex } from '@sentry/utils';

const globalWithInjectedValues = global as typeof global & {
  _sentryRewriteFramesDistDir?: string;
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
  const distDirName = process.env._sentryRewriteFramesDistDir || globalWithInjectedValues._sentryRewriteFramesDistDir;

  if (distDirName) {
    // nextjs always puts the build directory at the project root level, which is also where you run `next start` from, so
    // we can read in the project directory from the currently running process
    const distDirAbsPath = path.resolve(distDirName).replace(/(\/|\\)$/, ''); // We strip trailing slashes because "app:///_next" also doesn't have one
    // eslint-disable-next-line @sentry-internal/sdk/no-regexp-constructor -- user input is escaped
    const SOURCEMAP_FILENAME_REGEX = new RegExp(escapeStringForRegex(distDirAbsPath));

    return originalRewriteFramesIntegration({
      iteratee: frame => {
        frame.filename = frame.filename?.replace(SOURCEMAP_FILENAME_REGEX, 'app:///_next');
        return frame;
      },
      ...options,
    });
  }

  // Do nothing if we can't find a distDirName
  return {
    name: 'RewriteFrames',
  };
}) satisfies IntegrationFn;

export const rewriteFramesIntegration = defineIntegration(customRewriteFramesIntegration);
