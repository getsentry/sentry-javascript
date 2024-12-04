import type { WebFetchHeaders } from '@sentry/core';

export interface RequestAsyncStorage {
  getStore: () =>
    | {
        headers: WebFetchHeaders;
      }
    | undefined;
}

export const requestAsyncStorage = undefined;
export const workUnitAsyncStorage = undefined;
