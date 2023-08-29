export interface RequestAsyncStorage {
  getStore: () =>
    | {
        headers: {
          get: Headers['get'];
        };
      }
    | undefined;
}
