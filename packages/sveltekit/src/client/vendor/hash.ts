/* eslint-disable no-bitwise */

// Vendored from https://github.com/sveltejs/kit/blob/1c1ddd5e34fce28e6f89299d6c59162bed087589/packages/kit/src/runtime/hash.js
// with types only changes.

// The MIT License (MIT)

// Copyright (c) 2020 [these people](https://github.com/sveltejs/kit/graphs/contributors)

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files(the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and / or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

import type { StrictBody } from '@sveltejs/kit/types/internal';

/**
 * Hash using djb2
 * @param {import('types').StrictBody[]} values
 */
export function hash(...values: StrictBody[]): string {
  let hash = 5381;

  for (const value of values) {
    if (typeof value === 'string') {
      let i = value.length;
      while (i) hash = (hash * 33) ^ value.charCodeAt(--i);
    } else if (ArrayBuffer.isView(value)) {
      const buffer = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      let i = buffer.length;
      while (i) hash = (hash * 33) ^ buffer[--i];
    } else {
      throw new TypeError('value must be a string or TypedArray');
    }
  }

  return (hash >>> 0).toString(36);
}
