## Expected Outcome

It should work with index routes inside the children routes

## Scenario

- with recursion

  ```ts
  export function addRoutesToAllRoutes(routes: RouteObject[]): void {
    console.log('routes to add to allRoutes::', JSON.stringify(routes));
    routes.forEach(route => {
      const extractedChildRoutes = getChildRoutesRecursively(route);

      extractedChildRoutes.forEach(r => {
        allRoutes.add(r);
      });
    });
  }
  ```

- with index route
  ```ts
    {
    path: '/post/:post',
    element: <div>Post</div>,
    children: [
      { index: true, element: <div>Post Index</div> },
      { path: '/post/:post/related', element: <div>Related Posts</div> },
    ],
  },
  ```

## Logs during E2E test

Running 4 tests using 1 worker

createV6CompatibleWrapCreateBrowserRouter - routes:: [{"path":"/post/:post","element":{"type":"div","key":null,"ref":null,"props":{"children":"Post"},"\_owner":null},"children":[{"index":true,"element":{"type":"div","key":null,"ref":null,"props":{"children":"Post Index"},"_owner":null}},{"path":"/post/:post/related","element":{"type":"div","key":null,"ref":null,"props":{"children":"Related Posts"},"_owner":null}}]},{"children":[{"path":"/","element":{"key":null,"ref":null,"props":{},"_owner":null}},{"path":"/*","element":{"key":null,"ref":null,"props":{},"_owner":null}}]}]

routes to add to allRoutes:: [{"path":"/post/:post","element":{"type":"div","key":null,"ref":null,"props":{"children":"Post"},"\_owner":null},"children":[{"index":true,"element":{"type":"div","key":null,"ref":null,"props":{"children":"Post Index"},"_owner":null}},{"path":"/post/:post/related","element":{"type":"div","key":null,"ref":null,"props":{"children":"Related Posts"},"_owner":null}}]},{"children":[{"path":"/","element":{"key":null,"ref":null,"props":{},"_owner":null}},{"path":"/*","element":{"key":null,"ref":null,"props":{},"_owner":null}}]}]

updatePageloadTransaction::

isInDescendantRoute:: true

rebuildRoutePathFromAllRoutes matched: {pathname: /projects/123/views/234/567, search: , hash: , state: null, key: default} [{"params":{"_":"projects/123/views/234/567"},"pathname":"/","pathnameBase":"/","route":{"children":[{"path":"/","element":{"key":null,"ref":null,"props":{},"\_owner":null}},{"path":"/_","element":{"key":null,"ref":null,"props":{},"\_owner":null}}]}},{"params":{"_":"projects/123/views/234/567"},"pathname":"/projects/123/views/234/567","pathnameBase":"/","route":{"path":"/_","element":{"key":null,"ref":null,"props":{},"\_owner":null}}}]

desc: name:: /projects/123/views/234/567 source:: route

router:: {basename: undefined, future: undefined, state: undefined, routes: undefined, window: undefined}

routes to add to allRoutes:: [{"path":":detailId","element":{"type":"div","key":null,"ref":null,"props":{"id":"details","children":"Details"},"_owner":null}}]

updatePageloadTransaction::

isInDescendantRoute:: true

rebuildRoutePathFromAllRoutes matched: {pathname: /projects/123/views/234/567, search: , hash: , state: null, key: default} [{"params":{"_":"projects/123/views/234/567"},"pathname":"/","pathnameBase":"/","route":{"children":[{"path":"/","element":{"key":null,"ref":null,"props":{},"\_owner":null}},{"path":"/_","element":{"key":null,"ref":null,"props":{},"\_owner":null}}]}},{"params":{"_":"projects/123/views/234/567"},"pathname":"/projects/123/views/234/567","pathnameBase":"/","route":{"path":"/_","element":{"key":null,"ref":null,"props":{},"\_owner":null}}}]

desc: name:: /projects/123/views/234/567 source:: route
routes to add to allRoutes:: [{"index":true,"element":{"type":"div","key":null,"ref":null,"props":{"id":"views","children":"Views"},"_owner":null}},{"path":"views/:viewId/*","element":{"key":null,"ref":null,"props":{},"_owner":null}},{"path":"old-views/:viewId/*","element":{"key":null,"ref":null,"props":{},"_owner":null}}]

updatePageloadTransaction::

isInDescendantRoute:: true

