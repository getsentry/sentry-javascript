## Expected Outcome

It should work with index routes inside the children routes

## Scenario

- no recursion
  ```ts
  export function addRoutesToAllRoutes(routes: RouteObject[]): void {
    console.log('routes to add to allRoutes::', JSON.stringify(routes));
    routes.forEach(route => {
      if (!allRoutes.has(route)) {
        allRoutes.add(route);
      }
    });
  }
  ```
- no index route
  ```ts
    {
    path: '/post/:post',
    element: <div>Post</div>,
    children: [
     //  { index: true, element: <div>Post Index</div> },
      { path: '/post/:post/related', element: <div>Related Posts</div> },
    ],
  },
  ```

## Logs during E2E test

Running 4 tests using 1 worker

createV6CompatibleWrapCreateBrowserRouter - routes:: [{"path":"/post/:post","element":{"type":"div","key":null,"ref":null,"props":{"children":"Post"},"\_owner":null},"children":[{"path":"/post/:post/related","element":{"type":"div","key":null,"ref":null,"props":{"children":"Related Posts"},"_owner":null}}]},{"children":[{"path":"/","element":{"key":null,"ref":null,"props":{},"_owner":null}},{"path":"/*","element":{"key":null,"ref":null,"props":{},"_owner":null}}]}]

routes to add to allRoutes:: [{"path":"/post/:post","element":{"type":"div","key":null,"ref":null,"props":{"children":"Post"},"\_owner":null},"children":[{"path":"/post/:post/related","element":{"type":"div","key":null,"ref":null,"props":{"children":"Related Posts"},"_owner":null}}]},{"children":[{"path":"/","element":{"key":null,"ref":null,"props":{},"_owner":null}},{"path":"/*","element":{"key":null,"ref":null,"props":{},"_owner":null}}]}]

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

rebuildRoutePathFromAllRoutes matched: {pathname: /123/views/234/567} [{"params":{"_":"123/views/234/567"},"pathname":"/","pathnameBase":"/","route":{"children":[{"path":"/","element":{"key":null,"ref":null,"props":{},"\_owner":null}},{"path":"/_","element":{"key":null,"ref":null,"props":{},"\_owner":null}}]}},{"params":{"_":"123/views/234/567"},"pathname":"/123/views/234/567","pathnameBase":"/","route":{"path":"/_","element":{"key":null,"ref":null,"props":{},"\_owner":null}}}]

desc: name:: /projects/123/views/234/567 source:: route

✘ 1 [chromium] › tests/transactions.test.ts:4:5 › sends a pageload transaction with a parameterized URL (1.3s)

✘ 2 [chromium] › tests/transactions.test.ts:30:5 › sends a pageload transaction with a parameterized URL - alternative route (1.2s)

✘ 3 [chromium] › tests/transactions.test.ts:54:5 › sends a navigation transaction with a parameterized URL (2.3s)

✘ 4 [chromium] › tests/transactions.test.ts:98:5 › sends a navigation transaction with a parameterized URL - alternative route (2.3s)

