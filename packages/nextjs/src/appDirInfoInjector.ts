import { GLOBAL_OBJ } from '@sentry/utils';

export type GlobalAppDirInfo = {
  _sentryAppDirInfo?: {
    appDir: true;
  };
};

// A variable injected only into app-directory bundles
// it helps us identify when we are on an app - directory page and when we're not
(GLOBAL_OBJ as typeof GLOBAL_OBJ & GlobalAppDirInfo)._sentryAppDirInfo = { appDir: true };

export {};
