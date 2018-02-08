/*jshint mocha:true*/
/*global assert:false, console:true*/
'use strict';

var RavenConfigError = require('../src/configError');

var utils = require('../src/utils');
var isUndefined = utils.isUndefined;
var isFunction = utils.isFunction;
var isPlainObject = utils.isPlainObject;
var isString = utils.isString;
var isArray = utils.isArray;
var isObject = utils.isObject;
var isEmptyObject = utils.isEmptyObject;
var isError = utils.isError;
var isErrorEvent = utils.isErrorEvent;
var supportsErrorEvent = utils.supportsErrorEvent;
var wrappedCallback = utils.wrappedCallback;
var joinRegExp = utils.joinRegExp;
var objectMerge = utils.objectMerge;
var truncate = utils.truncate;
var urlencode = utils.urlencode;
var htmlTreeAsString = utils.htmlTreeAsString;
var htmlElementAsString = utils.htmlElementAsString;
var parseUrl = utils.parseUrl;
var safeJoin = utils.safeJoin;

describe('utils', function() {
  describe('isUndefined', function() {
    it('should do as advertised', function() {
      assert.isTrue(isUndefined());
      assert.isFalse(isUndefined({}));
      assert.isFalse(isUndefined(''));
      assert.isTrue(isUndefined(undefined));
    });
  });

  describe('isFunction', function() {
    it('should do as advertised', function() {
      assert.isTrue(isFunction(function() {}));
      assert.isFalse(isFunction({}));
      assert.isFalse(isFunction(''));
      assert.isFalse(isFunction(undefined));
    });
  });

  describe('isPlainObject', function() {
    it('should do as advertised', function() {
      assert.isTrue(isPlainObject({}));
      assert.isTrue(isPlainObject({foo: 'bar'}));
      assert.isTrue(isPlainObject(new Object()));
      assert.isFalse(isPlainObject([]));
      assert.isFalse(isPlainObject(undefined));
      assert.isFalse(isPlainObject(null));
      assert.isFalse(isPlainObject(1));
      assert.isFalse(isPlainObject(''));
      assert.isFalse(isPlainObject(function() {}));
    });
  });

  describe('isString', function() {
    it('should do as advertised', function() {
      assert.isTrue(isString(''));
      assert.isTrue(isString(String('')));
      assert.isTrue(isString(new String('')));
      assert.isFalse(isString({}));
      assert.isFalse(isString(undefined));
      assert.isFalse(isString(function() {}));
    });
  });

  describe('isArray', function() {
    it('should do as advertised', function() {
      assert.isTrue(isArray([]));
      assert.isTrue(isArray(new Array(42)));
      assert.isFalse(isArray(''));
      assert.isFalse(isArray({}));
      assert.isFalse(isArray(undefined));
      assert.isFalse(isArray(function() {}));
    });
  });

  describe('isObject', function() {
    it('should do as advertised', function() {
      assert.isTrue(isObject({}));
      assert.isTrue(isObject(new Error()));
      assert.isFalse(isObject(''));
    });
  });

  describe('isEmptyObject', function() {
    it('should work as advertised', function() {
      assert.isTrue(isEmptyObject({}));
      assert.isFalse(isEmptyObject({foo: 1}));
      var MyObj = function() {};
      MyObj.prototype.foo = 0;
      assert.isTrue(isEmptyObject(new MyObj()));
      var myExample = new MyObj();
      myExample.bar = 1;
      assert.isFalse(isEmptyObject(myExample));
    });
  });

  if (supportsErrorEvent()) {
    describe('isErrorEvent', function() {
      it('should work as advertised', function() {
        assert.isFalse(isErrorEvent(new Error()));
        assert.isTrue(isErrorEvent(new ErrorEvent('')));
      });
    });
  }

  describe('isError', function() {
    function testErrorFromDifferentContext(createError) {
      var iframe = document.createElement('iframe');
      document.body.appendChild(iframe);
      try {
        return createError(iframe.contentWindow);
      } finally {
        iframe.parentElement.removeChild(iframe);
      }
    }

    function fromContext(win) {
      return new win.Error();
    }

    function domException(win) {
      try {
        win.document.querySelectorAll('');
      } catch (e) {
        return e;
      }
    }

    it('should work as advertised', function() {
      if (supportsErrorEvent()) assert.isFalse(isError(new ErrorEvent('')));
      assert.isTrue(isError(new Error()));
      assert.isTrue(isError(new ReferenceError()));
      assert.isTrue(isError(new RavenConfigError()));
      assert.isTrue(isError(testErrorFromDifferentContext(fromContext)));
      assert.isTrue(isError(testErrorFromDifferentContext(domException)));
      assert.isFalse(isError({}));
      assert.isFalse(
        isError({
          message: 'A fake error',
          stack: 'no stack here'
        })
      );
      assert.isFalse(isError(''));
      assert.isFalse(isError(true));
    });
  });

  describe('objectMerge', function() {
    it('should work as advertised', function() {
      assert.deepEqual(objectMerge({}, {}), {});
      assert.deepEqual(objectMerge({a: 1}, {b: 2}), {a: 1, b: 2});
      assert.deepEqual(objectMerge({a: 1}), {a: 1});
    });
  });

  describe('truncate', function() {
    it('should work as advertised', function() {
      assert.equal(truncate('lolol', 3), 'lol\u2026');
      assert.equal(truncate('lolol', 10), 'lolol');
      assert.equal(truncate('lol', 3), 'lol');
      assert.equal(truncate(new Array(1000).join('f'), 0), new Array(1000).join('f'));
    });
  });

  describe('joinRegExp', function() {
    it('should work as advertised', function() {
      assert.equal(
        joinRegExp(['a', 'b', 'a.b', /d/, /[0-9]/]).source,
        'a|b|a\\.b|d|[0-9]'
      );
    });

    it('should not process empty or undefined variables', function() {
      assert.equal(joinRegExp(['a', 'b', null, undefined]).source, 'a|b');
    });

    it('should skip entries that are not strings or regular expressions in the passed array of patterns', function() {
      assert.equal(
        joinRegExp(['a', 'b', null, 'a.b', undefined, true, /d/, 123, {}, /[0-9]/, []])
          .source,
        'a|b|a\\.b|d|[0-9]'
      );
    });
  });

  describe('urlencode', function() {
    it('should work', function() {
      assert.equal(urlencode({}), '');
      assert.equal(urlencode({foo: 'bar', baz: '1 2'}), 'foo=bar&baz=1%202');
    });
  });

  describe('htmlTreeAsString', function() {
    it('should work', function() {
      var tree = {
        tagName: 'INPUT',
        id: 'the-username',
        className: 'form-control',
        getAttribute: function(key) {
          return {
            name: 'username'
          }[key];
        },
        parentNode: {
          tagName: 'span',
          getAttribute: function() {},
          parentNode: {
            tagName: 'div',
            getAttribute: function() {}
          }
        }
      };

      assert.equal(
        htmlTreeAsString(tree),
        'div > span > input#the-username.form-control[name="username"]'
      );
    });

    it('should not create strings that are too big', function() {
      var tree = {
        tagName: 'INPUT',
        id: 'the-username',
        className: 'form-control',
        getAttribute: function(key) {
          return {
            name: 'username'
          }[key];
        },
        parentNode: {
          tagName: 'span',
          getAttribute: function() {},
          parentNode: {
            tagName: 'div',
            getAttribute: function(key) {
              return {
                name:
                  'super long input name that nobody would really ever have i mean come on look at this'
              }[key];
            }
          }
        }
      };

      // NOTE: <div/> omitted because crazy long name
      assert.equal(
        htmlTreeAsString(tree),
        'span > input#the-username.form-control[name="username"]'
      );
    });
  });

  describe('htmlElementAsString', function() {
    it('should work', function() {
      assert.equal(
        htmlElementAsString({
          tagName: 'INPUT',
          id: 'the-username',
          className: 'form-control',
          getAttribute: function(key) {
            return {
              name: 'username',
              placeholder: 'Enter your username'
            }[key];
          }
        }),
        'input#the-username.form-control[name="username"]'
      );

      assert.equal(
        htmlElementAsString({
          tagName: 'IMG',
          id: 'image-3',
          getAttribute: function(key) {
            return {
              title: 'A picture of an apple',
              'data-something': 'This should be ignored' // skipping data-* attributes in first implementation
            }[key];
          }
        }),
        'img#image-3[title="A picture of an apple"]'
      );
    });

    it('should return an empty string if the input element is falsy', function() {
      assert.equal(htmlElementAsString(null), '');
      assert.equal(htmlElementAsString(0), '');
      assert.equal(htmlElementAsString(undefined), '');
    });

    it('should return an empty string if the input element has no tagName property', function() {
      assert.equal(
        htmlElementAsString({
          id: 'the-username',
          className: 'form-control'
        }),
        ''
      );
    });

    it('should gracefully handle when className is not a string (e.g. SVGAnimatedString', function() {
      assert.equal(
        htmlElementAsString({
          tagName: 'INPUT',
          id: 'the-username',
          className: {}, // not a string
          getAttribute: function(key) {
            return {
              name: 'username'
            }[key];
          }
        }),
        'input#the-username[name="username"]'
      );
    });
  });

  describe('parseUrl', function() {
    it('should parse fully qualified URLs', function() {
      assert.deepEqual(parseUrl('http://example.com/foo'), {
        protocol: 'http',
        host: 'example.com',
        path: '/foo',
        relative: '/foo'
      });
      assert.deepEqual(parseUrl('//example.com/foo?query'), {
        protocol: undefined,
        host: 'example.com',
        path: '/foo',
        relative: '/foo?query'
      });
    });

    it('should parse partial URLs, e.g. path only', function() {
      assert.deepEqual(parseUrl('/foo'), {
        protocol: undefined,
        host: undefined,
        path: '/foo',
        relative: '/foo'
      });
      assert.deepEqual(parseUrl('example.com/foo#derp'), {
        protocol: undefined,
        host: undefined,
        path: 'example.com/foo',
        relative: 'example.com/foo#derp'
        // this is correct! pushState({}, '', 'example.com/foo') would take you
        // from example.com => example.com/example.com/foo (valid url).
      });
    });

    it('should return an empty object for invalid input', function() {
      assert.deepEqual(parseUrl(), {});
      assert.deepEqual(parseUrl(42), {});
      assert.deepEqual(parseUrl([]), {});
      assert.deepEqual(parseUrl({}), {});
      assert.deepEqual(parseUrl(null), {});
      assert.deepEqual(parseUrl(undefined), {});
    });
  });

  describe('wrappedCallback', function() {
    it('should return data from callback', function() {
      var expected = 'yup';
      var cb = wrappedCallback(function() {
        return expected;
      });
      assert.equal(cb(), expected);
    });

    it('should return mutated data from callback', function() {
      var cb = wrappedCallback(function(data) {
        data.mutated = true;
      });
      assert.deepEqual(cb({}), {mutated: true});
    });

    it('should return data from original', function() {
      var expected = 'yup';
      var cb = wrappedCallback(function(data) {
        return 'nope';
      });

      function original() {
        return expected;
      }
      assert.equal(cb({}, original), expected);
    });

    it('should return mutated data from original', function() {
      var cb = wrappedCallback(function(data) {
        data.mutatedSomeMore = true;
      });

      function original(data) {
        data.mutated = true;
      }
      assert.deepEqual(cb({}, original), {
        mutated: true,
        mutatedSomeMore: true
      });
    });

    it('should call callback and original in the right order', function() {
      var cb = wrappedCallback(function(data) {
        return data + 'callback first, ';
      });

      function original(data) {
        return data + 'then the original.';
      }

      assert.equal(
        cb('it will run the ', original),
        'it will run the callback first, then the original.'
      );
    });
  });

  describe('safeJoin', function() {
    it('should return empty string if not-array input provided', function() {
      assert.equal(safeJoin('asd'), '');
      assert.equal(safeJoin(undefined), '');
      assert.equal(safeJoin({foo: 123}), '');
    });

    it('should default to comma, as regular join() call', function() {
      assert.equal(safeJoin(['a', 'b', 'c']), 'a,b,c');
    });

    it('should stringify complex values, as regular String() call', function() {
      assert.equal(
        safeJoin([1, 'a', {foo: 42}, [1, 2, 3]], ' '),
        '1 a [object Object] 1,2,3'
      );
    });

    it('should still work with unserializeable values', function() {
      function Foo() {}
      Foo.prototype.toString = function() {
        throw Error('whoops!');
      };

      assert.equal(
        safeJoin([new Foo(), 'abc', new Foo(), 42], ' X '),
        '[value cannot be serialized] X abc X [value cannot be serialized] X 42'
      );
    });
  });
});
