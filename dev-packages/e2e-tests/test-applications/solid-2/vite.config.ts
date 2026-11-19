import solid from '@solidjs/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    solid({
      start: { clientSetup: './src/instrument.client.ts' },
      observe: process.env.SOLID_OBSERVE === '1',
    }),
  ],
  build: {
    target: 'esnext',
  },
  envPrefix: 'PUBLIC_',
});
