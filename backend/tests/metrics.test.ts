import { it, expect } from "vitest";
import { wordErrorRate } from "../src/batch";
import { distribution } from "../src/reports";
it("measures substitutions, deletions and insertions without treating missing reference as perfect", () => {
  expect(
    wordErrorRate("hello blue friend", "hello red friend").rate,
  ).toBeCloseTo(1 / 3);
  expect(wordErrorRate("chai please", "chai").rate).toBe(0.5);
  expect(wordErrorRate("", "chai").rate).toBeNull();
});
it("reports interpolated even median and nearest-rank p95", () => {
  expect(distribution([1, 3, 2, 4])).toEqual({
    count: 4,
    average: 2.5,
    median: 2.5,
    p95: 4,
  });
  expect(distribution([]).median).toBeNull();
});
