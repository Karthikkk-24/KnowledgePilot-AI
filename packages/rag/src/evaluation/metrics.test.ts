import { describe, expect, it } from 'vitest';
import {
  averageMetrics,
  citationCorrectness,
  computeItemMetrics,
  faithfulnessHeuristic,
  meanReciprocalRank,
  ndcgAtK,
  recallAtK,
} from './metrics';

describe('retrieval metrics', () => {
  it('computes recall@k, MRR, and nDCG@k', () => {
    const retrieved = ['a', 'b', 'c', 'd'];
    const relevant = ['c', 'x'];
    expect(recallAtK(retrieved, relevant, 3)).toBe(0.5);
    expect(meanReciprocalRank(retrieved, relevant)).toBeCloseTo(1 / 3);
    expect(ndcgAtK(retrieved, relevant, 3)).toBeGreaterThan(0);
  });

  it('returns 0 for empty relevant sets', () => {
    expect(recallAtK(['a'], [], 5)).toBe(0);
    expect(meanReciprocalRank(['a'], [])).toBe(0);
    expect(ndcgAtK(['a'], [], 5)).toBe(0);
  });
});

describe('answer metrics', () => {
  it('scores citation correctness', () => {
    const result = citationCorrectness(['a', 'fake'], ['a', 'b'], ['a']);
    expect(result.validCitationRate).toBe(0.5);
    expect(result.citationPrecision).toBe(0.5);
    expect(result.citationRecall).toBe(1);
  });

  it('scores faithfulness by token overlap', () => {
    expect(
      faithfulnessHeuristic('Retention is 7 years', [
        'Retention period is 7 years for financial records.',
      ]),
    ).toBeGreaterThan(0.5);
    expect(faithfulnessHeuristic('Atlantis capital city', ['Retention period is 7 years'])).toBe(
      0,
    );
  });

  it('aggregates item metrics', () => {
    const one = computeItemMetrics({
      retrievedIds: ['a', 'b'],
      relevantIds: ['a'],
      citedIds: ['a'],
      answer: 'a is correct',
      evidenceTexts: ['a is correct and supported'],
      k: 5,
      cost: { promptTokens: 100, completionTokens: 50 },
    });
    const avg = averageMetrics([one, one]);
    expect(avg.itemCount).toBe(2);
    expect(avg.recallAtK).toBe(1);
    expect(avg.mrr).toBe(1);
  });
});
