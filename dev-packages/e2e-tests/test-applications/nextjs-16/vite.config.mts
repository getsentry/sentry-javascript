import vinext from 'vinext';
import { defineConfig } from 'vite';

// Only for the `nextjs-16 (vinext)` variants, which build this app with vinext instead of Next.js. Their build command
// sets `"type": "module"`, because `vinext start` does not find the `.mjs` server files that Vite writes otherwise, and
// React 19.3, because vinext needs React 19.2.6 or newer.
export default defineConfig({ plugins: [vinext()] });
