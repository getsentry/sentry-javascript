import { withSentryConfig } from '@sentry/nitro';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    nitro(
      // FIXME: Nitro plugin has a type issue
      // @ts-expect-error
      withSentryConfig({
        serverDir: './server',
      }),
    ),
  ],
});
