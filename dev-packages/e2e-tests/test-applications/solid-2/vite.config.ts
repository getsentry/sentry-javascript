import solid from '@solidjs/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [solid({ start: { clientSetup: './src/instrument.client.ts' } })],
  build: {
    target: 'esnext',
  },
  envPrefix: 'PUBLIC_',
});
