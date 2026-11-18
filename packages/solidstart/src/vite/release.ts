import { fileURLToPath } from 'node:url';
import { resolveReleaseName } from '@sentry/bundler-plugins/core';
import type { BuildTimeOptionsBase } from '@sentry/core';

/**
 * The release that the server hands to the browser SDK through the page, instead of the build plugin writing it into
 * the client chunks, where it would change their content hashes on every release.
 *
 * `undefined` when the build plugin would not inject a release either.
 */
export function getRuntimeRelease(options: Pick<BuildTimeOptionsBase, 'release' | 'sourcemaps'>): string | undefined {
  if (
    process.env.NODE_ENV === 'development' ||
    options.sourcemaps?.disable === true ||
    options.release?.inject === false
  ) {
    return undefined;
  }

  return resolveReleaseName(options.release?.name);
}

/** Resolves a Nitro runtime file that ships in `build/{esm,cjs}/nitro`. */
export function getNitroRuntimeFilePath(fileName: string): string {
  // Through a variable, as Vite rewrites `new URL(template, import.meta.url)` into a glob import.
  const moduleUrl = import.meta.url;
  const url = new URL(`../nitro/${fileName}`, moduleUrl);

  // `import.meta.url` is a file URL in the built package, but not in every test environment.
  return url.protocol === 'file:' ? fileURLToPath(url) : url.pathname;
}
