import { InstrumentationTypeBreadcrumb } from '../types';
import { handleDom } from './handleDom';
import { handleScope } from './handleScope';

// TODO: Add return type
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/explicit-function-return-type
export function getBreadcrumbHandler(type: InstrumentationTypeBreadcrumb) {
  if (type === 'scope') {
    return handleScope;
  }

  return handleDom;
}
