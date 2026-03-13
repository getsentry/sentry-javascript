import { handleCallback } from '../../../../lib/queue';

export const dynamic = 'force-dynamic';

export const POST = handleCallback(async (message, _metadata) => {
  // Simulate some async work
  await new Promise(resolve => setTimeout(resolve, 50));
});
