import type { WebFetchHeaders } from '@sentry/types';

export interface RequestAsyncStorage {
  getStore: () =>
    | {
        headers: WebFetchHeaders;
      }
    | undefined;
}

export const requestAsyncStorage = undefined;
export const workUnitAsyncStorage = undefined;
