import { StackLineParser, StackLineParserFn } from '@sentry/types';

const FILENAME_MATCH = /^\s*[-]{4,}$/;
const FULL_MATCH = /at (?:async )?(?:(.+?)\s+\()?(?:(.+?):(\d+)(?::(\d+))?|([^)]+))\)?/;

type GetModuleFn = (filename: string | undefined) => string | undefined;

// eslint-disable-next-line complexity
function node(getModule?: GetModuleFn): StackLineParserFn {
  // eslint-disable-next-line complexity
  return (line: string) => {
    if (line.match(FILENAME_MATCH)) {
      return {
        filename: line,
      };
    }

    const lineMatch = line.match(FULL_MATCH);
    if (!lineMatch) {
      return undefined;
    }

    let object: string | undefined;
    let method: string | undefined;
    let functionName: string | undefined;
    let typeName: string | undefined;
    let methodName: string | undefined;

    if (lineMatch[1]) {
      functionName = lineMatch[1];

      let methodStart = functionName.lastIndexOf('.');
      if (functionName[methodStart - 1] === '.') {
        // eslint-disable-next-line no-plusplus
        methodStart--;
      }

      if (methodStart > 0) {
        object = functionName.substr(0, methodStart);
        method = functionName.substr(methodStart + 1);
        const objectEnd = object.indexOf('.Module');
        if (objectEnd > 0) {
          functionName = functionName.substr(objectEnd + 1);
          object = object.substr(0, objectEnd);
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
      methodName = methodName || '<anonymous>';
      functionName = typeName ? `${typeName}.${methodName}` : methodName;
    }

    const filename = lineMatch[2]?.startsWith('file://') ? lineMatch[2].substr(7) : lineMatch[2];
    const isNative = lineMatch[5] === 'native';
    const isInternal =
      isNative || (filename && !filename.startsWith('/') && !filename.startsWith('.') && filename.indexOf(':\\') !== 1);

    // in_app is all that's not an internal Node function or a module within node_modules
    // note that isNative appears to return true even for node core libraries
    // see https://github.com/getsentry/raven-node/issues/176
    const in_app = !isInternal && filename !== undefined && !filename.includes('node_modules/');

    return {
      filename,
      module: getModule?.(filename),
      function: functionName,
      lineno: parseInt(lineMatch[3], 10) || undefined,
      colno: parseInt(lineMatch[4], 10) || undefined,
      in_app,
    };
  };
}

/** Node.js stack line parser */
export function nodeStackLineParser(getModule?: GetModuleFn): StackLineParser {
  return [90, node(getModule)];
}
