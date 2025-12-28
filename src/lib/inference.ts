import type {
  CausalModel,
  CausalNode,
  CausalEdge,
  EffectFunction,
  CircuitBreakers,
  RenderableDistribution,
} from '@/types/causal';
import { sampleFromDistribution, samplesToKDE, expectedValue } from './distributions';

export const DEFAULT_SAMPLE_COUNT = 100;

// Default circuit breaker configuration
// Note: priorWeight was causing effects to dampen at each propagation level
const DEFAULT_CIRCUIT_BREAKERS: CircuitBreakers = {
  minValue: undefined,
  maxValue: undefined,
  priorWeight: 0, // Disabled - was dampening multi-level propagation
  maxStdDevRatio: 3.0, // Increased to allow more variance
};

export interface NodeSamples {
  [nodeId: string]: number[];
}

export interface PropagationResult {
  samples: NodeSamples;
  distributions: Map<string, RenderableDistribution>;
}

/**
 * Topologically sort nodes so parents are processed before children
 */
export function topologicalSort(model: CausalModel): CausalNode[] {
  const nodes = model.nodes;
  const edges = model.edges;

  // Build adjacency list and in-degree map
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }

  for (const edge of edges) {
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    adjacency.get(edge.source)?.push(edge.target);
  }

  // Kahn's algorithm
  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const sorted: CausalNode[] = [];
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = nodeMap.get(id);
    if (node) sorted.push(node);

    for (const child of adjacency.get(id) || []) {
      const newDegree = (inDegree.get(child) || 1) - 1;
      inDegree.set(child, newDegree);
      if (newDegree === 0) queue.push(child);
    }
  }

  return sorted;
}

/**
 * Apply linear effect using sensitivity-based formula
 *
 * The coefficient represents "coupling strength" or "sensitivity":
 * - 0.0 = no coupling (parent has no effect)
 * - 0.5 = moderate coupling (target moves 50% as much as parent deviates)
 * - 1.0 = tight coupling (target moves proportionally with parent)
 *
 * Formula: target = baseValue * (1 + coefficient * parentDeviation)
 * where parentDeviation = (parentValue - parentMean) / parentMean
 */
function applyLinearEffect(
  baseValue: number,
  effect: { coefficient?: number; intercept?: number; saturation?: number },
  parentValue: number,
  parentPriorMean: number
): number {
  const coefficient = effect.coefficient ?? 0.3; // Default moderate sensitivity

  // Handle edge case where parent mean is zero or very small
  if (Math.abs(parentPriorMean) < 0.001) {
    // Fall back to small additive effect
    const delta = coefficient * parentValue * 0.01;
    return baseValue + delta;
  }

  // Calculate parent's deviation from its mean (as a fraction)
  const parentDeviation = (parentValue - parentPriorMean) / parentPriorMean;

  // Apply saturation to the deviation if specified (prevents extreme swings)
  let effectiveDeviation = parentDeviation;
  if (effect.saturation && effect.saturation > 0) {
    effectiveDeviation = effect.saturation * Math.tanh(parentDeviation / effect.saturation);
  }

  // Apply sensitivity: target scales proportionally with parent's deviation
  const multiplier = 1 + coefficient * effectiveDeviation;

  // Clamp multiplier to reasonable range (0.1x to 10x)
  const clampedMultiplier = Math.min(Math.max(multiplier, 0.1), 10);

  return baseValue * clampedMultiplier;
}

/**
 * Apply multiplicative effect with damping
 *
 * The factor represents how much the child scales when parent doubles from baseline.
 * - factor = 2.0 means child doubles when parent doubles (linear relationship)
 * - factor = 1.5 means child increases 50% when parent doubles
 * - factor = 1.0 means no effect
 *
 * Formula: multiplier = factor^(log2(parentValue / baseline))
 * This means: when parent = 2*baseline, multiplier = factor
 */
function applyMultiplicativeEffect(
  baseValue: number,
  effect: { factor?: number; baseline?: number },
  parentValue: number
): number {
  const factor = effect.factor ?? 1.5;
  const baseline = effect.baseline ?? 1;

  // Avoid log of zero or negative
  if (parentValue <= 0 || baseline <= 0) {
    return baseValue;
  }

  // Calculate how many "doublings" the parent is from baseline
  // When parent = baseline, doublings = 0, multiplier = 1
  // When parent = 2*baseline, doublings = 1, multiplier = factor
  // When parent = 0.5*baseline, doublings = -1, multiplier = 1/factor
  const doublings = Math.log2(parentValue / baseline);

  // Apply the scaling factor
  const rawMultiplier = Math.pow(factor, doublings);

  // Cap multiplier to prevent explosion (0.1x to 10x range)
  const dampedMultiplier = Math.min(Math.max(rawMultiplier, 0.1), 10);

  return baseValue * dampedMultiplier;
}

