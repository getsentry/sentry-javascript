import { createRequire } from 'node:module';
import type {
  ComponentAnnotationTransformMeta,
  ComponentAnnotationTransformResult,
} from '../core/component-annotation-vite';

type ViteModule = {
  parseAstAsync?: (code: string, options: { lang: 'jsx' | 'tsx' }) => Promise<unknown>;
};

type ViteParseAstAsync = NonNullable<ViteModule['parseAstAsync']>;

type ViteAnnotationHooks = {
  transform(
    code: string,
    id: string,
    meta?: ComponentAnnotationTransformMeta,
  ): Promise<ComponentAnnotationTransformResult>;
};

let viteParseAstAsyncPromise: Promise<ViteParseAstAsync | null> | undefined;

export function getViteParseAstAsync(): Promise<ViteParseAstAsync | null> {
  if (!viteParseAstAsyncPromise) {
    viteParseAstAsyncPromise = Promise.resolve()
      .then(async () => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - Vite is an optional runtime peer for this package
        const viteModule = createRequire(import.meta.url)('vite') as ViteModule;

        if (typeof viteModule.parseAstAsync !== 'function') {
          return null;
        }

        try {
          await viteModule.parseAstAsync('const x = <div />;', { lang: 'tsx' });
        } catch {
          return null;
        }

        return viteModule.parseAstAsync;
      })
      .catch(() => null);
  }

  return viteParseAstAsyncPromise;
}

export function createViteAnnotationHooks(ignoredComponents: string[]): ViteAnnotationHooks {
  let hooksPromise: Promise<ViteAnnotationHooks> | undefined;

  return {
    transform(code, id, meta) {
      if (!hooksPromise) {
        hooksPromise = import('../core/component-annotation-vite').then(({ createViteComponentNameAnnotateHooks }) =>
          createViteComponentNameAnnotateHooks(ignoredComponents, getViteParseAstAsync),
        );
      }

      return hooksPromise.then(hooks => hooks.transform(code, id, meta));
    },
  };
}
