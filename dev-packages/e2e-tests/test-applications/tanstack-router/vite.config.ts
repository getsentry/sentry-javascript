import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_DSN__: JSON.stringify(process.env.E2E_TEST_DSN),
  },
  preview: {
    port: 3030,
  },
});