rebuildRoutePathFromAllRoutes matched: {pathname: /projects/123/views/234/567, search: , hash: , state: null, key: default} [{"params":{"_":"projects/123/views/234/567"},"pathname":"/","pathnameBase":"/","route":{"children":[{"path":"/","element":{"key":null,"ref":null,"props":{},"\_owner":null}},{"path":"/_","element":{"key":null,"ref":null,"props":{},"\_owner":null}}]}},{"params":{"_":"projects/123/views/234/567"},"pathname":"/projects/123/views/234/567","pathnameBase":"/","route":{"path":"/_","element":{"key":null,"ref":null,"props":{},"\_owner":null}}}]

desc: name:: /projects/123/views/234/567 source:: route

routesFromChildren:: [{"id":"0","element":{"key":null,"ref":null,"props":{},"\_owner":null},"path":"projects","hasErrorBoundary":false,"children":[{"id":"0-0","element":{"type":"div","key":null,"ref":null,"props":{"children":"Project Page Root"},"\_owner":null},"index":true,"hasErrorBoundary":false},{"id":"0-1","element":{"key":null,"ref":null,"props":{},"\_owner":null},"path":"_","hasErrorBoundary":false,"children":[{"id":"0-1-0","element":{"key":null,"ref":null,"props":{},"\_owner":null},"path":":projectId/_","hasErrorBoundary":false}]}]}]

routes to add to allRoutes:: [{"id":"0","element":{"key":null,"ref":null,"props":{},"\_owner":null},"path":"projects","hasErrorBoundary":false,"children":[{"id":"0-0","element":{"type":"div","key":null,"ref":null,"props":{"children":"Project Page Root"},"\_owner":null},"index":true,"hasErrorBoundary":false},{"id":"0-1","element":{"key":null,"ref":null,"props":{},"\_owner":null},"path":"_","hasErrorBoundary":false,"children":[{"id":"0-1-0","element":{"key":null,"ref":null,"props":{},"\_owner":null},"path":":projectId/_","hasErrorBoundary":false}]}]}]
updatePageloadTransaction::

isInDescendantRoute:: true

rebuildRoutePathFromAllRoutes matched: {pathname: /projects/123/views/234/567, search: , hash: , state: null, key: default} [{"params":{"_":"views/234/567","projectId":"123"},"pathname":"/projects","pathnameBase":"/projects","route":{"id":"0","element":{"key":null,"ref":null,"props":{},"\_owner":null},"path":"projects","hasErrorBoundary":false,"children":[{"id":"0-0","element":{"type":"div","key":null,"ref":null,"props":{"children":"Project Page Root"},"\_owner":null},"index":true,"hasErrorBoundary":false},{"id":"0-1","element":{"key":null,"ref":null,"props":{},"\_owner":null},"path":"_","hasErrorBoundary":false,"children":[{"id":"0-1-0","element":{"key":null,"ref":null,"props":{},"_owner":null},"path":":projectId/*","hasErrorBoundary":false}]}]}},{"params":{"_":"views/234/567","projectId":"123"},"pathname":"/projects/123/views/234/567","pathnameBase":"/projects","route":{"id":"0-1","element":{"key":null,"ref":null,"props":{},"\_owner":null},"path":"_","hasErrorBoundary":false,"children":[{"id":"0-1-0","element":{"key":null,"ref":null,"props":{},"_owner":null},"path":":projectId/*","hasErrorBoundary":false}]}},{"params":{"_":"views/234/567","projectId":"123"},"pathname":"/projects/123/views/234/567","pathnameBase":"/projects/123","route":{"id":"0-1-0","element":{"key":null,"ref":null,"props":{},"\_owner":null},"path":":projectId/_","hasErrorBoundary":false}}]

rebuildRoutePathFromAllRoutes matched: {pathname: /123/views/234/567} [{"params":{"_":"views/234/567","projectId":"123"},"pathname":"/123/views/234/567","pathnameBase":"/","route":{"id":"0-1","element":{"key":null,"ref":null,"props":{},"\_owner":null},"path":"_","hasErrorBoundary":false,"children":[{"id":"0-1-0","element":{"key":null,"ref":null,"props":{},"_owner":null},"path":":projectId/*","hasErrorBoundary":false}]}},{"params":{"_":"views/234/567","projectId":"123"},"pathname":"/123/views/234/567","pathnameBase":"/123","route":{"id":"0-1-0","element":{"key":null,"ref":null,"props":{},"\_owner":null},"path":":projectId/_","hasErrorBoundary":false}}]

