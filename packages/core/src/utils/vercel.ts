/**
 * Returns the Vercel environment the code is running in, determined by the `VERCEL_TARGET_ENV` environment variable
 * with `VERCEL_ENV` as fallback. Returns `undefined` outside of Vercel.
 *
 * `VERCEL_TARGET_ENV` also carries the name of custom Vercel environments, whereas `VERCEL_ENV` only ever holds
 * `production`, `preview` or `development`. SDKs use this as the default `environment` and the bundler plugins use it
 * for the deploys they create, so the two stay in sync and deploys show up next to events.
 *
 * @param isClient Whether to read the `NEXT_PUBLIC_` prefixed variants that Next.js exposes to the browser.
 */
export function getVercelEnv(isClient: boolean): string | undefined {
  if (typeof process === 'undefined') {
    return undefined;
  }

  const vercelEnv = isClient
    ? process.env.NEXT_PUBLIC_VERCEL_TARGET_ENV || process.env.NEXT_PUBLIC_VERCEL_ENV
    : process.env.VERCEL_TARGET_ENV || process.env.VERCEL_ENV;
  return vercelEnv || undefined;
}
