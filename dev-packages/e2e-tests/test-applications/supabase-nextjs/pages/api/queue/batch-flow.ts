import type { NextApiRequest, NextApiResponse } from 'next';
import { getQueueSupabaseClient } from '@/lib/initSupabaseQueue';

const supabaseClient = getQueueSupabaseClient();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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

  const { data: receiveData, error: receiveError } = await supabaseClient.rpc('receive', {
    queue_name: 'batch-flow-queue',
    vt: 30,
    qty: 3,
  });

  if (receiveError) {
    return res.status(500).json({ error: `Receive failed: ${receiveError.message}` });
  }

  const processedMessages = receiveData?.map((msg: Record<string, unknown>) => ({
    messageId: msg.msg_id,
    message: msg.message,
  }));

  const messageIds = receiveData?.map((msg: Record<string, unknown>) => msg.msg_id).filter(Boolean);
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
