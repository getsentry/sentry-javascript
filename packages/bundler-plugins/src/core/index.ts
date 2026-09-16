import { CodeInjection, containsOnlyImports, stripQueryAndHashFromPath } from './utils';
import { createOxcComponentNameAnnotateHooks, getOxcParseAstAsync } from './component-annotation-oxc';
import type { ComponentAnnotationTransformMeta, ParseAstAsync } from './component-annotation-oxc-ast';
import type { Logger } from './logger';

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
  return ['.js', '.mjs', '.cjs'].some(ext => cleanFileName.endsWith(ext));
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
export function shouldSkipCodeInjection(code: string, facadeModuleId: string | null | undefined): boolean {
  // Skip empty chunks - these are placeholder chunks that should be optimized away
  if (code.trim().length === 0) {
    return true;
  }

  // For HTML facade chunks, only skip if they contain only import statements
  if (facadeModuleId && stripQueryAndHashFromPath(facadeModuleId).endsWith('.html')) {
    return containsOnlyImports(code);
  }

  return false;
}

export { globFiles } from './glob';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createComponentNameAnnotateHooks(
  ignoredComponents: string[],
  injectIntoHtml: boolean,
  options: { getParseAstAsync?: () => Promise<ParseAstAsync | null>; logger?: Logger } = {},
) {
  let warnedParserUnavailable = false;

  const hooks = createOxcComponentNameAnnotateHooks(
    ignoredComponents,
    async () => {
      const parseAstAsync = (await options.getParseAstAsync?.()) ?? (await getOxcParseAstAsync());

      if (!parseAstAsync && !warnedParserUnavailable) {
        warnedParserUnavailable = true;
        options.logger?.warn('Could not load `oxc-parser` for this platform. React components will not be annotated.');
      }

      return parseAstAsync;
    },
    injectIntoHtml,
  );

  return {
    transform(this: void, code: string, id: string, meta?: ComponentAnnotationTransformMeta) {
      return hooks.transform(code, id, meta);
    },
  };
}

export function getDebugIdSnippet(debugId: string): CodeInjection {
  return new CodeInjection(
    `var n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="${debugId}",e._sentryDebugIdIdentifier="sentry-dbid-${debugId}");`,
  );
}

export type { Logger } from './logger';
export type { Options, SentrySDKBuildFlags } from './types';
export {
  CodeInjection,
  replaceBooleanFlagsInCode,
  stringToUUID,
  generateReleaseInjectorCode,
  generateModuleMetadataInjectorCode,
} from './utils';
export { createSentryBuildPluginManager } from './build-plugin-manager';
export { createDebugIdUploadFunction, addDebugIdToEmittedArtifacts, stampDebugId } from './debug-id-upload';
