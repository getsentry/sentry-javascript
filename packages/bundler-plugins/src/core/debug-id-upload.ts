import fs from 'fs';
import path from 'path';
import * as url from 'url';
import * as util from 'util';
import { promisify } from 'util';
import type { SentryBuildPluginManager } from './build-plugin-manager';
import type { Logger } from './logger';
import type { ResolveSourceMapHook, RewriteSourcesHook } from './types';
import { stripQueryAndHashFromPath } from './utils';

interface DebugIdUploadPluginOptions {
  sentryBuildPluginManager: SentryBuildPluginManager;
}

export function createDebugIdUploadFunction({ sentryBuildPluginManager }: DebugIdUploadPluginOptions) {
  return async (buildArtifactPaths: string[]) => {
    // Webpack and perhaps other bundlers allow you to append query strings to
    // filenames for cache busting purposes. We should strip these before upload.
    const cleanedPaths = buildArtifactPaths.map(stripQueryAndHashFromPath);
    await sentryBuildPluginManager.uploadSourcemaps(cleanedPaths);
  };
}

export async function prepareBundleForDebugIdUpload(
  bundleFilePath: string,
  uploadFolder: string,
  chunkIndex: number,
  logger: Logger,
  rewriteSourcesHook: RewriteSourcesHook,
  resolveSourceMapHook: ResolveSourceMapHook | undefined,
): Promise<void> {
  let bundleContent;
  try {
    bundleContent = await promisify(fs.readFile)(bundleFilePath, 'utf8');
  } catch (e) {
    logger.error(`Could not read bundle to determine debug ID and source map: ${bundleFilePath}`, e);
    return;
  }

  const debugId = determineDebugIdFromBundleSource(bundleContent);
  if (debugId === undefined) {
    logger.debug(
      `Could not determine debug ID from bundle. This can happen if you did not clean your output folder before installing the Sentry plugin. File will not be source mapped: ${bundleFilePath}`,
    );
    return;
  }

  const uniqueUploadName = `${debugId}-${chunkIndex}`;

  bundleContent = addDebugIdToBundleSource(bundleContent, debugId);

  const sourceMapPath = await determineSourceMapPathFromBundle(
    bundleFilePath,
    bundleContent,
    logger,
    resolveSourceMapHook,
  );

  // A chunk with a debug ID but no resolvable source map
  // (e.g. framework-generated stub chunks that never emit one) can't be
  // symbolicated, so uploading its minified source alone accomplishes
  // nothing and only makes the uploader warn about a missing source map ref.
  // Skip it, unless the source map is inlined into the bundle, in which case
  // the source file carries the map itself and must still be uploaded.
  if (!sourceMapPath && !bundleHasInlineSourceMap(bundleContent)) {
    logger.debug(`Not uploading bundle without a source map: ${bundleFilePath}`);
    return;
  }

  const writeSourceFilePromise = fs.promises.writeFile(
    path.join(uploadFolder, `${uniqueUploadName}.js`),
    bundleContent,
    'utf-8',
  );

  const writeSourceMapFilePromise = sourceMapPath
    ? prepareSourceMapForDebugIdUpload(
        sourceMapPath,
        path.join(uploadFolder, `${uniqueUploadName}.js.map`),
        debugId,
        rewriteSourcesHook,
        logger,
      )
    : Promise.resolve();

  await writeSourceFilePromise;
  await writeSourceMapFilePromise;
}

/**
 * Looks for a particular string pattern (`sdbid-[debug ID]`) in the bundle
 * source and extracts the bundle's debug ID from it.
 *
 * The string pattern is injected via the debug ID injection snipped.
 */
function determineDebugIdFromBundleSource(code: string): string | undefined {
  const match = code.match(
    /sentry-dbid-([0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12})/,
  );

  if (match) {
    return match[1];
  } else {
    return undefined;
  }
}

const SPEC_LAST_DEBUG_ID_REGEX = /\/\/# debugId=([a-fA-F0-9-]+)(?![\s\S]*\/\/# debugId=)/m;

function hasSpecCompliantDebugId(bundleSource: string): boolean {
  return SPEC_LAST_DEBUG_ID_REGEX.test(bundleSource);
}

function addDebugIdToBundleSource(bundleSource: string, debugId: string): string {
  if (hasSpecCompliantDebugId(bundleSource)) {
    return bundleSource.replace(SPEC_LAST_DEBUG_ID_REGEX, `//# debugId=${debugId}`);
  } else {
    return `${bundleSource}\n//# debugId=${debugId}`;
  }
}

