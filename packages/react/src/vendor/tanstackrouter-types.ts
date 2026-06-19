/*
 * Copyright (c) 2021-present Tanner Linsley
 * SPDX-License-Identifier: MIT
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
