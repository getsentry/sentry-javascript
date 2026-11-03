// Next.js' runtime manifest registry
// https://github.com/vercel/next.js/blob/8e0700c74474498a07b33f58da1c1316f740eb19/packages/next/src/server/app-render/manifests-singleton.ts#L56-L59
const NEXT_MANIFESTS_SINGLETON = Symbol.for('next.server.manifests');

type ManifestEntries = Record<string, { filename?: unknown } | undefined>;

type GlobalWithManifests = typeof globalThis & {
  [NEXT_MANIFESTS_SINGLETON]?: {
    serverActionsManifest?: {
      node?: ManifestEntries;
      edge?: ManifestEntries;
    };
  };
};

interface MultipartField {
  content: string;
  /** Index of the first character after this field. */
  end: number;
}

/**
 * Reads one field of a multipart cache key, starting at `start`.
 * A field is `<length>:<content>`, with the length in lowercase hex counting UTF-16 code units.
 * https://github.com/vercel/next.js/blob/8e0700c74474498a07b33f58da1c1316f740eb19/packages/next/src/server/use-cache/use-cache-wrapper.ts#L1815-L1847
 *
 * Returns `undefined` when the framing is broken.
 */
function readMultipartField(cacheKey: string, start: number): MultipartField | undefined {
  // The characters before the next `:` must be a non-empty hex length.
  const colon = cacheKey.indexOf(':', start);
  if (colon <= start || !/^[0-9a-f]+$/.test(cacheKey.slice(start, colon))) {
    return undefined;
  }

  // A length that points past the end of the key means the key is truncated.
  const contentStart = colon + 1;
  const contentEnd = contentStart + parseInt(cacheKey.slice(start, colon), 16);
  if (contentEnd > cacheKey.length) {
    return undefined;
  }

  return { content: cacheKey.slice(contentStart, contentEnd), end: contentEnd };
}

/**
 * Cache keys with arguments that do not serialize to JSON (a page's `params` promise, a layout's
 * `children`) are serialized FormData: pairs of length-prefixed fields, a field name followed by
 * its content. React stores the key parts JSON in the field named `"0"`, which is not necessarily
 * the first field. Returns that JSON text, or `undefined` for a malformed key.
 */
function readKeyPartsFromMultipartKey(cacheKey: string): string | undefined {
  let position = 0;
  while (position < cacheKey.length) {
    // Each pair is the field name, then the field content.
    const name = readMultipartField(cacheKey, position);
    const content = name && readMultipartField(cacheKey, name.end);
    if (name === undefined || content === undefined) {
      return undefined;
    }

    if (name.content === '0') {
      return content.content;
    }
    position = content.end;
  }
  return undefined;
}

/**
 * Picks the function id out of the decoded key parts. Next.js 16.3 puts the id at index 1
 * (`[buildId, id, args]` in prod; dev appends a fourth part). 16.4 canary moves it to index 0
 * (`[id, args, …]`). Returns `undefined` for any other shape.
 */
function readFunctionIdFromKeyParts(keyParts: unknown): string | undefined {
  if (!Array.isArray(keyParts)) {
    return undefined;
  }
  // An args array at index 1 marks the canary shape, where the id sits at index 0.
  const functionId = Array.isArray(keyParts[1]) ? keyParts[0] : keyParts[1];
  return typeof functionId === 'string' ? functionId : undefined;
}

/**
 * Manifest filenames start at the repo root, but only the path inside the project is useful.
 * The repo-root-to-project part equals the tail of `process.cwd()`, because `next dev`,
 * `next start`, and the standalone server all run in the project directory (the standalone
 * `server.js` chdirs into its mirrored copy). Unknown layouts keep the full path.
 */
function toProjectRelativePath(filename: string): string {
  // Split the cwd on both separators so Windows paths work. The manifest always uses `/`.
  const cwdSegments = process.cwd().split(/[\\/]/).filter(Boolean);
  const fileSegments = filename.split('/');

  // Drop the longest filename prefix that matches the cwd tail. Longest first, so the whole
  // repo prefix goes, not just a part of it. At least one segment always remains.
  const maxOverlap = Math.min(fileSegments.length - 1, cwdSegments.length);
  for (let overlap = maxOverlap; overlap > 0; overlap--) {
    const cwdTail = cwdSegments.slice(-overlap);
    if (cwdTail.every((segment, index) => segment === fileSegments[index])) {
      return fileSegments.slice(overlap).join('/');
    }
  }
  return filename;
}

/**
 * Resolves the source file of the `use cache` function behind a cache key, through the server-reference manifest.
 * With Turbopack on Next.js 16.3 the manifest only covers component-tree functions, so route handlers resolve
 * to `undefined`. Webpack and 16.4 canary include route handlers.
 * Any unexpected key or manifest shape returns `undefined`, never a wrong file.
 */
export function getCacheFunctionSourceFile(cacheKey: string): string | undefined {
  try {
    // The key is `encodeReply(keyParts)`: a plain JSON array when all function arguments
    // serialize to JSON, the multipart form otherwise.
    const keyPartsJson = cacheKey.startsWith('[') ? cacheKey : readKeyPartsFromMultipartKey(cacheKey);
    if (!keyPartsJson) {
      return undefined;
    }

    const functionId = readFunctionIdFromKeyParts(JSON.parse(keyPartsJson));
    if (functionId === undefined) {
      return undefined;
    }

    // The manifest has one section per runtime. `NEXT_RUNTIME` is only `'edge'` on edge.
    const manifest = (globalThis as GlobalWithManifests)[NEXT_MANIFESTS_SINGLETON]?.serverActionsManifest;
    const filename = manifest?.[process.env.NEXT_RUNTIME === 'edge' ? 'edge' : 'node']?.[functionId]?.filename;
    return typeof filename === 'string' && filename ? toProjectRelativePath(filename) : undefined;
  } catch {
    return undefined;
  }
}
