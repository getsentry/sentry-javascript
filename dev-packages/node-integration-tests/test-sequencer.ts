import { readFileSync } from 'node:fs';
import { relative, sep } from 'node:path';
import { BaseSequencer, type TestSpecification } from 'vitest/node';

export class DurationSequencer extends BaseSequencer {
  private timings = this.readTimings();
  private known = Object.values(this.timings).sort((a, b) => a - b);
  private fallback = this.known[Math.floor(this.known.length / 2)] ?? 1000;

  private readTimings(): Record<string, number> {
    const snapshots = JSON.parse(readFileSync(new URL('./test-durations.json', import.meta.url), 'utf8')) as Record<
      string,
      Record<string, number>
    >;
    const timings = snapshots[process.versions.node.split('.')[0]];
    if (!timings || Object.values(timings).some(duration => !Number.isFinite(duration) || duration < 0)) {
      throw new Error('Missing or invalid Node integration timing snapshot');
    }
    return timings;
  }

  private key(file: TestSpecification): string {
    return relative(this.ctx.config.root, file.moduleId).split(sep).join('/');
  }

  private duration(file: TestSpecification): number {
    return this.timings[this.key(file)] ?? this.fallback;
  }

  private ordered(files: TestSpecification[]): TestSpecification[] {
    return [...files].sort((a, b) => {
      const aKey = this.key(a);
      const bKey = this.key(b);
      return this.duration(b) - this.duration(a) || (aKey < bKey ? -1 : aKey > bKey ? 1 : 0);
    });
  }

  override async shard(files: TestSpecification[]): Promise<TestSpecification[]> {
    const shard = this.ctx.config.shard;
    if (!shard) return files;
    const shards = Array.from({ length: shard.count }, () => ({
      duration: 0,
      files: [] as TestSpecification[],
    }));
    for (const file of this.ordered(files)) {
      const target = shards.reduce((best, candidate) =>
        candidate.duration < best.duration ||
        (candidate.duration === best.duration && candidate.files.length < best.files.length)
          ? candidate
          : best,
      );
      target.files.push(file);
      target.duration += this.duration(file);
    }
    return shards[shard.index - 1].files;
  }

  override async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    return this.ordered(files);
  }
}
