import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  isWrapped,
} from '@opentelemetry/instrumentation';
import { SDK_VERSION } from '@sentry/core';
import { patchCatchTarget, patchInjectableTarget } from './wrap-components';
import type { CatchTarget, InjectableTarget, MinimalNestJsExecutionContext } from './types';

const supportedVersions = ['>=8.0.0 <12'];
const COMPONENT = '@nestjs/common';

/**
 * Custom instrumentation for nestjs.
 *
 * This hooks into
 * 1. @Injectable decorator, which is applied on class middleware,
 *    interceptors and guards.
 * 2. @Catch decorator, which is applied on exception filters.
 */
export class SentryNestInstrumentation extends InstrumentationBase {
  public constructor(config: InstrumentationConfig = {}) {
    super('sentry-nestjs', SDK_VERSION, config);
  }

  /**
   * Initializes the instrumentation by defining the modules to be patched.
   */
  public init(): InstrumentationNodeModuleDefinition {
    const moduleDef = new InstrumentationNodeModuleDefinition(COMPONENT, supportedVersions);

    moduleDef.files.push(
      this._getInjectableFileInstrumentation(supportedVersions),
      this._getCatchFileInstrumentation(supportedVersions),
    );
    return moduleDef;
  }

  /**
   * Wraps the @Injectable decorator.
   */
  private _getInjectableFileInstrumentation(versions: string[]): InstrumentationNodeModuleFile {
    return new InstrumentationNodeModuleFile(
      '@nestjs/common/decorators/core/injectable.decorator.js',
      versions,
      (moduleExports: { Injectable: InjectableTarget }) => {
        if (isWrapped(moduleExports.Injectable)) {
          this._unwrap(moduleExports, 'Injectable');
        }
        this._wrap(moduleExports, 'Injectable', this._createWrapInjectable());
        return moduleExports;
      },
      (moduleExports: { Injectable: InjectableTarget }) => {
        this._unwrap(moduleExports, 'Injectable');
      },
    );
  }

  /**
   * Wraps the @Catch decorator.
   */
  private _getCatchFileInstrumentation(versions: string[]): InstrumentationNodeModuleFile {
    return new InstrumentationNodeModuleFile(
      '@nestjs/common/decorators/core/catch.decorator.js',
      versions,
      (moduleExports: { Catch: CatchTarget }) => {
        if (isWrapped(moduleExports.Catch)) {
          this._unwrap(moduleExports, 'Catch');
        }
        this._wrap(moduleExports, 'Catch', this._createWrapCatch());
        return moduleExports;
      },
      (moduleExports: { Catch: CatchTarget }) => {
        this._unwrap(moduleExports, 'Catch');
      },
    );
  }

  /**
   * Creates a wrapper function for the @Injectable decorator. It patches the
   * decorated class (via `patchInjectableTarget`) and delegates to the
   * original decorator.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _createWrapInjectable(): (original: any) => (options?: unknown) => (target: InjectableTarget) => any {
    const seenContexts = new WeakSet<MinimalNestJsExecutionContext>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return function wrapInjectable(original: any) {
      return function wrappedInjectable(options?: unknown) {
        return function (target: InjectableTarget) {
          patchInjectableTarget(target, seenContexts);
          return original(options)(target);
        };
      };
    };
  }

  /**
   * Creates a wrapper function for the @Catch decorator. Used to instrument
   * exception filters.
   */
  private _createWrapCatch() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return function wrapCatch(original: any) {
      return function wrappedCatch(...exceptions: unknown[]) {
        return function (target: CatchTarget) {
          patchCatchTarget(target);
          return original(...exceptions)(target);
        };
      };
    };
  }
}
