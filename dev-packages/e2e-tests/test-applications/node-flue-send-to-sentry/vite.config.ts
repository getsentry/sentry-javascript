import { flue } from '@flue/vite';
import { defineConfig } from 'vite';

// Unmodified from what `flue init` scaffolds. No externals config is needed: a Flue node build
// already leaves dependencies as bare specifiers, so orchestrion's module transform still sees them
// as real modules.
export default defineConfig({
  plugins: [flue()],
});
