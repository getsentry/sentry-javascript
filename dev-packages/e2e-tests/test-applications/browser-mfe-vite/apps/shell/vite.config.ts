import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'shell',
      remotes: {
        mfe_header: 'http://localhost:3032/assets/remoteEntry.js',
        mfe_one: 'http://localhost:3033/assets/remoteEntry.js',
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
