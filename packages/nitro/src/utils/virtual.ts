import type { Nitro } from 'nitropack';

interface VirtualTemplate {
  filename: string;
  getContents: () => string;
}

/**
 * Adds a virtual file that can be used within the Nitro server plugins.
 */
export function addVirtualFile(nitro: Nitro, template: VirtualTemplate): VirtualTemplate {
  nitro.options.virtual = nitro.options.virtual || {};
  nitro.options.virtual[template.filename] = template.getContents;

  return template;
}
