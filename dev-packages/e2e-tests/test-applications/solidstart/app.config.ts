import { withSentry } from '@sentry/solidstart';
import { defineConfig } from '@solidjs/start/config';

export default defineConfig(
  withSentry(
    {},
    {
      // Typically we want to default to ./src/instrument.sever.ts
      // `withSentry` would then build and copy the file over to
      // the .output folder, but since we can't use the production
      // server for our e2e tests, we have to delete the build folders
      // prior to using the dev server for our tests. Which also gets
      // rid of the instrument.server.mjs file that we need to --import.
      // Therefore, we specify the .mjs file here and to ensure
      // `withSentry` gets its file to build and we continue to reference
      // the file from the `src` folder for --import without needing to
      // transpile before.
      // This can be removed once we get the production server to work
      // with our e2e tests.
      instrumentation: './src/instrument.server.mjs',
    },
  ),
);
