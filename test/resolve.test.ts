import { ZalgoPromise } from '../src';

describe('resolve', () => {
    it('creates a resolved promise and gets the value', async () => {
        expect(await ZalgoPromise.resolve('foobar')).toBe('foobar');
    });

    it('chains values through then', async () => {
        const result = await ZalgoPromise.resolve('foobar').then(first => [ first, 'fizzbuzz' ]);

        expect(result).toEqual([ 'foobar', 'fizzbuzz' ]);
    });

    it('resolves an existing promise', async () => {
        expect(await new ZalgoPromise<string>().resolve('foobar')).toBe('foobar');
    });

    it('resolves through the constructor, synchronously or later', async () => {
        expect(await new ZalgoPromise<string>(resolve => resolve('now'))).toBe('now');

        expect(await new ZalgoPromise<string>(resolve => {
            setTimeout(() => resolve('later'), 10);
        })).toBe('later');
    });

    it('runs then handlers synchronously on a settled promise', () => {
        let hasResolved = false;

        ZalgoPromise.resolve().then(() => {
            hasResolved = true;
        });

        expect(hasResolved).toBe(true);
    });

    it('runs handlers synchronously when a pending promise resolves', () => {
        const promise = new ZalgoPromise<number>();
        const seen : Array<number> = [];

        promise.then(value => seen.push(value));
        expect(seen).toEqual([]);

        promise.resolve(1);
        expect(seen).toEqual([ 1 ]);
    });

    it('only resolves once', async () => {
        const promise = ZalgoPromise.resolve('foobar');

        promise.resolve('fizzbuzz');
        promise.resolve('$$%^&*');

        expect(await promise).toBe('foobar');
    });

    it('returns the same promise from resolve of a ZalgoPromise', async () => {
        const inner = ZalgoPromise.resolve('foobar');

        expect(ZalgoPromise.resolve(inner)).toBe(inner);
        expect(await ZalgoPromise.resolve(inner)).toBe('foobar');
    });

    it('adopts a native promise', async () => {
        expect(await ZalgoPromise.resolve(Promise.resolve('native'))).toBe('native');
        await expect(ZalgoPromise.resolve(Promise.reject(new Error(`native no`))).toPromise()).rejects.toThrow(`native no`);
    });

    it('allows returning a promise in then, settled or not', async () => {
        expect(await ZalgoPromise.resolve('a').then(() => ZalgoPromise.resolve('b'))).toBe('b');

        expect(await ZalgoPromise.resolve('a').then(() => new ZalgoPromise<string>(resolve => {
            setTimeout(() => resolve('c'), 10);
        }))).toBe('c');

        expect(await ZalgoPromise.resolve('a').then(() => 'd')).toBe('d');
    });

    it('refuses to resolve with a promise', () => {
        expect(() => new ZalgoPromise(resolve => resolve(ZalgoPromise.resolve('x')))).toThrow('another promise');
        expect(() => new ZalgoPromise<unknown>().resolve(Promise.resolve(1))).toThrow('another promise');
    });

    it('calls finally and keeps the value', async () => {
        let finallyCalled = false;

        const result = await ZalgoPromise.resolve('foobar').finally(() => {
            finallyCalled = true;
        });

        expect(result).toBe('foobar');
        expect(finallyCalled).toBe(true);
    });

    it('lets a then handler attach another handler to the same promise', async () => {
        const promise = ZalgoPromise.resolve('x');
        let inner : string | undefined;

        await promise.then(() => promise.then(value => {
            inner = value;
        }));

        expect(inner).toBe('x');
    });

    it('works with await and with Promise.all', async () => {
        const [ a, b ] = await Promise.all([ ZalgoPromise.resolve(1), ZalgoPromise.resolve(2) ]);

        expect([ a, b ]).toEqual([ 1, 2 ]);
    });

    it('toPromise gives a native promise with the same outcome', async () => {
        const promise = ZalgoPromise.resolve('foobar').toPromise();

        expect(promise).toBeInstanceOf(Promise);
        expect(await promise).toBe('foobar');
    });

    it('timeout rejects a promise that takes too long, and not one that does not', async () => {
        const slow = new ZalgoPromise<string>();

        await expect(slow.timeout(10).toPromise()).rejects.toThrow('timed out after 10ms');

        const quick = new ZalgoPromise<string>(resolve => {
            setTimeout(() => resolve('in time'), 5);
        });

        expect(await quick.timeout(1000)).toBe('in time');

        const settled = ZalgoPromise.resolve('already');

        expect(settled.timeout(1)).toBe(settled);

        const custom = new ZalgoPromise<string>();

        await expect(custom.timeout(5, new Error('custom')).toPromise()).rejects.toThrow('custom');
    });

    it('delay waits', async () => {
        const start = Date.now();

        await ZalgoPromise.delay(20);

        expect(Date.now() - start).toBeGreaterThanOrEqual(15);
    });
});
