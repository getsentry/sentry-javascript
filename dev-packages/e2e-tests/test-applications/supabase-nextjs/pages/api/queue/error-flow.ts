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
  // Step 1: Produce a message that will cause processing error
  const { data: sendData, error: sendError } = await supabaseClient.rpc('send', {
    queue_name: 'error-flow-queue',
    message: {
      action: 'divide',
      numerator: 100,
      denominator: 0, // This will cause an error
    },
  });

  if (sendError) {
    return res.status(500).json({ error: `Send failed: ${sendError.message}` });
  }

  // Step 2: Consume the message
  const { data: receiveData, error: receiveError } = await supabaseClient.rpc('receive', {
    queue_name: 'error-flow-queue',
    vt: 30,
    qty: 1,
  });

  if (receiveError) {
    return res.status(500).json({ error: `Receive failed: ${receiveError.message}` });
  }

  // Step 3: Process the message - this will throw an error
  const message = receiveData?.[0];

  try {
    if (message?.message?.denominator === 0) {
      throw new Error('Division by zero error in queue processor');
    }

    // Simulate successful processing (won't be reached in this flow)
    const result = message.message.numerator / message.message.denominator;

    return res.status(200).json({
      success: true,
      result,
      messageId: message?.msg_id,
    });
  } catch (error) {
    // Capture the error with Sentry
    Sentry.captureException(error, scope => {
      scope.setContext('queue', {
        queueName: 'error-flow-queue',
        messageId: message?.msg_id,
        message: message?.message,
      });
      return scope;
    });

    // Return error response
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      messageId: message?.msg_id,
    });
  }
}
