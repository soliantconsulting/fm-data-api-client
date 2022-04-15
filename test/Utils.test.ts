import {LocalDate, LocalDateTime, LocalTime} from '@js-joda/core';
import {DateUtil, parseNumber} from '../src/Utils';

describe('Utils', () => {
    describe('parseNumber', () => {
        it('should return as number as is', () => {
            expect(parseNumber(5.3)).toBe(5.3);
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
                expect(parseNumber(input)).toBe(expected);
            },
        );
    });

    describe('DateUtil', () => {
        const dateUtil = new DateUtil();

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
