# Instrumentation tests

These are tests where we run our breadcrumb instrumentation on a module, then run the instrumented module's original test suite to make sure we didn't break anything.

We don't run these tests in CI; they have one-off harnesses and various requirements to run which may be tricky to provide in CI, and the results of these tests are unlikely to change without significant changes to instrumentation logic which would warrant running them manually during development.

We have the following tests:
- node core http (`node-http.test.js`)

We may add in the future:
- postgres, mysql, etc
- other database drivers
- any other node core modules we choose to instrument

### Usage:
In short, you need to have node checked out to the proper version, then run `node node-http.test.js "/Path/to/node"`.

Exact steps to run, starting from the directory above `raven-node`:
```bash
git clone git@github.com:nodejs/node.git
cd node
git checkout -b v7.2.0 # replace 7.2.0 with whatever version of node you have installed
cd ../raven-node/test/instrumentation
node node-http.test.js "../../../node" # or /Path/to/your/clone/of/node"
```
