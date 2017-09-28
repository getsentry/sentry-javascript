/*global Mocha, assert*/
var Sinon = require('sinon');
var stringify = require('../../vendor/json-stringify-safe/stringify');

function jsonify(obj) {
  return JSON.stringify(obj, null, 2);
}

describe('Stringify', function() {
  it('must stringify circular objects', function() {
    var obj = {name: 'Alice'};
    obj.self = obj;
    var json = stringify(obj, null, 2);
    assert.deepEqual(json, jsonify({name: 'Alice', self: '[Circular ~]'}));
  });

  it('must stringify circular objects with intermediaries', function() {
    var obj = {name: 'Alice'};
    obj.identity = {self: obj};
    var json = stringify(obj, null, 2);
    assert.deepEqual(json, jsonify({name: 'Alice', identity: {self: '[Circular ~]'}}));
  });

  it('must stringify circular objects deeper', function() {
    var obj = {name: 'Alice', child: {name: 'Bob'}};
    obj.child.self = obj.child;

    assert.deepEqual(
      stringify(obj, null, 2),
      jsonify({
        name: 'Alice',
        child: {name: 'Bob', self: '[Circular ~.child]'}
      })
    );
  });

  it('must stringify circular objects deeper with intermediaries', function() {
    var obj = {name: 'Alice', child: {name: 'Bob'}};
    obj.child.identity = {self: obj.child};

    assert.deepEqual(
      stringify(obj, null, 2),
      jsonify({
        name: 'Alice',
        child: {name: 'Bob', identity: {self: '[Circular ~.child]'}}
      })
    );
  });

  it('must stringify circular objects in an array', function() {
    var obj = {name: 'Alice'};
    obj.self = [obj, obj];

    assert.deepEqual(
      stringify(obj, null, 2),
      jsonify({
        name: 'Alice',
        self: ['[Circular ~]', '[Circular ~]']
      })
    );
  });

  it('must stringify circular objects deeper in an array', function() {
    var obj = {name: 'Alice', children: [{name: 'Bob'}, {name: 'Eve'}]};
    obj.children[0].self = obj.children[0];
    obj.children[1].self = obj.children[1];

    assert.deepEqual(
      stringify(obj, null, 2),
      jsonify({
        name: 'Alice',
        children: [
          {name: 'Bob', self: '[Circular ~.children.0]'},
          {name: 'Eve', self: '[Circular ~.children.1]'}
        ]
      })
    );
  });

  it('must stringify circular arrays', function() {
    var obj = [];
    obj.push(obj);
    obj.push(obj);
    var json = stringify(obj, null, 2);
    assert.deepEqual(json, jsonify(['[Circular ~]', '[Circular ~]']));
  });

  it('must stringify circular arrays with intermediaries', function() {
    var obj = [];
    obj.push({name: 'Alice', self: obj});
    obj.push({name: 'Bob', self: obj});

    assert.deepEqual(
      stringify(obj, null, 2),
      jsonify([
        {name: 'Alice', self: '[Circular ~]'},
        {name: 'Bob', self: '[Circular ~]'}
      ])
    );
  });

  it('must stringify repeated objects in objects', function() {
    var obj = {};
    var alice = {name: 'Alice'};
    obj.alice1 = alice;
    obj.alice2 = alice;

    assert.deepEqual(
      stringify(obj, null, 2),
      jsonify({
        alice1: {name: 'Alice'},
        alice2: {name: 'Alice'}
      })
    );
  });

  it('must stringify repeated objects in arrays', function() {
    var alice = {name: 'Alice'};
    var obj = [alice, alice];
    var json = stringify(obj, null, 2);
    assert.deepEqual(json, jsonify([{name: 'Alice'}, {name: 'Alice'}]));
  });

  it('must call given decycler and use its output', function() {
    var obj = {};
    obj.a = obj;
    obj.b = obj;

    var decycle = Sinon.spy(function() {
      return decycle.callCount;
    });
    var json = stringify(obj, null, 2, decycle);
    assert.deepEqual(json, jsonify({a: 1, b: 2}, null, 2));

    assert.strictEqual(decycle.callCount, 2);
    assert.strictEqual(decycle.thisValues[0], obj);
    assert.strictEqual(decycle.args[0][0], 'a');
    assert.strictEqual(decycle.args[0][1], obj);
    assert.strictEqual(decycle.thisValues[1], obj);
    assert.strictEqual(decycle.args[1][0], 'b');
    assert.strictEqual(decycle.args[1][1], obj);
  });

  it('must call replacer and use its output', function() {
    var obj = {name: 'Alice', child: {name: 'Bob'}};

    var replacer = Sinon.spy(bangString);
    var json = stringify(obj, replacer, 2);
    assert.deepEqual(json, jsonify({name: 'Alice!', child: {name: 'Bob!'}}));

    assert.strictEqual(replacer.callCount, 4);
    assert.strictEqual(replacer.args[0][0], '');
    assert.strictEqual(replacer.args[0][1], obj);
    assert.strictEqual(replacer.thisValues[1], obj);
    assert.strictEqual(replacer.args[1][0], 'name');
    assert.strictEqual(replacer.args[1][1], 'Alice');
    assert.strictEqual(replacer.thisValues[2], obj);
    assert.strictEqual(replacer.args[2][0], 'child');
    assert.strictEqual(replacer.args[2][1], obj.child);
    assert.strictEqual(replacer.thisValues[3], obj.child);
    assert.strictEqual(replacer.args[3][0], 'name');
    assert.strictEqual(replacer.args[3][1], 'Bob');
  });

  it('must call replacer after describing circular references', function() {
    var obj = {name: 'Alice'};
    obj.self = obj;

    var replacer = Sinon.spy(bangString);
    var json = stringify(obj, replacer, 2);
    assert.deepEqual(json, jsonify({name: 'Alice!', self: '[Circular ~]!'}));

    assert.strictEqual(replacer.callCount, 3);
    assert.strictEqual(replacer.args[0][0], '');
    assert.strictEqual(replacer.args[0][1], obj);
    assert.strictEqual(replacer.thisValues[1], obj);
    assert.strictEqual(replacer.args[1][0], 'name');
    assert.strictEqual(replacer.args[1][1], 'Alice');
    assert.strictEqual(replacer.thisValues[2], obj);
    assert.strictEqual(replacer.args[2][0], 'self');
    assert.strictEqual(replacer.args[2][1], '[Circular ~]');
  });

  it('must call given decycler and use its output for nested objects', function() {
    var obj = {};
    obj.a = obj;
    obj.b = {self: obj};

    var decycle = Sinon.spy(function() {
      return decycle.callCount;
    });
    var json = stringify(obj, null, 2, decycle);
    assert.deepEqual(json, jsonify({a: 1, b: {self: 2}}));

    assert.strictEqual(decycle.callCount, 2);
    assert.strictEqual(decycle.args[0][0], 'a');
    assert.strictEqual(decycle.args[0][1], obj);
    assert.strictEqual(decycle.args[1][0], 'self');
    assert.strictEqual(decycle.args[1][1], obj);
  });

  it("must use decycler's output when it returned null", function() {
    var obj = {a: 'b'};
    obj.self = obj;
    obj.selves = [obj, obj];

    function decycle() {
      return null;
    }
    assert.deepEqual(
      stringify(obj, null, 2, decycle),
      jsonify({
        a: 'b',
        self: null,
        selves: [null, null]
      })
    );
  });

  it("must use decycler's output when it returned undefined", function() {
    var obj = {a: 'b'};
    obj.self = obj;
    obj.selves = [obj, obj];

    function decycle() {}
    assert.deepEqual(
      stringify(obj, null, 2, decycle),
      jsonify({
        a: 'b',
        selves: [null, null]
      })
    );
  });

  it('must throw given a decycler that returns a cycle', function() {
    var obj = {};
    obj.self = obj;
    var err;
    function identity(key, value) {
      return value;
    }
    try {
      stringify(obj, null, 2, identity);
    } catch (ex) {
      err = ex;
    }
    assert.ok(err instanceof TypeError);
  });

  it('must stringify error objects, including extra properties', function() {
    var obj = new Error('Wubba Lubba Dub Dub');
    obj.reason = new TypeError("I'm pickle Riiick!");
    obj.extra = 'some extra prop';

    // Stack is inconsistent across browsers, so override it and just make sure its stringified
    obj.stack = 'x';
    obj.reason.stack = 'x';

    // IE 10/11
    delete obj.description;
    delete obj.reason.description;

    // Safari doesn't allow deleting those properties from error object, yet only it provides them
    var result = stringify(obj, null, 2)
      .replace(/ +"(line|column|sourceURL)": .+,?\n/g, '')
      .replace(/,\n( +)}/g, '\n$1}'); // make sure to strip trailing commas as well

    assert.equal(
      result,
      jsonify({
        stack: 'x',
        message: 'Wubba Lubba Dub Dub',
        name: 'Error',
        reason: {
          stack: 'x',
          message: "I'm pickle Riiick!",
          name: 'TypeError'
        },
        extra: 'some extra prop'
      })
    );
  });

  it('must stringify error objects with circular references', function() {
    var obj = new Error('Wubba Lubba Dub Dub');
    obj.reason = obj;

    // Stack is inconsistent across browsers, so override it and just make sure its stringified
    obj.stack = 'x';
    obj.reason.stack = 'x';

    // IE 10/11
    delete obj.description;

    // Safari doesn't allow deleting those properties from error object, yet only it provides them
    var result = stringify(obj, null, 2)
      .replace(/ +"(line|column|sourceURL)": .+,?\n/g, '')
      .replace(/,\n( +)}/g, '\n$1}'); // make sure to strip trailing commas as well

    assert.equal(
      result,
      jsonify({
        stack: 'x',
        message: 'Wubba Lubba Dub Dub',
        name: 'Error',
        reason: '[Circular ~]'
      })
    );
  });

  describe('.getSerialize', function() {
    it('must stringify circular objects', function() {
      var obj = {a: 'b'};
      obj.circularRef = obj;
      obj.list = [obj, obj];

      var json = JSON.stringify(obj, stringify.getSerialize(), 2);
      assert.deepEqual(
        json,
        jsonify({
          a: 'b',
          circularRef: '[Circular ~]',
          list: ['[Circular ~]', '[Circular ~]']
        })
      );
    });

    // This is the behavior as of Mar 3, 2015.
    // The serializer function keeps state inside the returned function and
    // so far I'm not sure how to not do that. JSON.stringify's replacer is not
    // called _after_ serialization.
    xit('must return a function that could be called twice', function() {
      var obj = {name: 'Alice'};
      obj.self = obj;

      var json;
      var serializer = stringify.getSerialize();

      json = JSON.stringify(obj, serializer, 2);
      assert.deepEqual(json, jsonify({name: 'Alice', self: '[Circular ~]'}));

      json = JSON.stringify(obj, serializer, 2);
      assert.deepEqual(json, jsonify({name: 'Alice', self: '[Circular ~]'}));
    });
  });
});

function bangString(key, value) {
  return typeof value == 'string' ? value + '!' : value;
}
