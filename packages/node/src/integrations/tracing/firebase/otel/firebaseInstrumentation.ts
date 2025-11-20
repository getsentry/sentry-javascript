import { InstrumentationBase, type InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';
import { SDK_VERSION } from '@sentry/core';
import { patchFirestore } from './patches/firestore';
import { patchFunctions } from './patches/functions';
import type { FirebaseInstrumentationConfig } from './types';

const DefaultFirebaseInstrumentationConfig: FirebaseInstrumentationConfig = {};
const firestoreSupportedVersions = ['>=3.0.0 <5']; // firebase 9+
const functionsSupportedVersions = ['>=6.0.0 <7']; // firebase-functions v2

/**
 * Instrumentation for Firebase services, specifically Firestore.
 */
export class FirebaseInstrumentation extends InstrumentationBase<FirebaseInstrumentationConfig> {
  public constructor(config: FirebaseInstrumentationConfig = DefaultFirebaseInstrumentationConfig) {
    super('@sentry/instrumentation-firebase', SDK_VERSION, config);
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
    modules.push(patchFunctions(this.tracer, functionsSupportedVersions, this._wrap, this._unwrap, this.getConfig()));

    return modules;
  }
}
