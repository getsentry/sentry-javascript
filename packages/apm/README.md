# Deprecated

The tracing integration for JavaScript SDKs has moved from
[`@sentry/apm`](https://www.npmjs.com/package/@sentry/apm) to
[`@sentry/tracing`](https://www.npmjs.com/package/@sentry/tracing). While the
two packages are similar, some imports and APIs have changed slightly.

The old package `@sentry/apm` is deprecated in favor of `@sentry/tracing`.
Future support for `@sentry/apm` is limited to bug fixes only.

## Migrating from @sentry/apm to @sentry/tracing

### Browser (CDN bundle)

If you were using the Browser CDN bundle, switch from the old
`bundle.apm.min.js` to the new tracing bundle:

```html
<script
  src="https://browser.sentry-cdn.com/xxx/bundle.tracing.min.js"
  integrity="sha384-sha"
  crossorigin="anonymous"
></script>
```

And then update `Sentry.init`:

```diff
 Sentry.init({
-  integrations: [new Sentry.Integrations.Tracing()]
+  integrations: [new Sentry.Integrations.BrowserTracing()]
 });
```

### Browser (npm package)

If you were using automatic instrumentation, update the import statement and
update `Sentry.init` to use the new `BrowserTracing` integration:

```diff
 import * as Sentry from "@sentry/browser";
-import { Integrations } from "@sentry/apm";
+import { Integrations } from "@sentry/tracing";

 Sentry.init({
   integrations: [
-    new Integrations.Tracing(),
+    new Integrations.BrowserTracing(),
   ]
 });
```

If you were using the `beforeNavigate` option from the `Tracing` integration,
the API in `BrowserTracing` has changed slightly. Instead of passing in a
location and returning a string representing transaction name, `beforeNavigate`
now accepts a transaction context and is expected to return a transaction
context. You can now add extra tags or change the `op` based on different
parameters. If you want to access the location like before, you can get it from
`window.location`.

For example, if you had a function like so that computed a custom transaction
name:

```javascript
import * as Sentry from "@sentry/browser";
import { Integrations } from "@sentry/apm";

Sentry.init({
  integrations: [
    new Integrations.Tracing({
      beforeNavigate: location => {
        return getTransactionName(location);
      },
    }),
  ],
});
```

You would now leverage the context to do the same thing:

```javascript
import * as Sentry from "@sentry/browser";
import { Integrations } from "@sentry/tracing";

Sentry.init({
  integrations: [
    new Integrations.BrowserTracing({
      beforeNavigate: context => {
        return {
          ...context,
          // Can even look at context tags or other data to adjust
          // transaction name
          name: getTransactionName(window.location),
        };
      },
    }),
  ],
});
```

For the full diff:

```diff
 import * as Sentry from "@sentry/browser";
-import { Integrations } from "@sentry/apm";
+import { Integrations } from "@sentry/tracing";

 Sentry.init({
   integrations: [
-    new Integrations.Tracing({
-      beforeNavigate: (location) => {
-        return getTransactionName(location)
+    new Integrations.BrowserTracing({
+      beforeNavigate: (ctx) => {
+        return {
+          ...ctx,
+          name: getTransactionName(ctx.name, window.location)
+        }
       }
     }),
   ]
 });
```

### Node

If you were using the Express integration for automatic instrumentation, the
only necessary change is to update the import statement:

```diff
 import * as Sentry from "@sentry/node";
-import { Integrations } from "@sentry/apm";
+import { Integrations } from "@sentry/tracing";

 Sentry.init({
   integrations: [
     new Integrations.Express(),
   ]
 });
```
