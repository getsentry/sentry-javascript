import { test as setup } from '@playwright/test';
import { recreateEventsDir } from './utils';

setup('remove left-overs from #tests/events directory', async () => {
  // We are not cleaning up after the testrun by design:
  // we are leaving the events from the test behind to be able
  // to inspect them.
  await recreateEventsDir();
});
