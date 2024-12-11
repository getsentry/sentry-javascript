import { spawnSync } from 'child_process';
import { join } from 'path';
import { conditionalTest } from '../../../utils';
import { cleanupChildProcesses } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

conditionalTest({ min: 18 })('import-in-the-middle', () => {
  test('should only instrument modules that we have instrumentation for', () => {
    const result = spawnSync('node', [join(__dirname, 'app.mjs')], { encoding: 'utf-8' });
    expect(result.stderr).not.toMatch('should be the only hooked modules but we just hooked');
  });
});
