import type { BuildOptions } from 'cugel-scripts/build';

// Syntax is kept at ES2019 so bundlers that predate `??`, `?.` and class
// fields can parse the package without a transpile step of their own.
// eslint-disable-next-line import/no-default-export -- cugel-scripts reads the config's default export
export default {
    build: {
        target: 'es2019'
    } satisfies Omit<BuildOptions, 'root'>
};
