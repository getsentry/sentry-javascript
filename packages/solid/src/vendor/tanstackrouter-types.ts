/*

MIT License

Copyright (c) 2021-present Tanner Linsley

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

*/

// The following types are vendored types from TanStack Router, so we don't have to depend on the actual package

export interface VendoredTanstackRouter {
  history: VendoredTanstackRouterHistory;
  state: VendoredTanstackRouterState;
  options: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parseSearch: (search: string) => Record<string, any>;
  };
  matchRoutes: (
    pathname: string,
    // eslint-disable-next-line @typescript-eslint/ban-types
    locationSearch: {},
    opts?: {
      preload?: boolean;
      throwOnError?: boolean;
    },
  ) => Array<VendoredTanstackRouterRouteMatch>;
  subscribe(
    eventType: 'onResolved' | 'onBeforeNavigate',
    callback: (stateUpdate: {
      toLocation: VendoredTanstackRouterLocation;
      fromLocation?: VendoredTanstackRouterLocation;
    }) => void,
  ): () => void;
}

interface VendoredTanstackRouterLocation {
  pathname: string;
  // eslint-disable-next-line @typescript-eslint/ban-types
  search: {};
  state: string;
}

interface VendoredTanstackRouterHistory {
  subscribe: (cb: () => void) => () => void;
}

interface VendoredTanstackRouterState {
  matches: Array<VendoredTanstackRouterRouteMatch>;
  pendingMatches?: Array<VendoredTanstackRouterRouteMatch>;
}

export interface VendoredTanstackRouterRouteMatch {
  routeId: string;
  pathname: string;
  params: { [key: string]: string };
}
