import type { Config } from '@react-router/dev/config';

export default {
  ssr: true,
  // The base-path variant serves the app, and so the tunnel, under `/app`.
  ...(process.env.E2E_TEST_BASE_PATH && { basename: `${process.env.E2E_TEST_BASE_PATH}/` }),
  prerender: ['/performance/static'],
} satisfies Config;
