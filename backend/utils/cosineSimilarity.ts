function cosineSimilarity(vecA: readonly number[], vecB: readonly number[]): number {
  if (vecA.length === 0 || vecA.length !== vecB.length) {
    throw new Error("Vectors must have the same nonzero length");
  }
  const dot = vecA.reduce((sum, a, i) => sum + a * vecB[i]!, 0);
  const normA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
  const normB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
  return dot / (normA * normB);
}

export default cosineSimilarity;
