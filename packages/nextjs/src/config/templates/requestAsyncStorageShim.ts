import type { WebFetchHeaders } from '@sentry/types';

export interface RequestAsyncStorage {
  getStore: () =>
    | {
        headers: WebFetchHeaders;
      }
    | undefined;
}
