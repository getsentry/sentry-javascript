import { defineIntegration, rewriteFramesIntegration as originalRewriteFramesIntegration } from '@sentry/core';
import type { IntegrationFn, StackFrame } from '@sentry/types';
import { GLOBAL_OBJ, escapeStringForRegex } from '@sentry/utils';

const globalWithInjectedValues = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  __rewriteFramesDistDir__?: string;
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
  const distDirName = globalWithInjectedValues.__rewriteFramesDistDir__;

  if (distDirName) {
    const distDirAbsPath = distDirName.replace(/(\/|\\)$/, ''); // We strip trailing slashes because "app:///_next" also doesn't have one

    // Normally we would use `path.resolve` to obtain the absolute path we will strip from the stack frame to align with
    // the uploaded artifacts, however we don't have access to that API in edge so we need to be a bit more lax.
    // eslint-disable-next-line @sentry-internal/sdk/no-regexp-constructor -- user input is escaped
    const SOURCEMAP_FILENAME_REGEX = new RegExp(`.*${escapeStringForRegex(distDirAbsPath)}`);

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
