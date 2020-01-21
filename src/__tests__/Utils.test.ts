import {LocalDate, LocalDateTime, LocalTime} from '@js-joda/core';
import {DateUtil, parseNumber} from '../Utils';

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

const dateUtil = new DateUtil();

test('parseDate', () => {
    expect(dateUtil.parseDate('02/01/2019').toString()).toBe('2019-02-01');
});

test('formatDate', () => {
    expect(dateUtil.formatDate(LocalDate.of(2019, 2, 1)).toString()).toBe('02/01/2019');
});

test('parseTime', () => {
    expect(dateUtil.parseTime('13:15:00').toString()).toBe('13:15');
});

test('formatTime', () => {
    expect(dateUtil.formatTime(LocalTime.of(13, 15, 0)).toString()).toBe('13:15:00');
});

test('parseTimeStamp', () => {
    expect(dateUtil.parseTimeStamp('02/01/2019 13:15:00').toString()).toBe('2019-02-01T13:15');
});

test('formatTimeStamp', () => {
    expect(dateUtil.formatTimeStamp(LocalDateTime.of(2019, 2, 1, 13, 15, 0)).toString()).toBe('02/01/2019 13:15:00');
});
