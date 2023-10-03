jest.mock('./src/util/isBrowser', () => {
  return {
    isBrowser: () => true,
  };
});
