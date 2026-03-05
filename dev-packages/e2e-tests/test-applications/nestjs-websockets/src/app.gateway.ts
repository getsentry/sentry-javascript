import { ParseIntPipe, UseGuards, UseInterceptors, UsePipes } from '@nestjs/common';
import { SubscribeMessage, WebSocketGateway, MessageBody } from '@nestjs/websockets';
import * as Sentry from '@sentry/nestjs';
import { ExampleGuard } from './example.guard';
import { ExampleInterceptor } from './example.interceptor';

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

  @SubscribeMessage('test-guard-instrumentation')
  @UseGuards(ExampleGuard)
  handleGuardInstrumentation() {
    return { event: 'guard-response', data: { success: true } };
  }

  @SubscribeMessage('test-interceptor-instrumentation')
  @UseInterceptors(ExampleInterceptor)
  handleInterceptorInstrumentation() {
    return { event: 'interceptor-response', data: { success: true } };
  }

  @SubscribeMessage('test-pipe-instrumentation')
  @UsePipes(ParseIntPipe)
  handlePipeInstrumentation(@MessageBody() value: number) {
    return { event: 'pipe-response', data: { value } };
  }

  @SubscribeMessage('test-manual-span')
  handleManualSpan() {
    const result = Sentry.startSpan({ name: 'test-ws-manual-span' }, () => {
      return { success: true };
    });
    return { event: 'manual-span-response', data: result };
  }
}
