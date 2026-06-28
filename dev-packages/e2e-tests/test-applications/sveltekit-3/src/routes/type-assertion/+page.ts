export async function load() {
  let x: unknown = 'foo';
  return {
    // this angle bracket type assertion threw an auto instrumentation error
    // see: https://github.com/getsentry/sentry-javascript/issues/9318
    msg: <string>x,
  };
}
