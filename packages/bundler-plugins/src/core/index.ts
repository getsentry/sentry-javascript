import { CodeInjection, containsOnlyImports, stripQueryAndHashFromPath } from './utils';

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

export interface ChunkGraphNode {
  fileName: string;
  isEntry?: boolean;
  imports?: string[];
}

const initialChunksCache = new WeakMap<Record<string, ChunkGraphNode>, Set<string>>();

function getInitialChunks(chunks: Record<string, ChunkGraphNode>): Set<string> {
  const cached = initialChunksCache.get(chunks);
  if (cached) {
    return cached;
  }

  const initial = new Set<string>();
  const queue = Object.values(chunks).filter(chunk => chunk.isEntry);

  for (let chunk = queue.shift(); chunk; chunk = queue.shift()) {
    if (initial.has(chunk.fileName)) {
      continue;
    }
    initial.add(chunk.fileName);
    for (const imported of chunk.imports ?? []) {
      const importedChunk = chunks[imported];
      if (importedChunk) {
        queue.push(importedChunk);
      }
    }
  }

  initialChunksCache.set(chunks, initial);
  return initial;
}

/**
 * Whether a chunk loads at startup: it is an entry chunk, or an entry chunk
 * reaches it through static imports. Chunks that only dynamic imports reach
 * load later, after startup code already ran.
 *
 * Without the chunk graph every chunk counts as initial.
 */
export function isInitialChunk(
  chunk: Pick<ChunkGraphNode, 'fileName' | 'isEntry'>,
  chunks: Record<string, ChunkGraphNode> | undefined,
): boolean {
  if (chunk.isEntry || !chunks) {
    return true;
  }

  return getInitialChunks(chunks).has(chunk.fileName);
}

export { globFiles } from './glob';
export { getCodeInjectionPosition } from './get-code-injection-position';

export { createComponentNameAnnotateHooks } from './component-annotate-hooks';

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
