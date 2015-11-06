/*jshint mocha:true*/
/*global assert:false, console:true*/
'use strict';

var utils = require('../src/utils');
var Raven = require('../src/raven');

var isUndefined = utils.isUndefined;
var isFunction = utils.isFunction;
var isString = utils.isString;
var isObject = utils.isObject;
var isEmptyObject = utils.isEmptyObject;
var isError = utils.isError;
var objectMerge = utils.objectMerge;
var truncate = utils.truncate;

describe('utils', function () {
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
            assert.isTrue(isFunction(function(){}));
            assert.isFalse(isFunction({}));
            assert.isFalse(isFunction(''));
            assert.isFalse(isFunction(undefined));
        });
    });

    describe('isString', function() {
        it('should do as advertised', function() {
            assert.isTrue(isString(''));
            assert.isTrue(isString(String('')));
            assert.isTrue(isString(new String('')));
            assert.isFalse(isString({}));
            assert.isFalse(isString(undefined));
            assert.isFalse(isString(function(){}));
        });
    });

    describe('isObject', function() {
        it('should do as advertised', function() {
            assert.isTrue(isObject({}));
            assert.isTrue(isObject(new Error()))
            assert.isFalse(isObject(''));
        });
    });

    describe('isEmptyObject', function() {
        it('should work as advertised', function() {
            assert.isTrue(isEmptyObject({}));
            assert.isFalse(isEmptyObject({foo: 1}));
        });
    });

    describe('isError', function() {
        it('should work as advertised', function() {
            assert.isTrue(isError(new Error()));
            assert.isTrue(isError(new ReferenceError()));
            assert.isTrue(isError(new Raven._test.RavenConfigError()));
            assert.isFalse(isError({}));
            assert.isFalse(isError(''));
            assert.isFalse(isError(true));
        });
    });

    describe('objectMerge', function() {
        it('should work as advertised', function() {
            assert.deepEqual(objectMerge({}, {}), {});
            assert.deepEqual(objectMerge({a:1}, {b:2}), {a:1, b:2});
            assert.deepEqual(objectMerge({a:1}), {a:1});
        });
    });

    describe('truncate', function() {
        it('should work as advertised', function() {
            assert.equal(truncate('lolol', 3), 'lol\u2026');
            assert.equal(truncate('lolol', 10), 'lolol');
            assert.equal(truncate('lol', 3), 'lol');
        });
    });
});