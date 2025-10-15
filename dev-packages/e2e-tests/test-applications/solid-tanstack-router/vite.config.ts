import { defineConfig } from 'vite';

import solidPlugin from 'vite-plugin-solid';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __APP_DSN__: JSON.stringify(process.env.E2E_TEST_DSN),
  },
  plugins: [solidPlugin(), tailwindcss()],
});
