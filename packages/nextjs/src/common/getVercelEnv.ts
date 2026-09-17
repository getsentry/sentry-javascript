/**
 * Browser counterpart of `getVercelEnv` from `@sentry/core`, reading the `NEXT_PUBLIC_` variants that Next.js exposes
 * to the client. The variables must be referenced statically so Next.js can inline them at build time.
 */
export function getClientVercelEnv(): string | undefined {
  return process.env.NEXT_PUBLIC_VERCEL_TARGET_ENV || process.env.NEXT_PUBLIC_VERCEL_ENV || undefined;
}
