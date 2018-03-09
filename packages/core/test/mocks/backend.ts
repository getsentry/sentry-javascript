import { Breadcrumb, Context, SentryEvent } from '../../src/lib/domain';
import { Backend, Frontend, Options } from '../../src/lib/interfaces';

export interface TestOptions extends Options {
  test?: boolean;
  mockInstallFailure?: boolean;
}

export class TestBackend implements Backend {
  public static instance?: TestBackend;

  public installed: number;
  public event?: SentryEvent;
  public context?: Context;
  public breadcrumbs: Breadcrumb[] = [];

  public constructor(private readonly frontend: Frontend<TestOptions>) {
    TestBackend.instance = this;
    this.installed = 0;
  }

  public async install(): Promise<boolean> {
    this.installed += 1;
    return !this.frontend.getOptions().mockInstallFailure;
  }

  public async sendEvent(event: SentryEvent): Promise<number> {
    this.event = event;
    return 200;
  }

  public async storeContext(context: Context): Promise<void> {
    this.context = context;
  }

  public async loadContext(): Promise<Context> {
    return this.context || {};
  }

  public async storeBreadcrumbs(breadcrumbs: Breadcrumb[]): Promise<void> {
    this.breadcrumbs = breadcrumbs;
  }

  public async loadBreadcrumbs(): Promise<Breadcrumb[]> {
    return this.breadcrumbs;
  }
}
