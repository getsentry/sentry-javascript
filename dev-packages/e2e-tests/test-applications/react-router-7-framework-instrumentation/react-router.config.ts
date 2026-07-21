import type { Config } from '@react-router/dev/config';
import { sentryOnBuildEnd } from '@sentry/react-router';

export default {
  ssr: true,
  prerender: ['/performance/static'],
  future: {
    v8_middleware: true,
  },
  // Required for `autoInjectServerInstrumentation`: the auto-injection runs in this build-end hook.
  buildEnd: sentryOnBuildEnd,
} satisfies Config;
