import { defineConfig } from 'nitro';
import { withSentryConfig } from '@sentry/nitro';

export default withSentryConfig(
  defineConfig({
    serverDir: './',
  }),
);
