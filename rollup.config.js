import typescript from '@rollup/plugin-typescript';
import pkg from './package.json';

export default [
    {
        input: 'src/index.ts',
        external: ['tarn', '@js-joda/core', 'node:fs/promises', 'node:path'],
        output: [
            {file: pkg.main, format: 'cjs', sourcemap: true},
            {file: pkg.module, format: 'es', sourcemap: true},
        ],
        plugins: [
            typescript({tsconfig: './tsconfig.build.json'}),
        ],
    },
];
