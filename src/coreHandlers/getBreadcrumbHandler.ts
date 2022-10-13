import { InstrumentationTypeBreadcrumb } from '../types';

import { handleDom } from './handleDom';
import { handleScope } from './handleScope';

export function getBreadcrumbHandler(type: InstrumentationTypeBreadcrumb) {
  if (type === 'scope') {
    return handleScope;
  }

  return handleDom;
}
