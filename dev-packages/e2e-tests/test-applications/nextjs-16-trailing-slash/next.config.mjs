// Deliberately `.mjs`: Next loads it through Node's own ESM loader rather than compiling it, which is the only
// config format that exercises `@sentry/nextjs/config` as a plain-Node ESM consumer.
import { withSentryConfig } from '@sentry/nextjs/config';

/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: true,
};

export default withSentryConfig(nextConfig, {
  silent: true,
});
