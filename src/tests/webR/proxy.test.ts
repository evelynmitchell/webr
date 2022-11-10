import { WebR } from '../../webR/webr-main';
import { RDouble, RFunction, RList } from '../../webR/robj';
import util from 'util';

const webR = new WebR({
  WEBR_URL: '../dist/',
  RArgs: ['--quiet'],
});

beforeAll(async () => {
  await webR.init();
});

test('Evaluate code and return a proxy', async () => {
  const result = (await webR.evalRCode('42')).result;
  expect(util.types.isProxy(result)).toBe(true);
});

test('RProxy _target property', async () => {
  const result = (await webR.evalRCode('42')).result;
  expect(result._target).toHaveProperty('type', 'PTR');
  expect(result._target).toHaveProperty('methods');
  expect(result._target).toHaveProperty('obj');
  expect(result._target.obj).toEqual(expect.any(Number));
});

test('RFunctions can be invoked via the proxy apply hook', async () => {
  const fn = (await webR.evalRCode('factorial')).result as RFunction;
  const result = await fn(8);
  expect(result).toEqual(expect.objectContaining({ names: null, values: [40320] }));
});

test('RFunctions can be returned by R functions and invoked via the apply hook', async () => {
  const fn = (await webR.evalRCode('function(x) function (y) {x*y}')).result as RFunction;
  const invoke = (await fn(5)) as RFunction;
  const result = await invoke(7);
  expect(result).toEqual(expect.objectContaining({ names: null, values: [35] }));
});

test('R list objects can be iterated over with `for await`', async () => {
  const list = (await webR.evalRCode('list(1+2i, "b", TRUE)')).result as RList;
  const result: any[] = [];
  for await (const elem of list) {
    result.push(await elem.toJs());
  }
  expect(result).toEqual([
    expect.objectContaining({ values: [{ re: 1, im: 2 }] }),
    expect.objectContaining({ values: ['b'] }),
    expect.objectContaining({ values: [true] }),
  ]);
});

test('Attempting to iterate over unsupported R objects throws an error', async () => {
  const shouldThrow = async () => {
    const notalist = (await webR.evalRCode('as.symbol("notalist")')).result;
    const result: any[] = [];
    for await (const elem of notalist) {
      result.push(await elem.toJs());
    }
    return result;
  };
  await expect(shouldThrow()).rejects.toThrow('Cannot iterate over object');
});

test('R atomic vector objects can be iterated over with `for await`', async () => {
  const vec = (await webR.evalRCode('c(3, 5, 6, 7, 9, 10, 11, 12, 13)')).result as RList;
  const result: any[] = [];
  for await (const elem of vec) {
    const val = await (elem as RDouble).toNumber();
    result.push(2 * (val || 0));
  }
  expect(result).toEqual([6, 10, 12, 14, 18, 20, 22, 24, 26]);
});

test('Other R objects cannot use the apply hook', async () => {
  const notFn = await webR.evalRCode('123');
  // @ts-expect-error Deliberate type error to test Error thrown
  expect(() => notFn(8)).toThrow('is not a function');
});

afterAll(() => {
  return webR.close();
});
