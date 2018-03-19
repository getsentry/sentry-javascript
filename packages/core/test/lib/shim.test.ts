import { expect } from 'chai';
import { SentryEvent } from '../../src';
import { popScope, pushScope, withScope } from '../../src/lib/shim';
import { TestBackend } from '../mocks/backend';
import {
  addBreadcrumb,
  captureException,
  create,
  setUserContext,
  TEST_SDK,
  TestFrontend,
} from '../mocks/frontend';

const dsn = 'https://username@domain/path';

describe('Shim', () => {
  beforeAll(() => {
    create({ dsn });
  });

  it('captures an exception', done => {
    pushScope(
      new TestFrontend({
        afterSend: (event: SentryEvent) => {
          expect(event).to.deep.equal({
            exception: [
              {
                type: 'Error',
                value: 'random error',
              },
            ],
            message: 'Error: test exception',
            sdk: TEST_SDK,
          });
          done();
        },
        dsn,
      }),
    );
    captureException(new Error('test exception'));
    popScope();
  });

  it('sets user context', done => {
    pushScope(
      new TestFrontend({
        afterSend: (event: SentryEvent) => {
          expect(event.user).to.deep.equal({
            id: '1234',
          });
          done();
        },
        dsn,
      }),
    );
    setUserContext({ id: '1234' });
    captureException(new Error('test exception'));
    popScope();
  });

  it('adds a breadcrumb', done => {
    pushScope(
      new TestFrontend({
        afterSend: () => {
          expect(TestBackend.instance!.event!.breadcrumbs![0].message).to.equal(
            'world',
          );
          done();
        },
        dsn,
      }),
    );
    addBreadcrumb({ message: 'world' });
    captureException(new Error('test exception'));
    popScope();
  });
});
