# FM Data API Client

[![npm version](https://badge.fury.io/js/fm-data-api-client.svg)](https://badge.fury.io/js/fm-data-api-client)
[![Release](https://github.com/soliantconsulting/fm-data-api-client/actions/workflows/release.yml/badge.svg)](https://github.com/soliantconsulting/fm-data-api-client/actions/workflows/release.yml)
[![codecov](https://codecov.io/gh/soliantconsulting/fm-data-api-client/branch/main/graph/badge.svg?token=ID1YAAB9CP)](https://codecov.io/gh/soliantconsulting/fm-data-api-client)

NodeJS client for the FileMaker Data API, written in TypeScript. This library supports all FileMaker 17 features.

## Requirements

 - Node 22+
 - @js-joda/core 3.0 or higher

## Upgrading from 3.x to 4.x

Version 4 drops support for Node 18 and 20, and corrects several types that did not match the
Data API specification:

 - **`UpdateParams.modId` is now a `string`** rather than a `number`, matching the Data API. The
   `modId` returned by a previous response can now be passed straight back in. This is the one
   change that can break a call site: a numeric `modId` needs `String(modId)`.
 - `layout.get()`, `layout.update()`, `layout.delete()` and `layout.upload()` accept `recordId`
   as `string | number`. Record IDs are only ever interpolated into the request URL, so both
   forms work, and the `recordId` returned by a response now feeds straight back in without a
   cast. Existing numeric call sites are unaffected.
 - `GetResponse` now includes `dataInfo`, which the server already returns for `get()` and
   `range()`. `dataInfo` also gained the `database`, `layout` and `table` members it always
   carried, alongside the existing counts.
 - `UpdateResponse` gained an optional `newPortalRecordInfo`.

It also changes how sessions are managed. The client now keeps a **pool** of Data API sessions
instead of one shared token, so concurrent calls no longer interleave on a single FileMaker session,
and a burst of concurrent cold calls no longer leaves orphaned sessions on the server:

 - Concurrent calls use up to `max` sessions (default 5), configurable via a new optional fifth
   constructor argument. See [Session pooling](#session-pooling).
 - **New `client.destroy()`** signs out of every session and closes the pool. Call it on shutdown.
   `Client` also implements `Symbol.asyncDispose`, so `await using` works.
 - **New `client.withSession(callback)`** pins several calls to one session, for the cases where
   FileMaker keeps state per session.
 - **`client.clearToken()` is deprecated** in favour of `destroy()`. It still signs out of every
   session held at the time of the call and leaves the client usable, so existing calls keep working.
 - `FileMakerError` is now exported from the package root. Previously there was no supported way to
   get at it for an `instanceof` check.
 - Pool exhaustion rejects with `TimeoutError`, re-exported from the package root.

## Connecting to a server

In order to connect to a server, create a new instance of a client:

```typescript
import {Client} from 'fm-data-api-client';

const client = new Client('https://file-maker-server', 'database', 'username', 'password');
```

A client is meant to be long lived. Create one per process, share it, and shut it down with
`destroy()` - see [Session pooling](#session-pooling) below.

## Session pooling

The client does not hold a single Data API token. It keeps a pool of sessions, and every call checks
one out for its duration and returns it afterwards. FileMaker treats a session as one logical
connection and serialises the work on it, so concurrent callers each get their own session instead of
interleaving on a shared one:

```typescript
// Three sessions, three concurrent Data API calls.
await Promise.all([
    client.layout('orders').find({query: [{status: '=open'}]}),
    client.layout('orders').find({query: [{status: '=shipped'}]}),
    client.layout('customers').range({limit: 100}),
]);
```

Sessions are signed in on demand, reused while they stay warm, and signed out once they have been
idle for `idleTimeoutMillis` - shortly before FileMaker's own 15 minute expiry, so they are released
on the server rather than left to time out. If the server reports an invalid token (error `952`), that
session is retired and the call is retried once on a fresh one.

The pool is configured with an optional fifth constructor argument:

```typescript
const client = new Client('https://file-maker-server', 'database', 'username', 'password', {
    max: 10,
});
```

| Option | Default | Meaning |
| --- | --- | --- |
| `max` | `5` | Maximum concurrent sessions. Each one is a real FileMaker Server connection, so this is the ceiling on Data API concurrency for this client. Calls beyond it queue. |
| `min` | `0` | Sessions to keep on hand. Leave it at `0`: a non-zero value holds sessions open past `idleTimeoutMillis` and keeps a timer alive for the lifetime of the process. It does not pre-warm the pool - sessions are only ever created on demand. |
| `idleTimeoutMillis` | `13 * 60 * 1000` | How long an unused session is kept before it is signed out. |
| `acquireTimeoutMillis` | `30_000` | How long a call waits for a free session before rejecting with `TimeoutError`. |
| `createTimeoutMillis` | `30_000` | How long a sign-in may take. |
| `destroyTimeoutMillis` | `5_000` | How long a sign-out may take. |
| `reapIntervalMillis` | `30_000` | How often idle sessions are looked for. |
| `createRetryIntervalMillis` | `200` | How long to wait after a failed sign-in before trying again. |
| `propagateCreateError` | `true` | Reject the waiting call as soon as a sign-in fails. With `false`, bad credentials are retried until `acquireTimeoutMillis` elapses and then surface as a `TimeoutError` instead of the FileMaker error that explains the problem. |
| `log` | none | Receives the pool's internal warnings. |

`max` bounds the sessions the pool holds, not quite the sessions FileMaker sees: when a session is
retired, its sign-out overlaps the sign-in of its replacement, so budget a little headroom against any
server-side session limit.

Pool exhaustion is reported with `TimeoutError`, which is re-exported for convenience:

```typescript
import {TimeoutError} from 'fm-data-api-client';

try {
    await client.layout('orders').range();
} catch (e) {
    if (e instanceof TimeoutError) {
        // No session became free within acquireTimeoutMillis.
    }
}
```

### Using one session for several calls

FileMaker keeps some state per session, a found set being the obvious example. `withSession` pins a
run of calls to a single session:

```typescript
await client.withSession(async session => {
    const created = await session.layout('orders').create({customer: 'ACME'});
    return session.layout('orders').get(created.recordId);
});
```

The session is returned to the pool once the callback settles and cannot be used afterwards, so do not
store it or let it escape. Nothing inside the callback may call `client.request`, `client.layout(...)`
or `client.withSession` again: those check out a *second* session while the callback is still holding
the first, which deadlocks once the pool is full. Use the `session` argument for everything inside.

An invalid token is not retried inside `withSession`, because the callback may already have written
something and must not run twice.

### Shutting down

The client holds server sessions, so release them on shutdown:

```typescript
await client.destroy();
```

That signs out of every session, waiting for in-flight calls to finish first, and closes the pool.
The client cannot be used afterwards. On Node 22 `await using` works too:

```typescript
await using client = new Client('https://file-maker-server', 'database', 'username', 'password');
```

Forgetting `destroy()` will not hang your process - idle sessions are signed out on their own, and
the pool's timer does not hold the event loop open - but the sessions stay registered on the server
until they expire.

## Sign out

> **Deprecated.** Idle sessions are signed out automatically. Use
> [`destroy()`](#shutting-down) to shut a client down for good, which is almost always what is
> wanted here.

`clearToken` signs out of every session held right now and carries on with fresh ones:

```typescript
await client.clearToken();
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
