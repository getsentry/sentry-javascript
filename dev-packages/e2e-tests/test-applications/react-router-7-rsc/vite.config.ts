import { unstable_reactRouterRSC } from '@react-router/dev/vite';
import rsc from '@vitejs/plugin-rsc/plugin';
import { defineConfig } from 'vite';

// RSC Framework Mode (Preview - React Router 7.9.2+)
// This enables React Server Components support in React Router
export default defineConfig({
  plugins: [unstable_reactRouterRSC(), rsc()],
});
