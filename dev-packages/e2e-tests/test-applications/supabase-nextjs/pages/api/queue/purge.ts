import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// These are the default development keys for a local Supabase instance
const NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
const SUPABASE_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const supabaseClient = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// NOTE: Not instrumenting with Sentry intentionally - this is just a cleanup helper

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Purge all messages from the todos queue by consuming them in a loop
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
