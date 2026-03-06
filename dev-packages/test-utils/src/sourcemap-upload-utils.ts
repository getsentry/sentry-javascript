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
  mappings?: string;
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
 * Extract debug ID pairs (JS file + sourcemap with matching debug-id) from artifact bundles.
 */
export function getDebugIdPairs(bundles: ArtifactBundleData[]): DebugIdPair[] {
  const pairs: DebugIdPair[] = [];

  for (const { bundleDir, manifest } of bundles) {
    const fileEntries = Object.entries(manifest.files);

    for (const [, entry] of fileEntries) {
      if (entry.type !== 'minified_source') continue;

      const debugId = entry.headers?.['debug-id'];
      const sourcemapRef = entry.headers?.['sourcemap'];
      if (!debugId || !sourcemapRef) continue;

      const mapEntry = fileEntries.find(([, e]) => e.type === 'source_map' && e.headers?.['debug-id'] === debugId);

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