1.  [chromium] › tests/transactions.test.ts:4:5 › sends a pageload transaction with a parameterized URL

    Error: expect(received).toMatchObject(expected)
    - Expected - 1
    * Received + 1

    @@ -3,10 +3,10 @@
    "trace": Object {
    "op": "pageload",
    "origin": "auto.pageload.react.reactrouter_v7",
    },
    },
    - "transaction": "/projects/:projectId/views/:viewId/:detailId",
    * "transaction": "/projects/123/views/234/567",
      "transaction_info": Object {
      "source": "route",
      },
      }

    14 |
    15 | expect((await page.innerHTML('#root')).includes('Details')).toBe(true);

    > 16 | expect(rootSpan).toMatchObject({

          |                    ^

    17 | contexts: {
    18 | trace: {
    19 | op: 'pageload',
    at /private/var/folders/zg/3jx06d797kv5pggvpxj2bc540000gn/T/sentry-e2e-tests-react-router-7-cross-usage-mSvGiI/tests/transactions.test.ts:16:20

    Error Context: test-results/transactions-sends-a-pagel-84aa8-on-with-a-parameterized-URL-chromium/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/transactions-sends-a-pagel-84aa8-on-with-a-parameterized-URL-chromium/trace.zip
    Usage:

         pnpm exec playwright show-trace test-results/transactions-sends-a-pagel-84aa8-on-with-a-parameterized-URL-chromium/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

2.  [chromium] › tests/transactions.test.ts:30:5 › sends a pageload transaction with a parameterized URL - alternative route

    Error: expect(received).toMatchObject(expected)
    - Expected - 1
    * Received + 1

    @@ -3,10 +3,10 @@
    "trace": Object {
    "op": "pageload",
    "origin": "auto.pageload.react.reactrouter_v7",
    },
    },
    - "transaction": "/projects/:projectId/old-views/:viewId/:detailId",
    * "transaction": "/projects/234/old-views/234/567",
      "transaction_info": Object {
      "source": "route",
      },
      }

    38 |
    39 | expect((await page.innerHTML('#root')).includes('Details')).toBe(true);

    > 40 | expect(rootSpan).toMatchObject({

          |                    ^

    41 | contexts: {
    42 | trace: {
    43 | op: 'pageload',
    at /private/var/folders/zg/3jx06d797kv5pggvpxj2bc540000gn/T/sentry-e2e-tests-react-router-7-cross-usage-mSvGiI/tests/transactions.test.ts:40:20

    Error Context: test-results/transactions-sends-a-pagel-f5147-zed-URL---alternative-route-chromium/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/transactions-sends-a-pagel-f5147-zed-URL---alternative-route-chromium/trace.zip
    Usage:

         pnpm exec playwright show-trace test-results/transactions-sends-a-pagel-f5147-zed-URL---alternative-route-chromium/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

3.  [chromium] › tests/transactions.test.ts:54:5 › sends a navigation transaction with a parameterized URL

    Error: expect(received).toMatchObject(expected)
    - Expected - 1
    * Received + 1

    @@ -3,10 +3,10 @@
    "trace": Object {
    "op": "navigation",
    "origin": "auto.navigation.react.reactrouter_v7",
    },
    },
    - "transaction": "/projects/:projectId/views/:viewId/:detailId",
    * "transaction": "/projects/123/views/456/789",
      "transaction_info": Object {
      "source": "route",
      },
      }

    82 |
    83 | expect((await page.innerHTML('#root')).includes('Details')).toBe(true);

    > 84 | expect(navigationTxn).toMatchObject({

          |                         ^

    85 | contexts: {
    86 | trace: {
    87 | op: 'navigation',
    at /private/var/folders/zg/3jx06d797kv5pggvpxj2bc540000gn/T/sentry-e2e-tests-react-router-7-cross-usage-mSvGiI/tests/transactions.test.ts:84:25

    Error Context: test-results/transactions-sends-a-navig-fc4a1-on-with-a-parameterized-URL-chromium/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/transactions-sends-a-navig-fc4a1-on-with-a-parameterized-URL-chromium/trace.zip
    Usage:

         pnpm exec playwright show-trace test-results/transactions-sends-a-navig-fc4a1-on-with-a-parameterized-URL-chromium/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

4.  [chromium] › tests/transactions.test.ts:98:5 › sends a navigation transaction with a parameterized URL - alternative route

    Error: expect(received).toMatchObject(expected)
    - Expected - 1
    * Received + 1

    @@ -3,10 +3,10 @@
    "trace": Object {
    "op": "navigation",
    "origin": "auto.navigation.react.reactrouter_v7",
    },
    },
    - "transaction": "/projects/:projectId/old-views/:viewId/:detailId",
    * "transaction": "/projects/123/old-views/345/654",
      "transaction_info": Object {
      "source": "route",
      },
      }

    126 |
    127 | expect((await page.innerHTML('#root')).includes('Details')).toBe(true);

    > 128 | expect(navigationTxn).toMatchObject({

           |                         ^

    129 | contexts: {
    130 | trace: {
    131 | op: 'navigation',
    at /private/var/folders/zg/3jx06d797kv5pggvpxj2bc540000gn/T/sentry-e2e-tests-react-router-7-cross-usage-mSvGiI/tests/transactions.test.ts:128:25

    Error Context: test-results/transactions-sends-a-navig-c389f-zed-URL---alternative-route-chromium/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/transactions-sends-a-navig-c389f-zed-URL---alternative-route-chromium/trace.zip
    Usage:

         pnpm exec playwright show-trace test-results/transactions-sends-a-navig-c389f-zed-URL---alternative-route-chromium/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

4 failed
[chromium] › tests/transactions.test.ts:4:5 › sends a pageload transaction with a parameterized URL
[chromium] › tests/transactions.test.ts:30:5 › sends a pageload transaction with a parameterized URL - alternative route
[chromium] › tests/transactions.test.ts:54:5 › sends a navigation transaction with a parameterized URL
[chromium] › tests/transactions.test.ts:98:5 › sends a navigation transaction with a parameterized URL - alternative route

ELIFECYCLE  Test failed. See above for more details.

ELIFECYCLE  Command failed with exit code 1.
