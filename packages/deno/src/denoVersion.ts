import { parseSemver } from '@sentry/core';

export const DENO_VERSION = parseSemver(typeof Deno !== 'undefined' ? (Deno.version?.deno ?? '') : '') as {
  major: number | undefined;
  minor: number | undefined;
  patch: number | undefined;
};

/** Exported for testing */
function gte(major: number, minor: number, patch: number): boolean {
  const { major: M, minor: m, patch: p } = DENO_VERSION;
  if (M === undefined || m === undefined || p === undefined) return false;
  if (M !== major) return M > major;
  if (m !== minor) return m > minor;
  return p >= patch;
}

/** Whether `http.client.request.created` fires (Deno 2.7.13+). */
export const HTTP_CLIENT_DIAGNOSTICS_CHANNEL_SUPPORTED = gte(2, 7, 13);

/** Whether `http.server.request.start` fires (Deno 2.8.0+). */
export const HTTP_SERVER_DIAGNOSTICS_CHANNEL_SUPPORTED = gte(2, 8, 0);

/** Whether `node:diagnostics_channel.tracingChannel` exists (Deno 1.44.3+). */
export const TRACING_CHANNEL_SUPPORTED = gte(1, 44, 3);