rebuildRoutePathFromAllRoutes matched: {pathname: /views/234/567} [{"params":{"viewId":"234","*":"567"},"pathname":"/views/234/567","pathnameBase":"/views/234","route":{"path":"views/:viewId/*","element":{"key":null,"ref":null,"props":{},"_owner":null}}}]

rebuildRoutePathFromAllRoutes matched: {pathname: /567} [{"params":{"detailId":"567"},"pathname":"/567","pathnameBase":"/567","route":{"path":":detailId","element":{"type":"div","key":null,"ref":null,"props":{"id":"details","children":"Details"},"_owner":null}}}]

rebuildRoutePathFromAllRoutes matched: {pathname: /} [{"params":{},"pathname":"/","pathnameBase":"/","route":{"index":true,"element":{"type":"div","key":null,"ref":null,"props":{"children":"Post Index"},"_owner":null}}}]

desc: name:: /projects/:projectId/views/:viewId/:detailId source:: route

✓ 1 [chromium] › tests/transactions.test.ts:4:5 › sends a pageload transaction with a parameterized URL (1.3s)

✓ 2 [chromium] › tests/transactions.test.ts:30:5 › sends a pageload transaction with a parameterized URL - alternative route (1.2s)

✘ 3 [chromium] › tests/transactions.test.ts:54:5 › sends a navigation transaction with a parameterized URL (1.2s)

✘ 4 [chromium] › tests/transactions.test.ts:98:5 › sends a navigation transaction with a parameterized URL - alternative route (1.2s)

1.  [chromium] › tests/transactions.test.ts:54:5 › sends a navigation transaction with a parameterized URL

    Error: expect(received).toMatchObject(expected)
    - Expected - 1
    * Received + 1

    @@ -3,10 +3,10 @@
    "trace": Object {
    "op": "pageload",
    "origin": "auto.pageload.react.reactrouter_v7",
    },
    },
    - "transaction": "/",
    * "transaction": "<unlabeled transaction>",
      "transaction_info": Object {
      "source": "route",
      },
      }

    64 | const pageloadTxn = await pageloadTxnPromise;
    65 |

    > 66 | expect(pageloadTxn).toMatchObject({

          |                       ^

    67 | contexts: {
    68 | trace: {
    69 | op: 'pageload',
    at /private/var/folders/zg/3jx06d797kv5pggvpxj2bc540000gn/T/sentry-e2e-tests-react-router-7-cross-usage-Gan5my/tests/transactions.test.ts:66:23

    Error Context: test-results/transactions-sends-a-navig-fc4a1-on-with-a-parameterized-URL-chromium/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/transactions-sends-a-navig-fc4a1-on-with-a-parameterized-URL-chromium/trace.zip
    Usage:

         pnpm exec playwright show-trace test-results/transactions-sends-a-navig-fc4a1-on-with-a-parameterized-URL-chromium/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

2.  [chromium] › tests/transactions.test.ts:98:5 › sends a navigation transaction with a parameterized URL - alternative route

    Error: expect(received).toMatchObject(expected)
    - Expected - 1
    * Received + 1

    @@ -3,10 +3,10 @@
    "trace": Object {
    "op": "pageload",
    "origin": "auto.pageload.react.reactrouter_v7",
    },
    },
    - "transaction": "/",
    * "transaction": "<unlabeled transaction>",
      "transaction_info": Object {
      "source": "route",
      },
      }

    108 | const pageloadTxn = await pageloadTxnPromise;
    109 |

    > 110 | expect(pageloadTxn).toMatchObject({

           |                       ^

    111 | contexts: {
    112 | trace: {
    113 | op: 'pageload',
    at /private/var/folders/zg/3jx06d797kv5pggvpxj2bc540000gn/T/sentry-e2e-tests-react-router-7-cross-usage-Gan5my/tests/transactions.test.ts:110:23

    Error Context: test-results/transactions-sends-a-navig-c389f-zed-URL---alternative-route-chromium/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/transactions-sends-a-navig-c389f-zed-URL---alternative-route-chromium/trace.zip
    Usage:

         pnpm exec playwright show-trace test-results/transactions-sends-a-navig-c389f-zed-URL---alternative-route-chromium/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

2 failed
[chromium] › tests/transactions.test.ts:54:5 › sends a navigation transaction with a parameterized URL
[chromium] › tests/transactions.test.ts:98:5 › sends a navigation transaction with a parameterized URL - alternative route
2 passed (8.4s)

ELIFECYCLE  Test failed. See above for more details.

ELIFECYCLE  Command failed with exit code 1.
