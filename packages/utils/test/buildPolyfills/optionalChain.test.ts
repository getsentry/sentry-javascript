import { default as arrayFlat } from 'array.prototype.flat';

import { _optionalChain } from '../../src/buildPolyfills';
import type { GenericFunction, GenericObject, Value } from '../../src/buildPolyfills/types';
import { _optionalChain as _optionalChainOrig } from './originals';

// Older versions of Node don't have `Array.prototype.flat`, which crashes these tests. On newer versions that do have
// it, this is a no-op.
arrayFlat.shim();

type OperationType = 'access' | 'call' | 'optionalAccess' | 'optionalCall';
type OperationExecutor =
  | ((intermediateValue: GenericObject) => Value)
  | ((intermediateValue: GenericFunction) => Value);
type Operation = [OperationType, OperationExecutor];

const truthyObject = { maisey: 'silly', charlie: 'goofy' };
const nullishObject = null;
const truthyFunc = (): GenericObject => truthyObject;
const nullishFunc = undefined;
const truthyReturn = (): GenericObject => truthyObject;
const nullishReturn = (): null => nullishObject;

// The polyfill being tested here works under the assumption that the original code containing the optional chain has
// been transformed into an array of values, labels, and functions. For example, `truthyObject?.charlie` will have been
// transformed into `_optionalChain([truthyObject, 'optionalAccess', _ => _.charlie])`. We are not testing the
// transformation here, only what the polyfill does with the already-transformed inputs.

describe('_optionalChain', () => {
  describe('returns the same result as the original', () => {
    // In these test cases, the array passed to `_optionalChain` has been broken up into the first entry followed by an
    // array of pairs of subsequent elements, because this seemed the easiest way to express the type, which is really
    //
    //     [Value, OperationType, Value => Value, OperationType, Value => Value, OperationType, Value => Value, ...].
    //
    // (In other words, `[A, B, C, D, E]` has become `A, [[B, C], [D, E]]`, and these are then the second and third
    // entries in each test case.) We then undo this wrapping before passing the data to our functions.
    const testCases: Array<[string, Value, Operation[], Value]> = [
      ['truthyObject?.charlie', truthyObject, [['optionalAccess', (_: GenericObject) => _.charlie]], 'goofy'],
      ['nullishObject?.maisey', nullishObject, [['optionalAccess', (_: GenericObject) => _.maisey]], undefined],
      [
        'truthyFunc?.().maisey',
        truthyFunc,
        [
          ['optionalCall', (_: GenericFunction) => _()],
          ['access', (_: GenericObject) => _.maisey],
        ],
        'silly',
      ],
      [
        'nullishFunc?.().charlie',
        nullishFunc,
        [
          ['optionalCall', (_: GenericFunction) => _()],
          ['access', (_: GenericObject) => _.charlie],
        ],
        undefined,
      ],
      [
        'truthyReturn()?.maisey',
        truthyReturn,
        [
          ['call', (_: GenericFunction) => _()],
          ['optionalAccess', (_: GenericObject) => _.maisey],
        ],
        'silly',
      ],
      [
        'nullishReturn()?.charlie',
        nullishReturn,
        [
          ['call', (_: GenericFunction) => _()],
          ['optionalAccess', (_: GenericObject) => _.charlie],
        ],
        undefined,
      ],
    ];

    it.each(testCases)('%s', (_, initialChainComponent, operations, expectedValue) => {
      // `operations` is flattened and spread in order to undo the wrapping done in the test cases for TS purposes.
      expect(_optionalChain([initialChainComponent, ...operations.flat()])).toEqual(
        _optionalChainOrig([initialChainComponent, ...operations.flat()]),
      );
      expect(_optionalChain([initialChainComponent, ...operations.flat()])).toEqual(expectedValue);
    });
  });
});
