import { isPromise, ZalgoPromise } from '../src';

describe('all', () => {
    it('resolves with every value, settled promises and plain values alike', async () => {
        const settled = [ ZalgoPromise.resolve(1), ZalgoPromise.resolve(2), ZalgoPromise.resolve(3) ];

        expect(await ZalgoPromise.all(settled)).toEqual([ 1, 2, 3 ]);
        expect(await ZalgoPromise.all([ 1, ZalgoPromise.resolve(2), 3 ])).toEqual([ 1, 2, 3 ]);
        expect(await ZalgoPromise.all([])).toEqual([]);
    });

    it('waits for pending promises, native ones included', async () => {
        const later = new ZalgoPromise<number>(resolve => {
            setTimeout(() => resolve(2), 10);
        });

        expect(await ZalgoPromise.all([ 1, later, Promise.resolve(3) ])).toEqual([ 1, 2, 3 ]);
    });

    it('rejects with the first rejection', async () => {
        await expect(ZalgoPromise.all([
            ZalgoPromise.resolve(1),
            ZalgoPromise.reject(new Error('first')),
            ZalgoPromise.reject(new Error('second'))
        ]).toPromise()).rejects.toThrow('first');
    });

    it('is synchronous when every input is settled', () => {
        let result : ReadonlyArray<number> | undefined;

        ZalgoPromise.all([ ZalgoPromise.resolve(1), 2 ]).then(values => {
            result = values;
        });

        expect(result).toEqual([ 1, 2 ]);
    });
});

describe('hash', () => {
    it('resolves with every value by key', async () => {
        expect(await ZalgoPromise.hash({ one: ZalgoPromise.resolve(1), two: 2, three: Promise.resolve(3) }))
            .toEqual({ one: 1, two: 2, three: 3 });
    });

    it('rejects with the first rejection', async () => {
        await expect(ZalgoPromise.hash({
            one:   ZalgoPromise.resolve(1),
            two:   ZalgoPromise.reject(new Error('first')),
            three: ZalgoPromise.reject(new Error('second'))
        }).toPromise()).rejects.toThrow('first');
    });
});

describe('map', () => {
    it('maps with plain and promise-returning functions', async () => {
        expect(await ZalgoPromise.map([ 1, 2, 3 ], x => x + 1)).toEqual([ 2, 3, 4 ]);
        expect(await ZalgoPromise.map([ 1, 2, 3 ], x => ZalgoPromise.resolve(x + 1))).toEqual([ 2, 3, 4 ]);
    });
});

describe('try', () => {
    it('wraps a return value, a promise, or nothing', async () => {
        expect(await ZalgoPromise.try(() => 'foobar')).toBe('foobar');
        expect(await ZalgoPromise.try(() => ZalgoPromise.resolve('foobar'))).toBe('foobar');
        expect(await ZalgoPromise.try(() => undefined)).toBeUndefined();
        expect(await ZalgoPromise.try(() => ZalgoPromise.try(() => 'inner'))).toBe('inner');
    });

    it('turns a throw into a rejection', async () => {
        await expect(ZalgoPromise.try(() => {
            throw new Error('thrown');
        }).toPromise()).rejects.toThrow('thrown');
    });

    it('passes context and arguments', async () => {
        const sum = function (this : { base : number }, a : number, b : number) : number {
            return this.base + a + b;
        };

        const result = await ZalgoPromise.try(sum, { base: 10 }, [ 1, 2 ]);

        expect(result).toBe(13);
    });

    it('runs the function synchronously', () => {
        let ran = false;

        ZalgoPromise.try(() => {
            ran = true;
        });

        expect(ran).toBe(true);
    });
});

describe('isPromise', () => {
    it('recognises ZalgoPromise, native promises and thenables, and nothing else', () => {
        expect(ZalgoPromise.isPromise(ZalgoPromise.resolve())).toBe(true);
        expect(ZalgoPromise.isPromise(Promise.resolve())).toBe(true);
        expect(ZalgoPromise.isPromise({ then: () => undefined })).toBe(true);
        expect(ZalgoPromise.isPromise({ then: 'nope' })).toBe(false);
        expect(ZalgoPromise.isPromise(null)).toBe(false);
        expect(ZalgoPromise.isPromise(42)).toBe(false);
        expect(ZalgoPromise.isPromise('then')).toBe(false);
        expect(isPromise(() => undefined)).toBe(false);
    });

    it('treats a value whose then getter throws as not a promise', () => {
        const trap = {};

        Object.defineProperty(trap, 'then', {
            get: () => {
                throw new Error('Can not access .then');
            }
        });

        expect(isPromise(trap)).toBe(false);
    });
});
