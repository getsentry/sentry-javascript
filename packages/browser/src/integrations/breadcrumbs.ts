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
    // tslint:disable-next-line:no-unsafe-any
    Raven._instrumentBreadcrumbs();
  }
  /**
   * @inheritDoc
   */
  public uninstall(): void {
    // tslint:disable-next-line:no-unsafe-any
    Raven._restoreBuiltIns();
    // tslint:disable-next-line:no-unsafe-any
    Raven._restoreConsole();
  }
}
