import {LocalDate, LocalDateTime, LocalTime} from '@js-joda/core';
import {utils} from '../src';

describe('Utils', () => {
    describe('quote', () => {
        it('should quote all special characters', () => {
            expect(utils.quote('\\\\=!<≤>≥…?@#*"~//')).toBe('\\\\\\\\\\=\\!\\<\\≤\\>\\≥\\…\\?\\@\\#\\*\\"\\~\\//');
        });

        it('should not quote standard characters', () => {
            expect(utils.quote('a_ \'[{')).toBe('a_ \'[{');
        });
    });

    describe('parseNumber', () => {
        it('should return as number as is', () => {
            expect(utils.parseNumber(5.3)).toBe(5.3);
        });

        const stringCases : Array<[string, number | null]> = [
            ['', null],
            ['.1', .1],
            ['-', 0],
            ['foo1bar2', 12],
            ['714/715', 714715],
            ['7-14/...71.5', 714.715],
            ['foo-7-14/...71.5', -714.715],
        ];

        test.each(stringCases)(
            'should parse "%s" as %p',
            (input, expected) => {
                expect(utils.parseNumber(input)).toBe(expected);
            },
        );
    });

    describe('parseBoolean', () => {
        const cases : Array<[string | number, boolean]> = [
            [0, false],
            [1, true],
            [-1, true],
            ['', false],
            ['0', false],
            ['1', true],
            ['test', true],
        ];

        test.each(cases)(
            'should parse %p as %p',
            (input, expected) => {
                expect(utils.parseBoolean(input)).toBe(expected);
            },
        );
    });

    describe('DateUtil', () => {
        const dateUtil = new utils.DateUtil();

        it('should successfully parse a date', () => {
            expect(dateUtil.parseDate('02/01/2019').toString()).toBe('2019-02-01');
        });

        it('should format a date in default FileMaker format', () => {
            expect(dateUtil.formatDate(LocalDate.of(2019, 2, 1)).toString()).toBe('02/01/2019');
        });

        it('should successfully parse a time', () => {
            expect(dateUtil.parseTime('13:15:00').toString()).toBe('13:15');
        });

        it('should format a time in default FileMaker format', () => {
            expect(dateUtil.formatTime(LocalTime.of(13, 15, 0)).toString()).toBe('13:15:00');
        });

        it('should successfully parse a timestamp', () => {
            expect(dateUtil.parseTimeStamp('02/01/2019 13:15:00').toString()).toBe('2019-02-01T13:15');
        });

        it('should format a timestamp in default FileMaker format', () => {
            expect(dateUtil.formatTimeStamp(LocalDateTime.of(2019, 2, 1, 13, 15, 0)).toString())
                .toBe('02/01/2019 13:15:00');
        });
    });
});
