import solid from '@solidjs/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    solid({
      start: {
        nodeServer: true,
        serverSetup: './src/instrument.server.ts',
        clientSetup: './src/instrument.client.ts',
      },
      ssr: true,
      serverFunctions: true,
      observe: process.env.SOLID_OBSERVE === '1',
    }),
  ],
  build: {
    target: 'esnext',
  },
  envPrefix: 'PUBLIC_',
});
