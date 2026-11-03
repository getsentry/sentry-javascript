import { withSentry } from '@sentry/solidstart/vite';
import { defineConfig } from '@solidjs/start/config';

export default defineConfig(
  withSentry(
    {},
    {
      autoInjectServerSentry: 'experimental_dynamic-import',
    },
  ),
);
