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
  // Test concurrent queue operations to multiple queues
  // This validates that instrumentation handles parallel operations correctly

  try {
    // Produce messages to 3 different queues concurrently
    const produceOperations = await Promise.all([
      supabaseClient.rpc('send', {
        queue_name: 'concurrent-queue-1',
        message: { queueId: 1, task: 'process-images' },
      }),
      supabaseClient.rpc('send', {
        queue_name: 'concurrent-queue-2',
        message: { queueId: 2, task: 'send-emails' },
      }),
      supabaseClient.rpc('send', {
        queue_name: 'concurrent-queue-3',
        message: { queueId: 3, task: 'generate-reports' },
      }),
    ]);

    // Check for errors
    const produceErrors = produceOperations
      .map((op, idx) => (op.error ? { queue: idx + 1, error: op.error.message } : null))
      .filter(Boolean);

    if (produceErrors.length > 0) {
      return res.status(500).json({ error: 'Some produce operations failed', details: produceErrors });
    }

    // Consume from all queues concurrently
    const consumeOperations = await Promise.all([
      supabaseClient.rpc('receive', {
        queue_name: 'concurrent-queue-1',
        vt: 30,
        qty: 1,
      }),
      supabaseClient.rpc('receive', {
        queue_name: 'concurrent-queue-2',
        vt: 30,
        qty: 1,
      }),
      supabaseClient.rpc('receive', {
        queue_name: 'concurrent-queue-3',
        vt: 30,
        qty: 1,
      }),
    ]);

    // Process results
    const consumeErrors = consumeOperations
      .map((op, idx) => (op.error ? { queue: idx + 1, error: op.error.message } : null))
      .filter(Boolean);

    if (consumeErrors.length > 0) {
      return res.status(500).json({ error: 'Some consume operations failed', details: consumeErrors });
    }

    // Archive all messages concurrently
    const messageIds = consumeOperations.map((op, idx) => ({
      queue: `concurrent-queue-${idx + 1}`,
      msgId: op.data?.[0]?.msg_id,
    }));

    await Promise.all(
      messageIds
        .filter(m => m.msgId)
        .map(m =>
          supabaseClient.rpc('archive', {
            queue_name: m.queue,
            msg_ids: [m.msgId],
          }),
        ),
    );

    return res.status(200).json({
      success: true,
      concurrentOperations: {
        queuesProcessed: 3,
        produced: produceOperations.map(op => op.data),
        consumed: consumeOperations.map((op, idx) => ({
          queue: idx + 1,
          messageId: op.data?.[0]?.msg_id,
          task: op.data?.[0]?.message?.task,
        })),
      },
    });
  } catch (error) {
    Sentry.captureException(error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
