import {DateTime} from 'luxon';

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
export const parseNumber = (value : string | number) : number | null => {
    if (typeof value === 'number') {
        return value;
    }

    value = value.replace(
        /^[^\d\-.]*(-?)([^.]*)(\.?)(.*)$/g,
        (substring, ...args) => `${args[0]}${args[1].replace(/[^\d]+/g, '')}${args[2]}${args[3].replace(/[^\d]+/g, '')}`
    );

    if (value === '') {
        return null;
    }

    if (value === '-') {
        return 0;
    }

    if (value.indexOf('.') === 0) {
        value = `0${value}`;
    }

    return parseFloat(value);
};

/**
 * Parses a FileMaker value as a boolean.
 *
 * This function will interpret any non-zero and non-empty value as true.
 */
export const parseBoolean = (value : string | number) : boolean => {
    if (typeof value === 'number') {
        return value !== 0;
    }

    return value !== '0' && value !== '';
};

/**
 * Date utility for working with dates, times and time stamps.
 */
export class DateUtil
{
    public constructor(
        private timeZone : string,
        private dateFormat = 'MM/dd/yyyy',
        private timeFormat = 'HH:mm:ss',
        private timeStampFormat = 'MM/dd/yyyy HH:mm:ss'
    )
    {
    }

    public parseDate(value : string) : DateTime
    {
        return DateTime.fromFormat(value, this.dateFormat);
    }

    public parseTime(value : string) : DateTime
    {
        return DateTime.fromFormat(value, this.timeFormat);
    }

    public parseTimeStamp(value : string) : DateTime
    {
        return DateTime.fromFormat(value, this.timeFormat, {zone: this.timeZone});
    }

    public formatDate(value : DateTime) : string
    {
        return value.toFormat(this.dateFormat);
    }

    public formatTime(value : DateTime) : string
    {
        return value.toFormat(this.timeFormat);
    }

    public formatTimeStamp(value : DateTime) : string
    {
        return value.toFormat(this.timeStampFormat, {timeZone: this.timeZone});
    }
}
