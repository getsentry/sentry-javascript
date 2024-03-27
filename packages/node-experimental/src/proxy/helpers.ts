/**
 * This code was originally forked from https://github.com/TooTallNate/proxy-agents/tree/b133295fd16f6475578b6b15bd9b4e33ecb0d0b7
 * With the following licence:
 *
 * (The MIT License)
 *
 * Copyright (c) 2013 Nathan Rajlich <nathan@tootallnate.net>*
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * 'Software'), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:*
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.*
 *
 * THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 * IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
 * CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
 * TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

/* eslint-disable jsdoc/require-jsdoc */
import * as http from 'node:http';
import * as https from 'node:https';
import type { Readable } from 'stream';
// TODO (v8): Remove this when Node < 12 is no longer supported
import type { URL } from 'url';

export type ThenableRequest = http.ClientRequest & {
  then: Promise<http.IncomingMessage>['then'];
};

export async function toBuffer(stream: Readable): Promise<Buffer> {
  let length = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    length += (chunk as Buffer).length;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, length);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function json(stream: Readable): Promise<any> {
  const buf = await toBuffer(stream);
  const str = buf.toString('utf8');
  try {
    return JSON.parse(str);
  } catch (_err: unknown) {
    const err = _err as Error;
    err.message += ` (input: ${str})`;
    throw err;
  }
}

export function req(url: string | URL, opts: https.RequestOptions = {}): ThenableRequest {
  const href = typeof url === 'string' ? url : url.href;
  const req = (href.startsWith('https:') ? https : http).request(url, opts) as ThenableRequest;
  const promise = new Promise<http.IncomingMessage>((resolve, reject) => {
    req.once('response', resolve).once('error', reject).end() as unknown as ThenableRequest;
  });
  req.then = promise.then.bind(promise);
  return req;
}
