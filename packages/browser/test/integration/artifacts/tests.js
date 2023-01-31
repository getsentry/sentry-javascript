/* !
 * @overview es6-promise - an implementation of Promise API.
 * @copyright Copyright (c) 2014 Yehuda Katz, Tom Dale, Stefan Penner and contributors (Conversion to ES6 API by Jake Archibald)
 * @license   Licensed under MIT license
 *            See https://raw.githubusercontent.com/stefanpenner/es6-promise/master/LICENSE
 * @version   v4.2.8+1e68dce6
 */

(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined'
    ? (module.exports = factory())
    : typeof define === 'function' && define.amd
    ? define(factory)
    : (global.ES6Promise = factory());
})(this, function () {
  'use strict';

  function objectOrFunction(x) {
    var type = typeof x;
    return x !== null && (type === 'object' || type === 'function');
  }

  function isFunction(x) {
    return typeof x === 'function';
  }

  var _isArray = void 0;
  if (Array.isArray) {
    _isArray = Array.isArray;
  } else {
    _isArray = function (x) {
      return Object.prototype.toString.call(x) === '[object Array]';
    };
  }

  var isArray = _isArray;

  var len = 0;
  var vertxNext = void 0;
  var customSchedulerFn = void 0;

  var asap = function asap(callback, arg) {
    queue[len] = callback;
    queue[len + 1] = arg;
    len += 2;
    if (len === 2) {
      // If len is 2, that means that we need to schedule an async flush.
      // If additional callbacks are queued before the queue is flushed, they
      // will be processed by this flush that we are scheduling.
      if (customSchedulerFn) {
        customSchedulerFn(flush);
      } else {
        scheduleFlush();
      }
    }
  };

  function setScheduler(scheduleFn) {
    customSchedulerFn = scheduleFn;
  }

  function setAsap(asapFn) {
    asap = asapFn;
  }

  var browserWindow = typeof window !== 'undefined' ? window : undefined;
  var browserGlobal = browserWindow || {};
  var BrowserMutationObserver = browserGlobal.MutationObserver || browserGlobal.WebKitMutationObserver;
  var isNode =
    typeof self === 'undefined' && typeof process !== 'undefined' && {}.toString.call(process) === '[object process]';

  // test for web worker but not in IE10
  var isWorker =
    typeof Uint8ClampedArray !== 'undefined' &&
    typeof importScripts !== 'undefined' &&
    typeof MessageChannel !== 'undefined';

  // node
  function useNextTick() {
    // node version 0.10.x displays a deprecation warning when nextTick is used recursively
    // see https://github.com/cujojs/when/issues/410 for details
    return function () {
      return process.nextTick(flush);
    };
  }

  // vertx
  function useVertxTimer() {
    if (typeof vertxNext !== 'undefined') {
      return function () {
        vertxNext(flush);
      };
    }

    return useSetTimeout();
  }

  function useMutationObserver() {
    var iterations = 0;
    var observer = new BrowserMutationObserver(flush);
    var node = document.createTextNode('');
    observer.observe(node, { characterData: true });

    return function () {
      node.data = iterations = ++iterations % 2;
    };
  }

  // web worker
  function useMessageChannel() {
    var channel = new MessageChannel();
    channel.port1.onmessage = flush;
    return function () {
      return channel.port2.postMessage(0);
    };
  }

  function useSetTimeout() {
    // Store setTimeout reference so es6-promise will be unaffected by
    // other code modifying setTimeout (like sinon.useFakeTimers())
    var globalSetTimeout = setTimeout;
    return function () {
      return globalSetTimeout(flush, 1);
    };
  }

  var queue = new Array(1000);
  function flush() {
    for (var i = 0; i < len; i += 2) {
      var callback = queue[i];
      var arg = queue[i + 1];

      callback(arg);

      queue[i] = undefined;
      queue[i + 1] = undefined;
    }

    len = 0;
  }

  function attemptVertx() {
    try {
      var vertx = Function('return this')().require('vertx');
      vertxNext = vertx.runOnLoop || vertx.runOnContext;
      return useVertxTimer();
    } catch (e) {
      return useSetTimeout();
    }
  }

  var scheduleFlush = void 0;
  // Decide what async method to use to triggering processing of queued callbacks:
  if (isNode) {
    scheduleFlush = useNextTick();
  } else if (BrowserMutationObserver) {
    scheduleFlush = useMutationObserver();
  } else if (isWorker) {
    scheduleFlush = useMessageChannel();
  } else if (browserWindow === undefined && typeof require === 'function') {
    scheduleFlush = attemptVertx();
  } else {
    scheduleFlush = useSetTimeout();
  }

  function then(onFulfillment, onRejection) {
    var parent = this;

    var child = new this.constructor(noop);

    if (child[PROMISE_ID] === undefined) {
      makePromise(child);
    }

    var _state = parent._state;

    if (_state) {
      var callback = arguments[_state - 1];
      asap(function () {
        return invokeCallback(_state, child, callback, parent._result);
      });
    } else {
      subscribe(parent, child, onFulfillment, onRejection);
    }

    return child;
  }

  /**
  `Promise.resolve` returns a promise that will become resolved with the
  passed `value`. It is shorthand for the following:

  ```javascript
  let promise = new Promise(function(resolve, reject){
    resolve(1);
  });

  promise.then(function(value){
    // value === 1
  });
  ```

  Instead of writing the above, your code now simply becomes the following:

  ```javascript
  let promise = Promise.resolve(1);

  promise.then(function(value){
    // value === 1
  });
  ```

  @method resolve
  @static
  @param {Any} value value that the returned promise will be resolved with
  Useful for tooling.
  @return {Promise} a promise that will become fulfilled with the given
  `value`
*/
  function resolve$1(object) {
    /* jshint validthis:true */
    var Constructor = this;

    if (object && typeof object === 'object' && object.constructor === Constructor) {
      return object;
    }

    var promise = new Constructor(noop);
    resolve(promise, object);
    return promise;
  }

  var PROMISE_ID = Math.random().toString(36).substring(2);

  function noop() {}

  var PENDING = void 0;
  var FULFILLED = 1;
  var REJECTED = 2;

  function selfFulfillment() {
    return new TypeError('You cannot resolve a promise with itself');
  }

  function cannotReturnOwn() {
    return new TypeError('A promises callback cannot return that same promise.');
  }

  function tryThen(then$$1, value, fulfillmentHandler, rejectionHandler) {
    try {
      then$$1.call(value, fulfillmentHandler, rejectionHandler);
    } catch (e) {
      return e;
    }
  }

  function handleForeignThenable(promise, thenable, then$$1) {
    asap(function (promise) {
      var sealed = false;
      var error = tryThen(
        then$$1,
        thenable,
        function (value) {
          if (sealed) {
            return;
          }
          sealed = true;
          if (thenable !== value) {
            resolve(promise, value);
          } else {
            fulfill(promise, value);
          }
        },
        function (reason) {
          if (sealed) {
            return;
          }
          sealed = true;

          reject(promise, reason);
        },
        'Settle: ' + (promise._label || ' unknown promise')
      );

      if (!sealed && error) {
        sealed = true;
        reject(promise, error);
      }
    }, promise);
  }

  function handleOwnThenable(promise, thenable) {
    if (thenable._state === FULFILLED) {
      fulfill(promise, thenable._result);
    } else if (thenable._state === REJECTED) {
      reject(promise, thenable._result);
    } else {
      subscribe(
        thenable,
        undefined,
        function (value) {
          return resolve(promise, value);
        },
        function (reason) {
          return reject(promise, reason);
        }
      );
    }
  }

  function handleMaybeThenable(promise, maybeThenable, then$$1) {
    if (
      maybeThenable.constructor === promise.constructor &&
      then$$1 === then &&
      maybeThenable.constructor.resolve === resolve$1
    ) {
      handleOwnThenable(promise, maybeThenable);
    } else {
      if (then$$1 === undefined) {
        fulfill(promise, maybeThenable);
      } else if (isFunction(then$$1)) {
        handleForeignThenable(promise, maybeThenable, then$$1);
      } else {
        fulfill(promise, maybeThenable);
      }
    }
  }

  function resolve(promise, value) {
    if (promise === value) {
      reject(promise, selfFulfillment());
    } else if (objectOrFunction(value)) {
      var then$$1 = void 0;
      try {
        then$$1 = value.then;
      } catch (error) {
        reject(promise, error);
        return;
      }
      handleMaybeThenable(promise, value, then$$1);
    } else {
      fulfill(promise, value);
    }
  }

  function publishRejection(promise) {
    if (promise._onerror) {
      promise._onerror(promise._result);
    }

    publish(promise);
  }

  function fulfill(promise, value) {
    if (promise._state !== PENDING) {
      return;
    }

    promise._result = value;
    promise._state = FULFILLED;

    if (promise._subscribers.length !== 0) {
      asap(publish, promise);
    }
  }

  function reject(promise, reason) {
    if (promise._state !== PENDING) {
      return;
    }
    promise._state = REJECTED;
    promise._result = reason;

    asap(publishRejection, promise);
  }

  function subscribe(parent, child, onFulfillment, onRejection) {
    var _subscribers = parent._subscribers;
    var length = _subscribers.length;

    parent._onerror = null;

    _subscribers[length] = child;
    _subscribers[length + FULFILLED] = onFulfillment;
    _subscribers[length + REJECTED] = onRejection;

    if (length === 0 && parent._state) {
      asap(publish, parent);
    }
  }

  function publish(promise) {
    var subscribers = promise._subscribers;
    var settled = promise._state;

    if (subscribers.length === 0) {
      return;
    }

    var child = void 0,
      callback = void 0,
      detail = promise._result;

    for (var i = 0; i < subscribers.length; i += 3) {
      child = subscribers[i];
      callback = subscribers[i + settled];

      if (child) {
        invokeCallback(settled, child, callback, detail);
      } else {
        callback(detail);
      }
    }

    promise._subscribers.length = 0;
  }

  function invokeCallback(settled, promise, callback, detail) {
    var hasCallback = isFunction(callback),
      value = void 0,
      error = void 0,
      succeeded = true;

    if (hasCallback) {
      try {
        value = callback(detail);
      } catch (e) {
        succeeded = false;
        error = e;
      }

      if (promise === value) {
        reject(promise, cannotReturnOwn());
        return;
      }
    } else {
      value = detail;
    }

    if (promise._state !== PENDING) {
      // noop
    } else if (hasCallback && succeeded) {
      resolve(promise, value);
    } else if (succeeded === false) {
      reject(promise, error);
    } else if (settled === FULFILLED) {
      fulfill(promise, value);
    } else if (settled === REJECTED) {
      reject(promise, value);
    }
  }

  function initializePromise(promise, resolver) {
    try {
      resolver(
        function resolvePromise(value) {
          resolve(promise, value);
        },
        function rejectPromise(reason) {
          reject(promise, reason);
        }
      );
    } catch (e) {
      reject(promise, e);
    }
  }

  var id = 0;
  function nextId() {
    return ++id;
  }

  function makePromise(promise) {
    promise[PROMISE_ID] = ++id;
    promise._state = undefined;
    promise._result = undefined;
    promise._subscribers = [];
  }

  function validationError() {
    return new Error('Array Methods must be provided an Array');
  }

  var Enumerator = (function () {
    function Enumerator(Constructor, input) {
      this._instanceConstructor = Constructor;
      this.promise = new Constructor(noop);

      if (!this.promise[PROMISE_ID]) {
        makePromise(this.promise);
      }

      if (isArray(input)) {
        this.length = input.length;
        this._remaining = input.length;

        this._result = new Array(this.length);

        if (this.length === 0) {
          fulfill(this.promise, this._result);
        } else {
          this.length = this.length || 0;
          this._enumerate(input);
          if (this._remaining === 0) {
            fulfill(this.promise, this._result);
          }
        }
      } else {
        reject(this.promise, validationError());
      }
    }

    Enumerator.prototype._enumerate = function _enumerate(input) {
      for (var i = 0; this._state === PENDING && i < input.length; i++) {
        this._eachEntry(input[i], i);
      }
    };

    Enumerator.prototype._eachEntry = function _eachEntry(entry, i) {
      var c = this._instanceConstructor;
      var resolve$$1 = c.resolve;

      if (resolve$$1 === resolve$1) {
        var _then = void 0;
        var error = void 0;
        var didError = false;
        try {
          _then = entry.then;
        } catch (e) {
          didError = true;
          error = e;
        }

        if (_then === then && entry._state !== PENDING) {
          this._settledAt(entry._state, i, entry._result);
        } else if (typeof _then !== 'function') {
          this._remaining--;
          this._result[i] = entry;
        } else if (c === Promise$2) {
          var promise = new c(noop);
          if (didError) {
            reject(promise, error);
          } else {
            handleMaybeThenable(promise, entry, _then);
          }
          this._willSettleAt(promise, i);
        } else {
          this._willSettleAt(
            new c(function (resolve$$1) {
              return resolve$$1(entry);
            }),
            i
          );
        }
      } else {
        this._willSettleAt(resolve$$1(entry), i);
      }
    };

    Enumerator.prototype._settledAt = function _settledAt(state, i, value) {
      var promise = this.promise;

      if (promise._state === PENDING) {
        this._remaining--;

        if (state === REJECTED) {
          reject(promise, value);
        } else {
          this._result[i] = value;
        }
      }

      if (this._remaining === 0) {
        fulfill(promise, this._result);
      }
    };

    Enumerator.prototype._willSettleAt = function _willSettleAt(promise, i) {
      var enumerator = this;

      subscribe(
        promise,
        undefined,
        function (value) {
          return enumerator._settledAt(FULFILLED, i, value);
        },
        function (reason) {
          return enumerator._settledAt(REJECTED, i, reason);
        }
      );
    };

    return Enumerator;
  })();

  /**
  `Promise.all` accepts an array of promises, and returns a new promise which
  is fulfilled with an array of fulfillment values for the passed promises, or
  rejected with the reason of the first passed promise to be rejected. It casts all
  elements of the passed iterable to promises as it runs this algorithm.

  Example:

  ```javascript
  let promise1 = resolve(1);
  let promise2 = resolve(2);
  let promise3 = resolve(3);
  let promises = [ promise1, promise2, promise3 ];

  Promise.all(promises).then(function(array){
    // The array here would be [ 1, 2, 3 ];
  });
  ```

  If any of the `promises` given to `all` are rejected, the first promise
  that is rejected will be given as an argument to the returned promises's
  rejection handler. For example:

  Example:

  ```javascript
  let promise1 = resolve(1);
  let promise2 = reject(new Error("2"));
  let promise3 = reject(new Error("3"));
  let promises = [ promise1, promise2, promise3 ];

  Promise.all(promises).then(function(array){
    // Code here never runs because there are rejected promises!
  }, function(error) {
    // error.message === "2"
  });
  ```

  @method all
  @static
  @param {Array} entries array of promises
  @param {String} label optional string for labeling the promise.
  Useful for tooling.
  @return {Promise} promise that is fulfilled when all `promises` have been
  fulfilled, or rejected if any of them become rejected.
  @static
*/
  function all(entries) {
    return new Enumerator(this, entries).promise;
  }

  /**
  `Promise.race` returns a new promise which is settled in the same way as the
  first passed promise to settle.

  Example:

  ```javascript
  let promise1 = new Promise(function(resolve, reject){
    setTimeout(function(){
      resolve('promise 1');
    }, 200);
  });

  let promise2 = new Promise(function(resolve, reject){
    setTimeout(function(){
      resolve('promise 2');
    }, 100);
  });

  Promise.race([promise1, promise2]).then(function(result){
    // result === 'promise 2' because it was resolved before promise1
    // was resolved.
  });
  ```

  `Promise.race` is deterministic in that only the state of the first
  settled promise matters. For example, even if other promises given to the
  `promises` array argument are resolved, but the first settled promise has
  become rejected before the other promises became fulfilled, the returned
  promise will become rejected:

  ```javascript
  let promise1 = new Promise(function(resolve, reject){
    setTimeout(function(){
      resolve('promise 1');
    }, 200);
  });

  let promise2 = new Promise(function(resolve, reject){
    setTimeout(function(){
      reject(new Error('promise 2'));
    }, 100);
  });

  Promise.race([promise1, promise2]).then(function(result){
    // Code here never runs
  }, function(reason){
    // reason.message === 'promise 2' because promise 2 became rejected before
    // promise 1 became fulfilled
  });
  ```

  An example real-world use case is implementing timeouts:

  ```javascript
  Promise.race([ajax('foo.json'), timeout(5000)])
  ```

  @method race
  @static
  @param {Array} promises array of promises to observe
  Useful for tooling.
  @return {Promise} a promise which settles in the same way as the first passed
  promise to settle.
*/
  function race(entries) {
    /* jshint validthis:true */
    var Constructor = this;

    if (!isArray(entries)) {
      return new Constructor(function (_, reject) {
        return reject(new TypeError('You must pass an array to race.'));
      });
    } else {
      return new Constructor(function (resolve, reject) {
        var length = entries.length;
        for (var i = 0; i < length; i++) {
          Constructor.resolve(entries[i]).then(resolve, reject);
        }
      });
    }
  }

  /**
  `Promise.reject` returns a promise rejected with the passed `reason`.
  It is shorthand for the following:

  ```javascript
  let promise = new Promise(function(resolve, reject){
    reject(new Error('WHOOPS'));
  });

  promise.then(function(value){
    // Code here doesn't run because the promise is rejected!
  }, function(reason){
    // reason.message === 'WHOOPS'
  });
  ```

  Instead of writing the above, your code now simply becomes the following:

  ```javascript
  let promise = Promise.reject(new Error('WHOOPS'));

  promise.then(function(value){
    // Code here doesn't run because the promise is rejected!
  }, function(reason){
    // reason.message === 'WHOOPS'
  });
  ```

  @method reject
  @static
  @param {Any} reason value that the returned promise will be rejected with.
  Useful for tooling.
  @return {Promise} a promise rejected with the given `reason`.
*/
  function reject$1(reason) {
    /* jshint validthis:true */
    var Constructor = this;
    var promise = new Constructor(noop);
    reject(promise, reason);
    return promise;
  }

  function needsResolver() {
    throw new TypeError('You must pass a resolver function as the first argument to the promise constructor');
  }

  function needsNew() {
    throw new TypeError(
      "Failed to construct 'Promise': Please use the 'new' operator, this object constructor cannot be called as a function."
    );
  }

  /**
  Promise objects represent the eventual result of an asynchronous operation. The
  primary way of interacting with a promise is through its `then` method, which
  registers callbacks to receive either a promise's eventual value or the reason
  why the promise cannot be fulfilled.

  Terminology
  -----------

  - `promise` is an object or function with a `then` method whose behavior conforms to this specification.
  - `thenable` is an object or function that defines a `then` method.
  - `value` is any legal JavaScript value (including undefined, a thenable, or a promise).
  - `exception` is a value that is thrown using the throw statement.
  - `reason` is a value that indicates why a promise was rejected.
  - `settled` the final resting state of a promise, fulfilled or rejected.

  A promise can be in one of three states: pending, fulfilled, or rejected.

  Promises that are fulfilled have a fulfillment value and are in the fulfilled
  state.  Promises that are rejected have a rejection reason and are in the
  rejected state.  A fulfillment value is never a thenable.

  Promises can also be said to *resolve* a value.  If this value is also a
  promise, then the original promise's settled state will match the value's
  settled state.  So a promise that *resolves* a promise that rejects will
  itself reject, and a promise that *resolves* a promise that fulfills will
  itself fulfill.


  Basic Usage:
  ------------

  ```js
  let promise = new Promise(function(resolve, reject) {
    // on success
    resolve(value);

    // on failure
    reject(reason);
  });

  promise.then(function(value) {
    // on fulfillment
  }, function(reason) {
    // on rejection
  });
  ```

  Advanced Usage:
  ---------------

  Promises shine when abstracting away asynchronous interactions such as
  `XMLHttpRequest`s.

  ```js
  function getJSON(url) {
    return new Promise(function(resolve, reject){
      let xhr = new XMLHttpRequest();

      xhr.open('GET', url);
      xhr.onreadystatechange = handler;
      xhr.responseType = 'json';
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.send();

      function handler() {
        if (this.readyState === this.DONE) {
          if (this.status === 200) {
            resolve(this.response);
          } else {
            reject(new Error('getJSON: `' + url + '` failed with status: [' + this.status + ']'));
          }
        }
      };
    });
  }

  getJSON('/posts.json').then(function(json) {
    // on fulfillment
  }, function(reason) {
    // on rejection
  });
  ```

  Unlike callbacks, promises are great composable primitives.

  ```js
  Promise.all([
    getJSON('/posts'),
    getJSON('/comments')
  ]).then(function(values){
    values[0] // => postsJSON
    values[1] // => commentsJSON

    return values;
  });
  ```

  @class Promise
  @param {Function} resolver
  Useful for tooling.
  @constructor
*/

  var Promise$2 = (function () {
    function Promise(resolver) {
      this[PROMISE_ID] = nextId();
      this._result = this._state = undefined;
      this._subscribers = [];

      if (noop !== resolver) {
        typeof resolver !== 'function' && needsResolver();
        this instanceof Promise ? initializePromise(this, resolver) : needsNew();
      }
    }

    /**
  The primary way of interacting with a promise is through its `then` method,
  which registers callbacks to receive either a promise's eventual value or the
  reason why the promise cannot be fulfilled.
   ```js
  findUser().then(function(user){
    // user is available
  }, function(reason){
    // user is unavailable, and you are given the reason why
  });
  ```
   Chaining
  --------
   The return value of `then` is itself a promise.  This second, 'downstream'
  promise is resolved with the return value of the first promise's fulfillment
  or rejection handler, or rejected if the handler throws an exception.
   ```js
  findUser().then(function (user) {
    return user.name;
  }, function (reason) {
    return 'default name';
  }).then(function (userName) {
    // If `findUser` fulfilled, `userName` will be the user's name, otherwise it
    // will be `'default name'`
  });
   findUser().then(function (user) {
    throw new Error('Found user, but still unhappy');
  }, function (reason) {
    throw new Error('`findUser` rejected and we're unhappy');
  }).then(function (value) {
    // never reached
  }, function (reason) {
    // if `findUser` fulfilled, `reason` will be 'Found user, but still unhappy'.
    // If `findUser` rejected, `reason` will be '`findUser` rejected and we're unhappy'.
  });
  ```
  If the downstream promise does not specify a rejection handler, rejection reasons will be propagated further downstream.
   ```js
  findUser().then(function (user) {
    throw new PedagogicalException('Upstream error');
  }).then(function (value) {
    // never reached
  }).then(function (value) {
    // never reached
  }, function (reason) {
    // The `PedgagocialException` is propagated all the way down to here
  });
  ```
   Assimilation
  ------------
   Sometimes the value you want to propagate to a downstream promise can only be
  retrieved asynchronously. This can be achieved by returning a promise in the
  fulfillment or rejection handler. The downstream promise will then be pending
  until the returned promise is settled. This is called *assimilation*.
   ```js
  findUser().then(function (user) {
    return findCommentsByAuthor(user);
  }).then(function (comments) {
    // The user's comments are now available
  });
  ```
   If the assimliated promise rejects, then the downstream promise will also reject.
   ```js
  findUser().then(function (user) {
    return findCommentsByAuthor(user);
  }).then(function (comments) {
    // If `findCommentsByAuthor` fulfills, we'll have the value here
  }, function (reason) {
    // If `findCommentsByAuthor` rejects, we'll have the reason here
  });
  ```
   Simple Example
  --------------
   Synchronous Example
   ```javascript
  let result;
   try {
    result = findResult();
    // success
  } catch(reason) {
    // failure
  }
  ```
   Errback Example
   ```js
  findResult(function(result, err){
    if (err) {
      // failure
    } else {
      // success
    }
  });
  ```
   Promise Example;
   ```javascript
  findResult().then(function(result){
    // success
  }, function(reason){
    // failure
  });
  ```
   Advanced Example
  --------------
   Synchronous Example
   ```javascript
  let author, books;
   try {
    author = findAuthor();
    books  = findBooksByAuthor(author);
    // success
  } catch(reason) {
    // failure
  }
  ```
   Errback Example
   ```js
   function foundBooks(books) {
   }
   function failure(reason) {
   }
   findAuthor(function(author, err){
    if (err) {
      failure(err);
      // failure
    } else {
      try {
        findBoooksByAuthor(author, function(books, err) {
          if (err) {
            failure(err);
          } else {
            try {
              foundBooks(books);
            } catch(reason) {
              failure(reason);
            }
          }
        });
      } catch(error) {
        failure(err);
      }
      // success
    }
  });
  ```
   Promise Example;
   ```javascript
  findAuthor().
    then(findBooksByAuthor).
    then(function(books){
      // found books
  }).catch(function(reason){
    // something went wrong
  });
  ```
   @method then
  @param {Function} onFulfilled
  @param {Function} onRejected
  Useful for tooling.
  @return {Promise}
  */

    /**
  `catch` is simply sugar for `then(undefined, onRejection)` which makes it the same
  as the catch block of a try/catch statement.
  ```js
  function findAuthor(){
  throw new Error('couldn't find that author');
  }
  // synchronous
  try {
  findAuthor();
  } catch(reason) {
  // something went wrong
  }
  // async with promises
  findAuthor().catch(function(reason){
  // something went wrong
  });
  ```
  @method catch
  @param {Function} onRejection
  Useful for tooling.
  @return {Promise}
  */

    Promise.prototype.catch = function _catch(onRejection) {
      return this.then(null, onRejection);
    };

    /**
    `finally` will be invoked regardless of the promise's fate just as native
    try/catch/finally behaves

    Synchronous example:

    ```js
    findAuthor() {
      if (Math.random() > 0.5) {
        throw new Error();
      }
      return new Author();
    }

    try {
      return findAuthor(); // succeed or fail
    } catch(error) {
      return findOtherAuther();
    } finally {
      // always runs
      // doesn't affect the return value
    }
    ```

    Asynchronous example:

    ```js
    findAuthor().catch(function(reason){
      return findOtherAuther();
    }).finally(function(){
      // author was either found, or not
    });
    ```

    @method finally
    @param {Function} callback
    @return {Promise}
  */

    Promise.prototype.finally = function _finally(callback) {
      var promise = this;
      var constructor = promise.constructor;

      if (isFunction(callback)) {
        return promise.then(
          function (value) {
            return constructor.resolve(callback()).then(function () {
              return value;
            });
          },
          function (reason) {
            return constructor.resolve(callback()).then(function () {
              throw reason;
            });
          }
        );
      }

      return promise.then(callback, callback);
    };

    return Promise;
  })();

  Promise$2.prototype.then = then;
  Promise$2.all = all;
  Promise$2.race = race;
  Promise$2.resolve = resolve$1;
  Promise$2.reject = reject$1;
  Promise$2._setScheduler = setScheduler;
  Promise$2._setAsap = setAsap;
  Promise$2._asap = asap;

  function polyfill() {
    var local = void 0;

    if (typeof global !== 'undefined') {
      local = global;
    } else if (typeof self !== 'undefined') {
      local = self;
    } else {
      try {
        local = Function('return this')();
      } catch (e) {
        throw new Error('polyfill failed because global object is unavailable in this environment');
      }
    }

    var P = local.Promise;

    if (P) {
      var promiseToString = null;
      try {
        promiseToString = Object.prototype.toString.call(P.resolve());
      } catch (e) {
        // silently ignored
      }

      if (promiseToString === '[object Promise]' && !P.cast) {
        return;
      }
    }

    local.Promise = Promise$2;
  }

  // Strange compat..
  Promise$2.polyfill = polyfill;
  Promise$2.Promise = Promise$2;

  Promise$2.polyfill();

  return Promise$2;
});

