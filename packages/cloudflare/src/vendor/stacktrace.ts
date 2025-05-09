// Vendored from https://github.com/robertcepa/toucan-js/blob/036568729e49d0a937de527dc32d73580d9a41b3/packages/toucan-js/src/stacktrace.ts
// MIT License

// Copyright (c) 2022 Robert Cepa

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

import type { StackLineParser, StackLineParserFn, StackParser } from '@sentry/core';
import { basename, createStackParser, nodeStackLineParser } from '@sentry/core';

type GetModuleFn = (filename: string | undefined) => string | undefined;

/**
 * Stack line parser for Cloudflare Workers.
 * This wraps node stack parser and adjusts root paths to match with source maps.
 *
 */
function workersStackLineParser(getModule?: GetModuleFn): StackLineParser {
  const [arg1, arg2] = nodeStackLineParser(getModule);

  const fn: StackLineParserFn = line => {
    const result = arg2(line);
    if (result) {
      const filename = result.filename;
      // Workers runtime runs a single bundled file that is always in a virtual root
      result.abs_path = filename !== undefined && !filename.startsWith('/') ? `/${filename}` : filename;
      // There is no way to tell what code is in_app and what comes from dependencies (node_modules), since we have one bundled file.
      // So everything is in_app, unless an error comes from runtime function (ie. JSON.parse), which is determined by the presence of filename.
      result.in_app = filename !== undefined;
    }
    return result;
  };

  return [arg1, fn];
}

/**
 * Gets the module from filename.
 *
 * @param filename
 * @returns Module name
 */
export function getModule(filename: string | undefined): string | undefined {
  if (!filename) {
    return;
  }

  // In Cloudflare Workers there is always only one bundled file
  return basename(filename, '.js');
}

/** Cloudflare Workers stack parser */
export const defaultStackParser: StackParser = createStackParser(workersStackLineParser(getModule));
