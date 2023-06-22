/* eslint-disable no-bitwise */

// Parts of this code are taken from https://github.com/sveltejs/kit/blob/1c1ddd5e34fce28e6f89299d6c59162bed087589/packages/kit/src/runtime/client/fetcher.js
// Attribution given directly in the function code below

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

import { WINDOW } from '@sentry/svelte';
import { getDomElement } from '@sentry/utils';

import { build_selector } from './buildSelector';

/**
 * Checks if a request is cached by looking for a script tag with the same selector as the constructed selector of the request.
 *
 * This function is a combination of the cache lookups in sveltekit's internal client-side fetch functions
 * - initial_fetch (used during hydration) https://github.com/sveltejs/kit/blob/1c1ddd5e34fce28e6f89299d6c59162bed087589/packages/kit/src/runtime/client/fetcher.js#L76
 * - subsequent_fetch (used afterwards) https://github.com/sveltejs/kit/blob/1c1ddd5e34fce28e6f89299d6c59162bed087589/packages/kit/src/runtime/client/fetcher.js#L98
 *
 * Parts of this function's logic is taken from SvelteKit source code.
 * These lines are annotated with attribution in comments above them.
 *
 * @param input first fetch param
 * @param init second fetch param
 * @returns true if a cache hit was encountered, false otherwise
 */
export function isRequestCached(input: URL | RequestInfo, init: RequestInit | undefined): boolean {
  // build_selector call copied from https://github.com/sveltejs/kit/blob/1c1ddd5e34fce28e6f89299d6c59162bed087589/packages/kit/src/runtime/client/fetcher.js#L77
  const selector = build_selector(input, init);

  const script = getDomElement<HTMLScriptElement>(selector);

  if (!script) {
    return false;
  }

  // If the script has a data-ttl attribute, we check if we're still in the TTL window:
  try {
    // ttl retrieval taken from https://github.com/sveltejs/kit/blob/1c1ddd5e34fce28e6f89299d6c59162bed087589/packages/kit/src/runtime/client/fetcher.js#L83-L84
    const ttl = Number(script.getAttribute('data-ttl')) * 1000;

    if (isNaN(ttl)) {
      return false;
    }

    if (ttl) {
      // cache hit determination taken from: https://github.com/sveltejs/kit/blob/1c1ddd5e34fce28e6f89299d6c59162bed087589/packages/kit/src/runtime/client/fetcher.js#L105-L106
      return (
        WINDOW.performance.now() < ttl &&
        ['default', 'force-cache', 'only-if-cached', undefined].includes(init && init.cache)
      );
    }
  } catch {
    return false;
  }

  // Otherwise, we check if the script has a content and return true in that case
  return !!script.textContent;
}
