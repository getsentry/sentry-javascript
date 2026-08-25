import { URL, fileURLToPath } from 'node:url';

import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import { defineConfig } from 'vite';

// Nuxt 5 disables the Options API by default (users can disable it too for smaller bundle size)
const optionsApi = process.env.VUE_OPTIONS_API === 'false' ? 'false' : 'true';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue(), vueJsx()],
  define: {
    __VUE_OPTIONS_API__: optionsApi,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  envPrefix: 'PUBLIC_',
});
