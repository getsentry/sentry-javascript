import { defineHandler } from 'nitro/h3';
import { runTask } from 'nitro/task';

export default defineHandler(async () => {
  // Catch the error so that only the task instrumentation can report it, not the `error` hook.
  await runTask('test-error').catch(() => undefined);
  return { status: 'ok' };
});
