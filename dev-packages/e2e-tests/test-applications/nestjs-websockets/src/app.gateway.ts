import { SubscribeMessage, WebSocketGateway, MessageBody } from '@nestjs/websockets';
import * as Sentry from '@sentry/nestjs';

@WebSocketGateway()
export class AppGateway {
  @SubscribeMessage('test-exception')
  handleTestException() {
    throw new Error('This is an exception in a WebSocket handler');
  }

  @SubscribeMessage('test-manual-capture')
  handleManualCapture() {
    try {
      throw new Error('Manually captured WebSocket error');
    } catch (e) {
      Sentry.captureException(e);
    }
    return { event: 'capture-response', data: { success: true } };
  }
}
