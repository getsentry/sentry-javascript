import { flue } from '@flue/vite';
import { defineConfig } from 'vite';

// Unmodified from what `flue init` scaffolds. In particular there is no externals config: a Flue
// node build leaves dependencies as bare specifiers, so orchestrion's module transform still sees
// them as real modules. (eve needs `externalDependencies` because it emits a bundled server.)
export default defineConfig({
  plugins: [flue()],
});
