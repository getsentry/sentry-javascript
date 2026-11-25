import { isNuxtError } from 'nuxt/app';

// 3xx/4xx Nuxt errors are expected control flow (redirects, not-found pages), not bugs. The server skips them too.
export function isIgnoredNuxtError(error: unknown): boolean {
  if (!isNuxtError(error)) {
    return false;
  }
  // oxlint-disable-next-line typescript/no-deprecated
  const statusCode = error?.status || error?.statusCode;
  return !!statusCode && statusCode >= 300 && statusCode < 500;
}
