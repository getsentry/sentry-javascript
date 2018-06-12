# Instrumentation tests

These are tests where we run our breadcrumb instrumentation on a module, then run the instrumented module's original test suite to make sure we didn't break anything.

We have the following tests:
- node core http (`node-http.test.js`)

We may add in the future:
- postgres, mysql, etc
- other database drivers
- any other node core modules we choose to instrument

### Usage:
We don't run these by default as part of `npm test` since they require a heavy download and take ~a minute to run, but we run them in CI. You can run them locally with:
```
npm run test-full
```
Or:
```bash
cd test/instrumentation
./run.sh
```
This will check what version of node you have, grab the source of that version, then run against that http test suite.
