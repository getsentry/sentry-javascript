const Environment = require('jest-environment-jsdom');

// Looks like jsdom does not support global TextEncoder/TextDecoder
// https://github.com/jsdom/jsdom/issues/2524

module.exports = class CustomTestEnvironment extends Environment {
  async setup() {
    await super.setup();
    if (typeof this.global.TextEncoder === 'undefined') {
      const { TextEncoder, TextDecoder } = require('util');
      this.global.TextEncoder = TextEncoder;
      this.global.TextDecoder = TextDecoder;
    }
  }
};
