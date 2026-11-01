import { expect, test } from "vitest";
import { Animated, shakeOffset } from "./anim";

test("a shake swings 8 units each way twice over 120ms, as lazer's ShakeContainer", () => {
  expect(shakeOffset(0)).toBe(0);
  expect(shakeOffset(15)).toBeCloseTo(8);
  expect(shakeOffset(45)).toBeCloseTo(-8);
  expect(shakeOffset(75)).toBeCloseTo(8);
  expect(shakeOffset(105)).toBeCloseTo(-8);
  expect(shakeOffset(120)).toBe(0);
  expect(shakeOffset(-1)).toBe(0);
});

test("a transform starts from the value it interrupts", () => {
  const alpha = new Animated(0).to(0, 100, 1).to(50, 100, 0);
  expect(alpha.at(25)).toBeCloseTo(0.25);
  expect(alpha.at(50)).toBeCloseTo(0.5);
  expect(alpha.at(100)).toBeCloseTo(0.25);
  expect(alpha.at(150)).toBe(0);
});

test("a jump and a transform at the same time run in order", () => {
  const scale = new Animated(0.6).to(0, 10, 0.9).set(10, 0.95).to(10, 10, 1);
  expect(scale.at(10)).toBeCloseTo(0.95);
  expect(scale.at(15)).toBeCloseTo(0.975);
  expect(scale.at(20)).toBe(1);
});
