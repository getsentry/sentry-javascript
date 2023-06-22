/* eslint-disable @sentry-internal/sdk/no-optional-chaining */

// Vendored from https://github.com/sveltejs/kit/blob/1c1ddd5e34fce28e6f89299d6c59162bed087589/packages/kit/src/runtime/client/fetcher.js
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

import { hash } from './hash';

/**
 * Build the cache key for a given request
 * @param {URL | RequestInfo} resource
 * @param {RequestInit} [opts]
 */
export function build_selector(resource: URL | RequestInfo, opts: RequestInit | undefined): string {
  const url = JSON.stringify(resource instanceof Request ? resource.url : resource);

  let selector = `script[data-sveltekit-fetched][data-url=${url}]`;

  if (opts?.headers || opts?.body) {
    /** @type {import('types').StrictBody[]} */
    const values = [];

    if (opts.headers) {
      // @ts-ignore - TS complains but this is a 1:1 copy of the original code and apparently it works
      values.push([...new Headers(opts.headers)].join(','));
    }

    if (opts.body && (typeof opts.body === 'string' || ArrayBuffer.isView(opts.body))) {
      values.push(opts.body);
    }

    selector += `[data-hash="${hash(...values)}"]`;
  }

  return selector;
}
