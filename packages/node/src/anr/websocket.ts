/* eslint-disable no-bitwise */
/**
 * A simple WebSocket client implementation copied from Rome before being modified for our use:
 * https://github.com/jeremyBanks/rome/tree/b034dd22d5f024f87c50eef2872e22b3ad48973a/packages/%40romejs/codec-websocket
 *
 * Original license:
 *
 * MIT License
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import * as http from 'http';
import type { Socket } from 'net';
import * as url from 'url';

type BuildFrameOpts = {
  opcode: number;
  fin: boolean;
  data: Buffer;
};

type Frame = {
  fin: boolean;
  opcode: number;
  mask: undefined | Buffer;
  payload: Buffer;
  payloadLength: number;
};

const OPCODES = {
  CONTINUATION: 0,
  TEXT: 1,
  BINARY: 2,
  TERMINATE: 8,
  PING: 9,
  PONG: 10,
};

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function isCompleteFrame(frame: Frame): boolean {
  return Buffer.byteLength(frame.payload) >= frame.payloadLength;
}

function unmaskPayload(payload: Buffer, mask: undefined | Buffer, offset: number): Buffer {
  if (mask === undefined) {
    return payload;
  }

  for (let i = 0; i < payload.length; i++) {
    payload[i] ^= mask[(offset + i) & 3];
  }

  return payload;
}

function buildFrame(opts: BuildFrameOpts): Buffer {
  const { opcode, fin, data } = opts;

  let offset = 6;
  let dataLength = data.length;

  if (dataLength >= 65_536) {
    offset += 8;
    dataLength = 127;
  } else if (dataLength > 125) {
    offset += 2;
    dataLength = 126;
  }

  const head = Buffer.allocUnsafe(offset);

  head[0] = fin ? opcode | 128 : opcode;
  head[1] = dataLength;

  if (dataLength === 126) {
    head.writeUInt16BE(data.length, 2);
  } else if (dataLength === 127) {
    head.writeUInt32BE(0, 2);
    head.writeUInt32BE(data.length, 6);
  }

  const mask = crypto.randomBytes(4);
  head[1] |= 128;
  head[offset - 4] = mask[0];
  head[offset - 3] = mask[1];
  head[offset - 2] = mask[2];
  head[offset - 1] = mask[3];

  const masked = Buffer.alloc(dataLength);
  for (let i = 0; i < dataLength; ++i) {
    masked[i] = data[i] ^ mask[i & 3];
  }

  return Buffer.concat([head, masked]);
}

function parseFrame(buffer: Buffer): Frame {
  const firstByte = buffer.readUInt8(0);
  const isFinalFrame: boolean = Boolean((firstByte >>> 7) & 1);
  const opcode: number = firstByte & 15;

  const secondByte: number = buffer.readUInt8(1);
  const isMasked: boolean = Boolean((secondByte >>> 7) & 1);

  // Keep track of our current position as we advance through the buffer
  let currentOffset = 2;
  let payloadLength = secondByte & 127;
  if (payloadLength > 125) {
    if (payloadLength === 126) {
      payloadLength = buffer.readUInt16BE(currentOffset);
      currentOffset += 2;
    } else if (payloadLength === 127) {
      const leftPart = buffer.readUInt32BE(currentOffset);
      currentOffset += 4;

      // The maximum safe integer in JavaScript is 2^53 - 1. An error is returned

      // if payload length is greater than this number.
      if (leftPart >= Number.MAX_SAFE_INTEGER) {
        throw new Error('Unsupported WebSocket frame: payload length > 2^53 - 1');
      }

      const rightPart = buffer.readUInt32BE(currentOffset);
      currentOffset += 4;

      payloadLength = leftPart * Math.pow(2, 32) + rightPart;
    } else {
      throw new Error('Unknown payload length');
    }
  }

  // Get the masking key if one exists
  let mask;
  if (isMasked) {
    mask = buffer.slice(currentOffset, currentOffset + 4);
    currentOffset += 4;
  }

  const payload = unmaskPayload(buffer.slice(currentOffset), mask, 0);

  return {
    fin: isFinalFrame,
    opcode,
    mask,
    payload,
    payloadLength,
  };
}

function createKey(key: string): string {
  return crypto.createHash('sha1').update(`${key}${GUID}`).digest('base64');
}

class WebSocketInterface extends EventEmitter {
  private _alive: boolean;
  private _incompleteFrame: undefined | Frame;
  private _unfinishedFrame: undefined | Frame;
  private _socket: Socket;

  public constructor(socket: Socket) {
    super();
    // When a frame is set here then any additional continuation frames payloads will be appended
    this._unfinishedFrame = undefined;

    // When a frame is set here, all additional chunks will be appended until we reach the correct payloadLength
    this._incompleteFrame = undefined;

    this._socket = socket;
    this._alive = true;

    socket.on('data', buff => {
      this._addBuffer(buff);
    });

    socket.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ECONNRESET') {
        this.emit('close');
      } else {
        this.emit('error');
      }
    });

    socket.on('close', () => {
      this.end();
    });
  }

  public end(): void {
    if (!this._alive) {
      return;
    }

    this._alive = false;
    this.emit('close');
    this._socket.end();
  }

  public send(buff: string): void {
    this._sendFrame({
      opcode: OPCODES.TEXT,
      fin: true,
      data: Buffer.from(buff),
    });
  }

  private _sendFrame(frameOpts: BuildFrameOpts): void {
    this._socket.write(buildFrame(frameOpts));
  }

  private _completeFrame(frame: Frame): void {
    // If we have an unfinished frame then only allow continuations
    const { _unfinishedFrame: unfinishedFrame } = this;
    if (unfinishedFrame !== undefined) {
      if (frame.opcode === OPCODES.CONTINUATION) {
        unfinishedFrame.payload = Buffer.concat([
          unfinishedFrame.payload,
          unmaskPayload(frame.payload, unfinishedFrame.mask, unfinishedFrame.payload.length),
        ]);

        if (frame.fin) {
          this._unfinishedFrame = undefined;
          this._completeFrame(unfinishedFrame);
        }
        return;
      } else {
        // Silently ignore the previous frame...
        this._unfinishedFrame = undefined;
      }
    }

    if (frame.fin) {
      if (frame.opcode === OPCODES.PING) {
        this._sendFrame({
          opcode: OPCODES.PONG,
          fin: true,
          data: frame.payload,
        });
      } else {
        // Trim off any excess payload
        let excess;
        if (frame.payload.length > frame.payloadLength) {
          excess = frame.payload.slice(frame.payloadLength);
          frame.payload = frame.payload.slice(0, frame.payloadLength);
        }

        this.emit('message', frame.payload);

        if (excess !== undefined) {
          this._addBuffer(excess);
        }
      }
    } else {
      this._unfinishedFrame = frame;
    }
  }

  private _addBufferToIncompleteFrame(incompleteFrame: Frame, buff: Buffer): void {
    incompleteFrame.payload = Buffer.concat([
      incompleteFrame.payload,
      unmaskPayload(buff, incompleteFrame.mask, incompleteFrame.payload.length),
    ]);

    if (isCompleteFrame(incompleteFrame)) {
      this._incompleteFrame = undefined;
      this._completeFrame(incompleteFrame);
    }
  }

  private _addBuffer(buff: Buffer): void {
    // Check if we're still waiting for the rest of a payload
    const { _incompleteFrame: incompleteFrame } = this;
    if (incompleteFrame !== undefined) {
      this._addBufferToIncompleteFrame(incompleteFrame, buff);
      return;
    }

    // There needs to be atleast two values in the buffer for us to parse
    // a frame from it.
    // See: https://github.com/getsentry/sentry-javascript/issues/9307
    if (buff.length <= 1) {
      return;
    }

    const frame = parseFrame(buff);

    if (isCompleteFrame(frame)) {
      // Frame has been completed!
      this._completeFrame(frame);
    } else {
      this._incompleteFrame = frame;
    }
  }
}

/**
 * Creates a WebSocket client
 */
export async function createWebSocketClient(rawUrl: string): Promise<WebSocketInterface> {
  const parts = url.parse(rawUrl);

  return new Promise((resolve, reject) => {
    const key = crypto.randomBytes(16).toString('base64');
    const digest = createKey(key);

    const req = http.request({
      hostname: parts.hostname,
      port: parts.port,
      path: parts.path,
      method: 'GET',
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Key': key,
        'Sec-WebSocket-Version': '13',
      },
    });

    req.on('response', (res: http.IncomingMessage) => {
      if (res.statusCode && res.statusCode >= 400) {
        process.stderr.write(`Unexpected HTTP code: ${res.statusCode}\n`);
        res.pipe(process.stderr);
      } else {
        res.pipe(process.stderr);
      }
    });

    req.on('upgrade', (res: http.IncomingMessage, socket: Socket) => {
      if (res.headers['sec-websocket-accept'] !== digest) {
        socket.end();
        reject(new Error(`Digest mismatch ${digest} !== ${res.headers['sec-websocket-accept']}`));
        return;
      }

      const client = new WebSocketInterface(socket);
      resolve(client);
    });

    req.on('error', err => {
      reject(err);
    });

    req.end();
  });
}
