const JSDOMEnvironment = require('jest-environment-jsdom');

// TODO Node >= 8.3 includes the same TextEncoder and TextDecoder as exist in the browser, but they haven't yet been
// added to jsdom. Until they are, we can do it ourselves. Once they do, this file can go away.

// see https://github.com/jsdom/jsdom/issues/2524 and https://nodejs.org/api/util.html#util_class_util_textencoder

module.exports = class DOMEnvironment extends JSDOMEnvironment {
  async setup() {
    await super.setup();
    if (typeof this.global.TextEncoder === 'undefined') {
      const { TextEncoder, TextDecoder } = require('util');
      this.global.TextEncoder = TextEncoder;
      this.global.TextDecoder = TextDecoder;
    }
  }
};