/**
 * Apply threshold effect with smooth sigmoid transition
 *
 * The below/above values are sensitivity coefficients (like linear effect):
 * - below: How strongly parent affects target when parent < cutoff
 * - above: How strongly parent affects target when parent > cutoff
 *
 * This creates a "regime change" where sensitivity shifts at the cutoff.
 * Example: Risk premium might have low sensitivity to debt below 120% GDP,
 * but high sensitivity above that threshold.
 */
function applyThresholdEffect(
  baseValue: number,
  effect: { cutoff?: number; below?: number; above?: number; smoothness?: number },
  parentValue: number,
  parentPriorMean: number
): number {
  const cutoff = effect.cutoff ?? parentPriorMean;
  const below = effect.below ?? 0.1;
  const above = effect.above ?? 0.5;
  const k = effect.smoothness ?? 2;

  // Sigmoid interpolation between below and above sensitivity
  const weight = 1 / (1 + Math.exp(-k * (parentValue - cutoff)));

  // Blend between 'below' and 'above' sensitivity coefficients
  const effectiveCoefficient = below * (1 - weight) + above * weight;

  // Apply like a linear effect: scale based on parent's deviation from cutoff
  // (using cutoff as the reference point, not parent mean)
  const parentDeviation = (parentValue - cutoff) / Math.abs(cutoff || 1);

  // Multiplier approach (like linear effect)
  const multiplier = 1 + effectiveCoefficient * parentDeviation;
  const clampedMultiplier = Math.min(Math.max(multiplier, 0.1), 10);

  return baseValue * clampedMultiplier;
}

/**
 * Apply logistic effect for binary outcomes
 */
function applyLogisticEffect(
  baseProbability: number,
  effect: { coefficient?: number; threshold?: number },
  parentValue: number
): number {
  const coefficient = effect.coefficient ?? 0.1;
  const threshold = effect.threshold ?? 0;

  // Clamp probability to avoid log(0)
  const clampedP = Math.min(Math.max(baseProbability, 0.001), 0.999);
  const logOdds = Math.log(clampedP / (1 - clampedP));

  // Shift log-odds
  const newLogOdds = logOdds + coefficient * (parentValue - threshold);

  // Clamp to prevent extreme probabilities
  const clampedLogOdds = Math.min(Math.max(newLogOdds, -10), 10);

  return 1 / (1 + Math.exp(-clampedLogOdds));
}

/**
 * Apply effect function to a sample value
 */
function applyEffectToSample(
  baseValue: number,
  effect: EffectFunction,
  parentValue: number,
  parentPriorMean: number
): number {
  // Guard against invalid inputs
  if (!effect || typeof effect.type !== 'string') {
    return baseValue;
  }
  if (isNaN(baseValue) || isNaN(parentValue)) {
    return baseValue;
  }

  try {
    let result: number;
    switch (effect.type) {
      case 'linear':
        result = applyLinearEffect(baseValue, effect, parentValue, parentPriorMean);
        break;
      case 'multiplicative':
        result = applyMultiplicativeEffect(baseValue, effect, parentValue);
        break;
      case 'threshold':
        result = applyThresholdEffect(baseValue, effect, parentValue, parentPriorMean);
        break;
      case 'logistic':
        result = applyLogisticEffect(baseValue, effect, parentValue);
        break;
      default:
        result = baseValue;
    }
    // Guard against NaN/Infinity results
    return isFinite(result) ? result : baseValue;
  } catch {
    return baseValue;
  }
}

/**
 * Apply circuit breakers to samples
 */
function applyCircuitBreakers(
  node: CausalNode,
  samples: number[]
): number[] {
  const config = { ...DEFAULT_CIRCUIT_BREAKERS, ...node.circuitBreakers };
  const priorMean = expectedValue(node.distribution);

  return samples.map(value => {
    let bounded = value;

    // Handle NaN
    if (isNaN(bounded)) {
      bounded = priorMean;
    }

    // Boundary awareness
    if (config.minValue !== undefined) {
      bounded = Math.max(bounded, config.minValue);
    }
    if (config.maxValue !== undefined) {
      bounded = Math.min(bounded, config.maxValue);
    }

    // Elastic band effect (mean reversion)
    if (config.priorWeight && config.priorWeight > 0) {
      const deviation = bounded - priorMean;
      bounded = priorMean + deviation * (1 - config.priorWeight);
    }

    return bounded;
  });
}

/**
 * Clamp variance if it exceeds the limit
 */
