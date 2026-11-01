import assert from "node:assert/strict";
import test from "node:test";
import { vectorLiteral } from "../utils/vector";

test("serializes a 768-dimensional embedding for pgvector", () => {
  const values = new Float32Array(768);
  values[0] = 0.5;
  values[767] = -0.25;
  const literal = vectorLiteral(values);
  assert.equal(literal.slice(0, 6), "[0.5,0");
  assert.equal(literal.endsWith(",-0.25]"), true);
});

test("rejects zero, nonfinite, and incorrectly sized embeddings", () => {
  assert.throws(() => vectorLiteral(new Float32Array(768)), /nonzero/);
  assert.throws(() => vectorLiteral([1, 2, 3]), /768-dimension/);
  const values = new Array<number>(768).fill(0);
  values[0] = Number.NaN;
  assert.throws(() => vectorLiteral(values), /finite/);
});
