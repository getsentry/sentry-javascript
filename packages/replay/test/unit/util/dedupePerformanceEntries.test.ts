import { dedupePerformanceEntries } from '../../../src/util/dedupePerformanceEntries';
import { PerformanceEntryLcp } from './../../fixtures/performanceEntry/lcp';
import { PerformanceEntryNavigation } from './../../fixtures/performanceEntry/navigation';
import { PerformanceEntryResource } from './../../fixtures/performanceEntry/resource';

describe('Unit | util | dedupePerformanceEntries', () => {
  it('does nothing with a single entry', function () {
    const entries = [PerformanceEntryNavigation()];
    expect(dedupePerformanceEntries([], entries)).toEqual(entries);
  });

  it('dedupes 2 duplicate entries correctly', function () {
    const entries = [PerformanceEntryNavigation(), PerformanceEntryNavigation()];
    expect(dedupePerformanceEntries([], entries)).toEqual([entries[0]]);
  });

  it('dedupes multiple+mixed entries from new list', function () {
    const a = PerformanceEntryNavigation({ startTime: 0 });
    const b = PerformanceEntryNavigation({
      startTime: 1,
      name: 'https://foo.bar/',
    });
    const c = PerformanceEntryNavigation({ startTime: 2, type: 'reload' });
    const d = PerformanceEntryResource({ startTime: 1.5 });
    const entries = [a, a, b, d, b, c].sort((a, b) => a.startTime - b.startTime);
    expect(dedupePerformanceEntries([], entries)).toEqual([a, b, d, c]);
  });

  it('dedupes from initial list and new list', function () {
    const a = PerformanceEntryNavigation({ startTime: 0 });
    const b = PerformanceEntryNavigation({
      startTime: 1,
      name: 'https://foo.bar/',
    });
    const c = PerformanceEntryNavigation({ startTime: 2, type: 'reload' });
    const d = PerformanceEntryNavigation({ startTime: 1000 });
    const entries = [a, a, b, b, c].sort((a, b) => a.startTime - b.startTime);
    expect(dedupePerformanceEntries([a, d], entries)).toEqual([a, b, c, d]);
  });

  it('selects the latest lcp value given multiple lcps in new list', function () {
    const a = PerformanceEntryResource({ startTime: 0 });
    const b = PerformanceEntryLcp({ startTime: 100, name: 'b' });
    const c = PerformanceEntryLcp({ startTime: 200, name: 'c' });
    const d = PerformanceEntryLcp({ startTime: 5, name: 'd' }); // don't assume they are ordered
    const entries = [a, b, c, d].sort((a, b) => a.startTime - b.startTime);
    expect(dedupePerformanceEntries([], entries)).toEqual([a, c]);
  });

  it('selects the latest lcp value from new list, given multiple lcps in new list with an existing lcp', function () {
    const a = PerformanceEntryResource({ startTime: 0 });
    const b = PerformanceEntryLcp({ startTime: 100, name: 'b' });
    const c = PerformanceEntryLcp({ startTime: 200, name: 'c' });
    const d = PerformanceEntryLcp({ startTime: 5, name: 'd' }); // don't assume they are ordered
    const entries = [b, c, d].sort((a, b) => a.startTime - b.startTime);
    expect(dedupePerformanceEntries([a, d], entries)).toEqual([a, c]);
  });

  it('selects the existing lcp value given multiple lcps in new list with an existing lcp having the latest startTime', function () {
    const a = PerformanceEntryResource({ startTime: 0 });
    const b = PerformanceEntryLcp({ startTime: 100, name: 'b' });
    const c = PerformanceEntryLcp({ startTime: 200, name: 'c' });
    const d = PerformanceEntryLcp({ startTime: 5, name: 'd' }); // don't assume they are ordered
    const entries = [b, d].sort((a, b) => a.startTime - b.startTime);
    expect(dedupePerformanceEntries([a, c], entries)).toEqual([a, c]);
  });

  it('dedupes when the list is the same', () => {
    const a = PerformanceEntryNavigation({ startTime: Number.NEGATIVE_INFINITY });
    expect(dedupePerformanceEntries([a], [a])).toEqual([a]);
  });

  it('does not spin forever in weird edge cases', function () {
    expect(dedupePerformanceEntries([], [])).toEqual([]);

    const randomFrom = (arr: number[]) => arr[Math.floor(Math.random() * arr.length)];
    const randomNumberBetweenInclusive = (min: number, max: number) =>
      Math.floor(Math.random() * (max - min + 1)) + min;

    const starts = [-100, 0, 100, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY, NaN, undefined];
    const entries = [PerformanceEntryLcp, PerformanceEntryNavigation, PerformanceEntryResource];

    for (let i = 0; i < 100; i++) {
      const previousEntries: any[] = [];
      const currEntries: any[] = [];
      for (let j = 0; j < randomNumberBetweenInclusive(0, 10); j++) {
        // @ts-expect-error
        previousEntries.push(randomFrom(entries)({ startTime: randomFrom(starts) }));
      }
      for (let j = 0; j < randomNumberBetweenInclusive(0, 10); j++) {
        // @ts-expect-error
        currEntries.push(randomFrom(entries)({ startTime: randomFrom(starts) }));
      }

      expect(() => dedupePerformanceEntries(previousEntries, currEntries)).not.toThrow();
      expect(() =>
        dedupePerformanceEntries(
          previousEntries.sort((a, b) => a.startTime - b.startTime),
          currEntries.sort((a, b) => a.startTime - b.startTime),
        ),
      ).not.toThrow();
    }
  });
});
