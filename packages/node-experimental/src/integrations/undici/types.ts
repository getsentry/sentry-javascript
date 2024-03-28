// Vendored from https://github.com/DefinitelyTyped/DefinitelyTyped/blob/5a94716c6788f654aea7999a5fc28f4f1e7c48ad/types/node/diagnostics_channel.d.ts

import type { URL } from 'url';
import type { Span } from '@sentry/types';

// License:
// This project is licensed under the MIT license.
// Copyrights are respective of each contributor listed at the beginning of each definition file.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
// documentation files(the "Software"), to deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and / or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
// WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.IN NO EVENT SHALL THE AUTHORS
// OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

// Vendored code starts here:

export type ChannelListener = (message: unknown, name: string | symbol) => void;

/**
 * The `diagnostics_channel` module provides an API to create named channels
 * to report arbitrary message data for diagnostics purposes.
 *
 * It can be accessed using:
 *
 * ```js
 * import diagnostics_channel from 'diagnostics_channel';
 * ```
 *
 * It is intended that a module writer wanting to report diagnostics messages
 * will create one or many top-level channels to report messages through.
 * Channels may also be acquired at runtime but it is not encouraged
 * due to the additional overhead of doing so. Channels may be exported for
 * convenience, but as long as the name is known it can be acquired anywhere.
 *
 * If you intend for your module to produce diagnostics data for others to
 * consume it is recommended that you include documentation of what named
 * channels are used along with the shape of the message data. Channel names
 * should generally include the module name to avoid collisions with data from
 * other modules.
 * @experimental
 * @see [source](https://github.com/nodejs/node/blob/v18.0.0/lib/diagnostics_channel.js)
 */
export interface DiagnosticsChannel {
  /**
   * Check if there are active subscribers to the named channel. This is helpful if
   * the message you want to send might be expensive to prepare.
   *
   * This API is optional but helpful when trying to publish messages from very
   * performance-sensitive code.
   *
   * ```js
   * import diagnostics_channel from 'diagnostics_channel';
   *
   * if (diagnostics_channel.hasSubscribers('my-channel')) {
   *   // There are subscribers, prepare and publish message
   * }
   * ```
   * @since v15.1.0, v14.17.0
   * @param name The channel name
   * @return If there are active subscribers
   */
  hasSubscribers(name: string | symbol): boolean;
  /**
   * This is the primary entry-point for anyone wanting to interact with a named
   * channel. It produces a channel object which is optimized to reduce overhead at
   * publish time as much as possible.
   *
   * ```js
   * import diagnostics_channel from 'diagnostics_channel';
   *
   * const channel = diagnostics_channel.channel('my-channel');
   * ```
   * @since v15.1.0, v14.17.0
   * @param name The channel name
   * @return The named channel object
   */
  channel(name: string | symbol): Channel;
  /**
   * Register a message handler to subscribe to this channel. This message handler will be run synchronously
   * whenever a message is published to the channel. Any errors thrown in the message handler will
   * trigger an 'uncaughtException'.
   *
   * ```js
   * import diagnostics_channel from 'diagnostics_channel';
   *
   * diagnostics_channel.subscribe('my-channel', (message, name) => {
   *   // Received data
   * });
   * ```
   *
   * @since v18.7.0, v16.17.0
   * @param name The channel name
   * @param onMessage The handler to receive channel messages
   */
  subscribe(name: string | symbol, onMessage: ChannelListener): void;
  /**
   * Remove a message handler previously registered to this channel with diagnostics_channel.subscribe(name, onMessage).
   *
   * ```js
   * import diagnostics_channel from 'diagnostics_channel';
   *
   * function onMessage(message, name) {
   *  // Received data
   * }
   *
   * diagnostics_channel.subscribe('my-channel', onMessage);
   *
   * diagnostics_channel.unsubscribe('my-channel', onMessage);
   * ```
   *
   * @since v18.7.0, v16.17.0
   * @param name The channel name
   * @param onMessage The previous subscribed handler to remove
   * @returns `true` if the handler was found, `false` otherwise
   */
  unsubscribe(name: string | symbol, onMessage: ChannelListener): boolean;
}

