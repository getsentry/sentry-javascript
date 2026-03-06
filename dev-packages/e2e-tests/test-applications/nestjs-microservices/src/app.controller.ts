import { Controller, Get, Inject, Param } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { flush } from '@sentry/nestjs';
import { firstValueFrom } from 'rxjs';

@Controller()
export class AppController {
  constructor(@Inject('MATH_SERVICE') private readonly client: ClientProxy) {}

  @Get('test-transaction')
  testTransaction() {
    return { message: 'hello' };
  }

  @Get('test-microservice-sum')
  async testMicroserviceSum() {
    const result = await firstValueFrom(this.client.send({ cmd: 'sum' }, { numbers: [1, 2, 3] }));
    return { result };
  }

  @Get('test-microservice-exception/:id')
  async testMicroserviceException(@Param('id') id: string) {
    return firstValueFrom(this.client.send({ cmd: 'exception' }, { id }));
  }

  @Get('test-microservice-manual-capture')
  async testMicroserviceManualCapture() {
    return firstValueFrom(this.client.send({ cmd: 'manual-capture' }, {}));
  }

  @Get('test-microservice-guard')
  async testMicroserviceGuard() {
    return firstValueFrom(this.client.send({ cmd: 'test-guard' }, {}));
  }

  @Get('test-microservice-interceptor')
  async testMicroserviceInterceptor() {
    return firstValueFrom(this.client.send({ cmd: 'test-interceptor' }, {}));
  }

  @Get('test-microservice-pipe')
  async testMicroservicePipe() {
    return firstValueFrom(this.client.send({ cmd: 'test-pipe' }, { value: 123 }));
  }

  @Get('flush')
  async flush() {
    await flush();
  }
}
