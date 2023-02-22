import { convertJSSelfProfileToSampledFormat } from '../src/utils';
import { JSSelfProfile } from '../src/jsSelfProfiling';

// @ts-ignore
const trace = require('./trace.json');

describe('convertJSSelfProfileToSampledFormat', () => {
  it('converts stack to sampled stack', () => {
    const profile = convertJSSelfProfileToSampledFormat(trace as JSSelfProfile);

    for (const stack of profile.stacks) {
      expect(Array.isArray(stack)).toBe(true);
      expect(stack.every(n => typeof n === 'number')).toBe(true);
    }
  });

  it('converts sample to sampled profile', () => {
    const profile = convertJSSelfProfileToSampledFormat(trace as JSSelfProfile);

    for (const sample of profile.samples) {
      expect(sample.thread_id).toBe('0');
      expect(typeof sample.elapsed_since_start_ns).toBe('string');
      expect(parseInt(sample.elapsed_since_start_ns)).toBeGreaterThan(0);
    }
  });

  it('assert frames has no holes', () => {
    const profile = convertJSSelfProfileToSampledFormat(trace as JSSelfProfile);

    for (const frame of profile.frames) {
      expect(frame).not.toBe(undefined);
    }
  });
});
