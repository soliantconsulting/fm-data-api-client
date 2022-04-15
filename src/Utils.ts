import {DateTimeFormatter, LocalDate, LocalDateTime, LocalTime} from '@js-joda/core';
import type {Numerish} from './Layout';

/**
 * Quotes a string for use in queries.
 */
export const quote = (value : string) : string => value.replace(/([\\=!<≤>≥…?@#*"~]|\/\/)/g, '\\$1');

/**
 * Parses a FileMaker value as a number.
 *
 * This utility function works the same way as FileMaker when it comes to interpret string values as numbers. An empty
 * string will be interpreted as <pre>null</pre>.
 */
export const parseNumber = (value : Numerish) : number | null => {
    if (typeof value === 'number') {
        return value;
    }

    value = value.replace(
        /^[^\d\-.]*(-?)([^.]*)(\.?)(.*)$/g,
        (substring, ...args) => `${args[0] as string}${(args[1] as string).replace(/[^\d]+/g, '')}`
            + `${args[2] as string}${(args[3] as string).replace(/[^\d]+/g, '')}`
    );

    if (value === '') {
        return null;
    }

    if (value === '-') {
        return 0;
    }

    if (value.startsWith('.')) {
        value = `0${value}`;
    }

    return parseFloat(value);
};

/**
 * Parses a FileMaker value as a boolean.
 *
 * This function will interpret any non-zero and non-empty value as true.
 */
export const parseBoolean = (value : Numerish) : boolean => {
    if (typeof value === 'number') {
        return value !== 0;
    }

    return value !== '0' && value !== '';
};

/**
 * Date utility for working with dates, times and time stamps.
 */
export class DateUtil {
    private readonly dateFormatter : DateTimeFormatter;
    private readonly timeFormatter : DateTimeFormatter;
    private readonly timeStampFormatter : DateTimeFormatter;

    public constructor(dateFormat = 'MM/dd/yyyy', timeFormat = 'HH:mm:ss', timeStampFormat = 'MM/dd/yyyy HH:mm:ss') {
        this.dateFormatter = DateTimeFormatter.ofPattern(dateFormat);
        this.timeFormatter = DateTimeFormatter.ofPattern(timeFormat);
        this.timeStampFormatter = DateTimeFormatter.ofPattern(timeStampFormat);
    }

    public parseDate(value : string) : LocalDate {
        return LocalDate.parse(value, this.dateFormatter);
    }

    public parseTime(value : string) : LocalTime {
        return LocalTime.parse(value, this.timeFormatter);
    }

    public parseTimeStamp(value : string) : LocalDateTime {
        return LocalDateTime.parse(value, this.timeStampFormatter);
    }

    public formatDate(value : LocalDate) : string {
        return value.format(this.dateFormatter);
    }

    public formatTime(value : LocalTime) : string {
        return value.format(this.timeFormatter);
    }

    public formatTimeStamp(value : LocalDateTime) : string {
        return value.format(this.timeStampFormatter);
    }
}