function clampVariance(samples: number[], config: CircuitBreakers): number[] {
  const n = samples.length;
  const mean = samples.reduce((a, b) => a + b, 0) / n;
  const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);

  const maxStdDevRatio = config.maxStdDevRatio ?? 2.0;
  const maxStdDev = Math.abs(mean) * maxStdDevRatio;

  if (stdDev > maxStdDev && maxStdDev > 0) {
    const compressionFactor = maxStdDev / stdDev;
    return samples.map(s => mean + (s - mean) * compressionFactor);
  }

  return samples;
}

/**
 * Compute samples for a child node based on parent samples
 */
function computeChildSamples(
  node: CausalNode,
  edges: CausalEdge[],
  parentSamples: NodeSamples,
  nodeMap: Map<string, CausalNode>,
  sampleCount: number
): number[] {
  const parentEdges = edges.filter(e => e.target === node.id);
  const baseSamples = sampleFromDistribution(node.distribution, sampleCount);

  // For each sample index, apply all parent effects
  return baseSamples.map((baseValue, i) => {
    let value = baseValue;

    for (const edge of parentEdges) {
      const parentValue = parentSamples[edge.source]?.[i] ?? 0;
      const parentNode = nodeMap.get(edge.source);
      const parentPriorMean = parentNode ? expectedValue(parentNode.distribution) : 0;
      value = applyEffectToSample(value, edge.effect, parentValue, parentPriorMean);
    }

    return value;
  });
}

/**
 * Main Monte Carlo propagation function
 */
export function propagateWithSampling(
  model: CausalModel,
  interventions: Map<string, number>,
  sampleCount: number = DEFAULT_SAMPLE_COUNT
): PropagationResult {
  const samples: NodeSamples = {};
  const sorted = topologicalSort(model);
  const nodeMap = new Map(model.nodes.map(n => [n.id, n]));

  console.log('>>> [Inference] Propagating with interventions:', [...interventions.entries()], 'samples:', sampleCount);
  console.log('>>> [Inference] Topological order:', sorted.map(n => n.id).join(' -> '));

  for (const node of sorted) {
    const priorMean = expectedValue(node.distribution);

    if (interventions.has(node.id)) {
      // Intervention: all samples are the fixed value
      const interventionValue = interventions.get(node.id)!;
      samples[node.id] = Array(sampleCount).fill(interventionValue);
      console.log(`>>> [Inference] ${node.id}: INTERVENED to ${interventionValue} (prior was ${priorMean.toFixed(2)})`);
    } else if (node.type === 'exogenous') {
      // Exogenous: sample from prior distribution
      samples[node.id] = sampleFromDistribution(node.distribution, sampleCount);
      const mean = samples[node.id].reduce((a, b) => a + b, 0) / sampleCount;
      console.log(`>>> [Inference] ${node.id}: exogenous, sampled mean=${mean.toFixed(2)} (prior=${priorMean.toFixed(2)})`);
    } else {
      // Endogenous: compute from parents
      const parentEdges = model.edges.filter(e => e.target === node.id);
      samples[node.id] = computeChildSamples(node, model.edges, samples, nodeMap, sampleCount);
      const mean = samples[node.id].reduce((a, b) => a + b, 0) / sampleCount;
      console.log(`>>> [Inference] ${node.id}: endogenous, computed mean=${mean.toFixed(2)} (prior=${priorMean.toFixed(2)}) from parents: [${parentEdges.map(e => e.source).join(', ')}]`);
    }

    // Apply circuit breakers (but NOT to intervened nodes - interventions override natural bounds)
    if (!interventions.has(node.id)) {
      samples[node.id] = applyCircuitBreakers(node, samples[node.id]);

      // Clamp variance if needed
      const config = { ...DEFAULT_CIRCUIT_BREAKERS, ...node.circuitBreakers };
      samples[node.id] = clampVariance(samples[node.id], config);
    }
  }

  // Convert samples to renderable distributions
  const distributions = new Map<string, RenderableDistribution>();
  for (const [nodeId, nodeSamples] of Object.entries(samples)) {
    distributions.set(nodeId, samplesToKDE(nodeSamples));
  }

  return { samples, distributions };
}

/**
 * Get descendants of a node (for highlighting affected nodes)
 */
export function getDescendants(model: CausalModel, nodeId: string): Set<string> {
  const descendants = new Set<string>();
  const queue = [nodeId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of model.edges) {
      if (edge.source === current && !descendants.has(edge.target)) {
        descendants.add(edge.target);
        queue.push(edge.target);
      }
    }
  }

  return descendants;
}

/**
 * Check if node B is a descendant of node A
 */
export function isDescendant(model: CausalModel, ancestorId: string, descendantId: string): boolean {
  return getDescendants(model, ancestorId).has(descendantId);
}
