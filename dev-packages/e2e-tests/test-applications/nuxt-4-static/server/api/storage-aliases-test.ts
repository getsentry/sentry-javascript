import { useStorage } from '#imports';
import { defineEventHandler } from 'h3';

export default defineEventHandler(async _event => {
  const storage = useStorage('test-storage');

  // Test all alias methods (get, set, del, remove)
  const results: Record<string, unknown> = {};

  // Test set (alias for setItem)
  await storage.set('alias:user', { name: 'Jane Doe', role: 'admin' });
  results.set = 'success';

  // Test get (alias for getItem)
  const user = await storage.get('alias:user');
  results.get = user;

  // Test has (alias for hasItem)
  const hasUser = await storage.has('alias:user');
  results.has = hasUser;

  // Setup for delete tests
  await storage.set('alias:temp1', 'temp1');
  await storage.set('alias:temp2', 'temp2');

  // Test del (alias for removeItem)
  await storage.del('alias:temp1');
  results.del = 'success';

  // Test remove (alias for removeItem)
  await storage.remove('alias:temp2');
  results.remove = 'success';

  // Verify deletions worked
  const hasTemp1 = await storage.has('alias:temp1');
  const hasTemp2 = await storage.has('alias:temp2');
  results.verifyDeletions = !hasTemp1 && !hasTemp2;

  // Clean up
  await storage.clear();

  return {
    success: true,
    results,
  };
});
