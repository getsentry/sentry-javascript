import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';

const basepath = process.env.E2E_TEST_BASEPATH || '';

// https://vitejs.dev/config/
export default defineConfig({
  base: basepath ? `${basepath}/` : '/',
  plugins: [react()],
  define: {
    __APP_DSN__: JSON.stringify(process.env.E2E_TEST_DSN),
    __APP_BASEPATH__: JSON.stringify(basepath),
  },
  preview: {
    port: 3030,
  },
});
