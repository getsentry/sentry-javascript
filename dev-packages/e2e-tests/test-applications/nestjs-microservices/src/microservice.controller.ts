import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import * as Sentry from '@sentry/nestjs';

@Controller()
export class MicroserviceController {
  @MessagePattern({ cmd: 'sum' })
  sum(data: { numbers: number[] }): number {
    return Sentry.startSpan({ name: 'microservice-sum-operation' }, () => {
      return data.numbers.reduce((a, b) => a + b, 0);
    });
  }

  @MessagePattern({ cmd: 'exception' })
  exception(data: { id: string }): never {
    throw new Error(`Microservice exception with id ${data.id}`);
  }

  @MessagePattern({ cmd: 'manual-capture' })
  manualCapture(): { success: boolean } {
    try {
      throw new Error('Manually captured microservice error');
    } catch (e) {
      Sentry.captureException(e);
    }
    return { success: true };
  }
}
