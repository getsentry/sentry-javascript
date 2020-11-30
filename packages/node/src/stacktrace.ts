/**
 * stack-trace - Parses node.js stack traces
 *
 * This was originally forked to fix this issue:
 * https://github.com/felixge/node-stack-trace/issues/31
 *
 * Mar 19,2019 - #4fd379e
 *
 * https://github.com/felixge/node-stack-trace/
 * @license MIT
 */

/** Decoded StackFrame */
export interface StackFrame {
  fileName: string;
  lineNumber: number;
  functionName: string;
  typeName: string;
  methodName: string;
  native: boolean;
  columnNumber: number;
}

/** Extracts StackFrames from the Error */
export function parse(err: Error): StackFrame[] {
  if (!err.stack) {
    return [];
  }

  const lines = err.stack.split('\n').slice(1);

  return lines
    .map(line => {
      if (line.match(/^\s*[-]{4,}$/)) {
        return {
          columnNumber: null,
          fileName: line,
          functionName: null,
          lineNumber: null,
          methodName: null,
          native: null,
          typeName: null,
        };
      }

      const lineMatch = line.match(/at (?:(.+?)\s+\()?(?:(.+?):(\d+)(?::(\d+))?|([^)]+))\)?/);
      if (!lineMatch) {
        return undefined;
      }

      let object = null;
      let method = null;
      let functionName = null;
      let typeName = null;
      let methodName = null;
      const isNative = lineMatch[5] === 'native';

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
        typeName = null;
      }

      if (method) {
        typeName = object;
        methodName = method;
      }

      if (method === '<anonymous>') {
        methodName = null;
        functionName = null;
      }

      const properties = {
        columnNumber: parseInt(lineMatch[4], 10) || null,
        fileName: lineMatch[2] || null,
        functionName,
        lineNumber: parseInt(lineMatch[3], 10) || null,
        methodName,
        native: isNative,
        typeName,
      };

      return properties;
    })
    .filter(callSite => !!callSite) as StackFrame[];
}
