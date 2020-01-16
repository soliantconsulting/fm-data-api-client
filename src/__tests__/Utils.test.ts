import {parseNumber} from '../Utils';

test('parseNumber', () => {
    [
        ['', null],
        ['.1', .1],
        ['-', 0],
        ['foo1bar2', 12],
        ['714/715', 714715],
        ['7-14/...71.5', 714.715],
        ['foo-7-14/...71.5', -714.715],
    ].forEach(([input, expected]) => {
        expect(parseNumber(input as string)).toBe(expected);
    });
});
