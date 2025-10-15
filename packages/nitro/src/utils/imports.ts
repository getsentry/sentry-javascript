import type { NitroConfig } from 'nitropack/types';
import type { Import } from 'unimport';

/**
 * Adds server imports to the Nitro config.
 */
export function addImports(nitro: NitroConfig, imports: Import | Import[]): void {
  const _imports = Array.isArray(imports) ? imports : [imports];

  nitro.imports = nitro.imports || {};
  nitro.imports.imports = nitro.imports.imports || [];
  nitro.imports.imports.push(..._imports);
}
