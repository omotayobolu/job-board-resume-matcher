const EMBEDDING_DIMENSIONS = 768;

function vectorLiteral(values: ArrayLike<number | bigint>): string {
  if (values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Expected a ${EMBEDDING_DIMENSIONS}-dimension embedding`);
  }

  const numbers = Array.from(values, Number);
  if (numbers.some((value) => !Number.isFinite(value)) || numbers.every((value) => value === 0)) {
    throw new Error("Embedding must contain finite, nonzero values");
  }

  return `[${numbers.join(",")}]`;
}

export { vectorLiteral };
