import { expect } from 'chai';
import { spy } from 'sinon';
import { Sdk } from '../../src/lib/sdk';
import { TestOptions } from '../mocks/backend';
import { TestFrontend } from '../mocks/frontend';

const PUBLIC_DSN = 'https://username@domain/path';

describe('Sdk', () => {
  let client: Sdk<TestFrontend, TestOptions>;

  const methods = [
    'captureException',
    'captureMessage',
    'captureEvent',
    'addBreadcrumb',
    'setOptions',
    'getContext',
    'setContext',
  ];

  beforeEach(() => {
    client = new Sdk(TestFrontend);
  });

  describe('create()', () => {
    it('creates and installs a new instance', async () => {
      await client.create({});
      expect(TestFrontend.instance!.installed).to.be.true;
    });

    it('creates and installs multiple times', async () => {
      await client.create({});
      const first = TestFrontend.instance!;
      await client.create({});
      const second = TestFrontend.instance!;

      expect(second.installed).to.be.true;
      expect(first).not.to.equal(second);
    });

    it('passes options to the frontend', async () => {
      await client.create({ dsn: PUBLIC_DSN });
      expect(TestFrontend.instance!.getOptions().dsn).to.equal(PUBLIC_DSN);
    });
  });

  describe('without instance', async () => {
    it('returns a default context', async () => {
      const context = await client.getContext();
      expect(context).to.deep.equal({});
    });

    for (const method of methods) {
      it(`performs no action for ${method}()`, async () => {
        // should not throw:
        await (client[method] as () => Promise<void>)();
      });
    }
  });

  describe('with instance', async () => {
    beforeEach(async () => {
      await client.create({});
    });

    for (const method of methods) {
      it(`proxies ${method}() to the frontend`, async () => {
        const mock = spy();
        TestFrontend.instance![method] = mock;
        await (client[method] as () => Promise<void>)();
        expect(mock.callCount).to.equal(1);
      });
    }
  });
});
