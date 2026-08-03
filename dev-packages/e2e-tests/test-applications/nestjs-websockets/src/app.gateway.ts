import { UseFilters } from '@nestjs/common';
import { MessageBody, SubscribeMessage, WebSocketGateway, WsException } from '@nestjs/websockets';
import * as Sentry from '@sentry/nestjs';
import { SentryGlobalFilter } from '@sentry/nestjs/setup';

@UseFilters(new SentryGlobalFilter())
@WebSocketGateway()
export class AppGateway {
  @SubscribeMessage('test-exception')
  handleTestException() {
    throw new Error('This is an exception in a WebSocket handler');
  }

  @SubscribeMessage('test-ws-exception')
  handleWsException() {
    throw new WsException('Expected WebSocket exception');
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
