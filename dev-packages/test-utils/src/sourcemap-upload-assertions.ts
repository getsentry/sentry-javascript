import * as assert from 'assert/strict';
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

/**
 * Load parsed request records from the JSON output file written by the mock Sentry server.
 */
export function loadSourcemapUploadRecords(outputFile = '.tmp_mock_uploads.json'): RequestRecord[] {
  assert.ok(fs.existsSync(outputFile), `Expected ${outputFile} to exist. Did the mock server run?`);
  return JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
}

/**
 * Assert basic upload mechanics: auth token, chunk uploads with body, releases.
 */
export function assertSourcemapUploadRequests(requests: RequestRecord[], authToken: string): void {
  assert.ok(requests.length > 0, 'Expected at least one request to the mock Sentry server');

  const authenticatedRequests = requests.filter(r => r.authorization.includes(authToken));
  assert.ok(authenticatedRequests.length > 0, 'Expected at least one request with the configured auth token');

  const chunkUploadPosts = requests.filter(r => r.url?.includes('chunk-upload') && r.method === 'POST');
  assert.ok(chunkUploadPosts.length > 0, 'Expected at least one POST to chunk-upload endpoint');

  const uploadsWithBody = chunkUploadPosts.filter(r => r.bodySize > 0);
  assert.ok(uploadsWithBody.length > 0, 'Expected at least one chunk upload with a non-empty body');

  const releaseRequests = requests.filter(r => r.url?.includes('/releases/'));
  assert.ok(releaseRequests.length > 0, 'Expected at least one request to releases endpoint');
}

/**
 * Extract all artifact bundle manifests from chunk upload records.
 */
export function getArtifactBundleManifests(requests: RequestRecord[]): ArtifactBundleData[] {
  const allManifests: ArtifactBundleData[] = [];
  const chunkUploadPosts = requests.filter(r => r.url?.includes('chunk-upload') && r.method === 'POST');

  for (const req of chunkUploadPosts) {
    for (const chunk of req.chunkFiles ?? []) {
      if (chunk.manifest && chunk.bundleDir) {
        allManifests.push({ bundleDir: chunk.bundleDir, manifest: chunk.manifest });
      }
    }
  }

  assert.ok(allManifests.length > 0, 'Expected at least one artifact bundle with a manifest.json');
  return allManifests;
}

/**
 * Assert debug ID pairs exist and are valid UUIDs, returns them.
 */
export function assertDebugIdPairs(manifests: ArtifactBundleData[]): DebugIdPair[] {
  const debugIdPairs: DebugIdPair[] = [];

  for (const { bundleDir, manifest } of manifests) {
    const files = manifest.files;
    const fileEntries = Object.entries(files);

    for (const [, entry] of fileEntries) {
      if (entry.type !== 'minified_source') continue;

      const debugId = entry.headers?.['debug-id'];
      const sourcemapRef = entry.headers?.['sourcemap'];
      if (!debugId || !sourcemapRef) continue;

      const mapEntry = fileEntries.find(([, e]) => e.type === 'source_map' && e.headers?.['debug-id'] === debugId);

      if (mapEntry) {
        debugIdPairs.push({
          jsUrl: entry.url,
          mapUrl: mapEntry[1].url,
          debugId,
          bundleDir,
        });
      }
    }
  }

  assert.ok(
    debugIdPairs.length > 0,
    'Expected at least one JS/sourcemap pair with matching debug IDs in the uploaded artifact bundles',
  );

  const uuidRegex = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
  for (const pair of debugIdPairs) {
    assert.match(pair.debugId, uuidRegex, `Expected debug ID to be a valid UUID, got: ${pair.debugId}`);
  }

  return debugIdPairs;
}

interface ParsedSourcemap {
  version?: number;
  sources?: string[];
  mappings?: string;
}

interface SourcemapEntry {
  url: string;
  bundleDir: string;
  sourcemap: ParsedSourcemap;
}

/**
 * Iterate over all source_map entries in the manifests, reading and parsing each sourcemap file.
 * Skips entries that don't exist on disk or fail to parse.
 * Return `true` from the callback to stop iteration early.
 */
function forEachSourcemap(manifests: ArtifactBundleData[], callback: (entry: SourcemapEntry) => boolean | void): void {
  for (const { bundleDir, manifest } of manifests) {
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

      if (callback({ url: entry.url, bundleDir, sourcemap }) === true) {
        return;
      }
    }
  }
}

/**
 * Assert at least one sourcemap has non-empty mappings.
 */
export function assertSourcemapMappings(manifests: ArtifactBundleData[]): void {
  let foundRealMappings = false;

  forEachSourcemap(manifests, ({ sourcemap }) => {
    if (sourcemap.mappings && sourcemap.mappings.length > 0) {
      foundRealMappings = true;
      return true;
    }
    return false;
  });

  assert.ok(foundRealMappings, 'Expected at least one sourcemap with non-empty mappings');
}

/**
 * Assert a sourcemap references source files matching a pattern.
 */
export function assertSourcemapSources(manifests: ArtifactBundleData[], sourcePattern: RegExp): void {
  const regex = sourcePattern;
  let found = false;

  forEachSourcemap(manifests, ({ url, sourcemap }) => {
    if (sourcemap.sources?.some(s => regex.test(s))) {
      found = true;

      // eslint-disable-next-line no-console
      console.log(`Sourcemap ${url} references app sources:`);
      for (const src of sourcemap.sources.filter(s => regex.test(s))) {
        // eslint-disable-next-line no-console
        console.log(`  - ${src}`);
      }

      assert.equal(sourcemap.version, 3, `Expected sourcemap version 3, got ${sourcemap.version}`);
      assert.ok(
        sourcemap.mappings && sourcemap.mappings.length > 0,
        'Expected sourcemap for app source to have non-empty mappings',
      );
    }
  });

  assert.ok(found, `Expected at least one sourcemap to reference sources matching ${sourcePattern}`);
}

/**
 * Assert assemble requests reference the expected project.
 */
export function assertArtifactBundleAssembly(requests: RequestRecord[], project: string): void {
  const assembleRequests = requests.filter(r => r.url?.includes('/artifactbundle/assemble/') && r.assembleBody);
  assert.ok(assembleRequests.length > 0, 'Expected at least one artifact bundle assemble request');

  for (const req of assembleRequests) {
    assert.ok(
      req.assembleBody?.projects?.includes(project),
      `Expected assemble request to include project "${project}". Got: ${req.assembleBody?.projects}`,
    );
    assert.ok(
      (req.assembleBody?.chunks?.length ?? 0) > 0,
      'Expected assemble request to have at least one chunk checksum',
    );
  }
}

export interface SourcemapUploadSummary {
  totalRequests: number;
  chunkUploadPosts: number;
  artifactBundles: number;
  debugIdPairs: number;
  assembleRequests: number;
}

/**
 * Compute summary counts from captured requests, manifests, and debug ID pairs.
 */
export function getSourcemapUploadSummary(
  requests: RequestRecord[],
  manifests: ArtifactBundleData[],
  debugIdPairs: DebugIdPair[],
): SourcemapUploadSummary {
  return {
    totalRequests: requests.length,
    chunkUploadPosts: requests.filter(r => r.url?.includes('chunk-upload') && r.method === 'POST').length,
    artifactBundles: manifests.length,
    debugIdPairs: debugIdPairs.length,
    assembleRequests: requests.filter(r => r.url?.includes('/artifactbundle/assemble/') && r.assembleBody).length,
  };
}
