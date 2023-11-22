export interface RequestAsyncStorage {
  getStore: () =>
    | {
        headers: Headers;
      }
    | undefined;
}
