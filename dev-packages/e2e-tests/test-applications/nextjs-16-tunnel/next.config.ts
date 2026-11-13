import { withSentryConfig } from '@sentry/nextjs/config';
import type { NextConfig } from 'next';

// The managed variants serve the managed tunnel under a base path and with trailing slashes, without a tunnel route.
const tunnelMode = process.env.NEXT_PUBLIC_E2E_TEST_TUNNEL_MODE;
const isManagedMode = tunnelMode === 'managed';

const nextConfig: NextConfig = isManagedMode ? { basePath: '/docs', trailingSlash: true } : {};

export default withSentryConfig(nextConfig, {
  silent: true,
  tunnelRoute: isManagedMode ? undefined : tunnelMode === 'path' ? '/monitoring' : true,
});
