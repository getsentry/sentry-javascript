// @ts-check
import dts from 'rollup-plugin-dts';
import { defineConfig } from 'rollup';

export default defineConfig({
  input: './build-types/index.d.ts',
  output: [{ file: 'build/index.d.ts', format: 'es' }],
  plugins: [
    dts({ respectExternal: true }),
    // The bundled types contain a declaration for the __DEBUG_BUILD__ global
    // This can result in errors about duplicate global declarations so we strip it out!
    {
      name: 'strip-global',
      renderChunk(code) {
        return { code: code.replace(/declare global \{\s*const __DEBUG_BUILD__: boolean;\s*\}/g, '') };
      },
    },
  ],
});
