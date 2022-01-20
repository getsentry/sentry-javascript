<p align="center">
  <a href="https://sentry.io" target="_blank" align="center">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-logo-black.png" width="280">
  </a>
  <br />
</p>

# Sentry JavaScript RewriteFrames integration

[![npm version](https://img.shields.io/npm/v/@sentry/integration-common-rewriteframes.svg)](https://www.npmjs.com/package/@sentry/wasm)
[![npm dm](https://img.shields.io/npm/dm/@sentry/integration-common-rewriteframes.svg)](https://www.npmjs.com/package/@sentry/wasm)
[![npm dt](https://img.shields.io/npm/dt/@sentry/integration-common-rewriteframes.svg)](https://www.npmjs.com/package/@sentry/wasm)
[![typedoc](https://img.shields.io/badge/docs-typedoc-blue.svg)](http://getsentry.github.io/sentry-javascript/)

## Links

- [Official SDK Docs](https://docs.sentry.io/quickstart/)
- [TypeDoc](http://getsentry.github.io/sentry-javascript/)

## General

This integration allows you to apply a transformation to each frame of the stack trace. In the streamlined scenario, it can be used to change the name of the file frame it originates from, or it can be fed with an iterated function to apply any arbitrary transformation.

On Windows machines, you have to use Unix paths and skip the volume letter in root option to enable. For example `C:\\Program Files\\Apache\\www` won’t work, however, `/Program Files/Apache/www` will.

Available options:

```js
import * as Sentry from "@sentry/browser";
import { RewriteFrames } from "@sentry/integration-common-rewriteframes";

Sentry.init({
  dsn: "___PUBLIC_DSN___",
  integrations: [new RewriteFrames(
    {
      // root path that will be stripped from the current frame's filename by the default iteratee if the filename is an absolute path
      root: string;

      // a custom prefix that will be used by the default iteratee (default: `app://`)
      prefix: string;

      // function that takes the frame, applies a transformation, and returns it
      iteratee: (frame) => frame;
    }
  )],
});
```

#### Usage Examples

For example, if the full path to your file is `/www/src/app/file.js`:

| Usage                             | Path in Stack Trace      | Description                                                                                                                   |
| --------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `RewriteFrames()`                 | `app:///file.js`         | The default behavior is to replace the absolute path, except the filename, and prefix it with the default prefix (`app:///`). |
| `RewriteFrames({prefix: 'foo/'})` | `foo/file.js`            | Prefix `foo/` is used instead of the default prefix `app:///`.                                                                |
| `RewriteFrames({root: '/www'})`   | `app:///src/app/file.js` | `root` is defined as `/www`, so only that part is trimmed from beginning of the path.                                         |
