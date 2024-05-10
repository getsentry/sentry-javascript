# Initializing the SDK in v8

In v8, manual initialization of the SDK will work as follows.

## Classic initialization

```ts
import * as Sentry from '@sentry/browser';

Sentry.init({
  dsn: 'xxx',
});
```

This will initialize the SDK with all defaults & make it the currently active Sentry instance. This will continue to use
the existing global, isolation & current scope, and just bind the client to it.

## Using multiple clients in Node

In an environment with multiple execution contexts (e.g. Node), you can setup multiple clients that are active for
different contexts, like this:

```js
import * as Sentry from '@sentry/node';

// Sets up the _default_ client
Sentry.init({
  dsn: 'xxx',
});

// One execution context with client A
Sentry.withScope(() => {
  const clientA = new Client();
  Sentry.setCurrentClient(clientA); // binds this client to the current execution context only!
  clientA.init();
});

// One execution context with client B
Sentry.withScope(() => {
  const clientB = new Client();
  Sentry.setCurrentClient(clientB); // binds this client to the current execution context only!
  clientB.init();
});
```

## Using multiple clients in Browser

In environments without execution contexts, like the browser, you can only ever have a single active client. You can,
however, create further clients and use them manually:

```js
// Default client - this is used everywhere
Sentry.init({
  dsn: 'xxx',
});

// Setup a manual client
const clientA = new Client();
const scope = new Scope();
scope.setClient(clientA);
// You can capture exceptions manually for this client like this:
scope.captureException();
```

This is also necessary e.g. if you have a browser extension or some other code that runs in a shared environment.
