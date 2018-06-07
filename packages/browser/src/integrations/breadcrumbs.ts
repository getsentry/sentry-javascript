import { Integration } from '@sentry/types';
import { Raven } from '../raven';

/** Default Breadcrumbs instrumentations */
export class Breadcrumbs implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = 'Breadcrumbs';
  /**
   * @inheritDoc
   */
  public install(): void {
    Raven._instrumentBreadcrumbs();
  }
}