function evaluateInSandbox(sandbox, code) {
  // use setTimeout so stack trace doesn't go all the way back to mocha test runner
  sandbox &&
    sandbox.contentWindow &&
    sandbox.contentWindow.eval('window.originalBuiltIns.setTimeout.call(window, ' + code.toString() + ');');
}

function runInSandbox(sandbox, options, code) {
  if (typeof options === 'function') {
    // eslint-disable-next-line no-param-reassign
    code = options;
    // eslint-disable-next-line no-param-reassign
    options = {};
  }

  var resolveTest;
  var donePromise = new Promise(function (resolve) {
    resolveTest = resolve;
  });
  sandbox.contentWindow.resolveTest = function (summary) {
    clearTimeout(lastResort);
    resolveTest(summary);
  };

  // If by some unexplainable way we reach the timeout limit, try to finalize the test and pray for the best
  // NOTE: 5000 so it's easier to grep for all timeout instances (shell.js, loader-specific.js and here)
  var lastResort = setTimeout(function () {
    var force = function () {
      window.resolveTest({
        events: events,
        breadcrumbs: breadcrumbs,
        window: window,
      });
    };
    if (sandbox) {
      evaluateInSandbox(sandbox, force.toString());
    }
  }, 5000 - 500);

  var finalize = function () {
    var summary = {
      events: events,
      eventHints: eventHints,
      breadcrumbs: breadcrumbs,
      breadcrumbHints: breadcrumbHints,
      window: window,
    };

    Sentry.onLoad(function () {
      setTimeout(function () {
        Sentry.flush()
          .then(function () {
            window.resolveTest(summary);
          })
          .catch(function () {
            window.resolveTest(summary);
          });
      });
    });
  };

  sandbox.contentWindow.finalizeManualTest = function () {
    evaluateInSandbox(sandbox, finalize.toString());
  };

  evaluateInSandbox(sandbox, code.toString());

  if (!options.manual) {
    evaluateInSandbox(sandbox, finalize.toString());
  }

  return donePromise;
}

