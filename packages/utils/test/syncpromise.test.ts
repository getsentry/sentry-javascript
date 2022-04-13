import { rejectedSyncPromise, resolvedSyncPromise, SyncPromise } from '../src/syncpromise';

describe('SyncPromise', () => {
  test('simple', async () => {
    expect.assertions(1);

    return new SyncPromise<number>(resolve => {
      resolve(42);
    }).then(val => {
      expect(val).toBe(42);
    });
  });

  test('simple chaining', async () => {
    expect.assertions(1);

    return new SyncPromise<number>(resolve => {
      resolve(42);
    })
      .then(_ => resolvedSyncPromise('a'))
      .then(_ => resolvedSyncPromise(0.1))
      .then(_ => resolvedSyncPromise(false))
      .then(val => {
        expect(val).toBe(false);
      });
  });

  test('compare to regular promise', async () => {
    expect.assertions(2);

    const ap = new Promise<string>(resolve => {
      resolve('1');
    });

    const bp = new Promise<string>(resolve => {
      resolve('2');
    });

    const cp = new Promise<string>(resolve => {
      resolve('3');
    });

    const fp = async (s: PromiseLike<string>, prepend: string) =>
      new Promise<string>(resolve => {
        void s
          .then(val => {
            resolve(prepend + val);
          })
          .then(null, _ => {
            // bla
          });
      });

    const res = await cp
      .then(async val => fp(Promise.resolve('x'), val))
      .then(async val => fp(bp, val))
      .then(async val => fp(ap, val));

    expect(res).toBe('3x21');

    const a = new SyncPromise<string>(resolve => {
      resolve('1');
    });

    const b = new SyncPromise<string>(resolve => {
      resolve('2');
    });

    const c = new SyncPromise<string>(resolve => {
      resolve('3');
    });

    const f = (s: SyncPromise<string>, prepend: string) =>
      new SyncPromise<string>(resolve => {
        void s
          .then(val => {
            resolve(prepend + val);
          })
          .then(null, () => {
            // no-empty
          });
      });

    return (
      c
        // @ts-ignore Argument of type 'PromiseLike<string>' is not assignable to parameter of type 'SyncPromise<string>'
        .then(val => f(resolvedSyncPromise('x'), val))
        .then(val => f(b, val))
        // @ts-ignore Argument of type 'SyncPromise<string>' is not assignable to parameter of type 'string'
        .then(val => f(a, val))
        .then(val => {
          expect(val).toBe(res);
        })
    );
  });

  test('simple static', async () => {
    expect.assertions(1);

    const p = resolvedSyncPromise(10);
    return p.then(val => {
      expect(val).toBe(10);
    });
  });

  test('using new Promise internally', async () => {
    expect.assertions(2);

    return new SyncPromise<number>(done => {
      void new Promise<number>(resolve => {
        expect(true).toBe(true);
        resolve(41);
      })
        .then(done)
        .then(null, _ => {
          //
        });
    }).then(val => {
      expect(val).toEqual(41);
    });
  });

  test('with setTimeout', async () => {
    jest.useFakeTimers();
    expect.assertions(1);

    return new SyncPromise<number>(resolve => {
      setTimeout(() => {
        resolve(12);
      }, 10);
      jest.runAllTimers();
    }).then(val => {
      expect(val).toEqual(12);
    });
  });

  test('calling the callback immediatly', () => {
    expect.assertions(1);

    let foo: number = 1;

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    new SyncPromise<number>(_ => {
      foo = 2;
    });

    expect(foo).toEqual(2);
  });

  test('calling the callback not immediatly', () => {
    jest.useFakeTimers();
    expect.assertions(4);

    const qp = new SyncPromise<number>(resolve =>
      setTimeout(() => {
        resolve(2);
      }),
    );
    void qp
      .then(value => {
        expect(value).toEqual(2);
      })
      .then(null, () => {
        // no-empty
      });
    expect((qp as any)._value).not.toBeDefined();
    void qp
      .then(value => {
        expect(value).toEqual(2);
      })
      .then(null, () => {
        // no-empty
      });
    jest.runAllTimers();
    expect((qp as any)._value).toBeDefined();
  });

  test('multiple then returning undefined', async () => {
    expect.assertions(3);

    return new SyncPromise<number>(resolve => {
      resolve(2);
    })
      .then(result => {
        expect(result).toEqual(2);
      })
      .then(result => {
        expect(result).toBeUndefined();
      })
      .then(result => {
        expect(result).toBeUndefined();
      });
  });

  test('multiple then returning different values', async () => {
    expect.assertions(3);

    return new SyncPromise<number>(resolve => {
      resolve(2);
    })
      .then(result => {
        expect(result).toEqual(2);
        return 3;
      })
      .then(result => {
        expect(result).toEqual(3);
        return 4;
      })
      .then(result => {
        expect(result).toEqual(4);
      });
  });

  test('multiple then returning different SyncPromise', async () => {
    expect.assertions(2);

    return new SyncPromise<number>(resolve => {
      resolve(2);
    })
      .then(result => {
        expect(result).toEqual(2);
        return new SyncPromise<string>(resolve2 => {
          resolve2('yo');
        });
      })
      .then(result => {
        expect(result).toEqual('yo');
      });
  });

  test('reject immediatly and do not call then', async () => {
    expect.assertions(1);

    return new SyncPromise<number>((_, reject) => {
      reject('test');
    })
      .then(_ => {
        expect(true).toBeFalsy();
      })
      .then(null, reason => {
        expect(reason).toBe('test');
      });
  });

  test('reject', async () => {
    expect.assertions(1);

    return new SyncPromise<number>((_, reject) => {
      reject('test');
    }).then(null, reason => {
      expect(reason).toBe('test');
    });
  });

  test('rejecting after first then', async () => {
    expect.assertions(2);

    return new SyncPromise<number>(resolve => {
      resolve(2);
    })
      .then(value => {
        expect(value).toEqual(2);
        return rejectedSyncPromise('wat');
      })
      .then(null, reason => {
        expect(reason).toBe('wat');
      });
  });
});
