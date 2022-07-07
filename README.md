# FM Data API Client

[![npm version](https://badge.fury.io/js/fm-data-api-client.svg)](https://badge.fury.io/js/fm-data-api-client)
[![Release](https://github.com/soliantconsulting/fm-data-api-client/actions/workflows/release.yml/badge.svg)](https://github.com/soliantconsulting/fm-data-api-client/actions/workflows/release.yml)
[![codecov](https://codecov.io/gh/soliantconsulting/fm-data-api-client/branch/main/graph/badge.svg?token=ID1YAAB9CP)](https://codecov.io/gh/soliantconsulting/fm-data-api-client)

NodeJS client for the FileMaker Data API, written in TypeScript. This library supports all FileMaker 17 features.

## Requirements

 - Node 0.12+
 - @js-joda/core 3.0 or higher

## Connecting to a server

In order to connect to a server, create a new instance of a client:

```typescript
import {Client} from 'fm-data-api-client';

const client = new Client('https://file-maker-server', 'username', 'password', 'database');
```

## Sign out

If you want to manually sign out to release the token, you can call the `clearToken` method:

```typescript
client.clearToken();
```

## Retrieving a layout client

In order to work with layouts, you have to obtain the layout client. There are two ways to do this:

### Untyped layout client

To get an untyped layout client, simply call:

```typescript
const layout = client.layout('layout');
```

All operations on this layout client will result in untyped `any` results, which means that you won't have any
type-safety or auto-completion within your IDE. If you prefer type-safety, have a look at the next section.

### Typed layout client

To create a typed layout client, you first have to define the types of your field- and portal-data:

```typescript
import {Numerish} from 'fm-data-api-client/Layout';

type MyFieldData = {
    name : string;
    createdAt : string;
    quantity : Numerish;
};

type MyPortalData = {
    portalA: {
        'portalA::name' : string;
    };
    portalB: {
        'portalB::name' : string;
    };
};
```

As you can see, field data are just a simple object type, with the value type being either a `string` or the special
`Numerish` type (which internally is either a `number` or a `string`). The reason for the latter is that FileMaker will
return numbers as a string when they contain special characters, more on that later.

Now that you have defined your types, you can retrieve a typed layout client:

```typescript
const layout = client.layout<MyFieldData, MyPortalData>('layout');
```

If you don't have any portal data, you can either ommit the second generic paramater or define it as an empty object.

## Working with records

Now that you have created a layout client, you can use it to interact with the given layout.

### Create a record

To create a record, all you have to do is to pass the (partial) field data to the create method:

```typescript
const createResult = await layout.create({
    name: 'foobar',
    createdAt: '01/01/2020 15:00:00',
    quantity: 5,
});
```

### Update a record

Updating a record is just as easy as creating one:

```typescript
const updateResult = await layout.update(recordId, {
    name: 'baz',
});
```

### Deleting a record

If you want to delete a record, this is even easier:

```typescript
const deleteResult = await layout.delete(recordId);
```

### Upload a file to a container

Once a record was created, you can upload files to a container field. You can either do this by supplying or path to a
file to upload or by passing in an object with two properties `buffer` and `name`:

```typescript
await layout.upload(file, recordId, fieldName);
```

If the field is repetitive, you can also pass the repetition number als the fourth parameter (defaults to `1`).

### Retrieve a single record

You can retrieve a single record directly via its record id:

```typescript
const record = await layout.get(recordId);
```

### Retrieve a range of records

If you only want to list the entire record set without searching, you can do so by querying for a range of records:

```typescript
const records = await layout.range({
    offset: 0,
    limit: 100,
    sort: {fieldName: 'name', sortOrder: 'ascend'},
});
```

All properties and the first parameter itself are optional.

### Searching for records

If you need to search for specific records, you can do so via the find method:

```typescript
const records = await layout.find({
    query: {name: 'foobar'},
});
```

### Additional parameters

All methods allow you to run scripts with each requests, either preRequests, preSort or after the processing. Please
refer to the FileMaker documentation for details. Unknown parameters will always be passed directly to the data API, so
you can also use any plain parameters defined by the API as well.

## Value conversion

Due to FileMaker's nature, the data API will always return either strings or numbers, depending on the data type and
syntax. The three special cases to consider are numbers, booleans and any form of dates and times.

### Numbers

As numbers can be returned as either `number` or `string` values, special care has to be taken when interpreting them.
If you have full control over the database, you could always assume them to be numbers. Otherwise you should play save
and use the number interpretation utility provided with this library:

```typescript
import {parseNumber} from 'fm-data-api-client';

const realNumber = parseNumber(row.numerishValue);
```

This utility will return the input value when it already is a `number`, otherwise it will apply the same parsing rules
as FileMaker does to the string. And empty value (after parsing) will result in `null` being returned.

### Booleans

As FileMaker has no data concept of booleans, these are represented as number fields. A value of `0` or an empty string
will be interpreted as `false`, while any other value is `true`:

```typescript
import {parseBoolean} from 'fm-data-api-client';

const realBoolean = parseBoolean(row.boolishValue);
```

### Dates and times

Last but not least, there are the special date and time values to consider. In order to parse these, you have to create
a new instance of `DateUtil` first:

```typescript
import {DateUtil} from 'fm-data-api-client';

const dateUtil = new DateUtil();
```

The `DateUtil` constructor takes three optional arguments:

- dateFormat
- timeFormat
- dateTimeFormat

When not defining them, they will default to the US date and time format, which is the default for FileMaker. If the
format deviates, you have to define the correct format through these parameters. Please refer to this documentation for
the possible format patterns:

https://js-joda.github.io/js-joda/manual/formatting.html#format-patterns

Once you created a `DateUtil` instance, you can use it to parse dates and times coming from FileMaker:

```typescript
const localDate = dateUtil.parseDate(row.date);
const localTime = dateUtil.parseTime(row.time);
const localDateTime = dateUtil.parseTime(row.dateTime);
```

Since FileMaker does not provide a timezone with their date-times, the result will always be one of the following:

- `LocalTime` 
- `LocalDate` 
- `LocalDateTime`

If you want to work with absolute date-time values, you have to interpret the given `LocalDateTime` in the correct
timezone:

```typescript
import {ZoneId} from '@js-joda/core';

const dateTime = localDateTime.atZone(ZoneId.of('America/Los_Angeles'));
```

For further information on how to work with those classes, please refer to the
[js-joda documentation](https://js-joda.github.io/js-joda/manual/).
