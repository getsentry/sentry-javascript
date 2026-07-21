import type { IntegrationFn, StackFrame } from '@sentry/core';
import {
  basename,
  defineIntegration,
  escapeStringForRegex,
  GLOBAL_OBJ,
  join,
  rewriteFramesIntegration as originalRewriteFramesIntegration,
} from '@sentry/core';
import { WRAPPED_MODULE_SUFFIX } from '../../common/utils';
import type { GlobalWithSentryValues } from '../../vite/injectGlobalValues';

type StackFrameIteratee = (frame: StackFrame) => StackFrame;
interface RewriteFramesOptions {
  root?: string;
  prefix?: string;
  iteratee?: StackFrameIteratee;
}

export const customRewriteFramesIntegration = ((options?: RewriteFramesOptions) => {
  return originalRewriteFramesIntegration({
    iteratee: rewriteFramesIteratee,
    ...options,
  });
}) satisfies IntegrationFn;

export const rewriteFramesIntegration = defineIntegration(customRewriteFramesIntegration);

/**
 * A custom iteratee function for the `RewriteFrames` integration.
 *
 * Does the same as the default iteratee, but also removes the `module` property from the
 * frame to improve issue grouping.
 *
 * For some reason, our stack trace processing pipeline isn't able to resolve the bundled
 * module name to the original file name correctly, leading to individual error groups for
 * each module. Removing the `module` field makes the grouping algorithm fall back to the
 * `filename` field, which is correctly resolved and hence grouping works as expected.
 *
 * Exported for tests only.
 */
export function rewriteFramesIteratee(frame: StackFrame): StackFrame {
  if (!frame.filename) {
    return frame;
  }
  const globalWithSentryValues: GlobalWithSentryValues = GLOBAL_OBJ;
  const svelteKitBuildOutDir = globalWithSentryValues.__sentry_sveltekit_output_dir;
  const prefix = 'app:///';

  // Check if the frame filename begins with `/` or a Windows-style prefix such as `C:\`
  const isWindowsFrame = /^[a-zA-Z]:\\/.test(frame.filename);
  const startsWithSlash = /^\//.test(frame.filename);
  if (isWindowsFrame || startsWithSlash) {
    const filename = isWindowsFrame
      ? frame.filename
          .replace(/^[a-zA-Z]:/, '') // remove Windows-style prefix
          .replace(/\\/g, '/') // replace all `\\` instances with `/`
      : frame.filename;

    let strippedFilename;
    if (svelteKitBuildOutDir) {
      strippedFilename = filename.replace(
        // oxlint-disable-next-line sdk/no-regexp-constructor -- not end user input + escaped anyway
        new RegExp(`^.*${escapeStringForRegex(join(svelteKitBuildOutDir, 'server'))}/`),
        '',
      );
    } else {
      strippedFilename = basename(filename);
    }
    frame.filename = `${prefix}${strippedFilename}`;
  } else if (isAppRelativeSourceFrame(frame.filename)) {
    // SvelteKit 3 (Vite/Rolldown) source-maps server frames to relative project paths such as
    // `src/routes/+page.ts` instead of the previous bundled absolute chunk paths. These skip the
    // branch above, so the default parser marks them as `in_app: false` (relative paths look like
    // Node internals). Prefix them like the absolute frames and flag them as app code.
    frame.filename = `${prefix}${frame.filename.replace(/^\.\//, '')}`;
    frame.in_app = true;
  }

  delete frame.module;

  // In dev-mode, the WRAPPED_MODULE_SUFFIX is still present in the frame's file name.
  // We need to remove it to make sure that the frame's filename matches the actual file
  if (frame.filename.endsWith(WRAPPED_MODULE_SUFFIX)) {
    frame.filename = frame.filename.slice(0, -WRAPPED_MODULE_SUFFIX.length);
  }

  return frame;
}

/**
 * Whether a (non-absolute) frame filename is an app-relative source path like `src/routes/+page.ts`,
 * as opposed to a dependency or a Node built-in. Excludes `node_modules` and any scheme/drive prefix
 * (e.g. `node:`, `data:`, `C:/`).
 */
function isAppRelativeSourceFrame(filename: string): boolean {
  return !filename.includes('node_modules/') && !/^[a-zA-Z][a-zA-Z0-9.+-]*:/.test(filename);
}
