import Client from '../Client';

const typeTesting = async () => {
    const client = new Client('a', 'b', 'c', 'd');
    const genericLayout = client.layout('foo');

    const result1 = await genericLayout.find({foo: 'bar'});
    result1.data[0].fieldData.foo;
    result1.data[0].portalData.foo[0].bar;

    type SpecificFieldData = {
        bar : string;
        baz : number;
    };
    type SpecificPortalData = {
        foo: {
            bar: string,
        },
    };

    const specificLayout = client.layout<SpecificFieldData, SpecificPortalData>('bar');
    const result2 = await specificLayout.find({baz: 'baz'});
    result2.data[0].portalData.foo[0].bar;
};

test('voidTest', () => {
    // Just to satisfy jest. This file is currently only testing the generic types not failing.
});
