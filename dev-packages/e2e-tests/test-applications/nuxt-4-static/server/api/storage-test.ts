import { useStorage } from '#imports';
import { defineEventHandler } from 'h3';

export default defineEventHandler(async _event => {
  const storage = useStorage('test-storage');

  // Test all instrumented methods
  const results: Record<string, unknown> = {};

  // Test setItem
  await storage.setItem('user:123', { name: 'John Doe', email: 'john@example.com' });
  results.setItem = 'success';

  // Test setItemRaw
  await storage.setItemRaw('raw:data', Buffer.from('raw data'));
  results.setItemRaw = 'success';

  // Manually set batch items (setItems not supported by memory driver)
  await storage.setItem('batch:1', 'value1');
  await storage.setItem('batch:2', 'value2');

  // Test hasItem
  const hasUser = await storage.hasItem('user:123');
  results.hasItem = hasUser;

  // Test getItem
  const user = await storage.getItem('user:123');
  results.getItem = user;

  // Test getItemRaw
  const rawData = await storage.getItemRaw('raw:data');
  results.getItemRaw = rawData?.toString();

  // Test getKeys
  const keys = await storage.getKeys('batch:');
  results.getKeys = keys;

  // Test removeItem
  await storage.removeItem('batch:1');
  results.removeItem = 'success';

  // Test clear
  await storage.clear();
  results.clear = 'success';

  // Verify clear worked
  const keysAfterClear = await storage.getKeys();
  results.keysAfterClear = keysAfterClear;

  return {
    success: true,
    results,
  };
});
