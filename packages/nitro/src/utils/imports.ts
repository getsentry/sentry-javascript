import type { Nitro } from 'nitropack/types';
import type { Import } from 'unimport';
import type { UnimportPluginOptions } from 'unimport/unplugin';

/**
 * Adds server imports to the Nitro config.
 */
export function addImports(nitro: Nitro, imports: Import | Import[]): void {
  const _imports = Array.isArray(imports) ? imports : [imports];

  nitro.options.imports = (nitro.options.imports || {}) as UnimportPluginOptions;
  nitro.options.imports.imports = nitro.options.imports.imports || [];
  nitro.options.imports.imports.push(..._imports);
}
