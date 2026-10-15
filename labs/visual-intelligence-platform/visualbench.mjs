const DIMENSIONS = Object.freeze([
  'semanticFidelity',
  'evidenceGrounding',
  'layoutQuality',
  'editability',
  'accessibility',
  'brandConsistency',
  'reproducibility'
]);

export function scoreVisualArtifact(input = {}) {
  const weights = {
    semanticFidelity: 0.22,
    evidenceGrounding: 0.18,
    layoutQuality: 0.16,
    editability: 0.16,
    accessibility: 0.10,
    brandConsistency: 0.08,
    reproducibility: 0.10
  };

  const scores = {};
  for (const dimension of DIMENSIONS) {
    const value = Number(input[dimension]);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new Error(`invalid-score:${dimension}`);
    }
    scores[dimension] = value;
  }

  const total = DIMENSIONS.reduce((sum, dimension) => sum + scores[dimension] * weights[dimension], 0);
  const hardFailures = [];
  if (scores.semanticFidelity < 70) hardFailures.push('semantic-fidelity');
  if (scores.evidenceGrounding < 70) hardFailures.push('evidence-grounding');
  if (scores.accessibility < 60) hardFailures.push('accessibility');
  if (scores.reproducibility < 70) hardFailures.push('reproducibility');

  return Object.freeze({
    benchmarkVersion: 'visualbench/v1alpha1',
    scores: Object.freeze(scores),
    total: Number(total.toFixed(2)),
    hardFailures: Object.freeze(hardFailures),
    passed: total >= 80 && hardFailures.length === 0
  });
}
