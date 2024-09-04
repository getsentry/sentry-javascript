import { sentryVitePlugin } from '@sentry/vite-plugin';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const sentrySolidStartVite = () => [
  ...sentryVitePlugin(),
  {
    name: 'DebugPlugin',
    buildEnd(error: unknown) {
      console.log({ error });
    },
  },
];
