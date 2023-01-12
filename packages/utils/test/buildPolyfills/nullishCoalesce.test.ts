import { _nullishCoalesce } from '../../src/buildPolyfills';
import type { Value } from '../../src/buildPolyfills/types';
import { _nullishCoalesce as _nullishCoalesceOrig } from './originals';

const dogStr = 'dogs are great!';
const dogFunc = () => dogStr;
const dogAdjectives = { maisey: 'silly', charlie: 'goofy' };
const dogAdjectiveFunc = () => dogAdjectives;

describe('_nullishCoalesce', () => {
  describe('returns the same result as the original', () => {
    const testCases: Array<[string, Value, () => Value, Value]> = [
      ['null LHS', null, dogFunc, dogStr],
      ['undefined LHS', undefined, dogFunc, dogStr],
      ['false LHS', false, dogFunc, false],
      ['zero LHS', 0, dogFunc, 0],
      ['empty string LHS', '', dogFunc, ''],
      ['true LHS', true, dogFunc, true],
      ['truthy primitive LHS', 12312012, dogFunc, 12312012],
      ['truthy object LHS', dogAdjectives, dogFunc, dogAdjectives],
      ['truthy function LHS', dogAdjectiveFunc, dogFunc, dogAdjectiveFunc],
    ];

    it.each(testCases)('%s', (_, lhs, rhs, expectedValue) => {
      expect(_nullishCoalesce(lhs, rhs)).toEqual(_nullishCoalesceOrig(lhs, rhs));
      expect(_nullishCoalesce(lhs, rhs)).toEqual(expectedValue);
    });
  });
});
