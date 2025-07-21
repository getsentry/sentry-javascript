/**
 * This code was originally forked from https://github.com/TooTallNate/proxy-agents/tree/b133295fd16f6475578b6b15bd9b4e33ecb0d0b7
 * With the following LICENSE:
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

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable jsdoc/require-jsdoc */
import type { IncomingHttpHeaders } from 'node:http';
import type { Readable } from 'node:stream';
import { debug } from '@sentry/core';

function debugLog(...args: unknown[]): void {
  debug.log('[https-proxy-agent:parse-proxy-response]', ...args);
}

export interface ConnectResponse {
  statusCode: number;
  statusText: string;
  headers: IncomingHttpHeaders;
}

export function parseProxyResponse(socket: Readable): Promise<{ connect: ConnectResponse; buffered: Buffer }> {
  return new Promise((resolve, reject) => {
    // we need to buffer any HTTP traffic that happens with the proxy before we get
    // the CONNECT response, so that if the response is anything other than an "200"
    // response code, then we can re-play the "data" events on the socket once the
    // HTTP parser is hooked up...
    let buffersLength = 0;
    const buffers: Buffer[] = [];

    function read() {
      const b = socket.read();
      if (b) ondata(b);
      else socket.once('readable', read);
    }

    function cleanup() {
      socket.removeListener('end', onend);
      socket.removeListener('error', onerror);
      socket.removeListener('readable', read);
    }

    function onend() {
      cleanup();
      debugLog('onend');
      reject(new Error('Proxy connection ended before receiving CONNECT response'));
    }

    function onerror(err: Error) {
      cleanup();
      debugLog('onerror %o', err);
      reject(err);
    }

    function ondata(b: Buffer) {
      buffers.push(b);
      buffersLength += b.length;

      const buffered = Buffer.concat(buffers, buffersLength);
      const endOfHeaders = buffered.indexOf('\r\n\r\n');

      if (endOfHeaders === -1) {
        // keep buffering
        debugLog('have not received end of HTTP headers yet...');
        read();
        return;
      }

      const headerParts = buffered.subarray(0, endOfHeaders).toString('ascii').split('\r\n');
      const firstLine = headerParts.shift();
      if (!firstLine) {
        socket.destroy();
        return reject(new Error('No header received from proxy CONNECT response'));
      }
      const firstLineParts = firstLine.split(' ');
      const statusCode = +(firstLineParts[1] || 0);
      const statusText = firstLineParts.slice(2).join(' ');
      const headers: IncomingHttpHeaders = {};
      for (const header of headerParts) {
        if (!header) continue;
        const firstColon = header.indexOf(':');
        if (firstColon === -1) {
          socket.destroy();
          return reject(new Error(`Invalid header from proxy CONNECT response: "${header}"`));
        }
        const key = header.slice(0, firstColon).toLowerCase();
        const value = header.slice(firstColon + 1).trimStart();
        const current = headers[key];
        if (typeof current === 'string') {
          headers[key] = [current, value];
        } else if (Array.isArray(current)) {
          current.push(value);
        } else {
          headers[key] = value;
        }
      }
      debugLog('got proxy server response: %o %o', firstLine, headers);
      cleanup();
      resolve({
        connect: {
          statusCode,
          statusText,
          headers,
        },
        buffered,
      });
    }

    socket.on('error', onerror);
    socket.on('end', onend);

    read();
  });
}
