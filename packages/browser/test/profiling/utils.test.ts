import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BrowserClient } from '../../src/client';
import type { JSSelfProfile } from '../../src/profiling/jsSelfProfiling';
import { createProfileChunkPayload } from '../../src/profiling/utils';
import { getDefaultBrowserClientOptions } from '../helper/browser-client-options';

describe('createProfileChunkPayload', () => {
  let client: BrowserClient;

  beforeEach(() => {
    client = new BrowserClient(getDefaultBrowserClientOptions());
  });

  afterEach(async () => {
    await client.close();
  });

  it('assigns samples without a stack to one empty stack and preserves recorded stacks', () => {
    const input: JSSelfProfile = {
      frames: [{ name: 'sentryWrapped' }, { name: 'startRequest' }],
      stacks: [{ frameId: 0 }, { frameId: 1, parentId: 0 }],
      samples: [{ timestamp: 0 }, { timestamp: 10, stackId: 0 }, { timestamp: 20, stackId: 1 }, { timestamp: 30 }],
      resources: [],
    };

    const { profile } = createProfileChunkPayload(input, client);

    expect(profile.stacks).toEqual([[0], [1, 0], []]);
    expect(profile.samples.map(sample => sample.stack_id)).toEqual([2, 0, 1, 2]);
  });

  it('does not add an empty stack when all samples have stacks', () => {
    const input: JSSelfProfile = {
      frames: [{ name: 'startRequest' }],
      stacks: [{ frameId: 0 }],
      samples: [{ timestamp: 0, stackId: 0 }],
      resources: [],
    };

    const { profile } = createProfileChunkPayload(input, client);

    expect(profile.stacks).toEqual([[0]]);
    expect(profile.samples.map(sample => sample.stack_id)).toEqual([0]);
  });

  it('reuses the empty stack at index zero when no stacks were recorded', () => {
    const input: JSSelfProfile = {
      frames: [],
      stacks: [],
      samples: [{ timestamp: 0 }, { timestamp: 10 }],
      resources: [],
    };

    const { profile } = createProfileChunkPayload(input, client);

    expect(profile.stacks).toEqual([[]]);
    expect(profile.samples.map(sample => sample.stack_id)).toEqual([0, 0]);
  });

  it('places the empty stack after the input stack indices even with trailing holes', () => {
    const input: JSSelfProfile = {
      frames: [{ name: 'startRequest' }],
      stacks: [{ frameId: 0 }],
      samples: [{ timestamp: 0 }, { timestamp: 10, stackId: 0 }],
      resources: [],
    };
    input.stacks.length = 3;

    const { profile } = createProfileChunkPayload(input, client);

    expect(profile.stacks).toHaveLength(4);
    expect(profile.stacks[0]).toEqual([0]);
    expect(profile.stacks[3]).toEqual([]);
    expect(profile.samples.map(sample => sample.stack_id)).toEqual([3, 0]);
  });
});
