function https() {
  webpack();
}

const webpack = () => {
  File.http();
};

class File {
  constructor() {}

  static http(params) {
    throw new Error('test_err');
  }
}

const blob = function () {
  (function file() {
    https();
  })();
};

try {
  blob();
} catch (err) {
  Sentry.captureException(err);
}
