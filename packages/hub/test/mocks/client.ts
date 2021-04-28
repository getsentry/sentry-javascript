import { Client } from '@sentry/types';

export class TestClient implements Client {
  public setupIntegrations: jest.Mock = jest.fn();
  public captureException: jest.Mock = jest.fn();
  public captureMessage: jest.Mock = jest.fn();
  public captureEvent: jest.Mock = jest.fn();
  public captureSession: jest.Mock = jest.fn();
  public getDsn: jest.Mock = jest.fn();
  public getOptions: jest.Mock = jest.fn();
  public flush: jest.Mock = jest.fn();
  public close: jest.Mock = jest.fn();
  public getIntegration: jest.Mock = jest.fn();
}
