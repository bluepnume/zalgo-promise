import { ZalgoPromise } from '../src';

const rejection = async (promise : ZalgoPromise) : Promise<unknown> => {
    try {
        await promise;
    } catch (err) {
        return err;
    }

    throw new Error('Expected a rejection');
};

describe('reject', () => {
    it('creates a rejected promise and catches the error', async () => {
        const err = await rejection(ZalgoPromise.reject(new Error('SERIOUS_ERROR')).then(() => {
            throw new Error('Success handler should not be called');
        }));

        expect(err).toBeInstanceOf(Error);
        expect((err as Error).message).toBe('SERIOUS_ERROR');
    });

    it('catches in the second argument of then', async () => {
        const seen = await ZalgoPromise.reject(new Error('SERIOUS_ERROR')).then(
            () => 'wrong',
            (err : unknown) => (err as Error).message
        );

        expect(seen).toBe('SERIOUS_ERROR');
    });

    it('rejects an existing promise, through the constructor, later, or by throwing', async () => {
        expect((await rejection(new ZalgoPromise().reject(new Error('a'))) as Error).message).toBe('a');
        expect((await rejection(new ZalgoPromise((_, reject) => reject(new Error('b')))) as Error).message).toBe('b');

        expect((await rejection(new ZalgoPromise((_, reject) => {
            setTimeout(() => reject(new Error('c')), 10);
        })) as Error).message).toBe('c');

        expect((await rejection(new ZalgoPromise(() => {
            throw new Error('d');
        })) as Error).message).toBe('d');
    });

    it('skips every then until a catch, then continues', async () => {
        const result = await ZalgoPromise.reject(new Error('SERIOUS_ERROR'))
            .then(() => 'never')
            .then(() => 'never either')
            .catch((err : unknown) => `${ (err as Error).message } handled`)
            .then(value => `${ value }!`);

        expect(result).toBe('SERIOUS_ERROR handled!');
    });

    it('rejects synchronously', () => {
        let hasRejected = false;

        ZalgoPromise.reject(new Error('Some error')).catch(() => {
            hasRejected = true;
        });

        expect(hasRejected).toBe(true);
    });

    it('only rejects once, and cannot resolve after', async () => {
        const promise = ZalgoPromise.reject<unknown>(new Error('first'));

        promise.reject(new Error('second'));
        promise.resolve(new Error('third'));

        expect(((await rejection(promise)) as Error).message).toBe('first');
    });

    it('refuses to reject with a promise', () => {
        const promise = ZalgoPromise.reject(new Error('x')).lazy();

        expect(() => ZalgoPromise.reject(promise)).toThrow('another promise');
    });

    it('rejects when then returns a rejected promise, settled or not', async () => {
        expect(((await rejection(ZalgoPromise.resolve(`a`).then(() => ZalgoPromise.reject(new Error(`b`))))) as Error).message)
            .toBe('b');

        expect(((await rejection(ZalgoPromise.resolve('a').then(() => new ZalgoPromise((_, reject) => {
            setTimeout(() => reject(new Error('c')), 10);
        })))) as Error).message).toBe('c');
    });

    it('rejects with the latest error thrown along the chain', async () => {
        const err = await rejection(ZalgoPromise.resolve('a')
            .then(() => {
                throw new Error('first');
            })
            .catch(() => {
                throw new Error('second');
            }));

        expect((err as Error).message).toBe('second');
    });

    it.each([
        [ 'undefined', undefined ],
        [ 'null', null ],
        [ 'empty string', '' ],
        [ 'false', false ]
    ])('turns a %s rejection into an Error', async (_, value) => {
        expect(await rejection(ZalgoPromise.reject(value))).toBeInstanceOf(Error);
    });

    it('keeps a truthy non-Error rejection as it is', async () => {
        expect(await rejection(ZalgoPromise.reject('SERIOUS_ERROR'))).toBe('SERIOUS_ERROR');
    });

    it('refuses a non-function handler', () => {
        const promise = ZalgoPromise.resolve('foobar');

        expect(() => promise.then(123 as never)).toThrow(TypeError);
        expect(() => promise.then(null, 123 as never)).toThrow(TypeError);
        expect(() => promise.catch(123 as never)).toThrow(TypeError);
        expect(() => promise.finally(123 as never)).toThrow(TypeError);
        expect(() => ZalgoPromise.try(123 as never)).toThrow(TypeError);
    });

    it('calls finally even when the error is not caught, and keeps the error', async () => {
        let finallyCalled = false;

        const err = await rejection(ZalgoPromise.reject(new Error('SERIOUS_ERROR')).finally(() => {
            finallyCalled = true;
        }));

        expect(finallyCalled).toBe(true);
        expect((err as Error).message).toBe('SERIOUS_ERROR');
    });

    it('an error thrown in finally replaces the outcome', async () => {
        const err = await rejection(ZalgoPromise.resolve('ok').finally(() => {
            throw new Error('from finally');
        }));

        expect((err as Error).message).toBe('from finally');
    });
});

describe('unhandled rejections', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('are reported to handlers and thrown, once per error', () => {
        const seen : Array<unknown> = [];
        const listener = ZalgoPromise.onPossiblyUnhandledException(err => seen.push(err));
        const error = new Error('foobar');

        ZalgoPromise.reject(error);
        ZalgoPromise.reject(error);
        ZalgoPromise.reject(error);

        expect(() => vi.runAllTimers()).toThrow('foobar');
        expect(seen).toEqual([ error ]);

        listener.cancel();
        ZalgoPromise.reject(new Error('after cancel'));
        expect(() => vi.runAllTimers()).toThrow('after cancel');
        expect(seen).toEqual([ error ]);
    });

    it('a primitive reason is reported each time', () => {
        const seen : Array<unknown> = [];
        const listener = ZalgoPromise.onPossiblyUnhandledException(err => seen.push(err));

        ZalgoPromise.reject('plain');
        ZalgoPromise.reject('plain');

        expect(() => vi.runAllTimers()).toThrow();
        expect(seen).toEqual([ 'plain', 'plain' ]);
        listener.cancel();
    });

    it('are not reported for asyncReject, lazy, or once a handler is attached in time', () => {
        const seen : Array<unknown> = [];
        const listener = ZalgoPromise.onPossiblyUnhandledException(err => seen.push(err));

        new ZalgoPromise().asyncReject(new Error('quiet'));
        ZalgoPromise.asyncReject(new Error('quiet too'));
        ZalgoPromise.reject(new Error('lazy')).lazy();

        const promise = new ZalgoPromise();

        promise.reject(new Error('caught soon'));
        promise.catch(() => undefined);

        vi.runAllTimers();
        expect(seen).toEqual([]);
        listener.cancel();
    });

    it('cancel is safe to call twice', () => {
        const listener = ZalgoPromise.onPossiblyUnhandledException(() => undefined);

        listener.cancel();
        listener.cancel();
    });
});