/**
 * The class `Channel` represents an individual named channel within the data
 * pipeline. It is use to track subscribers and to publish messages when there
 * are subscribers present. It exists as a separate object to avoid channel
 * lookups at publish time, enabling very fast publish speeds and allowing
 * for heavy use while incurring very minimal cost. Channels are created with {@link channel}, constructing a channel directly
 * with `new Channel(name)` is not supported.
 * @since v15.1.0, v14.17.0
 */
interface ChannelI {
  readonly name: string | symbol;
  /**
   * Check if there are active subscribers to this channel. This is helpful if
   * the message you want to send might be expensive to prepare.
   *
   * This API is optional but helpful when trying to publish messages from very
   * performance-sensitive code.
   *
   * ```js
   * import diagnostics_channel from 'diagnostics_channel';
   *
   * const channel = diagnostics_channel.channel('my-channel');
   *
   * if (channel.hasSubscribers) {
   *   // There are subscribers, prepare and publish message
   * }
   * ```
   * @since v15.1.0, v14.17.0
   */
  readonly hasSubscribers: boolean;

  /**
   * Publish a message to any subscribers to the channel. This will
   * trigger message handlers synchronously so they will execute within
   * the same context.
   *
   * ```js
   * import diagnostics_channel from 'diagnostics_channel';
   *
   * const channel = diagnostics_channel.channel('my-channel');
   *
   * channel.publish({
   *   some: 'message'
   * });
   * ```
   * @since v15.1.0, v14.17.0
   * @param message The message to send to the channel subscribers
   */
  publish(message: unknown): void;
  /**
   * Register a message handler to subscribe to this channel. This message handler
   * will be run synchronously whenever a message is published to the channel. Any
   * errors thrown in the message handler will trigger an `'uncaughtException'`.
   *
   * ```js
   * import diagnostics_channel from 'diagnostics_channel';
   *
   * const channel = diagnostics_channel.channel('my-channel');
   *
   * channel.subscribe((message, name) => {
   *   // Received data
   * });
   * ```
   * @since v15.1.0, v14.17.0
   * @param onMessage The handler to receive channel messages
   */
  subscribe(onMessage: ChannelListener): void;
  /**
   * Remove a message handler previously registered to this channel with `channel.subscribe(onMessage)`.
   *
   * ```js
   * import diagnostics_channel from 'diagnostics_channel';
   *
   * const channel = diagnostics_channel.channel('my-channel');
   *
   * function onMessage(message, name) {
   *   // Received data
   * }
   *
   * channel.subscribe(onMessage);
   *
   * channel.unsubscribe(onMessage);
   * ```
   * @since v15.1.0, v14.17.0
   * @param onMessage The previous subscribed handler to remove
   * @return `true` if the handler was found, `false` otherwise.
   */
  unsubscribe(onMessage: ChannelListener): void;
}

export interface Channel extends ChannelI {
  new (name: string | symbol): void;
}

// https://github.com/nodejs/undici/blob/e6fc80f809d1217814c044f52ed40ef13f21e43c/types/diagnostics-channel.d.ts
export interface UndiciRequest {
  origin?: string | URL;
  completed: boolean;
  // Originally was Dispatcher.HttpMethod, but did not want to vendor that in.
  method?: string;
  path: string;
  // string for undici@<=6.6.2 and string[] for undici@>=6.7.0.
  // see for more information: https://github.com/getsentry/sentry-javascript/issues/10936
  headers: string | string[];
  addHeader(key: string, value: string): RequestWithSentry;
}

export interface UndiciResponse {
  statusCode: number;
  statusText: string;
  headers: Array<Buffer>;
}

export interface RequestWithSentry extends UndiciRequest {
  __sentry_span__?: Span;
}

export interface RequestCreateMessage {
  request: RequestWithSentry;
}

export interface RequestEndMessage {
  request: RequestWithSentry;
  response: UndiciResponse;
}

export interface RequestErrorMessage {
  request: RequestWithSentry;
  error: Error;
}
