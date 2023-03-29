// This code was originally forked from https://github.com/felixge/node-stack-trace
// Since then it has been highly modified to fit our needs.

// Copyright (c) 2011 Felix Geisendörfer (felix@debuggable.com)//
//
//  Permission is hereby granted, free of charge, to any person obtaining a copy
//  of this software and associated documentation files (the "Software"), to deal
//  in the Software without restriction, including without limitation the rights
//  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
//  copies of the Software, and to permit persons to whom the Software is
//  furnished to do so, subject to the following conditions://
//
//  The above copyright notice and this permission notice shall be included in
//  all copies or substantial portions of the Software.//
//
//  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
//  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
//  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
//  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
//  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
//  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
//  THE SOFTWARE.

import type { StackLineParserFn } from '@sentry/types';

export type GetModuleFn = (filename: string | undefined) => string | undefined;

/** Node Stack line parser */
// eslint-disable-next-line complexity
export function node(getModule?: GetModuleFn): StackLineParserFn {
  const FILENAME_MATCH = /^\s*[-]{4,}$/;
  const FULL_MATCH = /at (?:async )?(?:(.+?)\s+\()?(?:(.+):(\d+):(\d+)?|([^)]+))\)?/;

  // eslint-disable-next-line complexity
  return (line: string) => {
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
        methodName = methodName || '<anonymous>';
        functionName = typeName ? `${typeName}.${methodName}` : methodName;
      }

      let filename = lineMatch[2] && lineMatch[2].startsWith('file://') ? lineMatch[2].slice(7) : lineMatch[2];
      const isNative = lineMatch[5] === 'native';

      if (!filename && lineMatch[5] && !isNative) {
        filename = lineMatch[5];
      }

      const isInternal =
        isNative || (filename && !filename.startsWith('/') && !filename.startsWith('.') && !filename.includes(':\\'));

      // in_app is all that's not an internal Node function or a module within node_modules
      // note that isNative appears to return true even for node core libraries
      // see https://github.com/getsentry/raven-node/issues/176

      const in_app = !isInternal && filename !== undefined && !filename.includes('node_modules/');

      return {
        filename,
        module: getModule ? getModule(filename) : undefined,
        function: functionName,
        lineno: parseInt(lineMatch[3], 10) || undefined,
        colno: parseInt(lineMatch[4], 10) || undefined,
        in_app,
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
