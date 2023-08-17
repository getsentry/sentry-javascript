import { dedupePerformanceEntries } from '../../../src/util/dedupePerformanceEntries';
import { PerformanceEntryLcp } from './../../fixtures/performanceEntry/lcp';
import { PerformanceEntryNavigation } from './../../fixtures/performanceEntry/navigation';
import { PerformanceEntryResource } from './../../fixtures/performanceEntry/resource';

function sortByTimeStamp(a: PerformanceEntry, b: PerformanceEntry) {
  return a.startTime - b.startTime;
}

describe('Unit | util | dedupePerformanceEntries', () => {
  it('does nothing with a single entry', function () {
    const entries = [PerformanceEntryNavigation()];
    expect(dedupePerformanceEntries(entries)).toEqual(entries);
  });

  it('dedupes 2 duplicate entries correctly', function () {
    const entries = [PerformanceEntryNavigation(), PerformanceEntryNavigation()];
    expect(dedupePerformanceEntries(entries)).toEqual([entries[0]]);
  });

  it('dedupes multiple+mixed entries from new list', function () {
    const a = PerformanceEntryNavigation({ startTime: 0 });
    const b = PerformanceEntryNavigation({
      startTime: 1,
      name: 'https://foo.bar/',
    });
    const c = PerformanceEntryNavigation({ startTime: 2, type: 'reload' });
    const d = PerformanceEntryResource({ startTime: 1.5 });
    const entries = [a, a, b, b, d, c];
    expect(dedupePerformanceEntries(entries)).toEqual([a, b, d, c]);
  });

  it('selects the latest lcp value given multiple lcps in new list', function () {
    const a = PerformanceEntryResource({ startTime: 0 });
    const b = PerformanceEntryLcp({ startTime: 100, name: 'b' });
    const c = PerformanceEntryLcp({ startTime: 200, name: 'c' });
    const d = PerformanceEntryLcp({ startTime: 5, name: 'd' }); // don't assume they are ordered
    const entries = [a, b, c, d].sort(sortByTimeStamp);
    expect(dedupePerformanceEntries(entries)).toEqual([a, c]);
  });

  it('selects the latest lcp value from new list, given multiple lcps in new list with an existing lcp', function () {
    const a = PerformanceEntryResource({ startTime: 0 });
    const b = PerformanceEntryLcp({ startTime: 100, name: 'b' });
    const c = PerformanceEntryLcp({ startTime: 200, name: 'c' });
    const d = PerformanceEntryLcp({ startTime: 5, name: 'd' }); // don't assume they are ordered
    const entries = [a, b, c, d].sort(sortByTimeStamp);
    expect(dedupePerformanceEntries(entries)).toEqual([a, c]);
  });

  it('selects the existing lcp value given multiple lcps in new list with an existing lcp having the latest startTime', function () {
    const a = PerformanceEntryResource({ startTime: 0 });
    const b = PerformanceEntryLcp({ startTime: 100, name: 'b' });
    const c = PerformanceEntryLcp({ startTime: 200, name: 'c' });
    const d = PerformanceEntryLcp({ startTime: 5, name: 'd' }); // don't assume they are ordered
    const entries = [a, b, c, d].sort(sortByTimeStamp);
    expect(dedupePerformanceEntries(entries)).toEqual([a, c]);
  });
});
