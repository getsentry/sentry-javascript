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
  // Step 1: Batch produce multiple messages
  const { data: sendData, error: sendError } = await supabaseClient.rpc('send_batch', {
    queue_name: 'batch-flow-queue',
    messages: [
      {
        taskType: 'email',
        recipient: 'user1@example.com',
        subject: 'Welcome!',
      },
      {
        taskType: 'email',
        recipient: 'user2@example.com',
        subject: 'Verification',
      },
      {
        taskType: 'sms',
        recipient: '+1234567890',
        message: 'Your code is 123456',
      },
    ],
  });

  if (sendError) {
    return res.status(500).json({ error: `Send batch failed: ${sendError.message}` });
  }

  // Step 2: Consume multiple messages from the queue
  const { data: receiveData, error: receiveError } = await supabaseClient.rpc('receive', {
    queue_name: 'batch-flow-queue',
    vt: 30,
    qty: 3,
  });

  if (receiveError) {
    return res.status(500).json({ error: `Receive failed: ${receiveError.message}` });
  }

  // Step 3: Process all messages
  const processedMessages = receiveData?.map((msg: any) => ({
    messageId: msg.msg_id,
    taskType: msg.message?.taskType,
    processed: true,
  }));

  // Step 4: Archive all processed messages
  const messageIds = receiveData?.map((msg: any) => msg.msg_id).filter(Boolean);
  if (messageIds && messageIds.length > 0) {
    const { error: archiveError } = await supabaseClient.rpc('archive', {
      queue_name: 'batch-flow-queue',
      msg_ids: messageIds,
    });

    if (archiveError) {
      return res.status(500).json({ error: `Archive failed: ${archiveError.message}` });
    }
  }

  return res.status(200).json({
    success: true,
    batchSize: 3,
    produced: { messageIds: sendData },
    consumed: {
      count: receiveData?.length || 0,
      messages: processedMessages,
    },
  });
}
