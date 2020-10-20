/* eslint-disable @typescript-eslint/no-explicit-any */
import { ExtractedNodeRequestData } from '@sentry/types';

import { isString } from './is';
import { normalize } from './object';

/**
 * Checks whether we're in the Node.js or Browser environment
 *
 * @returns Answer to given question
 */
export function isNodeEnv(): boolean {
  return Object.prototype.toString.call(typeof process !== 'undefined' ? process : 0) === '[object process]';
}

/**
 * Requires a module which is protected against bundler minification.
 *
 * @param request The module path to resolve
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function dynamicRequire(mod: any, request: string): any {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return mod.require(request);
}

/** Default request keys that'll be used to extract data from the request */
const DEFAULT_REQUEST_KEYS = ['cookies', 'data', 'headers', 'method', 'query_string', 'url'];

/**
 * Normalizes data from the request object, accounting for framework differences.
 *
 * @param req The request object from which to extract data
 * @param keys An optional array of keys to include in the normalized data. Defaults to DEFAULT_REQUEST_KEYS if not
 * provided.
 * @returns An object containing normalized request data
 */
export function extractNodeRequestData(
  req: { [key: string]: any },
  keys: string[] = DEFAULT_REQUEST_KEYS,
): ExtractedNodeRequestData {
  // make sure we can safely use dynamicRequire below
  if (!isNodeEnv()) {
    throw new Error("Can't get node request data outside of a node environment");
  }

  const requestData: { [key: string]: any } = {};

  // headers:
  //   node, express: req.headers
  //   koa: req.header
  const headers = (req.headers || req.header || {}) as {
    host?: string;
    cookie?: string;
  };
  // method:
  //   node, express, koa: req.method
  const method = req.method;
  // host:
  //   express: req.hostname in > 4 and req.host in < 4
  //   koa: req.host
  //   node: req.headers.host
  const host = req.hostname || req.host || headers.host || '<no host>';
  // protocol:
  //   node: <n/a>
  //   express, koa: req.protocol
  const protocol =
    req.protocol === 'https' || req.secure || ((req.socket || {}) as { encrypted?: boolean }).encrypted
      ? 'https'
      : 'http';
  // url (including path and query string):
  //   node, express: req.originalUrl
  //   koa: req.url
  const originalUrl = (req.originalUrl || req.url || '') as string;
  // absolute url
  const absoluteUrl = `${protocol}://${host}${originalUrl}`;

  keys.forEach(key => {
    switch (key) {
      case 'headers':
        requestData.headers = headers;
        break;
      case 'method':
        requestData.method = method;
        break;
      case 'url':
        requestData.url = absoluteUrl;
        break;
      case 'cookies':
        // cookies:
        //   node, express, koa: req.headers.cookie
        //   vercel, sails.js, express (w/ cookie middleware): req.cookies
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        requestData.cookies = req.cookies || dynamicRequire(module, 'cookie').parse(headers.cookie || '');
        break;
      case 'query_string':
        // query string:
        //   node: req.url (raw)
        //   express, koa: req.query
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        requestData.query_string = dynamicRequire(module, 'url').parse(originalUrl || '', false).query;
        break;
      case 'data':
        if (method === 'GET' || method === 'HEAD') {
          break;
        }
        // body data:
        //   node, express, koa: req.body
        if (req.body !== undefined) {
          requestData.data = isString(req.body) ? req.body : JSON.stringify(normalize(req.body));
        }
        break;
      default:
        if ({}.hasOwnProperty.call(req, key)) {
          requestData[key] = (req as { [key: string]: any })[key];
        }
    }
  });

  return requestData;
}
