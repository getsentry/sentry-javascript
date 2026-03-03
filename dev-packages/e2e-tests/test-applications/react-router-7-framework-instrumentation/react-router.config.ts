import type { Config } from '@react-router/dev/config';

export default {
  ssr: true,
  prerender: ['/performance/static'],
  future: {
    v8_middleware: true,
  },
} satisfies Config;
