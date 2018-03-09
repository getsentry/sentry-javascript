import { expect } from 'chai';
import { spy } from 'sinon';
import { Sdk } from '../../src/lib/sdk';
import { TestOptions } from '../mocks/backend';
import { TestFrontend } from '../mocks/frontend';

const PUBLIC_DSN = 'https://username@domain/path';

describe('Sdk', () => {
  let client: Sdk<TestFrontend, TestOptions>;

  type MethodMock = (...args: any[]) => Promise<void>;

  interface MethodDescriptor {
    name: keyof typeof client & keyof TestFrontend;
    args: any[];
  }

  const methods: MethodDescriptor[] = [
    { name: 'captureException', args: [new Error()] },
    { name: 'captureMessage', args: ['test'] },
    { name: 'captureEvent', args: [{ message: 'event' }] },
    { name: 'addBreadcrumb', args: [{ message: 'breadcrumb' }] },
    { name: 'setOptions', args: [{ test: true }] },
    { name: 'getContext', args: [] },
    { name: 'setContext', args: [{ extra: { a: 1 } }] },
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
      it(`performs no action for ${method.name}()`, async () => {
        // should not throw:
        await (client[method.name] as MethodMock)(...method.args);
      });
    }
  });

  describe('with instance', async () => {
    beforeEach(async () => {
      await client.create({});
    });

    for (const method of methods) {
      it(`proxies ${method.name}() to the frontend`, async () => {
        const mock = spy();
        TestFrontend.instance![method.name] = mock;
        await (client[method.name] as MethodMock)(...method.args);
        expect(mock.getCall(0).args).to.deep.equal(method.args);
      });
    }
  });
});
