export interface RequestAsyncStorage {
  getStore: () =>
    | {
        headers: {
          get: Headers['get'];
        };
      }
    | undefined;
}

export const requestAsyncStorage: RequestAsyncStorage = {
  getStore: () => {
    // eslint-disable-next-line no-console
    console.warn('[sentry] Warning: Could not access `RequestAsyncStorage` module. Certain features may not work.');
    return undefined;
  },
};
