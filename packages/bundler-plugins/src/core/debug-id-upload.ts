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

export function createDebugIdStampingFunction({ sentryBuildPluginManager }: DebugIdUploadPluginOptions) {
  return async (buildArtifactPaths: string[]) => {
    const cleanedPaths = buildArtifactPaths.map(stripQueryAndHashFromPath);
    await sentryBuildPluginManager.stampDebugIdsOnSourceMaps(cleanedPaths);
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
  const writeSourceFilePromise = fs.promises.writeFile(
    path.join(uploadFolder, `${uniqueUploadName}.js`),
    bundleContent,
    'utf-8',
  );

  const writeSourceMapFilePromise = determineSourceMapPathFromBundle(
    bundleFilePath,
    bundleContent,
    logger,
    resolveSourceMapHook,
  ).then(async sourceMapPath => {
    if (sourceMapPath) {
      await prepareSourceMapForDebugIdUpload(
        sourceMapPath,
        path.join(uploadFolder, `${uniqueUploadName}.js.map`),
        debugId,
        rewriteSourcesHook,
        logger,
      );
    }
  });

  await writeSourceFilePromise;
  await writeSourceMapFilePromise;
}

/**
 * The outcome of stamping a single bundle's source map. `inlineSourceMap` is called out separately
 * because it is the one case the caller has to surface to the user - the debug ID silently never
 * lands anywhere.
 */
export type SourceMapStampResult = 'stamped' | 'alreadyStamped' | 'inlineSourceMap' | 'skipped';

/**
 * Writes the debug ID that was injected into a bundle into the bundle's emitted source map.
 *
 * This is the counterpart to `prepareBundleForDebugIdUpload` for the `sourcemaps.disable:
 * 'disable-upload'` case: there is no upload to piggyback the temp-folder preparation on, so
 * the emitted source map has to carry the debug ID itself for a later manual upload to be able
 * to associate it with the bundle.
 *
 * The bundle itself is deliberately left byte-identical - hashes computed during the build
 * (e.g. for subresource integrity) must stay valid. The map's `sources` are left alone as well,
 * because unlike the throwaway upload copies this is a file the user keeps.
 */
export async function stampDebugIdOnEmittedSourceMap(
  bundleFilePath: string,
  logger: Logger,
  resolveSourceMapHook: ResolveSourceMapHook | undefined,
): Promise<SourceMapStampResult> {
  let bundleContent: string;
  try {
    bundleContent = await fs.promises.readFile(bundleFilePath, 'utf8');
  } catch (e) {
    logger.error(`Could not read bundle to determine debug ID and source map: ${bundleFilePath}`, e);
    return 'skipped';
  }

  const debugId = determineDebugIdFromBundleSource(bundleContent);
  if (debugId === undefined) {
    logger.debug(`Could not determine debug ID from bundle. Source map will not be stamped: ${bundleFilePath}`);
    return 'skipped';
  }

  const sourceMapPath = await determineSourceMapPathFromBundle(
    bundleFilePath,
    bundleContent,
    logger,
    resolveSourceMapHook,
  );
  if (!sourceMapPath) {
    // An inlined map lives inside the bundle, so stamping it would mean rewriting the bundle - which
    // is exactly what this function must not do. Report it so the caller can tell the user.
    return bundleHasInlineSourceMap(bundleContent) ? 'inlineSourceMap' : 'skipped';
  }

  const map = await readSourceMap(sourceMapPath, logger);
  if (!map) {
    return 'skipped';
  }

  if (map['debug_id'] === debugId && map['debugId'] === debugId) {
    return 'alreadyStamped';
  }

  addDebugIdToSourceMap(map, debugId);

  try {
    await fs.promises.writeFile(sourceMapPath, JSON.stringify(map), 'utf8');
    logger.debug(`Stamped debug ID ${debugId} onto source map: ${sourceMapPath}`);
    return 'stamped';
  } catch (e) {
    logger.error(`Failed to write source map with stamped debug ID: ${sourceMapPath}`, e);
    return 'skipped';
  }
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

/**
 * Whether the bundle carries its source map inlined as a `sourceMappingURL=data:` URI, rather than
 * referencing a separate `.map` file.
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
  const map = await readSourceMap(sourceMapPath, logger);
  if (!map) {
    return;
  }

  addDebugIdToSourceMap(map, debugId);

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

/**
 * Reads and parses a source map file.
 *
 * `JSON.parse` accepts plenty of JSON that is not a source map - `null`, numbers, arrays. Writing debug
 * IDs onto those either throws or, for arrays, silently succeeds and then serializes back to `[]`, which
 * looks like a valid upload until symbolication fails. So anything that is not a plain object is rejected
 * here rather than at each call site.
 *
 * @returns the parsed source map, or `undefined` if it could not be read, parsed or is not an object.
 */
async function readSourceMap(sourceMapPath: string, logger: Logger): Promise<Record<string, unknown> | undefined> {
  let sourceMapFileContent: string;
  try {
    sourceMapFileContent = await fs.promises.readFile(sourceMapPath, 'utf8');
  } catch (e) {
    logger.error(`Failed to read source map: ${sourceMapPath}`, e);
    return undefined;
  }

  let parsedSourceMap: unknown;
  try {
    parsedSourceMap = JSON.parse(sourceMapFileContent);
  } catch (e) {
    logger.error(`Failed to parse source map: ${sourceMapPath}`, e);
    return undefined;
  }

  if (typeof parsedSourceMap !== 'object' || parsedSourceMap === null || Array.isArray(parsedSourceMap)) {
    logger.error(`Source map is not a JSON object: ${sourceMapPath}`);
    return undefined;
  }

  return parsedSourceMap as Record<string, unknown>;
}

function addDebugIdToSourceMap(map: Record<string, unknown>, debugId: string): void {
  // For now we write both fields until we know what will become the standard - if ever.
  map['debug_id'] = debugId;
  map['debugId'] = debugId;
}

const PROTOCOL_REGEX = /^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//;
export function defaultRewriteSourcesHook(source: string): string {
  if (source.match(PROTOCOL_REGEX)) {
    return source.replace(PROTOCOL_REGEX, '');
  } else {
    return path.relative(process.cwd(), path.normalize(source));
  }
}
