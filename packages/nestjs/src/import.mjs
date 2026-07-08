// EXPERIMENTAL: NestJS diagnostics-channel injection runtime hook. The
// side-effecting `--import` entry (e.g. `node --import @sentry/nestjs/import app.js`)
// that injects the @nestjs channels unconditionally before the app loads.
//
// Order matters and static ESM imports are hoisted: we import the register
// FUNCTION (not a side-effecting base hook) and call it AFTER registering the
// NestJS instrumentation, so the transform config includes the @nestjs configs.
// The `nestjsOrchestrion` descriptor is an internal detail (not a public export),
// so we reach it via a relative path into this package's own build output;
// importing it has no side effects. It only defines the descriptor.
//
// This file ships verbatim to `build/import.mjs`; the relative import below
// resolves to `build/esm/orchestrion/index.js` at runtime.

import { registerOrchestrionInstrumentation } from '@sentry/server-utils/orchestrion';
import { registerDiagnosticsChannelInjection } from '@sentry/server-utils/orchestrion/register';
import { nestjsOrchestrion } from './esm/orchestrion/index.js';

registerOrchestrionInstrumentation(nestjsOrchestrion);
registerDiagnosticsChannelInjection();
