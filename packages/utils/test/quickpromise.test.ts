import { QuickPromise } from '../src/quickpromise';

describe('QuickPromise', () => {
  test('with callback', () => {
    expect.assertions(1);

    new QuickPromise<number>(done => done(42)).done(val => {
      expect(val).toEqual(42);
    });
  });

  test('with new Promise', finished => {
    expect.assertions(2);

    new QuickPromise<number>(done => {
      new Promise<number>(resolve => {
        expect(true).toBe(true);
        resolve(41);
      }).then(done);
    }).done(val => {
      expect(val).toEqual(41);
      finished();
    });
  });

  test('with setTimeout', finished => {
    jest.useFakeTimers();
    expect.assertions(1);

    new QuickPromise<number>(done => {
      setTimeout(() => done(41), 10);
      jest.runAllTimers();
    }).done(val => {
      expect(val).toEqual(41);
      finished();
    });
  });

  test('calling the callback immediatly', () => {
    expect.assertions(1);

    let foo: number = 1;

    new QuickPromise<number>(_ => {
      foo = 2;
    });

    expect(foo).toEqual(2);
  });

  test('calling the callback not immediatly', () => {
    jest.useFakeTimers();
    expect.assertions(5);

    const qp = new QuickPromise<number>(done => setTimeout(() => done(2)));
    qp.done(_ => {
      //
    })
      .done(_ => {
        //
      })
      .done(_ => {
        //
      });
    expect((qp as any).callbacks).toHaveLength(3);
    expect(qp).not.toHaveProperty('result');
    qp.done(result => {
      expect(result).toEqual(2);
    });
    expect((qp as any).callbacks).toHaveLength(4);
    jest.runAllTimers();
    expect(qp).toHaveProperty('result');
  });

  test('multi then', () => {
    expect.assertions(3);

    new QuickPromise<number>(done => done(2))
      .done(result => {
        expect(result).toEqual(2);
      })
      .done(result => {
        expect(result).toEqual(2);
      })
      .done(result => {
        expect(result).toEqual(2);
      });
  });
});
