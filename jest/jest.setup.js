// This is needed for `jest.useFakeTimers` to work
// See: https://stackoverflow.com/questions/77694957/typeerror-cannot-assign-to-read-only-property-performance-of-object-object
Object.defineProperty(global, 'performance', {
  writable: true,
});
