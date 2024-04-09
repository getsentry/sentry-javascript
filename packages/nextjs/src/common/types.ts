import type { SentrySpan } from '@sentry/core';
import type { WebFetchHeaders, WrappedFunction } from '@sentry/types';
import type { NextApiRequest, NextApiResponse } from 'next';
import type { RequestAsyncStorage } from '../config/templates/requestAsyncStorageShim';

export type ServerComponentContext = {
  componentRoute: string;
  componentType: string;
  headers?: WebFetchHeaders;
};

export type GenerationFunctionContext = {
  requestAsyncStorage?: RequestAsyncStorage;
  componentRoute: string;
  componentType: string;
  generationFunctionIdentifier: string;
};

export interface RouteHandlerContext {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  parameterizedRoute: string;
  headers?: WebFetchHeaders;
}

export type VercelCronsConfig = { path?: string; schedule?: string }[] | undefined;

// The `NextApiHandler` and `WrappedNextApiHandler` types are the same as the official `NextApiHandler` type, except:
//
// a) The wrapped version returns only promises, because wrapped handlers are always async.
//
// b) Instead of having a return types based on `void` (Next < 12.1.6) or `unknown` (Next 12.1.6+), both the wrapped and
// unwrapped versions of the type have both. This doesn't matter to users, because they exist solely on one side of that
// version divide or the other. For us, though, it's entirely possible to have one version of Next installed in our
// local repo (as a dev dependency) and have another Next version installed in a test app which also has the local SDK
// linked in.
//
// In that case, if those two versions are on either side of the 12.1.6 divide, importing the official `NextApiHandler`
// type here would break the test app's build, because it would set up a situation in which the linked SDK's
// `withSentry` would refer to one version of the type (from the local repo's `node_modules`) while any typed handler in
// the test app would refer to the other version of the type (from the test app's `node_modules`). By using a custom
// version of the type compatible with both the old and new official versions, we can use any Next version we want in a
// test app without worrying about type errors.
//
// c) These have internal SDK flags which the official Next types obviously don't have, one to allow our auto-wrapping
// function, `withSentryAPI`, to pass the parameterized route into `withSentry`, and the other to prevent a manually
// wrapped route from being wrapped again by the auto-wrapper.

export type NextApiHandler = {
  (req: NextApiRequest, res: NextApiResponse): void | Promise<void> | unknown | Promise<unknown>;
  __sentry_route__?: string;

  /**
   * A property we set in our integration tests to simulate running an API route on platforms that don't support streaming.
   */
  __sentry_test_doesnt_support_streaming__?: true;
};

export type WrappedNextApiHandler = {
  (req: NextApiRequest, res: NextApiResponse): Promise<void> | Promise<unknown>;
  __sentry_route__?: string;
  __sentry_wrapped__?: boolean;
};

export type AugmentedNextApiRequest = NextApiRequest & {
  __withSentry_applied__?: boolean;
};

export type AugmentedNextApiResponse = NextApiResponse & {
  __sentryTransaction?: SentrySpan;
};

export type ResponseEndMethod = AugmentedNextApiResponse['end'];
export type WrappedResponseEndMethod = AugmentedNextApiResponse['end'] & WrappedFunction;
