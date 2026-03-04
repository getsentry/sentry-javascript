import { SubscribeMessage, WebSocketGateway, MessageBody } from '@nestjs/websockets';
import * as Sentry from '@sentry/nestjs';

@WebSocketGateway({ cors: true })
export class AppGateway {
  @SubscribeMessage('test-message')
  handleTestMessage(@MessageBody() data: { message: string }) {
    return { event: 'test-response', data: { message: data.message } };
  }

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
