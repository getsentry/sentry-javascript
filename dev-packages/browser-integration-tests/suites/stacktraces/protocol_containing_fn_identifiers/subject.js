function httpsCall() {
  webpackDevServer();
}

const webpackDevServer = () => {
  Response.httpCode();
};

class Response {
  constructor() {}

  static httpCode(params) {
    throw new Error('test_err');
  }
}

const decodeBlob = function () {
  (function readFile() {
    httpsCall();
  })();
};

try {
  decodeBlob();
} catch (err) {
  Sentry.captureException(err);
}
