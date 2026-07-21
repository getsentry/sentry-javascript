import type { InstrumentationConfig, InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';
import { InstrumentationBase } from '@opentelemetry/instrumentation';
import { SDK_VERSION } from '@sentry/core';
import { patchFirestore } from './patches/firestore';
import { patchFunctions } from './patches/functions';

const firestoreSupportedVersions = ['>=3.0.0 <5']; // firebase 9+
const functionsSupportedVersions = ['>=6.0.0 <7']; // firebase-functions v2

/**
 * Instrumentation for Firebase services, specifically Firestore.
 */
export class FirebaseInstrumentation extends InstrumentationBase<InstrumentationConfig> {
  public constructor(config: InstrumentationConfig = {}) {
    super('@sentry/instrumentation-firebase', SDK_VERSION, config);
  }

  /**
   *
   * @protected
   */
  // eslint-disable-next-line @typescript-eslint/naming-convention
  protected init(): InstrumentationNodeModuleDefinition | InstrumentationNodeModuleDefinition[] | void {
    const modules: InstrumentationNodeModuleDefinition[] = [];

    modules.push(patchFirestore(firestoreSupportedVersions, this._wrap, this._unwrap));
    modules.push(patchFunctions(functionsSupportedVersions, this._wrap, this._unwrap));

    return modules;
  }
}
