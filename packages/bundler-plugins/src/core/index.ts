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

const moduleVersionsChunksCache = new WeakMap<Record<string, ChunkGraphNode>, Set<string>>();

// Greedily picks the chunks that the most entries load statically, until every entry loads one of them. This is a
// set cover, so it is not always minimal, but entries that share a chunk get one copy instead of one each.
function getModuleVersionsChunks(chunks: Record<string, ChunkGraphNode>): Set<string> {
  const cached = moduleVersionsChunksCache.get(chunks);
  if (cached) {
    return cached;
  }

  const entries = Object.values(chunks).filter(chunk => chunk.isEntry);
  const entriesByChunk = new Map<string, Set<string>>(entries.map(entry => [entry.fileName, new Set<string>()]));
  for (const entry of entries) {
    const queue = [entry];
    const seen = new Set<string>();
    for (let chunk = queue.shift(); chunk; chunk = queue.shift()) {
      if (seen.has(chunk.fileName)) {
        continue;
      }
      seen.add(chunk.fileName);
      let reachingEntries = entriesByChunk.get(chunk.fileName);
      if (!reachingEntries) {
        reachingEntries = new Set();
        entriesByChunk.set(chunk.fileName, reachingEntries);
      }
      reachingEntries.add(entry.fileName);
      for (const imported of chunk.imports ?? []) {
        const importedChunk = chunks[imported];
        if (importedChunk) {
          queue.push(importedChunk);
        }
      }
    }
  }

  const selected = new Set<string>();
  const uncovered = new Set(entries.map(entry => entry.fileName));
  while (uncovered.size > 0) {
    let best: string | undefined;
    let bestCount = 0;
    for (const [fileName, reachingEntries] of entriesByChunk) {
      let count = 0;
      for (const entry of reachingEntries) {
        if (uncovered.has(entry)) {
          count++;
        }
      }
      if (count > bestCount) {
        best = fileName;
        bestCount = count;
      }
    }
    if (best === undefined) {
      break;
    }
    selected.add(best);
    for (const entry of entriesByChunk.get(best) ?? []) {
      uncovered.delete(entry);
    }
  }

  moduleVersionsChunksCache.set(chunks, selected);
  return selected;
}

/**
 * Whether a chunk gets the module versions. Every entry chunk loads one of the selected chunks through static
 * imports, and entries that share a chunk share the copy in it.
 *
 * Without the chunk graph every entry chunk gets a copy.
 */
export function isModuleVersionsChunk(
  chunk: Pick<ChunkGraphNode, 'fileName' | 'isEntry'>,
  chunks: Record<string, ChunkGraphNode> | undefined,
): boolean {
  if (!chunks) {
    return chunk.isEntry ?? true;
  }

  return getModuleVersionsChunks(chunks).has(chunk.fileName);
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
export type { InternalOptions, Options, SentrySDKBuildFlags } from './types';
export {
  CodeInjection,
  replaceBooleanFlagsInCode,
  stringToUUID,
  generateReleaseInjectorCode,
  generateModuleMetadataInjectorCode,
  resolveReleaseName,
} from './utils';
export { createSentryBuildPluginManager } from './build-plugin-manager';
export type { SentryBuildPluginManager, UploadResult, UploadStaging } from './build-plugin-manager';
export { createDebugIdUploadFunction, addDebugIdToEmittedArtifacts, stampDebugId } from './debug-id-upload';
export {
  decideSourceMapHandling,
  getDeleteOption,
  getDeleteSourcemapsAfterUpload,
  getSdkEnabledSourceMaps,
  getSourceMapFeatures,
} from './sourcemap-settings';
export type { SourceMapDecision, SourceMapKind } from './sourcemap-settings';
export type { UploadFilter } from './upload-filter';