function setDebugIdOnSourceMap(map: Record<string, unknown>, debugId: string): void {
  // For now we write both fields until we know what will become the standard - if ever.
  map['debug_id'] = debugId;
  map['debugId'] = debugId;
}

export type StampedArtifacts = {
  bundleSource: string;
  /** `undefined` when the bundle has no separate source map (i.e. the map is inlined). */
  sourceMapSource: string | undefined;
};

function parseSourceMap(sourceMapSource: string): Record<string, unknown> | undefined {
  let map: unknown;
  try {
    map = JSON.parse(sourceMapSource);
  } catch {
    return undefined;
  }

  return map && typeof map === 'object' ? (map as Record<string, unknown>) : undefined;
}

/**
 * Stamps the debug ID injected into `bundleSource` into the bundle (as `//# debugId=` comment) and its
 * source map (as `debug_id`/`debugId` fields).
 *
 * This exists for `sourcemaps.disable: "disable-upload"`: the regular upload path only stamps
 * temporary copies of the artifacts (see `prepareBundleForDebugIdUpload`), so without this the
 * emitted artifacts would carry no debug ID and a later manual upload could not match them.
 * Callers must apply the result inside the bundler's asset pipeline (or, for bundlers without one,
 * before the build resolves) so that integrity hashes computed by later build steps include it.
 *
 * Pass `sourceMapSource: undefined` when the bundle has no separate source map. A bundle with an
 * inlined map still gets the comment, which is all the CLI and Symbolicator read the debug ID from.
 *
 * @returns the stamped artifacts, or `undefined` for bundles without a debug ID, without any source
 * map, or with an unparseable map.
 */
export function stampDebugId(bundleSource: string, sourceMapSource: string | undefined): StampedArtifacts | undefined {
  const debugId = determineDebugIdFromBundleSource(bundleSource);
  if (debugId === undefined) {
    return undefined;
  }

  if (sourceMapSource === undefined) {
    if (!bundleHasInlineSourceMap(bundleSource)) {
      return undefined;
    }

    return { bundleSource: addDebugIdToBundleSource(bundleSource, debugId), sourceMapSource: undefined };
  }

  const map = parseSourceMap(sourceMapSource);
  if (!map) {
    return undefined;
  }

  setDebugIdOnSourceMap(map, debugId);

  return {
    bundleSource: addDebugIdToBundleSource(bundleSource, debugId),
    sourceMapSource: JSON.stringify(map),
  };
}

/**
 * Stamps the debug ID of an emitted bundle into the bundle and its source map on disk.
 *
 * Used by bundlers that offer no hook to modify assets before they are written (esbuild).
 */
export async function addDebugIdToEmittedArtifacts(
  bundleFilePath: string,
  logger: Logger,
  resolveSourceMapHook: ResolveSourceMapHook | undefined,
): Promise<void> {
  let bundleSource: string;
  try {
    bundleSource = await fs.promises.readFile(bundleFilePath, 'utf8');
  } catch (e) {
    logger.error(`Could not read bundle to stamp debug ID: ${bundleFilePath}`, e);
    return;
  }

  const sourceMapPath = await determineSourceMapPathFromBundle(
    bundleFilePath,
    bundleSource,
    logger,
    resolveSourceMapHook,
  );

  let sourceMapSource: string | undefined;
  if (sourceMapPath) {
    try {
      sourceMapSource = await fs.promises.readFile(sourceMapPath, 'utf8');
    } catch (e) {
      logger.error(`Could not read source map to stamp debug ID: ${sourceMapPath}`, e);
      return;
    }
  }

  const stamped = stampDebugId(bundleSource, sourceMapSource);
  if (!stamped) {
    logger.debug(`Could not stamp debug ID (no debug ID in bundle, no source map, or invalid source map): ${bundleFilePath}`);
    return;
  }

  const writes = [fs.promises.writeFile(bundleFilePath, stamped.bundleSource, 'utf8')];
  if (sourceMapPath && stamped.sourceMapSource !== undefined) {
    writes.push(fs.promises.writeFile(sourceMapPath, stamped.sourceMapSource, 'utf8'));
  }

  try {
    await Promise.all(writes);
  } catch (e) {
    logger.error(`Could not write debug ID into build artifacts: ${bundleFilePath}`, e);
  }
}

/**
 * Whether the bundle carries its source map inlined as `sourceMappingURL=data:`
 * URI, rather than referencing a separate `.map` file. Such bundles must still
 * be uploaded even when no `.map` file is found, because the source file itself
 * contains the map.
 */
function bundleHasInlineSourceMap(bundleSource: string): boolean {
  return /^\s*\/\/# sourceMappingURL=data:/m.test(bundleSource);
}

