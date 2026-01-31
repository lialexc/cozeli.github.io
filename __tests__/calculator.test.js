// calculator.test.js
const { describe, test, expect } = require('@jest/globals');

describe('Calculator', () => {
  test('should add two numbers', () => {
    expect(1 + 2).toBe(3);
  });

  test('should multiply two numbers', () => {
    expect(2 * 3).toBe(6);
  });

  test('should divide two numbers', () => {
    expect(6 / 2).toBe(3);
  });

  test('should subtract two numbers', () => {
    expect(5 - 3).toBe(2);
  });
});
