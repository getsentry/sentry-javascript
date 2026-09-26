// Replaces `--import remix/node-tsx` rather than adding a second flag.
//
// Registers Sentry's module hook first, so the modules the app imports afterwards publish the
// channels subscribed to below. The asset server is created while the app's modules load, which is
// before `Sentry.init()` runs, so its subscriber has to be in place here.
import '@sentry/server-runtime-injection/import-hook';
import { instrumentAssetServer } from '@sentry/remix/v3';

instrumentAssetServer();

await import('remix/node-tsx');
