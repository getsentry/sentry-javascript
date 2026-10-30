export function createDependencyError() {
  return new Error('application-key-dependency-error');
}

export function createAsyncDependencyError() {
  return new Promise(resolve => {
    // Wait until the application's call stack has unwound so the error stack contains only a dependency frame.
    queueMicrotask(() => resolve(new Error('application-key-dependency-only-error')));
  });
}
