import { FetchMethod as ForgeRuntimeFetchMethod } from '@forge/api';
import { eventToSentryRequest, sessionToSentryRequest } from '@sentry/core';
import { Event, Response, Session, SessionAggregates, TransportOptions } from '@sentry/types';
import http, { OutgoingHttpHeaders } from 'http';
import https from 'https';
import { URL } from 'url';

import { BaseTransport } from './base';
import {
  HTTPModule,
  HTTPModuleClientRequest,
  HTTPModuleRequestIncomingMessage,
  HTTPModuleRequestOptions,
} from './base/http-module';

export type ErrorLogger = (map: { err: Error }, msg: string) => void;

export type ForgeRuntimeTransportOptions = TransportOptions & {
  fetch: ForgeRuntimeFetchMethod;
  logError: ErrorLogger;
};

type ForgeHttpModuleRequestOptions = {
  logError: ErrorLogger;
  fetch: ForgeRuntimeFetchMethod;
  options: http.RequestOptions | https.RequestOptions;
  callback(res: HTTPModuleRequestIncomingMessage): void;
};

/** Forge fetch implementation only accepts simple headers object */
const isValidHeadersObject = (headers: OutgoingHttpHeaders): headers is { [key: string]: string } => {
  return Object.keys(headers).every(headerName => {
    const value = headers[headerName];
    return typeof value === 'string';
  });
};

/** Internal Error used to re-throw if Response.ok is false */
class InvalidResponseError extends Error {
  public constructor(public statusCode: number) {
    super('Unexpected response code');
  }
}

/**
 * Current tsconfig target is "es5" which transforms classes into functions.
 * Thus, "instanceof" check doesn't work and that's the reason why this type guard function exists.
 */
const isInvalidResponseError = (err: Error | InvalidResponseError): err is InvalidResponseError => {
  return 'statusCode' in err;
};

/**
 * Forge custom implementation of http.ClientRequest
 *
 * It mimics Node.JS behaviour because Forge runtime has limited Node.JS API support.
 * @see https://developer.atlassian.com/platform/forge/runtime-reference/#javascript-environment
 */
class ForgeHttpModuleRequest implements HTTPModuleClientRequest {
  private readonly _httpRes: Exclude<HTTPModuleRequestIncomingMessage, 'statusCode'>;

  public constructor(private _options: ForgeHttpModuleRequestOptions) {
    this._httpRes = {
      setEncoding: () => null,
      headers: {},
      on: () => null,
    };
  }

  /** Mock method because it's not needed for this module */
  public on(): void {
    return undefined;
  }

  /** Sends request to Sentry API */
  public async end(body: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const {
      callback,
      logError,
      fetch,
      options: { headers, method, path, protocol, hostname, port },
    } = this._options;
    const url = new URL(path || '/', 'https://example.com');
    if (protocol) {
      url.protocol = protocol;
    }
    if (hostname) {
      url.hostname = hostname;
    }
    if (port) {
      url.port = String(port);
    }

    const requestHeaders = headers && isValidHeadersObject(headers) ? headers : {};

    try {
      const res = await fetch(url.toString(), {
        body,
        method,
        headers: requestHeaders,
      });

      if (!res.ok) {
        throw new InvalidResponseError(res.status);
      }

      callback({
        ...this._httpRes,
        statusCode: res.status,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      logError({ err }, 'Fetching entry API failed');

      const statusCode = isInvalidResponseError(err) ? err.statusCode : 500;

      callback({
        ...this._httpRes,
        statusCode,
      });
    }
  }
}

/**
 * HTTPModule implementation for Forge runtime.
 * It mimics Node.JS behaviour because Forge runtime has limited Node.JS API support.
 *
 * @see https://developer.atlassian.com/platform/forge/runtime-reference/#javascript-environment
 */
class ForgeHttpModule implements HTTPModule {
  public constructor(private _forgeFetch: ForgeRuntimeFetchMethod, private _logError: ErrorLogger) {}

  /** Sends request to Sentry API */
  public request(
    options: HTTPModuleRequestOptions,
    callback: (res: HTTPModuleRequestIncomingMessage) => void,
  ): HTTPModuleClientRequest {
    if (typeof options === 'string') {
      throw new Error('String request options are not supported');
    }

    if (options instanceof URL) {
      throw new Error('URL as request options is not supported');
    }

    return new ForgeHttpModuleRequest({
      options,
      callback,
      fetch: this._forgeFetch,
      logError: this._logError,
    });
  }
}

/** Forge module transport */
export class ForgeRuntimeTransport extends BaseTransport {
  /** Create a new instance and set this.agent */
  public constructor(options: ForgeRuntimeTransportOptions) {
    super(options);

    this.module = new ForgeHttpModule(options.fetch, options.logError);
    this.client = undefined;
    this.urlParser = url => new URL(url);
  }

  /**
   * @inheritDoc
   */
  public sendEvent(event: Event): Promise<Response> {
    return this._send(eventToSentryRequest(event, this._api), event);
  }

  /**
   * @inheritDoc
   */
  public sendSession(session: Session | SessionAggregates): PromiseLike<Response> {
    return this._send(sessionToSentryRequest(session, this._api), session);
  }
}
