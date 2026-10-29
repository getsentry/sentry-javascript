// This is the handler shim the AWS Lambda runtime loads in place of the user's handler
// when the `AwsLambda` integration has redirected `_HANDLER` (see `integration/awslambda.ts`).
//
// It is built as a standalone, ESM-only `build/npm/run-lambda-handler.mjs` because it uses
// top-level await to load the user's handler module (which may itself be ESM) before
// exporting the instrumented handler. The runtime awaits the dynamic import of this file,
// resolves the `handler` export, and invokes it for every event.
import type { Handler } from 'aws-lambda';
import { _INTERNAL_loadOriginalLambdaHandler } from '@sentry/node';
import { instrumentHandler } from './instrumentHandler';

export const handler = instrumentHandler((await _INTERNAL_loadOriginalLambdaHandler()) as Handler);
