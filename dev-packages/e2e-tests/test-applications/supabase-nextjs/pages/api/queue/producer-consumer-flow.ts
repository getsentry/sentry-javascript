import type { NextApiRequest, NextApiResponse } from 'next';
import { getQueueSupabaseClient } from '@/lib/initSupabaseQueue';

const supabaseClient = getQueueSupabaseClient();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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

  const { data: receiveData, error: receiveError } = await supabaseClient.rpc('receive', {
    queue_name: 'e2e-flow-queue',
    vt: 30,
    qty: 1,
  });

  if (receiveError) {
    return res.status(500).json({ error: `Receive failed: ${receiveError.message}` });
  }

  const processedMessage = receiveData?.[0];

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
