import { ReportDialogOptions } from '@sentry/browser';
import { ClientClass } from '@sentry/core';
import { Event, EventHint, Severity } from '@sentry/node';
import { Client, Dsn, Integration, IntegrationClass, Scope } from '@sentry/types';

import { dynamicRequireNextjsModule } from '../utils';
import { NextjsOptions } from './nextjsOptions';

/** Common interface for NextJS clients. */
export interface NextjsClientInterface extends Client<NextjsOptions> {
  /**
   * Uploads a native crash dump (Minidump) to Sentry.
   *
   * @param path The relative or absolute path to the minidump.
   * @param event Optional event payload to attach to the minidump.
   * @param scope Optional The SDK scope used to upload.
   */
  captureMinidump(path: string, event?: Event, scope?: Scope): string | undefined;

  /** Shows the report dialog. */
  showReportDialog(dialogOptions: ReportDialogOptions): void;
}

/** A wrapper around the actual NextJS client. */
export class NextjsClientWrapper implements NextjsClientInterface {
  private readonly _actualClient: NextjsClientInterface;

  constructor(options: NextjsOptions) {
    const clientClass: ClientClass<NextjsClientInterface, NextjsOptions> = dynamicRequireNextjsModule();
    this._actualClient = new clientClass(options);
  }

  /** @inheritdoc */
  public captureMinidump(path: string, event?: Event, scope?: Scope): string | undefined {
    return this._actualClient.captureMinidump(path, event, scope);
  }

  /** @inheritdoc */
  public showReportDialog(dialogOptions: ReportDialogOptions): void {
    return this._actualClient.showReportDialog(dialogOptions);
  }

  /** @inheritdoc */
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  public captureException(exception: any, hint?: EventHint, scope?: Scope): string | undefined {
    return this._actualClient.captureException(exception, hint, scope);
  }

  /** @inheritdoc */
  public captureMessage(message: string, level?: Severity, hint?: EventHint, scope?: Scope): string | undefined {
    return this._actualClient.captureMessage(message, level, hint, scope);
  }

  /** @inheritdoc */
  public captureEvent(event: Event, hint?: EventHint, scope?: Scope): string | undefined {
    return this._actualClient.captureEvent(event, hint, scope);
  }

  /** @inheritdoc */
  public getDsn(): Dsn | undefined {
    return this._actualClient.getDsn();
  }

  /** @inheritdoc */
  public getOptions(): NextjsOptions {
    return this._actualClient.getOptions();
  }

  /** @inheritdoc */
  public close(timeout?: number): PromiseLike<boolean> {
    return this._actualClient.close(timeout);
  }

  /** @inheritdoc */
  public flush(timeout?: number): PromiseLike<boolean> {
    return this._actualClient.flush(timeout);
  }

  /** @inheritdoc */
  public getIntegration<T extends Integration>(integration: IntegrationClass<T>): T | null {
    return this._actualClient.getIntegration(integration);
  }

  /** @inheritdoc */
  public setupIntegrations(): void {
    return this._actualClient.setupIntegrations();
  }
}
