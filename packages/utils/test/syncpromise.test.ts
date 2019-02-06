import { SyncPromise } from '../src/syncpromise';

describe('SyncPromise', () => {
  test('simple', () => {
    expect.assertions(1);

    return new SyncPromise<number>(resolve => {
      resolve(42);
    }).then(val => {
      expect(val).toBe(42);
    });
  });

  test('simple chaining', () => {
    expect.assertions(1);

    return new SyncPromise<number>(resolve => {
      resolve(42);
    })
      .then(_ => SyncPromise.resolve('a'))
      .then(_ => SyncPromise.resolve(0.1))
      .then(_ => SyncPromise.resolve(false))
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

    const fp = async (s: Promise<string>, prepend: string) =>
      new Promise<string>(resolve => {
        s.then(val => {
          resolve(prepend + val);
        }).catch(_ => {
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
        s.then(val => {
          resolve(prepend + val);
        });
      });

    return c
      .then(val => f(SyncPromise.resolve('x'), val))
      .then(val => f(b, val))
      .then(val => f(a, val))
      .then(val => {
        expect(val).toBe(res);
      });
  });

  test('simple static', () => {
    expect.assertions(1);

    const p = SyncPromise.resolve(10);
    return p.then(val => {
      expect(val).toBe(10);
    });
  });

  test('using new Promise internally', () => {
    expect.assertions(2);

    return new SyncPromise<number>(done => {
      new Promise<number>(resolve => {
        expect(true).toBe(true);
        resolve(41);
      })
        .then(done)
        .catch(_ => {
          //
        });
    }).then(val => {
      expect(val).toEqual(41);
    });
  });

  test('with setTimeout', () => {
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
    qp.then(value => {
      expect(value).toEqual(2);
    });
    expect(qp).not.toHaveProperty('value');
    qp.then(value => {
      expect(value).toEqual(2);
    });
    jest.runAllTimers();
    expect(qp).toHaveProperty('value');
  });

  test('multiple then returning undefined', () => {
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

  test('multiple then returning different values', () => {
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

  test('multiple then returning different SyncPromise', () => {
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

  test('reject immediatly and do not call then', () => {
    expect.assertions(1);

    return new SyncPromise<number>((_, reject) => {
      reject('test');
    })
      .then(_ => {
        expect(true).toBeFalsy();
      })
      .catch(reason => {
        expect(reason).toBe('test');
      });
  });

  test('reject', () => {
    expect.assertions(1);

    return new SyncPromise<number>((_, reject) => {
      reject('test');
    }).catch(reason => {
      expect(reason).toBe('test');
    });
  });

  test('rejecting after first then', () => {
    expect.assertions(2);

    return new SyncPromise<number>(resolve => {
      resolve(2);
    })
      .then(value => {
        expect(value).toEqual(2);
        return SyncPromise.reject('wat');
      })
      .catch(reason => {
        expect(reason).toBe('wat');
      });
  });
});