/**
 * Applies a set of heuristics to find the source map for a particular bundle.
 *
 * @returns the path to the bundle's source map or `undefined` if none could be found.
 */
export async function determineSourceMapPathFromBundle(
  bundlePath: string,
  bundleSource: string,
  logger: Logger,
  resolveSourceMapHook: ResolveSourceMapHook | undefined,
): Promise<string | undefined> {
  const sourceMappingUrlMatch = bundleSource.match(/^\s*\/\/# sourceMappingURL=(.*)$/m);
  const sourceMappingUrl = sourceMappingUrlMatch ? (sourceMappingUrlMatch[1] as string) : undefined;

  const searchLocations: string[] = [];

  if (resolveSourceMapHook) {
    logger.debug(
      `Calling sourcemaps.resolveSourceMap(${JSON.stringify(bundlePath)}, ${JSON.stringify(sourceMappingUrl)})`,
    );
    const customPath = await resolveSourceMapHook(bundlePath, sourceMappingUrl);
    logger.debug(`resolveSourceMap hook returned: ${JSON.stringify(customPath)}`);

    if (customPath) {
      searchLocations.push(customPath);
    }
  }

  // 1. try to find source map at `sourceMappingURL` location
  if (sourceMappingUrl) {
    let parsedUrl: URL | undefined;
    try {
      parsedUrl = new URL(sourceMappingUrl);
    } catch {
      // noop
    }

    if (parsedUrl?.protocol === 'file:') {
      searchLocations.push(url.fileURLToPath(sourceMappingUrl));
    } else if (parsedUrl) {
      // noop, non-file urls don't translate to a local sourcemap file
    } else if (path.isAbsolute(sourceMappingUrl)) {
      searchLocations.push(path.normalize(sourceMappingUrl));
    } else {
      searchLocations.push(path.normalize(path.join(path.dirname(bundlePath), sourceMappingUrl)));
    }
  }

  // 2. try to find source map at path adjacent to chunk source, but with `.map` appended
  searchLocations.push(`${bundlePath}.map`);

  for (const searchLocation of searchLocations) {
    try {
      await util.promisify(fs.access)(searchLocation);
      logger.debug(`Source map found for bundle \`${bundlePath}\`: \`${searchLocation}\``);
      return searchLocation;
    } catch {
      // noop
    }
  }

  // This is just a debug message because it can be quite spammy for some frameworks
  logger.debug(
    `Could not determine source map path for bundle \`${bundlePath}\`` +
      ` with sourceMappingURL=${sourceMappingUrl === undefined ? 'undefined' : `\`${sourceMappingUrl}\``}` +
      ` - Did you turn on source map generation in your bundler?` +
      ` (Attempted paths: ${searchLocations.map(e => `\`${e}\``).join(', ')})`,
  );
  return undefined;
}

/**
 * Reads a source map, injects debug ID fields, and writes the source map to the target path.
 */
async function prepareSourceMapForDebugIdUpload(
  sourceMapPath: string,
  targetPath: string,
  debugId: string,
  rewriteSourcesHook: RewriteSourcesHook,
  logger: Logger,
): Promise<void> {
  let sourceMapFileContent: string;
  try {
    sourceMapFileContent = await util.promisify(fs.readFile)(sourceMapPath, {
      encoding: 'utf8',
    });
  } catch (e) {
    logger.error(`Failed to read source map for debug ID upload: ${sourceMapPath}`, e);
    return;
  }

  let map: Record<string, unknown>;
  try {
    map = JSON.parse(sourceMapFileContent) as { sources: unknown; [key: string]: unknown };
    setDebugIdOnSourceMap(map, debugId);
  } catch {
    logger.error(`Failed to parse source map for debug ID upload: ${sourceMapPath}`);
    return;
  }

  if (map['sources'] && Array.isArray(map['sources'])) {
    const mapDir = path.dirname(sourceMapPath);
    map['sources'] = map['sources'].map((source: string) => rewriteSourcesHook(source, map, { mapDir }));
  }

  try {
    await util.promisify(fs.writeFile)(targetPath, JSON.stringify(map), {
      encoding: 'utf8',
    });
  } catch (e) {
    logger.error(`Failed to prepare source map for debug ID upload: ${sourceMapPath}`, e);
    return;
  }
}

const PROTOCOL_REGEX = /^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//;
export function defaultRewriteSourcesHook(source: string): string {
  if (source.match(PROTOCOL_REGEX)) {
    return source.replace(PROTOCOL_REGEX, '');
  } else {
    return path.relative(process.cwd(), path.normalize(source));
  }
}
