import { Event } from '../src';
import { parseRequest } from '../src/handlers';

describe('parseRequest', () => {
  const mockReq = {
    body: '',
    cookies: { test: 'test' },
    headers: {
      host: 'mattrobenolt.com',
    },
    method: 'GET',
    url: '/some/path?key=value',
    user: {
      custom_property: 'foo',
      email: 'tobias@mail.com',
      id: 123,
      username: 'tobias',
    },
  };

  describe('parseRequest.user properties', () => {
    const DEFAULT_USER_KEYS = ['id', 'username', 'email'];
    const CUSTOM_USER_KEYS = ['custom_property'];

    test('parseRequest.user only contains the default properties from the user', done => {
      const fakeEvent: Event = {};
      const parsedRequest: Event = parseRequest(fakeEvent, mockReq);
      const userKeys = Object.keys(parsedRequest.user);

      expect(userKeys).toEqual(DEFAULT_USER_KEYS);
      expect(userKeys).not.toEqual(expect.arrayContaining(CUSTOM_USER_KEYS));
      done();
    });

    test('parseRequest.user only contains the custom properties specified in the options.user array', done => {
      const options = {
        user: CUSTOM_USER_KEYS,
      };
      const fakeEvent: Event = {};
      const parsedRequest: Event = parseRequest(fakeEvent, mockReq, options);
      const userKeys = Object.keys(parsedRequest.user);

      expect(userKeys).toEqual(CUSTOM_USER_KEYS);
      expect(userKeys).not.toEqual(expect.arrayContaining(DEFAULT_USER_KEYS));
      done();
    });
  });

  describe('parseRequest.request properties', () => {
    test('parseRequest.request only contains the default set of properties from the request', done => {
      const DEFAULT_REQUEST_PROPERTIES = ['cookies', 'data', 'headers', 'method', 'query_string', 'url'];
      const fakeEvent: Event = {};
      const parsedRequest: Event = parseRequest(fakeEvent, mockReq, {});
      expect(Object.keys(parsedRequest.request)).toEqual(DEFAULT_REQUEST_PROPERTIES);
      done();
    });

    test('parseRequest.request only contains the specified properties in the options.request array', done => {
      const EXCLUDED_PROPERTIES = ['cookies', 'method'];
      const INCLUDED_PROPERTIES = ['data', 'headers', 'query_string', 'url'];
      const options = {
        request: INCLUDED_PROPERTIES,
      };
      const fakeEvent: Event = {};
      const parsedRequest: Event = parseRequest(fakeEvent, mockReq, options);
      const requestKeys = Object.keys(parsedRequest.request);

      expect(requestKeys).toEqual(INCLUDED_PROPERTIES);
      expect(requestKeys).not.toEqual(expect.arrayContaining(EXCLUDED_PROPERTIES));
      done();
    });
  });
});
