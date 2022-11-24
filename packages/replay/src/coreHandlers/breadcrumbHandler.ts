import { Breadcrumb, Scope } from '@sentry/types';

import { InstrumentationTypeBreadcrumb } from '../types';
import { DomHandlerData, handleDom } from './handleDom';
import { handleScope } from './handleScope';

export function breadcrumbHandler(type: InstrumentationTypeBreadcrumb, handlerData: unknown): Breadcrumb | null {
  if (type === 'scope') {
    return handleScope(handlerData as Scope);
  }

  return handleDom(handlerData as DomHandlerData);
}
