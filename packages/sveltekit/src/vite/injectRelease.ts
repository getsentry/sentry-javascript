import * as fs from 'fs';
import * as path from 'path';
import MagicString from 'magic-string';
import type { Plugin } from 'vite';
import { getGlobalValueInjectionCode } from './injectGlobalValues';
import type { ResolvedKitConfig } from './kitConfig';
import { getEntryFileExtensions, getHooksFileName, makeEntryFileMatcher } from './svelteConfig';

export const VIRTUAL_RELEASE_FILE = '\0sentry-sveltekit-release';

type ReleaseInjectionOptions = {
  release: string;
  getKitConfig: () => Promise<ResolvedKitConfig>;
  debug?: boolean;
};

type ReleaseInjectionSetup = {
  /** `sentryHandle` adds the release to every page it renders, so the client build doesn't need it. */
  usesSentryHandle: boolean;
  isServerEntryFile: (id: string) => boolean;
  isClientHooksFile: (id: string) => boolean;
};

/**
 * Gives the release to the SDKs without putting it into content-hashed client chunks: the server gets
 * it via its hooks files, and `sentryHandle` writes it into the `<head>` of each page it renders, where
 * the client SDK reads it.
 *
 * If the server hooks don't use `sentryHandle`, no page would carry the release, so the client hooks
 * file gets it at build time instead, as the bundler plugin would.
 */
export function makeReleaseInjectionPlugin(options: ReleaseInjectionOptions): Plugin {
  const { release, getKitConfig, debug } = options;

  let setupPromise: Promise<ReleaseInjectionSetup> | undefined;
  const getSetup = (): Promise<ReleaseInjectionSetup> =>
    (setupPromise ??= getKitConfig().then(kitConfig => {
      const serverHooksFile = getHooksFileName(kitConfig, 'server');
      const usesSentryHandle = /\bsentryHandle\b/.test(readEntryFile(kitConfig, serverHooksFile) ?? '');

      if (debug && !usesSentryHandle) {
        // eslint-disable-next-line no-console
        console.log(
          `[Sentry SvelteKit] \`sentryHandle\` not found in ${serverHooksFile}. Injecting the release into the client build.`,
        );
      }

      return {
        usesSentryHandle,
        isServerEntryFile: makeEntryFileMatcher(kitConfig, [serverHooksFile, 'src/instrumentation.server']),
        isClientHooksFile: makeEntryFileMatcher(kitConfig, [getHooksFileName(kitConfig, 'client')]),
      };
    }));

  return {
    name: 'sentry-sveltekit-release-injection-plugin',
    apply: 'build',

    resolveId: id => (id === VIRTUAL_RELEASE_FILE ? { id, external: false, moduleSideEffects: true } : null),

    load: (id, loadOptions) => {
      if (id !== VIRTUAL_RELEASE_FILE) {
        return null;
      }
      return getGlobalValueInjectionCode(
        loadOptions?.ssr
          ? { SENTRY_RELEASE: { id: release }, __sentry_sveltekit_release: release }
          : { SENTRY_RELEASE: { id: release } },
      );
    },

    transform: async (code, id, transformOptions) => {
      const { usesSentryHandle, isServerEntryFile, isClientHooksFile } = await getSetup();

      const shouldInject = transformOptions?.ssr ? isServerEntryFile(id) : !usesSentryHandle && isClientHooksFile(id);

      if (!shouldInject) {
        return null;
      }

      // Prepended, so it runs before any import that could call `Sentry.init`
      const ms = new MagicString(code);
      ms.prepend(`import "${VIRTUAL_RELEASE_FILE}";\n`);
      return { code: ms.toString(), map: ms.generateMap({ hires: true }) };
    },
  };
}

function readEntryFile(kitConfig: ResolvedKitConfig, entryPath: string): string | undefined {
  const candidates = getEntryFileExtensions(kitConfig).flatMap(extension => [
    `${entryPath}${extension}`,
    path.join(entryPath, `index${extension}`),
  ]);

  for (const candidate of candidates) {
    try {
      return fs.readFileSync(path.resolve(process.cwd(), candidate), 'utf-8');
    } catch {
      // try the next candidate
    }
  }
  return undefined;
}
