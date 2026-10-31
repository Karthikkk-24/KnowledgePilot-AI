export function recallAtK(retrievedIds: string[], relevantIds: string[], k: number): number {
  if (relevantIds.length === 0) return 0;
  const top = new Set(retrievedIds.slice(0, Math.max(0, k)));
  const hits = relevantIds.filter((id) => top.has(id)).length;
  return hits / relevantIds.length;
}

export function meanReciprocalRank(retrievedIds: string[], relevantIds: string[]): number {
  if (relevantIds.length === 0) return 0;
  const relevant = new Set(relevantIds);
  for (let i = 0; i < retrievedIds.length; i += 1) {
    const id = retrievedIds[i];
    if (id && relevant.has(id)) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

function dcgAtK(relevances: number[], k: number): number {
  let sum = 0;
  const limit = Math.min(k, relevances.length);
  for (let i = 0; i < limit; i += 1) {
    const rel = relevances[i] ?? 0;
    sum += rel / Math.log2(i + 2);
  }
  return sum;
}

export function ndcgAtK(retrievedIds: string[], relevantIds: string[], k: number): number {
  if (relevantIds.length === 0 || k <= 0) return 0;
  const relevant = new Set(relevantIds);
  const gains = retrievedIds.slice(0, k).map((id) => (relevant.has(id) ? 1 : 0));
  const ideal = [
    ...Array.from({ length: Math.min(k, relevantIds.length) }, () => 1),
    ...Array.from({ length: Math.max(0, k - relevantIds.length) }, () => 0),
  ];
  const idealDcg = dcgAtK(ideal, k);
  if (idealDcg === 0) return 0;
  return dcgAtK(gains, k) / idealDcg;
}

export type CitationCorrectness = {
  validCitationRate: number;
  relevantCitationRate: number;
  citationPrecision: number;
  citationRecall: number;
};

export function citationCorrectness(
  citedIds: string[],
  retrievedIds: string[],
  relevantIds: string[],
): CitationCorrectness {
  const retrieved = new Set(retrievedIds);
  const relevant = new Set(relevantIds);
  const uniqueCited = [...new Set(citedIds)];

  if (uniqueCited.length === 0) {
    return {
      validCitationRate: relevantIds.length === 0 ? 1 : 0,
      relevantCitationRate: 0,
      citationPrecision: 0,
      citationRecall: relevantIds.length === 0 ? 1 : 0,
    };
  }

  const valid = uniqueCited.filter((id) => retrieved.has(id));
  const relevantCited = uniqueCited.filter((id) => relevant.has(id));
  const validCitationRate = valid.length / uniqueCited.length;
  const relevantCitationRate = relevantCited.length / uniqueCited.length;
  const citationPrecision = relevantCited.length / uniqueCited.length;
  const citationRecall =
    relevantIds.length === 0 ? 0 : relevantCited.length / relevantIds.length;

  return {
    validCitationRate,
    relevantCitationRate,
    citationPrecision,
    citationRecall,
  };
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length > 2),
  );
}

/**
 * Deterministic faithfulness proxy: fraction of answer content tokens that appear in evidence.
 * Not an LLM judge — good enough for Phase 3 smoke and regression.
 */
export function faithfulnessHeuristic(answer: string, evidenceTexts: string[]): number {
  const answerTokens = tokenize(answer);
  if (answerTokens.size === 0) return 1;
  const evidenceTokens = tokenize(evidenceTexts.join('\n'));
  let supported = 0;
  for (const token of answerTokens) {
    if (evidenceTokens.has(token)) supported += 1;
  }
  return supported / answerTokens.size;
}

export type CostEstimateInput = {
  embeddingTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  rerankDocuments?: number;
};

/** Rough OpenAI-ish pricing for mock cost dashboards (USD). */
export function estimateCostUsd(input: CostEstimateInput): number {
  const embed = (input.embeddingTokens ?? 0) * (0.02 / 1_000_000);
  const prompt = (input.promptTokens ?? 0) * (0.15 / 1_000_000);
  const completion = (input.completionTokens ?? 0) * (0.6 / 1_000_000);
  const rerank = (input.rerankDocuments ?? 0) * 0.0001;
  return Number((embed + prompt + completion + rerank).toFixed(8));
}

export type ItemMetrics = {
  recallAtK: number;
  mrr: number;
  ndcgAtK: number;
  faithfulness: number;
  citationCorrectness: CitationCorrectness;
  estimatedCostUsd: number;
};

export function computeItemMetrics(input: {
  retrievedIds: string[];
  relevantIds: string[];
  citedIds: string[];
  answer: string;
  evidenceTexts: string[];
  k: number;
  cost?: CostEstimateInput;
}): ItemMetrics {
  return {
    recallAtK: recallAtK(input.retrievedIds, input.relevantIds, input.k),
    mrr: meanReciprocalRank(input.retrievedIds, input.relevantIds),
    ndcgAtK: ndcgAtK(input.retrievedIds, input.relevantIds, input.k),
    faithfulness: faithfulnessHeuristic(input.answer, input.evidenceTexts),
    citationCorrectness: citationCorrectness(
      input.citedIds,
      input.retrievedIds,
      input.relevantIds,
    ),
    estimatedCostUsd: estimateCostUsd(input.cost ?? {}),
  };
}

export function averageMetrics(items: ItemMetrics[]): {
  recallAtK: number;
  mrr: number;
  ndcgAtK: number;
  faithfulness: number;
  citationPrecision: number;
  citationRecall: number;
  validCitationRate: number;
  estimatedCostUsd: number;
  itemCount: number;
} {
  const n = items.length || 1;
  const sum = items.reduce(
    (acc, item) => {
      acc.recallAtK += item.recallAtK;
      acc.mrr += item.mrr;
      acc.ndcgAtK += item.ndcgAtK;
      acc.faithfulness += item.faithfulness;
      acc.citationPrecision += item.citationCorrectness.citationPrecision;
      acc.citationRecall += item.citationCorrectness.citationRecall;
      acc.validCitationRate += item.citationCorrectness.validCitationRate;
      acc.estimatedCostUsd += item.estimatedCostUsd;
      return acc;
    },
    {
      recallAtK: 0,
      mrr: 0,
      ndcgAtK: 0,
      faithfulness: 0,
      citationPrecision: 0,
      citationRecall: 0,
      validCitationRate: 0,
      estimatedCostUsd: 0,
    },
  );

  return {
    recallAtK: sum.recallAtK / n,
    mrr: sum.mrr / n,
    ndcgAtK: sum.ndcgAtK / n,
    faithfulness: sum.faithfulness / n,
    citationPrecision: sum.citationPrecision / n,
    citationRecall: sum.citationRecall / n,
    validCitationRate: sum.validCitationRate / n,
    estimatedCostUsd: sum.estimatedCostUsd,
    itemCount: items.length,
  };
}
