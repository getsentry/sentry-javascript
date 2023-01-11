import type { IncomingHttpHeaders, RequestOptions as HTTPRequestOptions } from 'http';
import type { RequestOptions as HTTPSRequestOptions } from 'https';
import type { Writable } from 'stream';
import type { URL } from 'url';

export type HTTPModuleRequestOptions = HTTPRequestOptions | HTTPSRequestOptions | string | URL;

/**
 * Cut version of http.IncomingMessage.
 * Some transports work in a special Javascript environment where http.IncomingMessage is not available.
 */
export interface HTTPModuleRequestIncomingMessage {
  headers: IncomingHttpHeaders;
  statusCode?: number;
  on(event: 'data' | 'end', listener: () => void): void;
  setEncoding(encoding: string): void;
}

/**
 * Internal used interface for typescript.
 * @hidden
 */
export interface HTTPModule {
  /**
   * Request wrapper
   * @param options These are {@see TransportOptions}
   * @param callback Callback when request is finished
   */
  request(options: HTTPModuleRequestOptions, callback?: (res: HTTPModuleRequestIncomingMessage) => void): Writable;

  // This is the type for nodejs versions that handle the URL argument
  // (v10.9.0+), but we do not use it just yet because we support older node
  // versions:

  // request(
  //   url: string | URL,
  //   options: http.RequestOptions | https.RequestOptions,
  //   callback?: (res: http.IncomingMessage) => void,
  // ): http.ClientRequest;
}
