import type { Config } from '@react-router/dev/config';

export default {
  ssr: true,
  // todo: check why this messes up client tracing in tests
  // prerender: ['/performance/static'],
} satisfies Config;
