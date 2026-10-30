import { withSentryConfig } from '@sentry/nextjs/config';
import type { NextConfig } from 'next';

// The managed variants serve the managed tunnel under a base path, without a tunnel route.
const isManagedMode = process.env.NEXT_PUBLIC_E2E_TEST_TUNNEL_MODE === 'managed';

const nextConfig: NextConfig = isManagedMode ? { basePath: '/docs' } : {};

export default withSentryConfig(nextConfig, {
  silent: true,
  tunnelRoute: isManagedMode ? undefined : true,
});