function createSandbox(done, file) {
  var sandbox = document.createElement('iframe');
  sandbox.style.display = 'none';
  sandbox.src = '/base/variants/' + file + '.html';
  sandbox.onload = function () {
    done();
  };
  document.body.appendChild(sandbox);
  return sandbox;
}

function optional(title, condition) {
  return condition ? '⚠ SKIPPED: ' + title : title;
}

var variants = ['frame', 'loader', 'loader-lazy-no'];

function runVariant(variant) {
  var IS_LOADER = !!variant.match(/^loader/);
  var IS_ASYNC_LOADER = !!variant.match(/^loader$/);
  var IS_SYNC_LOADER = !!variant.match(/^loader-lazy-no$/);

  describe(variant, function () {
    this.timeout(60000);
    this.retries(3);

    var sandbox;

    beforeEach(function (done) {
      sandbox = createSandbox(done, variant);
    });

    afterEach(function () {
      document.body.removeChild(sandbox);
    });

    /**
     * The test runner will replace each of these placeholders with the contents of the corresponding file.
     */
    describe('config', function () {
  it('should allow to ignore specific errors', function () {
    return runInSandbox(sandbox, function () {
      Sentry.captureException(new Error('foo'));
      Sentry.captureException(new Error('ignoreErrorTest'));
      Sentry.captureException(new Error('bar'));
    }).then(function (summary) {
      assert.equal(summary.events[0].exception.values[0].type, 'Error');
      assert.equal(summary.events[0].exception.values[0].value, 'foo');
      assert.equal(summary.events[1].exception.values[0].type, 'Error');
      assert.equal(summary.events[1].exception.values[0].value, 'bar');
    });
  });

  it('should allow to ignore specific urls', function () {
    return runInSandbox(sandbox, function () {
      /**
       * We always filter on the caller, not the cause of the error
       *
       * > foo.js file called a function in bar.js
       * > bar.js file called a function in baz.js
       * > baz.js threw an error
       *
       * foo.js is denied in the `init` call (init.js), thus we filter it
       * */
      var urlWithDeniedUrl = new Error('filter');
      urlWithDeniedUrl.stack =
        'Error: bar\n' +
        ' at http://localhost:5000/foo.js:7:19\n' +
        ' at bar(http://localhost:5000/bar.js:2:3)\n' +
        ' at baz(http://localhost:5000/baz.js:2:9)\n';

      /**
       * > foo-pass.js file called a function in bar-pass.js
       * > bar-pass.js file called a function in baz-pass.js
       * > baz-pass.js threw an error
       *
       * foo-pass.js is *not* denied in the `init` call (init.js), thus we don't filter it
       * */
      var urlWithoutDeniedUrl = new Error('pass');
      urlWithoutDeniedUrl.stack =
        'Error: bar\n' +
        ' at http://localhost:5000/foo-pass.js:7:19\n' +
        ' at bar(http://localhost:5000/bar-pass.js:2:3)\n' +
        ' at baz(http://localhost:5000/baz-pass.js:2:9)\n';

      Sentry.captureException(urlWithDeniedUrl);
      Sentry.captureException(urlWithoutDeniedUrl);
    }).then(function (summary) {
      assert.lengthOf(summary.events, 1);
      assert.equal(summary.events[0].exception.values[0].type, 'Error');
      assert.equal(summary.events[0].exception.values[0].value, 'pass');
    });
  });
});
 // prettier-ignore
    describe('API', function () {
  it('should capture Sentry.captureMessage', function () {
    return runInSandbox(sandbox, function () {
      Sentry.captureMessage('Hello');
    }).then(function (summary) {
      assert.equal(summary.events[0].message, 'Hello');
    });
  });

  it('should capture Sentry.captureException', function () {
    return runInSandbox(sandbox, function () {
      try {
        foo();
      } catch (e) {
        Sentry.captureException(e);
      }
    }).then(function (summary) {
      assert.isAtLeast(summary.events[0].exception.values[0].stacktrace.frames.length, 2);
      assert.isAtMost(summary.events[0].exception.values[0].stacktrace.frames.length, 4);
    });
  });

  it('should capture Sentry internal event as breadcrumbs for the following event sent', function () {
    return runInSandbox(sandbox, { manual: true }, function () {
      window.allowSentryBreadcrumbs = true;
      Sentry.captureMessage('a');
      Sentry.captureMessage('b');
      // For the loader
      Sentry.flush && Sentry.flush(2000);
      window.finalizeManualTest();
    }).then(function (summary) {
      assert.equal(summary.events.length, 2);
      assert.equal(summary.breadcrumbs.length, 2);
      assert.equal(summary.events[1].breadcrumbs[0].category, 'sentry.event');
      assert.equal(summary.events[1].breadcrumbs[0].event_id, summary.events[0].event_id);
      assert.equal(summary.events[1].breadcrumbs[0].level, summary.events[0].level);
    });
  });

  it('should capture Sentry internal transaction as breadcrumbs for the following event sent', function () {
    return runInSandbox(sandbox, { manual: true }, function () {
      window.allowSentryBreadcrumbs = true;
      Sentry.captureEvent({
        event_id: 'aa3ff046696b4bc6b609ce6d28fde9e2',
        message: 'someMessage',
        transaction: 'wat',
        type: 'transaction',
      });
      Sentry.captureMessage('c');
      // For the loader
      Sentry.flush && Sentry.flush(2000);
      window.finalizeManualTest();
    }).then(function (summary) {
      // We have a length of one here since transactions don't go through beforeSend
      // and we add events to summary in beforeSend
      assert.equal(summary.events.length, 1);
      assert.equal(summary.breadcrumbs.length, 2);
      assert.equal(summary.events[0].breadcrumbs[0].category, 'sentry.transaction');
      assert.isNotEmpty(summary.events[0].breadcrumbs[0].event_id);
      assert.isUndefined(summary.events[0].breadcrumbs[0].level);
    });
  });

  it('should generate a synthetic trace for captureException w/ non-errors', function () {
    return runInSandbox(sandbox, function () {
      throwNonError();
    }).then(function (summary) {
      assert.isAtLeast(summary.events[0].exception.values[0].stacktrace.frames.length, 1);
      assert.isAtMost(summary.events[0].exception.values[0].stacktrace.frames.length, 3);
    });
  });

  it('should have correct stacktrace order', function () {
    return runInSandbox(sandbox, function () {
      try {
        foo();
      } catch (e) {
        Sentry.captureException(e);
      }
    }).then(function (summary) {
      assert.equal(
        summary.events[0].exception.values[0].stacktrace.frames[
          summary.events[0].exception.values[0].stacktrace.frames.length - 1
        ].function,
        'bar'
      );
      assert.isAtLeast(summary.events[0].exception.values[0].stacktrace.frames.length, 2);
      assert.isAtMost(summary.events[0].exception.values[0].stacktrace.frames.length, 4);
    });
  });

  it('should have exception with type and value', function () {
    return runInSandbox(sandbox, function () {
      Sentry.captureException('this is my test exception');
    }).then(function (summary) {
      assert.isNotEmpty(summary.events[0].exception.values[0].value);
      assert.isNotEmpty(summary.events[0].exception.values[0].type);
    });
  });

  it('should reject duplicate, back-to-back errors from captureException', function () {
    return runInSandbox(sandbox, function () {
      // Different exceptions, don't dedupe
      for (var i = 0; i < 2; i++) {
        throwRandomError();
      }

      // Same exceptions and same stacktrace, dedupe
      for (var j = 0; j < 2; j++) {
        throwError();
      }

      // Same exceptions, different stacktrace (different line number), don't dedupe
      throwSameConsecutiveErrors('bar');
    }).then(function (summary) {
      assert.match(summary.events[0].exception.values[0].value, /Exception no \d+/);
      assert.match(summary.events[1].exception.values[0].value, /Exception no \d+/);
      assert.equal(summary.events[2].exception.values[0].value, 'foo');
      assert.equal(summary.events[3].exception.values[0].value, 'bar');
      assert.equal(summary.events[4].exception.values[0].value, 'bar');
    });
  });

  it('should not reject back-to-back errors with different stack traces', function () {
    return runInSandbox(sandbox, function () {
      // same error message, but different stacks means that these are considered
      // different errors

      // stack:
      //   bar
      try {
        bar(); // declared in frame.html
      } catch (e) {
        Sentry.captureException(e);
      }

      // stack (different # frames):
      //   bar
      //   foo
      try {
        foo(); // declared in frame.html
      } catch (e) {
        Sentry.captureException(e);
      }

      // stack (same # frames, different frames):
      //   bar
      //   foo2
      try {
        foo2(); // declared in frame.html
      } catch (e) {
        Sentry.captureException(e);
      }
    }).then(function (summary) {
      // NOTE: regex because exact error message differs per-browser
      assert.match(summary.events[0].exception.values[0].value, /baz/);
      assert.equal(summary.events[0].exception.values[0].type, 'ReferenceError');
      assert.match(summary.events[1].exception.values[0].value, /baz/);
      assert.equal(summary.events[1].exception.values[0].type, 'ReferenceError');
      assert.match(summary.events[2].exception.values[0].value, /baz/);
      assert.equal(summary.events[2].exception.values[0].type, 'ReferenceError');
    });
  });

  it('should reject duplicate, back-to-back messages from captureMessage', function () {
    return runInSandbox(sandbox, function () {
      // Different messages, don't dedupe
      for (var i = 0; i < 2; i++) {
        captureRandomMessage();
      }

      // Same messages and same stacktrace, dedupe
      for (var j = 0; j < 2; j++) {
        captureMessage('same message, same stacktrace');
      }

      // Same messages, different stacktrace (different line number), don't dedupe
      captureSameConsecutiveMessages('same message, different stacktrace');
    }).then(function (summary) {
      // On the async loader since we replay all messages from the same location,
      // so we actually only receive 4 summary.events
      assert.match(summary.events[0].message, /Message no \d+/);
      assert.match(summary.events[1].message, /Message no \d+/);
      assert.equal(summary.events[2].message, 'same message, same stacktrace');
      assert.equal(summary.events[3].message, 'same message, different stacktrace');
      !IS_LOADER && assert.equal(summary.events[4].message, 'same message, different stacktrace');
    });
  });
});
 // prettier-ignore
    describe('window.onerror', function () {
  it('should catch syntax errors', function () {
    return runInSandbox(sandbox, function () {
      eval('foo{};');
    }).then(function (summary) {
      // ¯\_(ツ)_/¯
      if (summary.window.isBelowIE11()) {
        assert.equal(summary.events[0].exception.values[0].type, 'Error');
      } else {
        assert.match(summary.events[0].exception.values[0].type, /SyntaxError/);
      }
      assert.equal(summary.events[0].exception.values[0].stacktrace.frames.length, 1); // just one frame
    });
  });

  it('should catch thrown strings', function () {
    return runInSandbox(sandbox, { manual: true }, function () {
      // intentionally loading this error via a script file to make
      // sure it is 1) not caught by instrumentation 2) doesn't trigger
      // "Script error"
      var script = document.createElement('script');
      script.src = '/base/subjects/throw-string.js';
      script.onload = function () {
        window.finalizeManualTest();
      };
      document.head.appendChild(script);
    }).then(function (summary) {
      assert.match(summary.events[0].exception.values[0].value, /stringError$/);
      assert.equal(summary.events[0].exception.values[0].stacktrace.frames.length, 1); // always 1 because thrown strings can't provide > 1 frame

      // some browsers extract proper url, line, and column for thrown strings
      // but not all - falls back to frame url
      assert.match(
        summary.events[0].exception.values[0].stacktrace.frames[0].filename,
        /(\/subjects\/throw-string.js|\/base\/variants\/)/
      );
      assert.match(
        summary.events[0].exception.values[0].stacktrace.frames[0]['function'],
        /throwStringError|\?|global code/i
      );
    });
  });

  it('should catch thrown objects', function () {
    return runInSandbox(sandbox, { manual: true }, function () {
      // intentionally loading this error via a script file to make
      // sure it is 1) not caught by instrumentation 2) doesn't trigger
      // "Script error"
      var script = document.createElement('script');
      script.src = '/base/subjects/throw-object.js';
      script.onload = function () {
        window.finalizeManualTest();
      };
      document.head.appendChild(script);
    }).then(function (summary) {
      assert.equal(summary.events[0].exception.values[0].type, 'Error');

      // ¯\_(ツ)_/¯
      if (summary.window.isBelowIE11()) {
        assert.equal(summary.events[0].exception.values[0].value, '[object Object]');
      } else {
        assert.equal(
          summary.events[0].exception.values[0].value,
          'Non-Error exception captured with keys: error, somekey'
        );
      }
      assert.equal(summary.events[0].exception.values[0].stacktrace.frames.length, 1); // always 1 because thrown objects can't provide > 1 frame

      // some browsers extract proper url, line, and column for thrown objects
      // but not all - falls back to frame url
      assert.match(
        summary.events[0].exception.values[0].stacktrace.frames[0].filename,
        /(\/subjects\/throw-object.js|\/base\/variants\/)/
      );
      assert.match(
        summary.events[0].exception.values[0].stacktrace.frames[0]['function'],
        /throwStringError|\?|global code/i
      );
    });
  });

  it('should catch thrown errors', function () {
    return runInSandbox(sandbox, { manual: true }, function () {
      // intentionally loading this error via a script file to make
      // sure it is 1) not caught by instrumentation 2) doesn't trigger
      // "Script error"
      var script = document.createElement('script');
      script.src = '/base/subjects/throw-error.js';
      script.onload = function () {
        window.finalizeManualTest();
      };
      document.head.appendChild(script);
    }).then(function (summary) {
      // ¯\_(ツ)_/¯
      if (summary.window.isBelowIE11()) {
        assert.equal(summary.events[0].exception.values[0].type, 'Error');
      } else {
        assert.match(summary.events[0].exception.values[0].type, /^Error/);
      }
      assert.match(summary.events[0].exception.values[0].value, /realError$/);
      // 1 or 2 depending on platform
      assert.isAtLeast(summary.events[0].exception.values[0].stacktrace.frames.length, 1);
      assert.isAtMost(summary.events[0].exception.values[0].stacktrace.frames.length, 2);
      assert.match(summary.events[0].exception.values[0].stacktrace.frames[0].filename, /\/subjects\/throw-error\.js/);
      assert.match(
        summary.events[0].exception.values[0].stacktrace.frames[0]['function'],
        /\?|global code|throwRealError/i
      );
    });
  });

  it('should onerror calls with non-string first argument gracefully', function () {
    return runInSandbox(sandbox, function () {
      window.onerror({
        type: 'error',
        otherKey: 'hi',
      });
    }).then(function (summary) {
      assert.equal(summary.events[0].exception.values[0].type, 'Error');
      assert.equal(
        summary.events[0].exception.values[0].value,
        'Non-Error exception captured with keys: otherKey, type'
      );
      assert.deepEqual(summary.events[0].extra.__serialized__, {
        type: 'error',
        otherKey: 'hi',
      });
    });
  });

  it('should NOT catch an exception already caught [but rethrown] via Sentry.captureException', function () {
    return runInSandbox(sandbox, function () {
      try {
        foo();
      } catch (e) {
        Sentry.captureException(e);
        throw e; // intentionally re-throw
      }
    }).then(function (summary) {
      // IE10 uses different type (Error instead of ReferenceError) for rethrown errors...
      if (!summary.window.isBelowIE11()) {
        assert.equal(summary.events.length, 1);
      }
    });
  });
});
 // prettier-ignore
    describe('window.onunhandledrejection', function () {
  it('should capture unhandledrejection with error', function () {
    return runInSandbox(sandbox, function () {
      if (supportsOnunhandledRejection()) {
        Promise.reject(new Error('test2'));
      } else {
        window.resolveTest({ window: window });
      }
    }).then(function (summary) {
      if (summary.window.supportsOnunhandledRejection()) {
        assert.equal(summary.events[0].exception.values[0].value, 'test2');
        assert.equal(summary.events[0].exception.values[0].type, 'Error');

        // Of course Safari had to screw up here...
        if (!/Version\/\d.+Safari\/\d/.test(window.navigator.userAgent)) {
          assert.isAtLeast(summary.events[0].exception.values[0].stacktrace.frames.length, 1);
        }
        assert.equal(summary.events[0].exception.values[0].mechanism.handled, false);
        assert.equal(summary.events[0].exception.values[0].mechanism.type, 'onunhandledrejection');
      }
    });
  });

  // something, somewhere, (likely a browser extension) effectively casts PromiseRejectionEvents
  // to CustomEvents, moving the `promise` and `reason` attributes of the PRE into
  // the CustomEvent's `detail` attribute, since they're not part of CustomEvent's spec
  // see https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent and
  // https://github.com/getsentry/sentry-javascript/issues/2380
  it('should capture PromiseRejectionEvent cast to CustomEvent with type unhandledrejection', function () {
    return runInSandbox(sandbox, function () {
      if (supportsOnunhandledRejection()) {
        // this isn't how it happens in real life, in that the promise and reason
        // values come from an actual PromiseRejectionEvent, but it's enough to test
        // how the SDK handles the structure
        window.dispatchEvent(
          new CustomEvent('unhandledrejection', {
            detail: {
              promise: new Promise(function () {}),
              // we're testing with an error here but it could be anything - really
              // all we're testing is that it gets dug out correctly
              reason: new Error('test2'),
            },
          })
        );
      } else {
        window.resolveTest({ window: window });
      }
    }).then(function (summary) {
      if (summary.window.supportsOnunhandledRejection()) {
        assert.equal(summary.events[0].exception.values[0].value, 'test2');
        assert.equal(summary.events[0].exception.values[0].type, 'Error');

        // Of course Safari had to screw up here...
        if (!/Version\/\d.+Safari\/\d/.test(window.navigator.userAgent)) {
          assert.isAtLeast(summary.events[0].exception.values[0].stacktrace.frames.length, 1);
        }
        assert.equal(summary.events[0].exception.values[0].mechanism.handled, false);
        assert.equal(summary.events[0].exception.values[0].mechanism.type, 'onunhandledrejection');
        // even though it's a regular Event (rather than a PRE) it should still only
        // come through this channel
        assert.equal(summary.events.length, 1);
      }
    });
  });

  // there's no evidence that this actually happens, but it could, and our code correctly
  // handles it, so might as well prevent future regression on that score
  it('should capture a random Event with type unhandledrejection', function () {
    return runInSandbox(sandbox, function () {
      if (supportsOnunhandledRejection()) {
        window.dispatchEvent(new Event('unhandledrejection'));
      } else {
        window.resolveTest({ window: window });
      }
    }).then(function (summary) {
      if (summary.window.supportsOnunhandledRejection()) {
        // non-error rejections don't provide stacktraces so we can skip that assertion
        assert.equal(
          summary.events[0].exception.values[0].value,
          'Non-Error promise rejection captured with keys: currentTarget, isTrusted, target, type'
        );
        assert.equal(summary.events[0].exception.values[0].type, 'Event');
        assert.equal(summary.events[0].exception.values[0].mechanism.handled, false);
        assert.equal(summary.events[0].exception.values[0].mechanism.type, 'onunhandledrejection');
        // even though it's a regular Event (rather than a PRE) it should sill only
        // come through this channel
        assert.equal(summary.events.length, 1);
      }
    });
  });

  it('should capture unhandledrejection with a string', function () {
    return runInSandbox(sandbox, function () {
      if (supportsOnunhandledRejection()) {
        Promise.reject('test');
      } else {
        window.resolveTest({ window: window });
      }
    }).then(function (summary) {
      if (summary.window.supportsOnunhandledRejection()) {
        // non-error rejections don't provide stacktraces so we can skip that assertion
        assert.equal(
          summary.events[0].exception.values[0].value,
          'Non-Error promise rejection captured with value: test'
        );
        assert.equal(summary.events[0].exception.values[0].type, 'UnhandledRejection');
        assert.equal(summary.events[0].exception.values[0].mechanism.handled, false);
        assert.equal(summary.events[0].exception.values[0].mechanism.type, 'onunhandledrejection');
      }
    });
  });

  it('should capture unhandledrejection with a monster string', function () {
    return runInSandbox(sandbox, function () {
      if (supportsOnunhandledRejection()) {
        Promise.reject('test'.repeat(100));
      } else {
        window.resolveTest({ window: window });
      }
    }).then(function (summary) {
      if (summary.window.supportsOnunhandledRejection()) {
        // non-error rejections don't provide stacktraces so we can skip that assertion
        assert.equal(summary.events[0].exception.values[0].value.length, 253);
        assert.include(
          summary.events[0].exception.values[0].value,
          'Non-Error promise rejection captured with value: '
        );
        assert.equal(summary.events[0].exception.values[0].type, 'UnhandledRejection');
        assert.equal(summary.events[0].exception.values[0].mechanism.handled, false);
        assert.equal(summary.events[0].exception.values[0].mechanism.type, 'onunhandledrejection');
      }
    });
  });

  it('should capture unhandledrejection with an object', function () {
    return runInSandbox(sandbox, function () {
      if (supportsOnunhandledRejection()) {
        Promise.reject({ a: 'b', b: 'c', c: 'd' });
      } else {
        window.resolveTest({ window: window });
      }
    }).then(function (summary) {
      if (summary.window.supportsOnunhandledRejection()) {
        // non-error rejections don't provide stacktraces so we can skip that assertion
        assert.equal(
          summary.events[0].exception.values[0].value,
          'Non-Error promise rejection captured with keys: a, b, c'
        );
        assert.equal(summary.events[0].exception.values[0].type, 'UnhandledRejection');
        assert.equal(summary.events[0].exception.values[0].mechanism.handled, false);
        assert.equal(summary.events[0].exception.values[0].mechanism.type, 'onunhandledrejection');
      }
    });
  });

  it('should capture unhandledrejection with an monster object', function () {
    return runInSandbox(sandbox, function () {
      if (supportsOnunhandledRejection()) {
        var a = {
          a: '1'.repeat('100'),
          b: '2'.repeat('100'),
          c: '3'.repeat('100'),
        };
        a.d = a.a;
        a.e = a;
        Promise.reject(a);
      } else {
        window.resolveTest({ window: window });
      }
    }).then(function (summary) {
      if (summary.window.supportsOnunhandledRejection()) {
        // non-error rejections don't provide stacktraces so we can skip that assertion
        assert.equal(
          summary.events[0].exception.values[0].value,
          'Non-Error promise rejection captured with keys: a, b, c, d, e'
        );
        assert.equal(summary.events[0].exception.values[0].type, 'UnhandledRejection');
        assert.equal(summary.events[0].exception.values[0].mechanism.handled, false);
        assert.equal(summary.events[0].exception.values[0].mechanism.type, 'onunhandledrejection');
      }
    });
  });

  it('should capture unhandledrejection with a number', function () {
    return runInSandbox(sandbox, function () {
      if (supportsOnunhandledRejection()) {
        Promise.reject(1337);
      } else {
        window.resolveTest({ window: window });
      }
    }).then(function (summary) {
      if (summary.window.supportsOnunhandledRejection()) {
        // non-error rejections don't provide stacktraces so we can skip that assertion
        assert.equal(
          summary.events[0].exception.values[0].value,
          'Non-Error promise rejection captured with value: 1337'
        );
        assert.equal(summary.events[0].exception.values[0].type, 'UnhandledRejection');
        assert.equal(summary.events[0].exception.values[0].mechanism.handled, false);
        assert.equal(summary.events[0].exception.values[0].mechanism.type, 'onunhandledrejection');
      }
    });
  });

  it('should capture unhandledrejection with null', function () {
    return runInSandbox(sandbox, function () {
      if (supportsOnunhandledRejection()) {
        Promise.reject(null);
      } else {
        window.resolveTest({ window: window });
      }
    }).then(function (summary) {
      if (summary.window.supportsOnunhandledRejection()) {
        // non-error rejections don't provide stacktraces so we can skip that assertion
        assert.equal(
          summary.events[0].exception.values[0].value,
          'Non-Error promise rejection captured with value: null'
        );
        assert.equal(summary.events[0].exception.values[0].type, 'UnhandledRejection');
        assert.equal(summary.events[0].exception.values[0].mechanism.handled, false);
        assert.equal(summary.events[0].exception.values[0].mechanism.type, 'onunhandledrejection');
      }
    });
  });

  it('should capture unhandledrejection with an undefined', function () {
    return runInSandbox(sandbox, function () {
      if (supportsOnunhandledRejection()) {
        Promise.reject(undefined);
      } else {
        window.resolveTest({ window: window });
      }
    }).then(function (summary) {
      if (summary.window.supportsOnunhandledRejection()) {
        // non-error rejections don't provide stacktraces so we can skip that assertion
        assert.equal(
          summary.events[0].exception.values[0].value,
          'Non-Error promise rejection captured with value: undefined'
        );
        assert.equal(summary.events[0].exception.values[0].type, 'UnhandledRejection');
        assert.equal(summary.events[0].exception.values[0].mechanism.handled, false);
        assert.equal(summary.events[0].exception.values[0].mechanism.type, 'onunhandledrejection');
      }
    });
  });

  it('should skip our own failed requests that somehow bubbled-up to unhandledrejection handler', function () {
    return runInSandbox(sandbox, function () {
      if (supportsOnunhandledRejection()) {
        Promise.reject({
          __sentry_own_request__: true,
        });
        Promise.reject({
          __sentry_own_request__: false,
        });
        Promise.reject({});
      } else {
        window.resolveTest({ window: window });
      }
    }).then(function (summary) {
      if (summary.window.supportsOnunhandledRejection()) {
        assert.equal(summary.events.length, 2);
      }
    });
  });
});
 // prettier-ignore
    describe('wrapped built-ins', function () {
  it('should capture exceptions from event listeners', function () {
    return runInSandbox(sandbox, function () {
      var div = document.createElement('div');
      document.body.appendChild(div);
      div.addEventListener(
        'click',
        function () {
          window.element = div;
          window.context = this;
          foo();
        },
        false
      );
      var click = new MouseEvent('click');
      div.dispatchEvent(click);
    }).then(function (summary) {
      // Make sure we preserve the correct context
      assert.equal(summary.window.element, summary.window.context);
      delete summary.window.element;
      delete summary.window.context;
      assert.match(summary.events[0].exception.values[0].value, /baz/);
    });
  });

  it('should transparently remove event listeners from wrapped functions', function () {
    return runInSandbox(sandbox, function () {
      var div = document.createElement('div');
      document.body.appendChild(div);
      var fooFn = function () {
        foo();
      };
      var barFn = function () {
        bar();
      };
      div.addEventListener('click', fooFn);
      div.addEventListener('click', barFn);
      div.removeEventListener('click', barFn);
      div.dispatchEvent(new MouseEvent('click'));
    }).then(function (summary) {
      assert.lengthOf(summary.events, 1);
    });
  });

  it('should remove the original callback if it was registered before Sentry initialized (w. original method)', function () {
    return runInSandbox(sandbox, function () {
      var div = document.createElement('div');
      document.body.appendChild(div);
      window.capturedCall = false;
      var captureFn = function () {
        window.capturedCall = true;
      };
      // Use original addEventListener to simulate non-wrapped behavior (callback is attached without __sentry_wrapped__)
      window.originalBuiltIns.addEventListener.call(div, 'click', captureFn);
      // Then attach the same callback again, but with already wrapped method
      div.addEventListener('click', captureFn);
      div.removeEventListener('click', captureFn);
      div.dispatchEvent(new MouseEvent('click'));
    }).then(function (summary) {
      assert.equal(summary.window.capturedCall, false);
      delete summary.window.capturedCalls;
    });
  });

  it('should capture exceptions inside setTimeout', function () {
    return runInSandbox(sandbox, function () {
      setTimeout(function () {
        foo();
      });
    }).then(function (summary) {
      assert.match(summary.events[0].exception.values[0].value, /baz/);
    });
  });

  it('should capture exceptions inside setInterval', function () {
    return runInSandbox(sandbox, function () {
      var exceptionInterval = setInterval(function () {
        clearInterval(exceptionInterval);
        foo();
      }, 0);
    }).then(function (summary) {
      assert.match(summary.events[0].exception.values[0].value, /baz/);
    });
  });

  describe('requestAnimationFrame', function () {
    it('should capture exceptions inside callback', function () {
      // needs to be visible or requestAnimationFrame won't ever fire
      sandbox.style.display = 'block';

      return runInSandbox(sandbox, { manual: true }, function () {
        requestAnimationFrame(function () {
          window.finalizeManualTest();
          foo();
        });
      }).then(function (summary) {
        assert.match(summary.events[0].exception.values[0].value, /baz/);
      });
    });

    it('wrapped callback should preserve correct context - window (not-bound)', function () {
      // needs to be visible or requestAnimationFrame won't ever fire
      sandbox.style.display = 'block';
      return runInSandbox(sandbox, { manual: true }, function () {
        requestAnimationFrame(function () {
          window.capturedCtx = this;
          window.finalizeManualTest();
        });
      }).then(function (summary) {
        assert.strictEqual(summary.window.capturedCtx, summary.window);
        delete summary.window.capturedCtx;
      });
    });

    it('wrapped callback should preserve correct context - class bound method', function () {
      // needs to be visible or requestAnimationFrame won't ever fire
      sandbox.style.display = 'block';
      return runInSandbox(sandbox, { manual: true }, function () {
        // TypeScript-transpiled class syntax
        var Foo = (function () {
          function Foo() {
            var _this = this;
            this.magicNumber = 42;
            this.getThis = function () {
              window.capturedCtx = _this;
              window.finalizeManualTest();
            };
          }
          return Foo;
        })();
        var foo = new Foo();
        requestAnimationFrame(foo.getThis);
      }).then(function (summary) {
        assert.strictEqual(summary.window.capturedCtx.magicNumber, 42);
        delete summary.window.capturedCtx;
      });
    });

    it('wrapped callback should preserve correct context - `bind` bound method', function () {
      // needs to be visible or requestAnimationFrame won't ever fire
      sandbox.style.display = 'block';
      return runInSandbox(sandbox, { manual: true }, function () {
        function foo() {
          window.capturedCtx = this;
          window.finalizeManualTest();
        }
        requestAnimationFrame(foo.bind({ magicNumber: 42 }));
      }).then(function (summary) {
        assert.strictEqual(summary.window.capturedCtx.magicNumber, 42);
        delete summary.window.capturedCtx;
      });
    });
  });

  it('should capture exceptions from XMLHttpRequest event handlers (e.g. onreadystatechange)', function () {
    return runInSandbox(sandbox, { manual: true }, function () {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', '/base/subjects/example.json');
      // intentionally assign event handlers *after* open, since this is what jQuery does
      xhr.onreadystatechange = function wat() {
        window.finalizeManualTest();
        // replace onreadystatechange with no-op so exception doesn't
        // fire more than once as XHR changes loading state
        xhr.onreadystatechange = function () {};
        foo();
      };
      xhr.send();
    }).then(function (summary) {
      assert.match(summary.events[0].exception.values[0].value, /baz/);

      if (IS_LOADER) {
        assert.ok(summary.events[0].exception.values[0].mechanism);
      } else {
        var handler = summary.events[0].exception.values[0].mechanism.data.handler;
        delete summary.events[0].exception.values[0].mechanism.data.handler;

        if (summary.window.canReadFunctionName()) {
          assert.equal(handler, 'wat');
        } else {
          assert.equal(handler, '<anonymous>');
        }

        assert.deepEqual(summary.events[0].exception.values[0].mechanism, {
          type: 'instrument',
          handled: true,
          data: {
            function: 'onreadystatechange',
          },
        });
      }
    });
  });

  it('should not call XMLHttpRequest onreadystatechange more than once per state', function () {
    return runInSandbox(sandbox, { manual: true }, function () {
      window.calls = {};
      var xhr = new XMLHttpRequest();
      xhr.open('GET', '/base/subjects/example.json');
      xhr.onreadystatechange = function wat() {
        window.calls[xhr.readyState] = window.calls[xhr.readyState] ? window.calls[xhr.readyState] + 1 : 1;
        if (xhr.readyState === 4) {
          window.finalizeManualTest();
        }
      };
      xhr.send();
    }).then(function (summary) {
      for (var state in summary.window.calls) {
        assert.equal(summary.window.calls[state], 1);
      }
      // IE Triggers all states (1-4), including 1 (open), despite it being assigned before
      // the `onreadystatechange` handler.
      assert.isAtLeast(Object.keys(summary.window.calls).length, 3);
      assert.isAtMost(Object.keys(summary.window.calls).length, 4);
      delete summary.window.calls;
    });
  });

  it(optional("should capture built-in's mechanism type as instrument", IS_LOADER), function () {
    return runInSandbox(sandbox, function () {
      setTimeout(function () {
        foo();
      });
    }).then(function (summary) {
      if (IS_LOADER) {
        // The async loader doesn't wrap setTimeout
        // so we don't receive the full mechanism
        assert.ok(summary.events[0].exception.values[0].mechanism);
      } else {
        var fn = summary.events[0].exception.values[0].mechanism.data.function;
        delete summary.events[0].exception.values[0].mechanism.data;

        if (summary.window.canReadFunctionName()) {
          assert.equal(fn, 'setTimeout');
        } else {
          assert.equal(fn, '<anonymous>');
        }

        assert.deepEqual(summary.events[0].exception.values[0].mechanism, {
          type: 'instrument',
          handled: true,
        });
      }
    });
  });

  it(optional("should capture built-in's handlers fn name in mechanism data", IS_LOADER), function () {
    return runInSandbox(sandbox, function () {
      var div = document.createElement('div');
      document.body.appendChild(div);
      div.addEventListener(
        'click',
        function namedFunction() {
          foo();
        },
        false
      );
      var click = new MouseEvent('click');
      div.dispatchEvent(click);
    }).then(function (summary) {
      if (IS_LOADER) {
        // The async loader doesn't wrap addEventListener
        // so we don't receive the full mechanism
        assert.ok(summary.events[0].exception.values[0].mechanism);
      } else {
        var handler = summary.events[0].exception.values[0].mechanism.data.handler;
        delete summary.events[0].exception.values[0].mechanism.data.handler;
        var target = summary.events[0].exception.values[0].mechanism.data.target;
        delete summary.events[0].exception.values[0].mechanism.data.target;

        if (summary.window.canReadFunctionName()) {
          assert.equal(handler, 'namedFunction');
        } else {
          assert.equal(handler, '<anonymous>');
        }

        // IE vs. Rest of the world
        assert.oneOf(target, ['Node', 'EventTarget']);
        assert.deepEqual(summary.events[0].exception.values[0].mechanism, {
          type: 'instrument',
          handled: true,
          data: {
            function: 'addEventListener',
          },
        });
      }
    });
  });

  it(
    optional('should fallback to <anonymous> fn name in mechanism data if one is unavailable', IS_LOADER),
    function () {
      return runInSandbox(sandbox, function () {
        var div = document.createElement('div');
        document.body.appendChild(div);
        div.addEventListener(
          'click',
          function () {
            foo();
          },
          false
        );
        var click = new MouseEvent('click');
        div.dispatchEvent(click);
      }).then(function (summary) {
        if (IS_LOADER) {
          // The async loader doesn't wrap
          assert.ok(summary.events[0].exception.values[0].mechanism);
        } else {
          var target = summary.events[0].exception.values[0].mechanism.data.target;
          delete summary.events[0].exception.values[0].mechanism.data.target;

          // IE vs. Rest of the world
          assert.oneOf(target, ['Node', 'EventTarget']);
          assert.deepEqual(summary.events[0].exception.values[0].mechanism, {
            type: 'instrument',
            handled: true,
            data: {
              function: 'addEventListener',
              handler: '<anonymous>',
            },
          });
        }
      });
    }
  );
});
 // prettier-ignore
    describe('breadcrumbs', function () {
  it(optional('should record an XMLHttpRequest with a handler', IS_LOADER), function () {
    return runInSandbox(sandbox, { manual: true }, function () {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', '/base/subjects/example.json');
      xhr.onreadystatechange = function () {};
      xhr.send();
      waitForXHR(xhr, function () {
        Sentry.captureMessage('test');
        window.finalizeManualTest();
      });
    }).then(function (summary) {
      // The async loader doesn't wrap XHR
      if (IS_LOADER) {
        return;
      }
      assert.equal(summary.breadcrumbs.length, 1);
      assert.equal(summary.breadcrumbs[0].type, 'http');
      assert.equal(summary.breadcrumbs[0].category, 'xhr');
      assert.equal(summary.breadcrumbs[0].data.method, 'GET');
    });
  });

  it(optional('should record an XMLHttpRequest with a handler attached after send was called', IS_LOADER), function () {
    return runInSandbox(sandbox, { manual: true }, function () {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', '/base/subjects/example.json');
      xhr.send();
      xhr.onreadystatechange = function () {
        window.handlerCalled = true;
      };
      waitForXHR(xhr, function () {
        Sentry.captureMessage('test');
        window.finalizeManualTest();
      });
    }).then(function (summary) {
      // The async loader doesn't wrap XHR
      if (IS_LOADER) {
        return;
      }
      assert.equal(summary.breadcrumbs.length, 1);
      assert.equal(summary.breadcrumbs[0].type, 'http');
      assert.equal(summary.breadcrumbs[0].category, 'xhr');
      assert.equal(summary.breadcrumbs[0].data.method, 'GET');
      assert.typeOf(summary.breadcrumbs[0].timestamp, 'number');
      assert.isTrue(summary.window.handlerCalled);
      delete summary.window.handlerCalled;
    });
  });

  it(optional('should record an XMLHttpRequest without any handlers set', IS_LOADER), function () {
    return runInSandbox(sandbox, { manual: true }, function () {
      var xhr = new XMLHttpRequest();
      xhr.open('get', '/base/subjects/example.json');
      xhr.send();
      waitForXHR(xhr, function () {
        Sentry.captureMessage('test');
        window.finalizeManualTest();
      });
    }).then(function (summary) {
      // The async loader doesn't wrap XHR
      if (IS_LOADER) {
        return;
      }
      assert.equal(summary.breadcrumbs.length, 1);
      assert.equal(summary.breadcrumbs[0].type, 'http');
      assert.equal(summary.breadcrumbs[0].category, 'xhr');
      assert.equal(summary.breadcrumbs[0].data.method, 'GET');
      assert.isUndefined(summary.breadcrumbs[0].data.input);
      // To make sure that we are not providing this key for non-post requests
      assert.equal(summary.breadcrumbHints[0].input, undefined);
    });
  });

  it(optional('should give access to request body for XMLHttpRequest POST requests', IS_LOADER), function () {
    return runInSandbox(sandbox, { manual: true }, function () {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/base/subjects/example.json');
      xhr.send('{"foo":"bar"}');
      waitForXHR(xhr, function () {
        Sentry.captureMessage('test');
        window.finalizeManualTest();
      });
    }).then(function (summary) {
      // The async loader doesn't wrap XHR
      if (IS_LOADER) {
        return;
      }
      assert.equal(summary.breadcrumbs.length, 1);
      assert.equal(summary.breadcrumbs[0].type, 'http');
      assert.equal(summary.breadcrumbs[0].category, 'xhr');
      assert.equal(summary.breadcrumbs[0].data.method, 'POST');
      assert.isUndefined(summary.breadcrumbs[0].data.input);
      assert.equal(summary.breadcrumbHints[0].input, '{"foo":"bar"}');
    });
  });

  it('should record a fetch request', function () {
    return runInSandbox(sandbox, { manual: true }, function () {
      fetch('/base/subjects/example.json', {
        method: 'Get',
      })
        .then(
          function () {
            Sentry.captureMessage('test');
          },
          function () {
            Sentry.captureMessage('test');
          }
        )
        .then(function () {
          window.finalizeManualTest();
        })
        .catch(function () {
          window.finalizeManualTest();
        });
    }).then(function (summary) {
      if (IS_LOADER) {
        // The async loader doesn't wrap fetch, but we should receive the event without breadcrumbs
        assert.lengthOf(summary.events, 1);
      } else {
        if (summary.window.supportsNativeFetch()) {
          assert.equal(summary.breadcrumbs.length, 1);
          assert.equal(summary.breadcrumbs[0].type, 'http');
          assert.equal(summary.breadcrumbs[0].category, 'fetch');
          assert.equal(summary.breadcrumbs[0].data.method, 'GET');
          assert.equal(summary.breadcrumbs[0].data.url, '/base/subjects/example.json');
        } else {
          // otherwise we use a fetch polyfill based on xhr
          assert.equal(summary.breadcrumbs.length, 1);
          assert.equal(summary.breadcrumbs[0].type, 'http');
          assert.equal(summary.breadcrumbs[0].category, 'xhr');
          assert.equal(summary.breadcrumbs[0].data.method, 'GET');
          assert.equal(summary.breadcrumbs[0].data.url, '/base/subjects/example.json');
        }
      }
    });
  });

  it('should record a fetch request with Request obj instead of URL string', function () {
    return runInSandbox(sandbox, { manual: true }, function () {
      fetch(new Request('/base/subjects/example.json'))
        .then(
          function () {
            Sentry.captureMessage('test');
          },
          function () {
            Sentry.captureMessage('test');
          }
        )
        .then(function () {
          window.finalizeManualTest();
        })
        .catch(function () {
          window.finalizeManualTest();
        });
    }).then(function (summary) {
      if (IS_LOADER) {
        // The async loader doesn't wrap fetch, but we should receive the event without breadcrumbs
        assert.lengthOf(summary.events, 1);
      } else {
        if (summary.window.supportsNativeFetch()) {
          assert.equal(summary.breadcrumbs.length, 1);
          assert.equal(summary.breadcrumbs[0].type, 'http');
          assert.equal(summary.breadcrumbs[0].category, 'fetch');
          assert.equal(summary.breadcrumbs[0].data.method, 'GET');
          // Request constructor normalizes the url
          assert.ok(summary.breadcrumbs[0].data.url.indexOf('/base/subjects/example.json') !== -1);
        } else {
          // otherwise we use a fetch polyfill based on xhr
          assert.equal(summary.breadcrumbs.length, 1);
          assert.equal(summary.breadcrumbs[0].type, 'http');
          assert.equal(summary.breadcrumbs[0].category, 'xhr');
          assert.equal(summary.breadcrumbs[0].data.method, 'GET');
          assert.ok(summary.breadcrumbs[0].data.url.indexOf('/base/subjects/example.json') !== -1);
        }
      }
    });
  });

  it('should record a fetch request with an arbitrary type argument', function () {
    return runInSandbox(sandbox, { manual: true }, function () {
      fetch(123)
        .then(
          function () {
            Sentry.captureMessage('test');
          },
          function () {
            Sentry.captureMessage('test');
          }
        )
        .then(function () {
          window.finalizeManualTest();
        })
        .catch(function () {
          window.finalizeManualTest();
        });
    }).then(function (summary) {
      if (IS_LOADER) {
        // The async loader doesn't wrap fetch, but we should receive the event without breadcrumbs
        assert.lengthOf(summary.events, 1);
      } else {
        if (summary.window.supportsNativeFetch()) {
          assert.equal(summary.breadcrumbs.length, 1);
          assert.equal(summary.breadcrumbs[0].type, 'http');
          assert.equal(summary.breadcrumbs[0].category, 'fetch');
          assert.equal(summary.breadcrumbs[0].data.method, 'GET');
          assert.ok(summary.breadcrumbs[0].data.url.indexOf('123') !== -1);
        } else {
          // otherwise we use a fetch polyfill based on xhr
          assert.equal(summary.breadcrumbs.length, 1);
          assert.equal(summary.breadcrumbs[0].type, 'http');
          assert.equal(summary.breadcrumbs[0].category, 'xhr');
          assert.equal(summary.breadcrumbs[0].data.method, 'GET');
          assert.ok(summary.breadcrumbs[0].data.url.indexOf('123') !== -1);
        }
      }
    });
  });

  it('should provide a hint for dom events that includes event name and event itself', function () {
    return runInSandbox(sandbox, function () {
      var input = document.getElementsByTagName('input')[0];
      var clickHandler = function () {};
      input.addEventListener('click', clickHandler);
      var click = new MouseEvent('click');
      input.dispatchEvent(click);
      Sentry.captureMessage('test');
    }).then(function (summary) {
      if (IS_LOADER) {
        // The async loader doesn't wrap event listeners, but we should receive the event without breadcrumbs
        assert.lengthOf(summary.events, 1);
      } else {
        assert.equal(summary.breadcrumbHints.length, 1);
        assert.equal(summary.breadcrumbHints[0].name, 'click');
        assert.equal(summary.breadcrumbHints[0].event.target.tagName, 'INPUT');
      }
    });
  });

  it('should not fail with click or keypress handler with no callback', function () {
    return runInSandbox(sandbox, function () {
      var input = document.getElementsByTagName('input')[0];
      input.addEventListener('click', undefined);
      input.addEventListener('keypress', undefined);

      var click = new MouseEvent('click');
      input.dispatchEvent(click);

      var keypress = new KeyboardEvent('keypress');
      input.dispatchEvent(keypress);

      Sentry.captureMessage('test');
    }).then(function (summary) {
      if (IS_LOADER) {
        // The async loader doesn't wrap event listeners, but we should receive the event without breadcrumbs
        assert.lengthOf(summary.events, 1);
      } else {
        assert.equal(summary.breadcrumbs.length, 2);

        assert.equal(summary.breadcrumbs[0].category, 'ui.click');
        assert.equal(summary.breadcrumbs[0].message, 'body > form#foo-form > input[name="foo"]');

        assert.equal(summary.breadcrumbs[1].category, 'ui.input');
        assert.equal(summary.breadcrumbs[1].message, 'body > form#foo-form > input[name="foo"]');
      }
    });
  });

  it('should not fail with custom event', function () {
    return runInSandbox(sandbox, function () {
      var input = document.getElementsByTagName('input')[0];
      input.addEventListener('build', function (evt) {
        evt.stopPropagation();
      });

      var customEvent = new CustomEvent('build', { detail: 1 });
      input.dispatchEvent(customEvent);

      Sentry.captureMessage('test');
    }).then(function (summary) {
      if (IS_LOADER) {
        // The async loader doesn't wrap event listeners, but we should receive the event without breadcrumbs
        assert.lengthOf(summary.events, 1);
      } else {
        assert.equal(summary.breadcrumbs.length, 0);
      }
    });
  });

  it('should not fail with custom event and handler with no callback', function () {
    return runInSandbox(sandbox, function () {
      var input = document.getElementsByTagName('input')[0];
      input.addEventListener('build', undefined);

      var customEvent = new CustomEvent('build', { detail: 1 });
      input.dispatchEvent(customEvent);

      Sentry.captureMessage('test');
    }).then(function (summary) {
      if (IS_LOADER) {
        // The async loader doesn't wrap event listeners, but we should receive the event without breadcrumbs
        assert.lengthOf(summary.events, 1);
      } else {
        assert.equal(summary.breadcrumbs.length, 0);
      }
    });
  });

  it('should record a mouse click on element WITH click handler present', function () {
    return runInSandbox(sandbox, function () {
      // add an event listener to the input. we want to make sure that
      // our breadcrumbs still work even if the page has an event listener
      // on an element that cancels event bubbling
      var input = document.getElementsByTagName('input')[0];
      var clickHandler = function (evt) {
        evt.stopPropagation(); // don't bubble
      };
      input.addEventListener('click', clickHandler);

      // click <input/>
      var click = new MouseEvent('click');
      input.dispatchEvent(click);

      Sentry.captureMessage('test');
    }).then(function (summary) {
      if (IS_LOADER) {
        // The async loader doesn't wrap event listeners, but we should receive the event without breadcrumbs
        assert.lengthOf(summary.events, 1);
      } else {
        assert.equal(summary.breadcrumbs.length, 1);

        assert.equal(summary.breadcrumbs[0].category, 'ui.click');
        assert.equal(summary.breadcrumbs[0].message, 'body > form#foo-form > input[name="foo"]');
      }
    });
  });

  it('should record a mouse click on element WITHOUT click handler present', function () {
    return runInSandbox(sandbox, function () {
      // click <input/>
      var click = new MouseEvent('click');
      var input = document.getElementsByTagName('input')[0];
      input.dispatchEvent(click);

      Sentry.captureMessage('test');
    }).then(function (summary) {
      if (IS_LOADER) {
        // The async loader doesn't wrap event listeners, but we should receive the event without breadcrumbs
        assert.lengthOf(summary.events, 1);
      } else {
        assert.equal(summary.breadcrumbs.length, 1);

        assert.equal(summary.breadcrumbs[0].category, 'ui.click');
        assert.equal(summary.breadcrumbs[0].message, 'body > form#foo-form > input[name="foo"]');
      }
    });
  });

  it('should only record a SINGLE mouse click for a tree of elements with event listeners', function () {
    return runInSandbox(sandbox, function () {
      var clickHandler = function () {};

      // mousemove event shouldnt clobber subsequent "breadcrumbed" events (see #724)
      document.querySelector('.a').addEventListener('mousemove', clickHandler);

      document.querySelector('.a').addEventListener('click', clickHandler);
      document.querySelector('.b').addEventListener('click', clickHandler);
      document.querySelector('.c').addEventListener('click', clickHandler);

      // click <input/>
      var click = new MouseEvent('click');
      var input = document.querySelector('.a'); // leaf node
      input.dispatchEvent(click);

      Sentry.captureMessage('test');
    }).then(function (summary) {
      if (IS_LOADER) {
        // The async loader doesn't wrap event listeners, but we should receive the event without breadcrumbs
        assert.lengthOf(summary.events, 1);
      } else {
        assert.equal(summary.breadcrumbs.length, 1);

        assert.equal(summary.breadcrumbs[0].category, 'ui.click');
        assert.equal(summary.breadcrumbs[0].message, 'body > div.c > div.b > div.a');
      }
    });
  });

  it('should bail out if accessing the `target` property of an event throws an exception', function () {
    // see: https://github.com/getsentry/sentry-javascript/issues/768
    return runInSandbox(sandbox, function () {
      // click <input/>
      var click = new MouseEvent('click');
      function kaboom() {
        throw new Error('lol');
      }
      Object.defineProperty(click, 'target', { get: kaboom });

      var input = document.querySelector('.a'); // leaf node

      Sentry.captureMessage('test');
      input.dispatchEvent(click);
    }).then(function (summary) {
      if (IS_LOADER) {
        // The async loader doesn't wrap event listeners, but we should receive the event without breadcrumbs
        assert.lengthOf(summary.events, 1);
      } else {
        assert.equal(summary.breadcrumbs.length, 1);
        assert.equal(summary.breadcrumbs[0].category, 'ui.click');
        assert.equal(summary.breadcrumbs[0].message, '<unknown>');
      }
    });
  });

  it('should record consecutive keypress events into a single "input" breadcrumb', function () {
    return runInSandbox(sandbox, function () {
      // keypress <input/> twice
      var keypress1 = new KeyboardEvent('keypress');
      var keypress2 = new KeyboardEvent('keypress');

      var input = document.getElementsByTagName('input')[0];
      input.dispatchEvent(keypress1);
      input.dispatchEvent(keypress2);

      Sentry.captureMessage('test');
    }).then(function (summary) {
      if (IS_LOADER) {
        // The async loader doesn't wrap event listeners, but we should receive the event without breadcrumbs
        assert.lengthOf(summary.events, 1);
      } else {
        assert.equal(summary.breadcrumbs.length, 1);

        assert.equal(summary.breadcrumbs[0].category, 'ui.input');
        assert.equal(summary.breadcrumbs[0].message, 'body > form#foo-form > input[name="foo"]');
      }
    });
  });

  it('should correctly capture multiple consecutive breadcrumbs if they are of different type', function () {
    return runInSandbox(sandbox, function () {
      var input = document.getElementsByTagName('input')[0];

      var clickHandler = function () {};
      input.addEventListener('click', clickHandler);
      var keypressHandler = function () {};
      input.addEventListener('keypress', keypressHandler);

      input.dispatchEvent(new MouseEvent('click'));
      input.dispatchEvent(new KeyboardEvent('keypress'));

      Sentry.captureMessage('test');
    }).then(function (summary) {
      if (IS_LOADER) {
        // The async loader doesn't wrap event listeners, but we should receive the event without breadcrumbs
        assert.lengthOf(summary.events, 1);
      } else {
        // Breadcrumb should be captured by the global event listeners, not a specific one
        assert.equal(summary.breadcrumbs.length, 2);
        assert.equal(summary.breadcrumbs[0].category, 'ui.click');
        assert.equal(summary.breadcrumbs[0].message, 'body > form#foo-form > input[name="foo"]');
        assert.equal(summary.breadcrumbs[1].category, 'ui.input');
        assert.equal(summary.breadcrumbs[0].message, 'body > form#foo-form > input[name="foo"]');
        assert.equal(summary.breadcrumbHints[0].global, false);
        assert.equal(summary.breadcrumbHints[1].global, false);
      }
    });
  });

  it('should debounce multiple consecutive identical breadcrumbs but allow for switching to a different type', function () {
    return runInSandbox(sandbox, function () {
      var input = document.getElementsByTagName('input')[0];

      var clickHandler = function () {};
      input.addEventListener('click', clickHandler);
      var keypressHandler = function () {};
      input.addEventListener('keypress', keypressHandler);

      input.dispatchEvent(new MouseEvent('click'));
      input.dispatchEvent(new MouseEvent('click'));
      input.dispatchEvent(new MouseEvent('click'));
      input.dispatchEvent(new KeyboardEvent('keypress'));
      input.dispatchEvent(new KeyboardEvent('keypress'));
      input.dispatchEvent(new KeyboardEvent('keypress'));

      Sentry.captureMessage('test');
    }).then(function (summary) {
      if (IS_LOADER) {
        // The async loader doesn't wrap event listeners, but we should receive the event without breadcrumbs
        assert.lengthOf(summary.events, 1);
      } else {
        // Breadcrumb should be captured by the global event listeners, not a specific one
        assert.equal(summary.breadcrumbs.length, 2);
        assert.equal(summary.breadcrumbs[0].category, 'ui.click');
        assert.equal(summary.breadcrumbs[0].message, 'body > form#foo-form > input[name="foo"]');
        assert.equal(summary.breadcrumbs[1].category, 'ui.input');
        assert.equal(summary.breadcrumbs[0].message, 'body > form#foo-form > input[name="foo"]');
        assert.equal(summary.breadcrumbHints[0].global, false);
        assert.equal(summary.breadcrumbHints[1].global, false);
      }
    });
  });

  it('should debounce multiple consecutive identical breadcrumbs but allow for switching to a different target', function () {
    return runInSandbox(sandbox, function () {
      var input = document.querySelector('#foo-form input');
      var div = document.querySelector('#foo-form div');

      var clickHandler = function () {};
      input.addEventListener('click', clickHandler);
      div.addEventListener('click', clickHandler);

      input.dispatchEvent(new MouseEvent('click'));
      div.dispatchEvent(new MouseEvent('click'));

      Sentry.captureMessage('test');
    }).then(function (summary) {
      if (IS_LOADER) {
        // The async loader doesn't wrap event listeners, but we should receive the event without breadcrumbs
        assert.lengthOf(summary.events, 1);
      } else {
        // Breadcrumb should be captured by the global event listeners, not a specific one
        assert.equal(summary.breadcrumbs.length, 2);
        assert.equal(summary.breadcrumbs[0].category, 'ui.click');
        assert.equal(summary.breadcrumbs[0].message, 'body > form#foo-form > input[name="foo"]');
        assert.equal(summary.breadcrumbs[1].category, 'ui.click');
        assert.equal(summary.breadcrumbs[1].message, 'body > form#foo-form > div.contenteditable');
        assert.equal(summary.breadcrumbHints[0].global, false);
        assert.equal(summary.breadcrumbHints[1].global, false);
      }
    });
  });

  it(optional('should flush keypress breadcrumbs when an error is thrown', IS_LOADER), function () {
    return runInSandbox(sandbox, function () {
      // keypress <input/>
      var keypress = new KeyboardEvent('keypress');
      var input = document.getElementsByTagName('input')[0];
      input.dispatchEvent(keypress);
      foo(); // throw exception
    }).then(function (summary) {
      if (IS_LOADER) {
        return;
      }
      // TODO: don't really understand what's going on here
      // Why do we not catch an error here

      assert.equal(summary.breadcrumbs.length, 1);
      assert.equal(summary.breadcrumbs[0].category, 'ui.input');
      assert.equal(summary.breadcrumbs[0].message, 'body > form#foo-form > input[name="foo"]');
    });
  });

  it('should flush keypress breadcrumb when input event occurs immediately after', function () {
    return runInSandbox(sandbox, function () {
      // 1st keypress <input/>
      var keypress1 = new KeyboardEvent('keypress');
      // click <input/>
      var click = new MouseEvent('click');
      // 2nd keypress
      var keypress2 = new KeyboardEvent('keypress');

      var input = document.getElementsByTagName('input')[0];
      input.dispatchEvent(keypress1);
      input.dispatchEvent(click);
      input.dispatchEvent(keypress2);

      Sentry.captureMessage('test');
    }).then(function (summary) {
      if (IS_LOADER) {
        // The async loader doesn't wrap event listeners, but we should receive the event without breadcrumbs
        assert.lengthOf(summary.events, 1);
      } else {
        assert.equal(summary.breadcrumbs.length, 3);

        assert.equal(summary.breadcrumbs[0].category, 'ui.input');
        assert.equal(summary.breadcrumbs[0].message, 'body > form#foo-form > input[name="foo"]');

        assert.equal(summary.breadcrumbs[1].category, 'ui.click');
        assert.equal(summary.breadcrumbs[1].message, 'body > form#foo-form > input[name="foo"]');

        assert.equal(summary.breadcrumbs[2].category, 'ui.input');
        assert.equal(summary.breadcrumbs[2].message, 'body > form#foo-form > input[name="foo"]');
      }
    });
  });

  it('should record consecutive keypress events in a contenteditable into a single "input" breadcrumb', function () {
    return runInSandbox(sandbox, function () {
      // keypress <input/> twice
      var keypress1 = new KeyboardEvent('keypress');
      var keypress2 = new KeyboardEvent('keypress');

      var div = document.querySelector('[contenteditable]');
      div.dispatchEvent(keypress1);
      div.dispatchEvent(keypress2);

      Sentry.captureMessage('test');
    }).then(function (summary) {
      if (IS_LOADER) {
        // The async loader doesn't wrap event listeners, but we should receive the event without breadcrumbs
        assert.lengthOf(summary.events, 1);
      } else {
        assert.equal(summary.breadcrumbs.length, 1);

        assert.equal(summary.breadcrumbs[0].category, 'ui.input');
        assert.equal(summary.breadcrumbs[0].message, 'body > form#foo-form > div.contenteditable');
      }
    });
  });

  it('should record click events that were handled using an object with handleEvent property and call original callback', function () {
    return runInSandbox(sandbox, function () {
      window.handleEventCalled = false;

      var input = document.getElementsByTagName('input')[0];
      input.addEventListener('click', {
        handleEvent: function () {
          window.handleEventCalled = true;
        },
      });
      input.dispatchEvent(new MouseEvent('click'));

      Sentry.captureMessage('test');
    }).then(function (summary) {
      if (IS_LOADER) {
        // The async loader doesn't wrap event listeners, but we should receive the event without breadcrumbs
        assert.lengthOf(summary.events, 1);
      } else {
        assert.equal(summary.breadcrumbs.length, 1);
        assert.equal(summary.breadcrumbs[0].category, 'ui.click');
        assert.equal(summary.breadcrumbs[0].message, 'body > form#foo-form > input[name="foo"]');

        assert.equal(summary.window.handleEventCalled, true);
      }
    });
  });

  it('should record keypress events that were handled using an object with handleEvent property and call original callback', function () {
    return runInSandbox(sandbox, function () {
      window.handleEventCalled = false;

      var input = document.getElementsByTagName('input')[0];
      input.addEventListener('keypress', {
        handleEvent: function () {
          window.handleEventCalled = true;
        },
      });
      input.dispatchEvent(new KeyboardEvent('keypress'));

      Sentry.captureMessage('test');
    }).then(function (summary) {
      if (IS_LOADER) {
        // The async loader doesn't wrap event listeners, but we should receive the event without breadcrumbs
        assert.lengthOf(summary.events, 1);
      } else {
        assert.equal(summary.breadcrumbs.length, 1);
        assert.equal(summary.breadcrumbs[0].category, 'ui.input');
        assert.equal(summary.breadcrumbs[0].message, 'body > form#foo-form > input[name="foo"]');

        assert.equal(summary.window.handleEventCalled, true);
      }
    });
  });

  it('should remove breadcrumb instrumentation when all event listeners are detached', function () {
    return runInSandbox(sandbox, function () {
      var input = document.getElementsByTagName('input')[0];

      var clickHandler = function () {};
      var otherClickHandler = function () {};
      input.addEventListener('click', clickHandler);
      input.addEventListener('click', otherClickHandler);
      input.removeEventListener('click', clickHandler);
      input.removeEventListener('click', otherClickHandler);

      var keypressHandler = function () {};
      var otherKeypressHandler = function () {};
      input.addEventListener('keypress', keypressHandler);
      input.addEventListener('keypress', otherKeypressHandler);
      input.removeEventListener('keypress', keypressHandler);
      input.removeEventListener('keypress', otherKeypressHandler);

      input.dispatchEvent(new MouseEvent('click'));
      input.dispatchEvent(new KeyboardEvent('keypress'));

      Sentry.captureMessage('test');
    }).then(function (summary) {
      if (IS_LOADER) {
        // The async loader doesn't wrap event listeners, but we should receive the event without breadcrumbs
        assert.lengthOf(summary.events, 1);
      } else {
        // Breadcrumb should be captured by the global event listeners, not a specific one
        assert.equal(summary.breadcrumbs.length, 2);
        assert.equal(summary.breadcrumbHints[0].global, true);
        assert.equal(summary.breadcrumbHints[1].global, true);
      }
    });
  });

  it(
    optional('should record history.[pushState|replaceState] changes as navigation breadcrumbs', IS_LOADER),
    function () {
      return runInSandbox(sandbox, function () {
        history.pushState({}, '', '/foo');
        history.pushState({}, '', '/bar?a=1#fragment');
        history.pushState({}, '', {}); // pushState calls toString on non-string args
        history.pushState({}, '', null); // does nothing / no-op
        // can't call history.back() because it will change url of parent document
        // (e.g. document running mocha) ... instead just "emulate" a back button
        // press by calling replaceState
        history.replaceState({}, '', '/bar?a=1#fragment');
        Sentry.captureMessage('test');
      }).then(function (summary) {
        if (IS_LOADER) {
          // The async loader doesn't wrap history
          return;
        }
        assert.equal(summary.breadcrumbs.length, 4);
        assert.equal(summary.breadcrumbs[0].category, 'navigation'); // (start) => foo
        assert.equal(summary.breadcrumbs[1].category, 'navigation'); // foo => bar?a=1#fragment
        assert.equal(summary.breadcrumbs[2].category, 'navigation'); // bar?a=1#fragment => [object%20Object]
        assert.equal(summary.breadcrumbs[3].category, 'navigation'); // [object%20Object] => bar?a=1#fragment (back button)

        assert.ok(/\/base\/variants\/.*\.html$/.test(summary.breadcrumbs[0].data.from), "'from' url is incorrect");
        assert.ok(/\/foo$/.test(summary.breadcrumbs[0].data.to), "'to' url is incorrect");

        assert.ok(/\/foo$/.test(summary.breadcrumbs[1].data.from), "'from' url is incorrect");
        assert.ok(/\/bar\?a=1#fragment$/.test(summary.breadcrumbs[1].data.to), "'to' url is incorrect");

        assert.ok(/\/bar\?a=1#fragment$/.test(summary.breadcrumbs[2].data.from), "'from' url is incorrect");
        assert.ok(/\[object Object\]$/.test(summary.breadcrumbs[2].data.to), "'to' url is incorrect");

        assert.ok(/\[object Object\]$/.test(summary.breadcrumbs[3].data.from), "'from' url is incorrect");
        assert.ok(/\/bar\?a=1#fragment/.test(summary.breadcrumbs[3].data.to), "'to' url is incorrect");
      });
    }
  );

  it(optional('should preserve native code detection compatibility', IS_LOADER), function () {
    return runInSandbox(sandbox, { manual: true }, function () {
      window.resolveTest();
    }).then(function () {
      if (IS_LOADER) {
        // The async loader doesn't wrap anything
        return;
      }
      assert.include(Function.prototype.toString.call(window.setTimeout), '[native code]');
      assert.include(Function.prototype.toString.call(window.setInterval), '[native code]');
      assert.include(Function.prototype.toString.call(window.addEventListener), '[native code]');
      assert.include(Function.prototype.toString.call(window.removeEventListener), '[native code]');
      assert.include(Function.prototype.toString.call(window.requestAnimationFrame), '[native code]');
      if ('fetch' in window) {
        assert.include(Function.prototype.toString.call(window.fetch), '[native code]');
      }
    });
  });

  it('should capture console breadcrumbs', function () {
    return runInSandbox(sandbox, { manual: true }, function () {
      window.allowConsoleBreadcrumbs = true;
      var logs = document.createElement('script');
      logs.src = '/base/subjects/console-logs.js';
      logs.onload = function () {
        window.finalizeManualTest();
      };
      document.head.appendChild(logs);
    }).then(function (summary) {
      if (IS_LOADER) {
        // The async loader doesn't capture breadcrumbs, but we should receive the event without them
        assert.lengthOf(summary.events, 1);
      } else {
        if ('assert' in console) {
          assert.lengthOf(summary.breadcrumbs, 4);
          assert.deepEqual(summary.breadcrumbs[3].data.arguments, ['math broke']);
        } else {
          assert.lengthOf(summary.breadcrumbs, 3);
        }

        assert.deepEqual(summary.breadcrumbs[0].data.arguments, ['One']);
        assert.deepEqual(summary.breadcrumbs[1].data.arguments, ['Two', { a: 1 }]);
        assert.deepEqual(summary.breadcrumbs[2].data.arguments, ['Error 2', { b: { c: [] } }]);
      }
    });
  });
});
 // prettier-ignore
    if (IS_LOADER) {
  describe('Loader Specific Tests', function () {
    it('should add breadcrumb from onLoad callback from undefined error', function () {
      return runInSandbox(sandbox, function () {
        Sentry.onLoad(function () {
          Sentry.addBreadcrumb({
            category: 'auth',
            message: 'testing loader',
            level: 'error',
          });
        });
        setTimeout(function () {
          Sentry.captureMessage('test');
        });
        undefinedMethod();
      }).then(function (summary) {
        if (IS_ASYNC_LOADER) {
          assert.notOk(summary.events[0].breadcrumbs);
        } else {
          if (summary.events[0].breadcrumbs) {
            assert.ok(summary.events[0].breadcrumbs);
            assert.lengthOf(summary.events[0].breadcrumbs, 1);
            assert.equal(summary.events[0].breadcrumbs[0].message, 'testing loader');
          } else {
            // This seems to be happening only in chrome
            assert.notOk(summary.events[0].breadcrumbs);
          }
        }
      });
    });

    it('should add breadcrumb from onLoad callback from undefined error with custom init()', function () {
      return runInSandbox(sandbox, function () {
        Sentry.onLoad(function () {
          Sentry.init({ debug: true });
          Sentry.addBreadcrumb({
            category: 'auth',
            message: 'testing loader',
            level: 'error',
          });
        });
        setTimeout(function () {
          Sentry.captureMessage('test');
        });
        undefinedMethod(); // trigger error
      }).then(function (summary) {
        assert.ok(summary.events[0].breadcrumbs);
        assert.lengthOf(summary.events[0].breadcrumbs, 1);
        assert.equal(summary.events[0].breadcrumbs[0].message, 'testing loader');
      });
    });

    it('should set SENTRY_SDK_SOURCE value', () => {
      return runInSandbox(sandbox, function () {
        Sentry.onLoad(function () {
          Sentry.init({ debug: true });
        });
        setTimeout(function () {
          Sentry.captureMessage('test');
        });
        undefinedMethod(); // trigger error
      }).then(function (summary) {
        assert.equal(summary.events[0].sdk.packages[0].name, 'loader:@sentry/browser');
      });
    });
  });
}
 // prettier-ignore
  });
}

for (var idx in variants) {
  (function () {
    runVariant(variants[idx]);
  })();
}

var loaderVariants = ['loader-with-no-global-init', 'loader-with-no-global-init-lazy-no'];

for (var idx in loaderVariants) {
  (function () {
    describe(loaderVariants[idx], function () {
      this.timeout(60000);
      this.retries(3);

      var sandbox;

      beforeEach(function (done) {
        sandbox = createSandbox(done, loaderVariants[idx]);
      });

      afterEach(function () {
        document.body.removeChild(sandbox);
      });

      describe('Loader Specific Tests - With no Global init() call', function () {
        it('should add breadcrumb from onLoad callback from undefined error', function () {
          return runInSandbox(sandbox, function () {
            Sentry.onLoad(function () {
              initSDK();
              Sentry.addBreadcrumb({
                category: 'auth',
                message: 'testing loader',
                level: 'error',
              });
            });
            setTimeout(function () {
              Sentry.captureMessage('test');
            });
            undefinedMethod();
          }).then(function (summary) {
            assert.ok(summary.breadcrumbs);
            assert.lengthOf(summary.breadcrumbs, 1);
            assert.equal(summary.breadcrumbs[0].message, 'testing loader');
          });
        });
      });
    });
  })();
}
 // prettier-ignore
