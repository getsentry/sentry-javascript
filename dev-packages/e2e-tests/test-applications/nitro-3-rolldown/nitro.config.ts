import { withSentryConfig } from '@sentry/nitro';
import { defineConfig } from 'nitro';

// No Vite: Nitro's own builder externalizes `node_modules` in dev, unlike the Vite builder.
export default withSentryConfig(defineConfig({ serverDir: './server' }));
