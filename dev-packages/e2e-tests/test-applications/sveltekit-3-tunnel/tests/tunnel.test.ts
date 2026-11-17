import { runManagedTunnelSuite } from '@sentry-internal/test-utils/tunnel-suite';

runManagedTunnelSuite({
  appName: 'sveltekit-3-tunnel',
  basePath: '/app',
  // Kit's own `sveltekit.handle.root` span starts with only `http.url`, no `url.path`.
  isTunnelSpan: (span, tunnelPath) => {
    const url = span.attributes['http.url']?.value;
    return typeof url === 'string' && new URL(url).pathname === tunnelPath;
  },
});
