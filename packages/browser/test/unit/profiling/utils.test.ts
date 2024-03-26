import { TextDecoder, TextEncoder } from 'util';
const patchedEncoder = (!global.window.TextEncoder && (global.window.TextEncoder = TextEncoder)) || true;
// @ts-expect-error patch the encoder on the window, else importing JSDOM fails (deleted in afterAll)
const patchedDecoder = (!global.window.TextDecoder && (global.window.TextDecoder = TextDecoder)) || true;

import { JSDOM } from 'jsdom';

import type { JSSelfProfile } from '../../../src/profiling/jsSelfProfiling';
import { convertJSSelfProfileToSampledFormat } from '../../../src/profiling/utils';

const makeJSProfile = (partial: Partial<JSSelfProfile> = {}): JSSelfProfile => {
  return {
    resources: [],
    samples: [],
    stacks: [],
    frames: [],
    ...partial,
  };
};

const globalDocument = global.document;
const globalWindow = global.window;
const globalLocation = global.location;

describe('convertJSSelfProfileToSampledFormat', () => {
  beforeEach(() => {
    const dom = new JSDOM();
    global.document = dom.window.document;
    // @ts-expect-error need to override global document
    global.window = dom.window;
    global.location = dom.window.location;
  });

  // Reset back to previous values
  afterEach(() => {
    global.document = globalDocument;
    global.window = globalWindow;
    global.location = globalLocation;
  });

  afterAll(() => {
    // @ts-expect-error patch the encoder on the window, else importing JSDOM fails
    patchedEncoder && delete global.window.TextEncoder;
    // @ts-expect-error patch the encoder on the window, else importing JSDOM fails
    patchedDecoder && delete global.window.TextDecoder;
  });

  it('gracefully handles empty profiles', () => {
    expect(() =>
      convertJSSelfProfileToSampledFormat(
        makeJSProfile({
          samples: [],
          frames: [],
          stacks: [
            { frameId: 0, parentId: undefined },
            { frameId: 1, parentId: 2 },
            { frameId: 2, parentId: 3 },
          ],
        }),
      ),
    ).not.toThrow();
  });
  it('converts stack to sampled stack', () => {
    const profile = convertJSSelfProfileToSampledFormat(
      makeJSProfile({
        samples: [
          {
            stackId: 0,
            timestamp: 0,
          },
          {
            stackId: 1,
            timestamp: 100,
          },
        ],
        frames: [{ name: 'f0' }, { name: 'f1' }, { name: 'f2' }],
        stacks: [
          { frameId: 0, parentId: undefined },
          { frameId: 1, parentId: 2 },
          { frameId: 2, parentId: 3 },
        ],
      }),
    );

    expect(profile.stacks.length).toBe(2);
    expect(profile.stacks[0]).toEqual([0]);
    expect(profile.stacks[1]).toEqual([1, 2]);
  });

  it('converts sample to sampled profile', () => {
    const profile = convertJSSelfProfileToSampledFormat(
      makeJSProfile({
        samples: [
          {
            stackId: 0,
            timestamp: 0,
          },
          {
            stackId: 1,
            timestamp: 1,
          },
        ],
        frames: [{ name: 'f0' }, { name: 'f1' }, { name: 'f2' }],
        stacks: [
          { frameId: 0, parentId: undefined },
          { frameId: 1, parentId: 2 },
          { frameId: 2, parentId: 3 },
        ],
      }),
    );

    expect(profile.samples[0].stack_id).toBe(0);
    expect(profile.samples[1].stack_id).toBe(1);

    expect(profile.samples[0].elapsed_since_start_ns).toBe('0');
    expect(profile.samples[1].elapsed_since_start_ns).toBe((1 * 1e6).toFixed(0));
  });

  it('assert frames has no holes', () => {
    const profile = convertJSSelfProfileToSampledFormat(
      makeJSProfile({
        samples: [
          {
            stackId: 0,
            timestamp: 0,
          },
          {
            stackId: 1,
            timestamp: 1,
          },
        ],
        frames: [{ name: 'f0' }, { name: 'f1' }, { name: 'f2' }],
        stacks: [
          { frameId: 0, parentId: undefined },
          { frameId: 1, parentId: 2 },
          { frameId: 2, parentId: 3 },
        ],
      }),
    );

    for (const frame of profile.frames) {
      expect(frame).not.toBeUndefined();
    }
  });

  it('handles empty stacks', () => {
    const profile = convertJSSelfProfileToSampledFormat(
      makeJSProfile({
        samples: [
          {
            timestamp: 0,
          },
        ],
        stacks: [],
      }),
    );

    expect(profile.stacks.length).toBe(1);
    expect(profile.stacks[0]).toEqual([]);
  });

  it('reuses empty stack inde', () => {
    const profile = convertJSSelfProfileToSampledFormat(
      makeJSProfile({
        samples: [
          {
            timestamp: 0,
          },
          {
            stackId: 0,
            timestamp: 100,
          },
          {
            timestamp: 200,
          },
        ],
        frames: [{ name: 'f0' }],
        stacks: [{ frameId: 0, parentId: undefined }],
      }),
    );

    expect(profile.stacks.length).toBe(2);
    expect(profile.samples.length).toBe(3);
    expect(profile.samples[0].stack_id).toEqual(profile.samples[2].stack_id);
    expect(profile.stacks[profile.samples[0].stack_id]).toEqual([]);
  });
});
