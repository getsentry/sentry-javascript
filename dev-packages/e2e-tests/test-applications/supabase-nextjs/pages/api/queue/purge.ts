import type { NextApiRequest, NextApiResponse } from 'next';
import { getUninstrumentedSupabaseClient } from '@/lib/initSupabaseQueue';

// NOTE: Not instrumenting with Sentry intentionally - this is just a cleanup helper
const supabaseClient = getUninstrumentedSupabaseClient();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let purgedCount = 0;
  const maxIterations = 100; // Safety limit

  for (let i = 0; i < maxIterations; i++) {
    const { data, error } = await supabaseClient.schema('pgmq_public').rpc('pop', {
      queue_name: 'todos',
    });

    if (error) {
      return res.status(500).json({ error: error.message, purgedCount });
    }

    // No more messages to pop
    if (!data || (Array.isArray(data) && data.length === 0)) {
      break;
    }

    purgedCount++;
  }

  return res.status(200).json({ purgedCount });
}
