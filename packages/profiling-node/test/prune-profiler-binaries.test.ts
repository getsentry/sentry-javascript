import { spawnSync } from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('prune-profiler-binaries', () => {
  it('should check if the node version is valid', () => {
    const currentNode = process.version.split('v')[1];
    const result = spawnSync(
      'node',
      [
        path.join(__dirname, '../scripts/prune-profiler-binaries.js'),
        '--target_platform=linux',
        '--target_arch=x64',
        '--target_stdlib=glibc',
        `--target_dir_path=${os.tmpdir()}`,
        `--target_node=${currentNode}`,
      ],
      { encoding: 'utf8' },
    );

    expect(result.stdout).not.toContain('Invalid node version passed as argument');
  });
});
