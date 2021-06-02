const { get } = require('http');
const nock = require('nock');
const { logIf, parseEnvelope } = require('./common');

const getAsync = url => {
  return new Promise((resolve, reject) => {
    get(url, res => {
      res.setEncoding('utf8');
      let rawData = '';
      res.on('data', chunk => {
        rawData += chunk;
      });
      res.on('end', () => {
        try {
          resolve(rawData);
        } catch (e) {
          reject(e);
        }
      });
    });
  });
};

const interceptEventRequest = (expectedEvent, argv) => {
  return nock('https://dsn.ingest.sentry.io')
    .post('/api/1337/store/', body => {
      logIf(argv.debug, 'Intercepted Event', body, argv.depth);
      return objectMatches(body, expectedEvent);
    })
    .reply(200);
};

const interceptSessionRequest = (expectedItem, argv) => {
  return nock('https://dsn.ingest.sentry.io')
    .post('/api/1337/envelope/', body => {
      const { envelopeHeader, itemHeader, item } = parseEnvelope(body);
      logIf(argv.debug, 'Intercepted Transaction', { envelopeHeader, itemHeader, item }, argv.depth);
      return itemHeader.type === 'session' && objectMatches(item, expectedItem);
    })
    .reply(200);
};

const interceptTracingRequest = (expectedItem, argv) => {
  return nock('https://dsn.ingest.sentry.io')
    .post('/api/1337/envelope/', body => {
      const { envelopeHeader, itemHeader, item } = parseEnvelope(body);
      logIf(argv.debug, 'Intercepted Transaction', { envelopeHeader, itemHeader, item }, argv.depth);
      return itemHeader.type === 'transaction' && objectMatches(item, expectedItem);
    })
    .reply(200);
};

const objectMatches = (actual, expected) => {
  if (Object.prototype.toString.call(actual) !== Object.prototype.toString.call(expected)) {
    return false;
  }

  for (const key in expected) {
    const expectedValue = expected[key];

    if (Object.prototype.toString.call(expectedValue) === '[object Object]' || Array.isArray(expectedValue)) {
      if (!objectMatches(actual[key], expectedValue)) {
        return false;
      }
    } else {
      if (actual[key] !== expectedValue) {
        return false;
      }
    }
  }

  return true;
};

module.exports = {
  getAsync,
  interceptEventRequest,
  interceptSessionRequest,
  interceptTracingRequest,
};
