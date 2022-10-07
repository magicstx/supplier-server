import { isNotNullish, isNullish } from '../src/utils';

test('isNullish', () => {
  expect(isNullish(undefined)).toEqual(true);
  expect(isNullish(null)).toEqual(true);
  expect(isNullish(false)).toEqual(false);
  expect(isNullish(0)).toEqual(false);
});

test('isNullish', () => {
  expect(isNotNullish(undefined)).toEqual(false);
  expect(isNotNullish(null)).toEqual(false);
  expect(isNotNullish(false)).toEqual(true);
  expect(isNotNullish(0)).toEqual(true);
});
