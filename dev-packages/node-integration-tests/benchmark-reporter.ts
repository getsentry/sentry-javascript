import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Reporter, TestModule } from 'vitest/node';

export default class BenchmarkReporter implements Reporter {
  onTestRunEnd(modules: ReadonlyArray<TestModule>, errors: ReadonlyArray<unknown>, reason: string): void {
    const path = process.env.INTEGRATION_TIMINGS;
    if (!path) return;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      JSON.stringify(
        {
          source: process.env.HEAD_COMMIT,
          node: process.version,
          reason,
          errors: errors.length,
          files: modules.map(module => ({
            project: module.project.name,
            file: module.relativeModuleId,
            durationMs: module.diagnostic().duration,
            collectMs: module.diagnostic().collectDuration,
            state: module.state(),
            tests: [...module.children.allTests()].map(test => ({ name: test.fullName, state: test.result().state })),
          })),
        },
        null,
        2,
      ),
    );
  }
}
