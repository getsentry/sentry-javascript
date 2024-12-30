import { withSentry } from '@sentry/solidstart';
import { defineConfig } from '@solidjs/start/config';

export default defineConfig(
  withSentry(
    {},
    {
      autoInjectServerSentry: 'top-level-import',
    },
  ),
);
