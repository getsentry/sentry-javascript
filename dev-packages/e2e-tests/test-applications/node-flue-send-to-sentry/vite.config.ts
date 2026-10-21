import { flue } from '@flue/vite';
import { defineConfig } from 'vite';

// As `flue init` scaffolds it. Flue keeps dependencies as bare imports, so orchestrion can still hook them.
export default defineConfig({
  plugins: [flue()],
});
