import { basename, dirname, StackLineParser } from '@sentry/utils';

const mainModule: string = `${
  (require.main && require.main.filename && dirname(require.main.filename)) || global.process.cwd()
}/`;

/** Gets the module */
function getModule(filename: string | undefined, base?: string): string | undefined {
  if (!filename) {
    return;
  }

  if (!base) {
    // eslint-disable-next-line no-param-reassign
    base = mainModule;
  }

  // It's specifically a module
  const file = basename(filename, '.js');
  // eslint-disable-next-line no-param-reassign
  filename = dirname(filename);
  let n = filename.lastIndexOf('/node_modules/');
  if (n > -1) {
    // /node_modules/ is 14 chars
    return `${filename.substr(n + 14).replace(/\//g, '.')}:${file}`;
  }
  // Let's see if it's a part of the main module
  // To be a part of main module, it has to share the same base
  n = `${filename}/`.lastIndexOf(base, 0);

  if (n === 0) {
    let moduleName = filename.substr(base.length).replace(/\//g, '.');
    if (moduleName) {
      moduleName += ':';
    }
    moduleName += file;
    return moduleName;
  }
  return file;
}

const FILENAME_MATCH = /^\s*[-]{4,}$/;
const FULL_MATCH = /at (?:(.+?)\s+\()?(?:(.+?):(\d+)(?::(\d+))?|([^)]+))\)?/;

// eslint-disable-next-line complexity
export const node: StackLineParser = (line: string) => {
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

  let fn;
  try {
    fn = functionName || `${typeName}.${methodName || '<anonymous>'}`;
  } catch (_) {
    // This seems to happen sometimes when using 'use strict',
    // stemming from `getTypeName`.
    // [TypeError: Cannot read property 'constructor' of undefined]
    fn = '<anonymous>';
  }

  const filename = lineMatch[2];
  const isNative = lineMatch[5] === 'native';
  const isInternal =
    isNative || (filename && !filename.startsWith('/') && !filename.startsWith('.') && filename.indexOf(':\\') !== 1);

  // in_app is all that's not an internal Node function or a module within node_modules
  // note that isNative appears to return true even for node core libraries
  // see https://github.com/getsentry/raven-node/issues/176
  const in_app = !isInternal && filename !== undefined && !filename.includes('node_modules/');

  /** Gets int from string or undefined if NaN */
  function getInt(int: string): number | undefined {
    const val = parseInt(int, 10);
    return isNaN(val) ? undefined : val;
  }

  return {
    filename: lineMatch[2],
    module: getModule(filename),
    function: fn,
    lineno: getInt(lineMatch[3]),
    colno: getInt(lineMatch[4]),
    in_app,
  };
};
