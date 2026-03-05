import http from 'node:http';
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { RequestRecord } from './sourcemap-upload-assertions';

export interface MockSentryServerOptions {
  port?: number;
  org?: string;
  outputFile?: string;
  outputDir?: string;
}

export interface MockSentryServer {
  port: number;
  url: string;
  close: () => void;
}

/**
 * Parse multipart form data to extract individual parts.
 * sentry-cli uploads gzipped chunks as multipart/form-data.
 */
function parseMultipartParts(body: Buffer, boundary: string): { headers: string; content: Buffer }[] {
  const parts: { headers: string; content: Buffer }[] = [];
  const boundaryBuf = Buffer.from(`--${boundary}`);

  let start = 0;
  while (start < body.length) {
    const idx = body.indexOf(boundaryBuf, start);
    if (idx === -1) break;

    const afterBoundary = idx + boundaryBuf.length;
    if (body.slice(afterBoundary, afterBoundary + 2).toString() === '--') break;

    const headerEnd = body.indexOf('\r\n\r\n', afterBoundary);
    if (headerEnd === -1) break;

    const headerStr = body.slice(afterBoundary, headerEnd).toString();

    const nextBoundary = body.indexOf(boundaryBuf, headerEnd + 4);
    const contentEnd = nextBoundary !== -1 ? nextBoundary - 2 : body.length;
    const content = body.slice(headerEnd + 4, contentEnd);

    parts.push({ headers: headerStr, content });
    start = nextBoundary !== -1 ? nextBoundary : body.length;
  }

  return parts;
}

/**
 * Starts a mock Sentry server that captures sourcemap upload requests.
 *
 * The server handles sentry-cli API endpoints (chunk-upload, artifact bundle assemble,
 * releases) and writes captured request data to a JSON file and extracted bundles to a directory.
 */
export function startMockSentryServer(options: MockSentryServerOptions = {}): MockSentryServer {
  const { port = 3032, org = 'test-org', outputFile = '.tmp_mock_uploads.json', outputDir = '.tmp_chunks' } = options;

  // Ensure chunks directory exists
  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true });
  }
  fs.mkdirSync(outputDir);

  const requests: RequestRecord[] = [];
  let chunkIndex = 0;

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];

    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const contentType = req.headers['content-type'] || '';
      const authorization = req.headers['authorization'] || '';

      const record: RequestRecord = {
        method: req.method || '',
        url: req.url || '',
        contentType,
        authorization,
        bodySize: body.length,
        timestamp: new Date().toISOString(),
      };

      // For chunk upload POSTs, save and extract artifact bundles
      if (req.url?.includes('chunk-upload') && req.method === 'POST' && body.length > 0) {
        record.hasBody = true;
        record.chunkFiles = [];

        const boundaryMatch = contentType.match(/boundary=(.+)/);
        if (boundaryMatch) {
          const parts = parseMultipartParts(body, boundaryMatch[1]!);
          for (let i = 0; i < parts.length; i++) {
            const part = parts[i]!;
            const bundleDir = path.join(outputDir, `bundle_${chunkIndex}_${i}`);

            // Try to decompress (sentry-cli gzips chunks)
            let zipBuffer: Buffer;
            try {
              zipBuffer = zlib.gunzipSync(part.content);
            } catch {
              zipBuffer = part.content;
            }

            const zipFile = `${bundleDir}.zip`;
            fs.writeFileSync(zipFile, zipBuffer);

            // Extract the zip to inspect contents
            try {
              fs.mkdirSync(bundleDir, { recursive: true });
              execFileSync('unzip', ['-q', '-o', zipFile, '-d', bundleDir], { stdio: 'ignore' });

              // Read manifest.json if present
              const manifestPath = path.join(bundleDir, 'manifest.json');
              if (fs.existsSync(manifestPath)) {
                const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
                record.chunkFiles.push({
                  bundleDir,
                  manifest,
                  fileCount: Object.keys(manifest.files || {}).length,
                });
              } else {
                record.chunkFiles.push({ bundleDir, note: 'no manifest.json found' });
              }
            } catch (err: unknown) {
              record.chunkFiles.push({
                zipFile,
                note: `extraction failed: ${err instanceof Error ? err.message : String(err)}`,
              });
            }

            chunkIndex++;
          }
        }
      }

      // For artifact bundle assemble, capture the request body
      if (req.url?.includes('/artifactbundle/assemble/') && body.length > 0) {
        try {
          record.assembleBody = JSON.parse(body.toString('utf-8'));
        } catch {
          // ignore parse errors
        }
      }

      requests.push(record);

      // Write all collected requests to the output file after each request
      fs.writeFileSync(outputFile, JSON.stringify(requests, null, 2));

      // Route responses — order matters: most specific first
      const url = req.url || '';

      if (url.includes('/artifactbundle/assemble/')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ state: 'created', missingChunks: [] }));
      } else if (url.includes('/chunk-upload/')) {
        if (req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              url: `http://localhost:${port}/api/0/organizations/${org}/chunk-upload/`,
              chunkSize: 8388608,
              chunksPerRequest: 64,
              maxFileSize: 2147483648,
              maxRequestSize: 33554432,
              concurrency: 1,
              hashAlgorithm: 'sha1',
              compression: ['gzip'],
              accept: [
                'debug_files',
                'release_files',
                'pdbs',
                'sources',
                'bcsymbolmaps',
                'il2cpp',
                'portablepdbs',
                'artifact_bundles',
              ],
            }),
          );
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({}));
        }
      } else if (url.includes('/releases/')) {
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ version: 'test-release', dateCreated: new Date().toISOString() }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      }
    });
  });

  server.listen(port, () => {
    console.log(`Mock Sentry server listening on port ${port}`);
  });

  return {
    port,
    url: `http://localhost:${port}`,
    close: () => server.close(),
  };
}
