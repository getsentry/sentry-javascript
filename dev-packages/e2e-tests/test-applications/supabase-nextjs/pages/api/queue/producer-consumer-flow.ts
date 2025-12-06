import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';

// These are the default development keys for a local Supabase instance
const NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
const SUPABASE_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const supabaseClient = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  db: {
    schema: 'pgmq_public',
  },
});

Sentry.instrumentSupabaseClient(supabaseClient);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Step 1: Produce a message to the queue
  const { data: sendData, error: sendError } = await supabaseClient.rpc('send', {
    queue_name: 'e2e-flow-queue',
    message: {
      action: 'process_order',
      orderId: 'ORDER-123',
      timestamp: new Date().toISOString(),
    },
  });

  if (sendError) {
    return res.status(500).json({ error: `Send failed: ${sendError.message}` });
  }

  // Step 2: Consume the message from the queue (with VT=30 seconds)
  const { data: receiveData, error: receiveError } = await supabaseClient.rpc('receive', {
    queue_name: 'e2e-flow-queue',
    vt: 30,
    qty: 1,
  });

  if (receiveError) {
    return res.status(500).json({ error: `Receive failed: ${receiveError.message}` });
  }

  // Step 3: Process the message (simulate business logic)
  const processedMessage = receiveData?.[0];

  // Step 4: Archive the message after successful processing
  if (processedMessage?.msg_id) {
    const { error: archiveError } = await supabaseClient.rpc('archive', {
      queue_name: 'e2e-flow-queue',
      msg_ids: [processedMessage.msg_id],
    });

    if (archiveError) {
      return res.status(500).json({ error: `Archive failed: ${archiveError.message}` });
    }
  }

  return res.status(200).json({
    success: true,
    produced: { messageId: sendData },
    consumed: {
      messageId: processedMessage?.msg_id,
      message: processedMessage?.message,
    },
  });
}
