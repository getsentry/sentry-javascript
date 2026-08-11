import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    nitro({
      preset: 'cloudflare-module',
      serverDir: './server',
      cloudflare: {
        deployConfig: false,
      },
    }),
  ],
});
