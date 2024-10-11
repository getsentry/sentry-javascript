import { InstrumentationBase, type InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';

import { patchFirestore } from './patches/firestore';
import type { FirebaseInstrumentationConfig } from './types';
import { VERSION } from './version';

const DefaultFirebaseInstrumentationConfig: FirebaseInstrumentationConfig = {};
const firestoreSupportedVersions = ['>=3.0.0 <5']; // firebase 9+

/**
 *
 */
export class FirebaseInstrumentation extends InstrumentationBase<FirebaseInstrumentationConfig> {
  public constructor(config: FirebaseInstrumentationConfig = DefaultFirebaseInstrumentationConfig) {
    super('@sentry/instrumentation-firebase', VERSION, config);
  }

  /**
   * sets config
   * @param config
   */
  public override setConfig(config: FirebaseInstrumentationConfig = {}): void {
    super.setConfig({ ...DefaultFirebaseInstrumentationConfig, ...config });
  }

  /**
   *
   * @protected
   */
  // eslint-disable-next-line @typescript-eslint/naming-convention
  protected init(): InstrumentationNodeModuleDefinition | InstrumentationNodeModuleDefinition[] | void {
    const modules: InstrumentationNodeModuleDefinition[] = [];

    modules.push(patchFirestore(this.tracer, firestoreSupportedVersions, this._wrap, this._unwrap, this.getConfig()));

    return modules;
  }
}
