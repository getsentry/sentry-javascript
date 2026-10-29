// The handler shim the AWS Lambda runtime loads in place of the user's handler when `init` redirected `_HANDLER`
// for the managed tunnel (see `lambda/redirectHandler.ts`). Lambda runs no HTTP server, so the handler invocation is
// the only place to answer tunnel requests before the app.
//
// It is built as a standalone, ESM-only `build/run-lambda-handler.mjs`, because it uses top-level await to load the
// user's handler module, which may itself be ESM. `@sentry/aws-serverless` has its own shim with the full Lambda
// instrumentation, and `init` doesn't redirect when that one is in place.
import { loadOriginalLambdaHandler } from './lambda/handlerResolution';
import { wrapLambdaHandlerForTunnel } from './lambda/tunnel';

export const handler = wrapLambdaHandlerForTunnel(await loadOriginalLambdaHandler());
