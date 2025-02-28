> NOTE: These are docs for the maintainers of the TanStack Start SDK and not for users of the package.

# Hosting Provider ESM Loader Hooks

This file contains the code for ESM loader hooks that can be base64 encoded and passed to the `NODE_OPTIONS` environment variable as `--import "data:text/javascript;base64,1234BASE64HERE1324"`.

Before encoding the snippets below and pasting them in docs or whatever, make sure to minify them as much as possible.

In their current state the hooks are as minimal as possible. Do not remove things from them because you think they can be smaller - unless thoroughly testing them beforehand!

## Vercel

```mjs
import { register, createRequire } from 'module';
if (!process.env.CI) {
  try {
    const moduleResolutionContext = `file://${process.cwd()}/index.js`;
    const req = createRequire(moduleResolutionContext);
    const { createAddHookMessageChannel } = req('import-in-the-middle');
    const { addHookMessagePort } = createAddHookMessageChannel();
    register('import-in-the-middle/hook.mjs', moduleResolutionContext, {
      data: { addHookMessagePort, include: [] },
      transferList: [addHookMessagePort],
    });
    globalThis._sentryEsmLoaderHookRegistered = true;
  } catch (e) {
    globalThis._sentryEsmLoaderHookError = `${e}`;
  }
}
```
