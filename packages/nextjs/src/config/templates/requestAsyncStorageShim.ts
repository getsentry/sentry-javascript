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
    return undefined;
  },
};
