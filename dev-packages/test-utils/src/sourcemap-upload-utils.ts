import * as fs from 'fs';
import * as path from 'path';

export interface ManifestFile {
  type: 'minified_source' | 'source_map';
  url: string;
  headers?: Record<string, string>;
}

export interface Manifest {
  files: Record<string, ManifestFile>;
  debug_id?: string;
  org?: string;
  project?: string;
  release?: string;
}

export interface ChunkFileRecord {
  bundleDir?: string;
  zipFile?: string;
  manifest?: Manifest;
  fileCount?: number;
  note?: string;
}

export interface RequestRecord {
  method: string;
  url: string;
  contentType: string;
  authorization: string;
  bodySize: number;
  timestamp: string;
  hasBody?: boolean;
  /** Parsed body of `application/json` requests. */
  jsonBody?: unknown;
  chunkFiles?: ChunkFileRecord[];
  assembleBody?: {
    checksum: string;
    chunks: string[];
    projects: string[];
  };
}

export interface DebugIdPair {
  jsUrl: string;
  mapUrl: string;
  debugId: string;
  bundleDir: string;
}

export interface ArtifactBundleData {
  bundleDir: string;
  manifest: Manifest;
}

export interface ParsedSourcemap {
  [key: string]: unknown;
  version?: number;
  sources?: string[];
  /** Absent when the generator drops all sources (Rollup's `sourcemapExcludeSources`), null per dropped entry. */
  sourcesContent?: (string | null)[];
  mappings?: string;
  sections?: { map?: ParsedSourcemap }[];
}

export interface SourcemapEntry {
  url: string;
  bundleDir: string;
  sourcemap: ParsedSourcemap;
}

/**
 * Load parsed request records from the JSON output file written by the mock Sentry server.
 */
export function loadMockServerResults(outputFile = '.tmp_mock_uploads.json'): RequestRecord[] {
  if (!fs.existsSync(outputFile)) {
    throw new Error(`Expected ${outputFile} to exist. Did the mock server run?`);
  }
  return JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
}

/**
 * Extract all artifact bundle manifests from chunk upload records.
 */
export function getArtifactBundles(requests: RequestRecord[]): ArtifactBundleData[] {
  const bundles: ArtifactBundleData[] = [];
  const chunkUploadPosts = requests.filter(r => r.url?.includes('chunk-upload') && r.method === 'POST');

  for (const req of chunkUploadPosts) {
    for (const chunk of req.chunkFiles ?? []) {
      if (chunk.manifest && chunk.bundleDir) {
        bundles.push({ bundleDir: chunk.bundleDir, manifest: chunk.manifest });
      }
    }
  }

  return bundles;
}

/**
 * Every source path a sourcemap refers to, including those inside an indexed map's sections.
 *
 * Bundlers that emit indexed source maps (Turbopack, for one) leave the top-level `sources` empty
 * and put the real paths in `sections[].map.sources`, so reading `sources` alone reports that a
 * map covers nothing. Nothing flattens these before upload: the bundler plugin rewrites only the
 * top-level `sources` and uploads with `rewrite: false`, so the sections reach Sentry intact.
 */
export function getSourcemapSources(sourcemap: ParsedSourcemap): string[] {
  const sources = [...(sourcemap.sources ?? [])];

  for (const section of sourcemap.sections ?? []) {
    if (section.map) {
      sources.push(...getSourcemapSources(section.map));
    }
  }

  return sources;
}

/**
 * Read a manifest header by name, ignoring case.
 *
 * These are HTTP header names, so their casing is not contractual: `@sentry/cli` wrote
 * `sourcemap`, the CLI SDK writes `Sourcemap`. Matching one spelling exactly silently drops
 * every pair when the other CLI produced the bundle.
 */
function getManifestHeader(headers: Record<string, string> | undefined, name: string): string | undefined {
  if (!headers) {
    return undefined;
  }
  const match = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return match?.[1];
}

/**
 * Extract debug ID pairs (JS file + sourcemap with matching debug-id) from artifact bundles.
 */
export function getDebugIdPairs(bundles: ArtifactBundleData[]): DebugIdPair[] {
  const pairs: DebugIdPair[] = [];

  for (const { bundleDir, manifest } of bundles) {
    const fileEntries = Object.entries(manifest.files);

    for (const [, entry] of fileEntries) {
      if (entry.type !== 'minified_source') continue;

      const debugId = getManifestHeader(entry.headers, 'debug-id');
      const sourcemapRef = getManifestHeader(entry.headers, 'sourcemap');
      if (!debugId || !sourcemapRef) continue;

      const mapEntry = fileEntries.find(
        ([, e]) => e.type === 'source_map' && getManifestHeader(e.headers, 'debug-id') === debugId,
      );

      if (mapEntry) {
        pairs.push({
          jsUrl: entry.url,
          mapUrl: mapEntry[1].url,
          debugId,
          bundleDir,
        });
      }
    }
  }

  return pairs;
}

/**
 * Read and parse all sourcemap files from artifact bundles.
 */
export function getSourcemaps(bundles: ArtifactBundleData[]): SourcemapEntry[] {
  const sourcemaps: SourcemapEntry[] = [];

  for (const { bundleDir, manifest } of bundles) {
    for (const [filePath, entry] of Object.entries(manifest.files)) {
      if (entry.type !== 'source_map') continue;

      const fullPath = path.join(bundleDir, filePath);
      if (!fs.existsSync(fullPath)) continue;

      let content: string;
      try {
        content = fs.readFileSync(fullPath, 'utf-8');
      } catch {
        continue;
      }

      let sourcemap: ParsedSourcemap;
      try {
        sourcemap = JSON.parse(content);
      } catch {
        continue;
      }

      sourcemaps.push({ url: entry.url, bundleDir, sourcemap });
    }
  }

  return sourcemaps;
}

/**
 * Get chunk upload POST requests.
 */
export function getChunkUploadPosts(requests: RequestRecord[]): RequestRecord[] {
  return requests.filter(r => r.url?.includes('chunk-upload') && r.method === 'POST');
}

/**
 * Get artifact bundle assemble requests.
 */
export function getAssembleRequests(requests: RequestRecord[]): RequestRecord[] {
  return requests.filter(r => r.url?.includes('/artifactbundle/assemble/') && r.assembleBody);
}
