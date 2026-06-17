import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'shell',
      remotes: {
        mfe_header: {
          type: 'module',
          name: 'mfe_header',
          entry: 'http://localhost:3032/remoteEntry.js',
          entryGlobalName: 'mfe_header',
          shareScope: 'default',
        },
        mfe_one: {
          type: 'module',
          name: 'mfe_one',
          entry: 'http://localhost:3033/remoteEntry.js',
          entryGlobalName: 'mfe_one',
          shareScope: 'default',
        },
      },
      shared: ['react', 'react-dom'],
    }),
  ],
  build: {
    target: 'esnext',
    minify: false,
    envPrefix: ['PUBLIC_'],
  },
  envPrefix: ['PUBLIC_'],
  preview: { port: 3030 },
});
