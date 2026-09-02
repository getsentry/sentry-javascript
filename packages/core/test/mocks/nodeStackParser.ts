import type { StackLineParser, StackLineParserFn } from '../../src/types/stacktrace';
import { normalizeStackTracePath, UNKNOWN_FUNCTION } from '../../src/utils/stacktrace';

// A node-style stack-line parser used purely as a realistic fixture for core tests
// (event building, module metadata, debug ids). The production parser lives in
// `@sentry/server-utils`; core must not depend on it, so this mirrors just enough of
// its behaviour to exercise the core code under test.

type GetModuleFn = (filename: string | undefined) => string | undefined;

function filenameIsInApp(filename: string, isNative: boolean = false): boolean {
  const isInternal =
    isNative ||
    (filename &&
      !filename.startsWith('/') &&
      !filename.match(/^[A-Z]:/) &&
      !filename.startsWith('.') &&
      !filename.match(/^[a-zA-Z]([a-zA-Z0-9.\-+])*:\/\//));

  return !isInternal && filename !== undefined && !filename.includes('node_modules/');
}

function node(getModule?: GetModuleFn): StackLineParserFn {
  const FILENAME_MATCH = /^\s*[-]{4,}$/;
  const FULL_MATCH = /at (?:async )?(?:(.+?)\s+\()?(?:(.+):(\d+):(\d+)?|([^)]+))\)?/;
  const DATA_URI_MATCH = /at (?:async )?(.+?) \(data:(.*?),/;

  return (line: string) => {
    const dataUriMatch = line.match(DATA_URI_MATCH);
    if (dataUriMatch) {
      return {
        filename: `<data:${dataUriMatch[2]}>`,
        function: dataUriMatch[1],
      };
    }

    const lineMatch = line.match(FULL_MATCH);

    if (lineMatch) {
      let object: string | undefined;
      let method: string | undefined;
      let functionName: string | undefined;
      let typeName: string | undefined;
      let methodName: string | undefined;

      if (lineMatch[1]) {
        functionName = lineMatch[1];

        let methodStart = functionName.lastIndexOf('.');
        if (functionName[methodStart - 1] === '.') {
          methodStart--;
        }

        if (methodStart > 0) {
          object = functionName.slice(0, methodStart);
          method = functionName.slice(methodStart + 1);
          const objectEnd = object.indexOf('.Module');
          if (objectEnd > 0) {
            functionName = functionName.slice(objectEnd + 1);
            object = object.slice(0, objectEnd);
          }
        }
        typeName = undefined;
      }

      if (method) {
        typeName = object;
        methodName = method;
      }

      if (method === '<anonymous>') {
        methodName = undefined;
        functionName = undefined;
      }

      if (functionName === undefined) {
        methodName = methodName || UNKNOWN_FUNCTION;
        functionName = typeName ? `${typeName}.${methodName}` : methodName;
      }

      let filename = normalizeStackTracePath(lineMatch[2]);
      const isNative = lineMatch[5] === 'native';

      if (!filename && lineMatch[5] && !isNative) {
        filename = lineMatch[5];
      }

      const maybeDecodedFilename = filename ? _safeDecodeURI(filename) : undefined;
      return {
        filename: maybeDecodedFilename ?? filename,
        module: maybeDecodedFilename && getModule?.(maybeDecodedFilename),
        function: functionName,
        lineno: _parseIntOrUndefined(lineMatch[3]),
        colno: _parseIntOrUndefined(lineMatch[4]),
        in_app: filenameIsInApp(filename || '', isNative),
      };
    }

    if (line.match(FILENAME_MATCH)) {
      return {
        filename: line,
      };
    }

    return undefined;
  };
}

/** Node stack line parser for use as a test fixture. */
export function nodeStackLineParser(getModule?: GetModuleFn): StackLineParser {
  return [90, node(getModule)];
}

function _parseIntOrUndefined(input: string | undefined): number | undefined {
  return parseInt(input || '', 10) || undefined;
}

function _safeDecodeURI(filename: string): string | undefined {
  try {
    return decodeURI(filename);
  } catch {
    return undefined;
  }
}
