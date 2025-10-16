import { useNuxt } from '@nuxt/kit';
import type { NuxtTemplate } from 'nuxt/schema';

/**
 * Adds a virtual file that can be used within the Nuxt Nitro server build.
 * Available in NuxtKit v4, so we are porting it here.
 * https://github.com/nuxt/nuxt/blob/d6df732eec1a3bd442bdb325b0335beb7e10cd64/packages/kit/src/template.ts#L55-L62
 */
export function addServerTemplate(template: NuxtTemplate): NuxtTemplate {
  const nuxt = useNuxt();
  if (template.filename) {
    nuxt.options.nitro.virtual = nuxt.options.nitro.virtual || {};
    nuxt.options.nitro.virtual[template.filename] = template.getContents;
  }

  return template;
}
