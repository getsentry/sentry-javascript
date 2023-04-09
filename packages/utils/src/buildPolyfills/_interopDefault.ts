// https://github.com/rollup/rollup/tree/c2cda424e69686671ba010d628c0f70c43a563f8
// The MIT License (MIT)
//
// Copyright (c) 2017 [these people](https://github.com/rollup/rollup/graphs/contributors)
//
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
// documentation files (the "Software"), to deal in the Software without restriction, including without limitation
// the rights to use, copy, modify, merge, publish, distribute, sublicense, and / or sell copies of the Software,
// and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all copies or substantial portions
// of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
// LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
// IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
// WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE
// OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

import type { RequireResult } from './types';

/**
 * Unwraps a module if it has been wrapped in an object under the key `default`.
 *
 * Adapted from Rollup (https://github.com/rollup/rollup)
 *
 * @param requireResult The result of calling `require` on a module
 * @returns The full module, unwrapped if necessary.
 */
export function _interopDefault(requireResult: RequireResult): RequireResult {
  return requireResult.__esModule ? (requireResult.default as RequireResult) : requireResult;
}

// Rollup version:
// function _interopDefault(e) {
//   return e && e.__esModule ? e['default'] : e;
// }
