import type { NitroConfig } from 'nitropack';

interface VirtualTemplate {
  filename: string;
  getContents: () => string;
}

/**
 * Adds a virtual file that can be used within the Nitro server plugins.
 */
export function addVirtualFile(nitro: NitroConfig, template: VirtualTemplate): VirtualTemplate {
  nitro.virtual = nitro.virtual || {};
  nitro.virtual[template.filename] = template.getContents;

  return template;
}
