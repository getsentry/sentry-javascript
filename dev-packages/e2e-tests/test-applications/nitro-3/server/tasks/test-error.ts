import { defineTask } from 'nitro/task';

export default defineTask({
  meta: { name: 'test-error' },
  run: () => {
    throw new Error('This is a task error');
  },
});
