import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Reporter, TestModule } from 'vitest/node';

export default class TimingReporter implements Reporter {
  onTestRunEnd(modules: ReadonlyArray<TestModule>, errors: ReadonlyArray<unknown>, reason: string): void {
    const path = process.env.NODE_SHARD_TIMINGS;
    if (!path) return;
    const files = Object.fromEntries(
      [...modules]
        .sort((a, b) => a.relativeModuleId.localeCompare(b.relativeModuleId))
        .map(module => {
          const diagnostic = module.diagnostic();
          return [
            module.relativeModuleId,
            {
              durationMs: diagnostic.duration,
              collectMs: diagnostic.collectDuration,
              state: module.state(),
              tests: [...module.children.allTests()].map(test => ({
                id: test.id,
                name: test.fullName,
                state: test.result().state,
              })),
            },
          ];
        }),
    );
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      JSON.stringify(
        {
          node: process.version,
          strategy: process.env.NODE_SHARD_STRATEGY ?? 'hash',
          shard: process.env.BENCHMARK_SHARD,
          source: process.env.BENCHMARK_COMMIT,
          reason,
          errors: errors.length,
          files,
        },
        null,
        2,
      ),
    );
  }
}
