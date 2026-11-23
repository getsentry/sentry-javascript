import type { CodeInjection, Logger } from '../core';

// Vite 6+ sets `environment` on the plugin context.
export type ViteHookContext = { environment?: { config?: { consumer?: string } } };

export type BuildInputOptions = { input?: string[] | Record<string, string> };

type HtmlTagDescriptor = { tag: string; children: string; injectTo: 'head' };

export type ViteReleaseHtmlInjection = {
  /** Whether the build of the hook's environment puts the release into its HTML pages instead of its chunks. */
  inHtml: (context: ViteHookContext | undefined) => boolean;
  buildStart: (context: ViteHookContext | undefined, inputOptions: BuildInputOptions | undefined) => void;
  transformIndexHtml: (html: string, ctx: { server?: unknown }) => HtmlTagDescriptor[] | undefined;
};

/**
 * Puts the release snippet into the HTML pages of a Vite build (`release.inject: 'html'`), so the
 * content hashes of the chunks do not change when only the release changes.
 */
export function createViteReleaseHtmlInjection(
  releaseInjectionCode: CodeInjection,
  logger: Logger,
): ViteReleaseHtmlInjection {
  // Only a build with HTML entry points runs `transformIndexHtml`. Without one, the release goes
  // into the chunks so it is not lost.
  // In Vite 6+, one plugin instance serves every environment, and environments can build in parallel.
  const inHtmlByEnvironment = new WeakMap<object, boolean>();
  let inHtmlWithoutEnvironment = false;
  let warned = false;

  return {
    inHtml: context =>
      context?.environment ? (inHtmlByEnvironment.get(context.environment) ?? false) : inHtmlWithoutEnvironment,

    buildStart(context, inputOptions) {
      const inHtml = Object.values(inputOptions?.input ?? {}).some(input => /\.html$/.test(input));
      if (context?.environment) {
        inHtmlByEnvironment.set(context.environment, inHtml);
      } else {
        inHtmlWithoutEnvironment = inHtml;
      }

      // The server build of an SSR app has no HTML, and browsers do not cache its chunks.
      if (!inHtml && !warned && context?.environment?.config?.consumer !== 'server') {
        warned = true;
        logger.warn(
          "`release.inject: 'html'` needs a build with HTML entry points, and this build has none. Injecting the release into the startup chunks instead.",
        );
      }
    },

    transformIndexHtml(_html, ctx) {
      // The dev server does not inject the release into chunks either.
      if (ctx.server) {
        return undefined;
      }
      // Vite emits its entry scripts as deferred module scripts, so this runs before them.
      return [{ tag: 'script', children: releaseInjectionCode.code(), injectTo: 'head' }];
    },
  };
}
