import { Controller, Get, Headers, Param } from '@nestjs/common';
import { AppService1, AppService2 } from './app.service';

@Controller()
export class AppController1 {
  constructor(private readonly appService: AppService1) {}

  @Get('test-success')
  testSuccess() {
    return this.appService.testSuccess();
  }

  @Get('test-param/:param')
  testParam(@Param() params) {
    return this.appService.testParam(params.param);
  }

  @Get('test-inbound-headers/:id')
  testInboundHeaders(@Headers() headers, @Param('id') id: string) {
    return this.appService.testInboundHeaders(headers, id);
  }

  @Get('test-outgoing-http/:id')
  async testOutgoingHttp(@Param('id') id: string) {
    return this.appService.testOutgoingHttp(id);
  }

  @Get('test-outgoing-fetch/:id')
  async testOutgoingFetch(@Param('id') id: string) {
    return this.appService.testOutgoingFetch(id);
  }

  @Get('test-transaction')
  testTransaction() {
    return this.appService.testTransaction();
  }

  @Get('test-error')
  async testError() {
    return this.appService.testError();
  }

  @Get('test-exception/:id')
  async testException(@Param('id') id: string) {
    return this.appService.testException(id);
  }

  @Get('test-outgoing-fetch-external-allowed')
  async testOutgoingFetchExternalAllowed() {
    return this.appService.testOutgoingFetchExternalAllowed();
  }

  @Get('test-outgoing-fetch-external-disallowed')
  async testOutgoingFetchExternalDisallowed() {
    return this.appService.testOutgoingFetchExternalDisallowed();
  }

  @Get('test-outgoing-http-external-allowed')
  async testOutgoingHttpExternalAllowed() {
    return this.appService.testOutgoingHttpExternalAllowed();
  }

  @Get('test-outgoing-http-external-disallowed')
  async testOutgoingHttpExternalDisallowed() {
    return this.appService.testOutgoingHttpExternalDisallowed();
  }
}

@Controller()
export class AppController2 {
  constructor(private readonly appService: AppService2) {}

  @Get('external-allowed')
  externalAllowed(@Headers() headers) {
    return this.appService.externalAllowed(headers);
  }

  @Get('external-disallowed')
  externalDisallowed(@Headers() headers) {
    return this.appService.externalDisallowed(headers);
  }
}
