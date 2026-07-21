import type { Config } from '@react-router/dev/config';
import { sentryOnBuildEnd } from '@sentry/react-router';

export default {
  ssr: true,
  buildEnd: sentryOnBuildEnd,
} satisfies Config;
