import type { Plugin } from 'vite';
import type { SentryOptions } from './types';

function resolveVirtualModuleId<T extends string>(id: T): `\0${T}` {
  return `\0${id}`;
}

export type VirtualImportsParams = Pick<Required<SentryOptions>['tunnelRoute'], 'host' | 'projectIds'>;

export const virtualImportsPlugin = ({ host = 'sentry.io', projectIds }: VirtualImportsParams): Plugin => {
  const modules: Record<string, string> = {
    'virtual:@sentry/astro/tunnel-config': `export const config = ${JSON.stringify({ host, projectIds })}`,
  };

  /** Mapping names prefixed with `\0` to their original form. */
  const resolutionMap = Object.fromEntries(
    (Object.keys(modules) as (keyof typeof modules)[]).map(key => [resolveVirtualModuleId(key), key]),
  );

  return {
    name: '@sentry/astro/virtual',
    resolveId(id) {
      if (id in modules) return resolveVirtualModuleId(id);
    },
    load(id) {
      const resolution = resolutionMap[id];
      if (resolution) return modules[resolution];
    },
  };
};
