/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
    preset: 'ts-jest',
    clearMocks: true,
    // clearMocks only resets call data; without this the Date.now() spies in Client.test.ts leak
    // into later tests, where the pool would then compare timestamps taken under different clocks.
    restoreMocks: true,
};
