import { transformAsync } from "@babel/core";
import componentNameAnnotatePlugin, {
  experimentalComponentNameAnnotatePlugin,
} from "../babel-plugin";
import SentryCli from "@sentry/cli";
import { debug } from "@sentry/core";
import * as fs from "fs";
import { CodeInjection, containsOnlyImports, stripQueryAndHashFromPath } from "./utils";

/**
 * Determines whether the Sentry CLI binary is in its expected location.
 * This function is useful since `@sentry/cli` installs the binary via a post-install
 * script and post-install scripts may not always run. E.g. with `npm i --ignore-scripts`.
 */
export function sentryCliBinaryExists(): boolean {
  return fs.existsSync(SentryCli.getPath());
}

// We need to be careful not to inject the snippet before any `"use strict";`s.
// As an additional complication `"use strict";`s may come after any number of comments.
export const COMMENT_USE_STRICT_REGEX =
  // Note: CodeQL complains that this regex potentially has n^2 runtime. This likely won't affect realistic files.
  /^(?:\s*|\/\*(?:.|\r|\n)*?\*\/|\/\/.*[\n\r])*(?:"[^"]*";|'[^']*';)?/;

/**
 * Checks if a file is a JavaScript file based on its extension.
 * Handles query strings and hashes in the filename.
 */
export function isJsFile(fileName: string): boolean {
  const cleanFileName = stripQueryAndHashFromPath(fileName);
  return [".js", ".mjs", ".cjs"].some((ext) => cleanFileName.endsWith(ext));
}

/**
 * Checks if a chunk should be skipped for code injection
 *
 * This is necessary to handle Vite's MPA (multi-page application) mode where
 * HTML entry points create "facade" chunks that should not contain injected code.
 * See: https://github.com/getsentry/sentry-javascript-bundler-plugins/issues/829
 *
 * However, in SPA mode, the main bundle also has an HTML facade but contains
 * substantial application code. We should NOT skip injection for these bundles.
 *
 * @param code - The chunk's code content
 * @param facadeModuleId - The facade module ID (if any) - HTML files create facade chunks
 * @returns true if the chunk should be skipped
 */
export function shouldSkipCodeInjection(
  code: string,
  facadeModuleId: string | null | undefined
): boolean {
  // Skip empty chunks - these are placeholder chunks that should be optimized away
  if (code.trim().length === 0) {
    return true;
  }

  // For HTML facade chunks, only skip if they contain only import statements
  if (facadeModuleId && stripQueryAndHashFromPath(facadeModuleId).endsWith(".html")) {
    return containsOnlyImports(code);
  }

  return false;
}

export { globFiles } from "./glob";

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createComponentNameAnnotateHooks(
  ignoredComponents: string[],
  injectIntoHtml: boolean
) {
  type ParserPlugins = NonNullable<
    NonNullable<Parameters<typeof transformAsync>[1]>["parserOpts"]
  >["plugins"];

  return {
    async transform(this: void, code: string, id: string) {
      // id may contain query and hash which will trip up our file extension logic below
      const idWithoutQueryAndHash = stripQueryAndHashFromPath(id);

      if (idWithoutQueryAndHash.match(/\\node_modules\\|\/node_modules\//)) {
        return null;
      }

      // We will only apply this plugin on jsx and tsx files
      if (![".jsx", ".tsx"].some((ending) => idWithoutQueryAndHash.endsWith(ending))) {
        return null;
      }

      const parserPlugins: ParserPlugins = [];
      if (idWithoutQueryAndHash.endsWith(".jsx")) {
        parserPlugins.push("jsx");
      } else if (idWithoutQueryAndHash.endsWith(".tsx")) {
        parserPlugins.push("jsx", "typescript");
      }

      const plugin = injectIntoHtml
        ? experimentalComponentNameAnnotatePlugin
        : componentNameAnnotatePlugin;

      try {
        const result = await transformAsync(code, {
          plugins: [[plugin, { ignoredComponents }]],
          filename: id,
          parserOpts: {
            sourceType: "module",
            allowAwaitOutsideFunction: true,
            plugins: parserPlugins,
          },
          generatorOpts: {
            decoratorsBeforeExport: true,
          },
          sourceMaps: true,
        });

        return {
          code: result?.code ?? code,
          map: result?.map,
        };
      } catch (e) {
        debug.error(`Failed to apply react annotate plugin`, e);
      }

      return { code };
    },
  };
}

export function getDebugIdSnippet(debugId: string): CodeInjection {
  return new CodeInjection(
    `var n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="${debugId}",e._sentryDebugIdIdentifier="sentry-dbid-${debugId}");`
  );
}

export type { Logger } from "./logger";
export type { Options, SentrySDKBuildFlags } from "./types";
export {
  CodeInjection,
  replaceBooleanFlagsInCode,
  stringToUUID,
  generateReleaseInjectorCode,
  generateModuleMetadataInjectorCode,
} from "./utils";
export { createSentryBuildPluginManager } from "./build-plugin-manager";
export { createDebugIdUploadFunction } from "./debug-id-upload";
