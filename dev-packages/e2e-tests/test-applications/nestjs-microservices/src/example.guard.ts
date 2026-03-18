import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

@Injectable()
export class ExampleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    return true;
  }
}
