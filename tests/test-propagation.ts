/**
 * Causal Graph Propagation Simulator
 *
 * This script tests the inference engine by:
 * 1. Generating causal models for multiple questions
 * 2. Documenting expected behaviors based on effect types
 * 3. Running interventions and capturing actual results
 * 4. Comparing expected vs actual to validate the propagation logic
 */

import { generateCausalModel } from '../src/lib/llm';
import { propagateWithSampling, topologicalSort } from '../src/lib/inference';
import { expectedValue } from '../src/lib/distributions';
import type { CausalModel, CausalEdge, EffectFunction } from '../src/types/causal';

// Get API key from environment
const API_KEY: string = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

if (!API_KEY) {
  console.error('ERROR: Please set GEMINI_API_KEY or GOOGLE_API_KEY environment variable');
  process.exit(1);
}

// Test queries across different domains
const TEST_QUERIES = [
  "In 2026, how does the US federal debt overhang impact interest rates and inflation?",
  "How does increasing minimum wage affect unemployment and small business profitability?",
  "How does social media usage affect teen mental health and academic performance?",
  "How does deforestation in the Amazon affect global climate patterns and biodiversity?",
  "How does remote work adoption affect urban real estate prices and commuter traffic?",
];

// Helper to compute statistics from samples
function computeStats(samples: number[]) {
  const n = samples.length;
  const mean = samples.reduce((a, b) => a + b, 0) / n;
  const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);
  const sorted = [...samples].sort((a, b) => a - b);
  const p5 = sorted[Math.floor(n * 0.05)];
  const p50 = sorted[Math.floor(n * 0.5)];
  const p95 = sorted[Math.floor(n * 0.95)];
  return { mean, stdDev, p5, p50, p95 };
}

// Describe what an effect should do
function describeExpectedEffect(effect: EffectFunction, parentLabel: string): string {
  switch (effect.type) {
    case 'linear':
      const coef = effect.coefficient;
      const direction = coef > 0 ? 'increase' : 'decrease';
      return `Linear (coef=${coef.toFixed(3)}): Higher ${parentLabel} should ${direction} this node`;
    case 'multiplicative':
      const factor = effect.factor;
      return `Multiplicative (factor=${factor.toFixed(3)}): ${parentLabel} scales this node exponentially`;
    case 'threshold':
      return `Threshold (cutoff=${effect.cutoff}): Below=${effect.below}, Above=${effect.above}`;
    case 'logistic':
      return `Logistic (coef=${effect.coefficient}): Shifts probability based on ${parentLabel}`;
    default:
      return 'Unknown effect type';
  }
}

// Find leaf nodes (terminal nodes with no outgoing edges)
function findLeafNodes(model: CausalModel): string[] {
  const hasOutgoing = new Set(model.edges.map(e => e.source));
  return model.nodes.filter(n => !hasOutgoing.has(n.id)).map(n => n.id);
}

// Find root nodes (exogenous nodes with no incoming edges)
function findRootNodes(model: CausalModel): string[] {
  const hasIncoming = new Set(model.edges.map(e => e.target));
  return model.nodes.filter(n => !hasIncoming.has(n.id)).map(n => n.id);
}

// Get all paths from a root to a leaf
function findPaths(model: CausalModel, from: string, to: string): string[][] {
  const paths: string[][] = [];
  const adjacency = new Map<string, CausalEdge[]>();

  for (const edge of model.edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    adjacency.get(edge.source)!.push(edge);
  }

  function dfs(current: string, path: string[]) {
    if (current === to) {
      paths.push([...path, current]);
      return;
    }
    const edges = adjacency.get(current) || [];
    for (const edge of edges) {
      dfs(edge.target, [...path, current]);
    }
  }

  dfs(from, []);
  return paths;
}

// Result structure for each model test
interface ModelTestResult {
  query: string;
  title: string;
  nodeCount: number;
  edgeCount: number;
  issues: {
    priorDrift: { nodeId: string; label: string; prior: number; computed: number; ratio: number }[];
    clampedNodes: { nodeId: string; label: string; std: number }[];
    multiplicativeExplosion: { edge: string; factor: number; baseline: number; parentPrior: number; expectedMultiplier: number }[];
    directionMismatch: { edge: string; expected: string; actual: string }[];
  };
  interventionResults: {
    rootNode: string;
    leafNode: string;
    direction: 'high' | 'low';
    baselineValue: number;
    interventionValue: number;
    pctChange: number;
  }[];
}

// Analyze a single model and return structured results
async function analyzeModel(query: string): Promise<ModelTestResult | null> {
  console.log(`\nGenerating model for: "${query.substring(0, 60)}..."`);

  let model: CausalModel;
  try {
    model = await generateCausalModel(query, API_KEY);
  } catch (error) {
    console.error(`  Failed: ${error}`);
    return null;
  }

  console.log(`  Generated: ${model.title} (${model.nodes.length} nodes, ${model.edges.length} edges)`);

  const result: ModelTestResult = {
    query,
    title: model.title,
    nodeCount: model.nodes.length,
    edgeCount: model.edges.length,
    issues: {
      priorDrift: [],
      clampedNodes: [],
      multiplicativeExplosion: [],
      directionMismatch: [],
    },
    interventionResults: [],
  };

  const nodeMap = new Map(model.nodes.map(n => [n.id, n]));
  const rootNodes = findRootNodes(model);
  const leafNodes = findLeafNodes(model);
  const sortedNodes = topologicalSort(model);

  // Run baseline propagation (suppress inference logs)
  const originalLog = console.log;
  console.log = () => {};
  const baselineResult = propagateWithSampling(model, new Map());
  console.log = originalLog;

  // Check for issues
  const baselineStats: Record<string, ReturnType<typeof computeStats>> = {};

  for (const node of sortedNodes) {
    const samples = baselineResult.samples[node.id];
    const stats = computeStats(samples);
    baselineStats[node.id] = stats;
    const prior = expectedValue(node.distribution);

    // Check prior drift (computed vs prior ratio)
    if (prior !== 0) {
      const ratio = stats.mean / prior;
      if (ratio > 2 || ratio < 0.5) {
        result.issues.priorDrift.push({
          nodeId: node.id,
          label: node.label,
          prior,
          computed: stats.mean,
          ratio,
        });
      }
    }

    // Check for clamped nodes (very low std)
    if (stats.stdDev < 0.001 && node.type !== 'exogenous') {
      result.issues.clampedNodes.push({
        nodeId: node.id,
        label: node.label,
        std: stats.stdDev,
      });
    }
  }

  // Check for multiplicative explosion potential
  for (const edge of model.edges) {
    if (edge.effect.type === 'multiplicative') {
      const source = nodeMap.get(edge.source)!;
      const parentPrior = expectedValue(source.distribution);
      const factor = edge.effect.factor;
      const baseline = edge.effect.baseline ?? 1;
      const expectedMultiplier = Math.pow(factor, parentPrior / baseline);

      if (expectedMultiplier > 5 || expectedMultiplier < 0.2) {
        result.issues.multiplicativeExplosion.push({
          edge: `${edge.source} -> ${edge.target}`,
          factor,
          baseline,
          parentPrior,
          expectedMultiplier,
        });
      }
    }
  }

  // Test interventions on first root node
  if (rootNodes.length > 0) {
    const rootId = rootNodes[0];
    const rootNode = nodeMap.get(rootId)!;
    const rootPrior = expectedValue(rootNode.distribution);

    for (const direction of ['high', 'low'] as const) {
      const interventionValue = direction === 'high' ? rootPrior * 1.5 : rootPrior * 0.5;

      console.log = () => {};
      const interventionResult = propagateWithSampling(model, new Map([[rootId, interventionValue]]));
      console.log = originalLog;

      for (const leafId of leafNodes) {
        const leafNode = nodeMap.get(leafId);
        if (!leafNode || !baselineStats[leafId] || !interventionResult.samples[leafId]) continue;

        const baselineLeafMean = baselineStats[leafId].mean;
        const interventionLeafMean = computeStats(interventionResult.samples[leafId]).mean;
        const pctChange = baselineLeafMean !== 0
          ? ((interventionLeafMean - baselineLeafMean) / Math.abs(baselineLeafMean)) * 100
          : 0;

        result.interventionResults.push({
          rootNode: rootNode.label,
          leafNode: leafNode.label,
          direction,
          baselineValue: baselineLeafMean,
          interventionValue: interventionLeafMean,
          pctChange,
        });
      }
    }

    // Check direction mismatches for direct edges from exogenous nodes
    for (const edge of model.edges) {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (!source || !target || source.type !== 'exogenous') continue;
      if (!baselineStats[edge.target]) continue;

      const sourcePrior = expectedValue(source.distribution);
      const highValue = sourcePrior * 1.5;

      console.log = () => {};
      const highResult = propagateWithSampling(model, new Map([[edge.source, highValue]]));
      console.log = originalLog;

      if (!highResult.samples[edge.target]) continue;

      const baselineTargetMean = baselineStats[edge.target].mean;
      const highTargetMean = computeStats(highResult.samples[edge.target]).mean;
      const actualChange = highTargetMean - baselineTargetMean;

      let expectedDirection: 'increase' | 'decrease' | 'unknown' = 'unknown';
      if (edge.effect.type === 'linear') {
        expectedDirection = edge.effect.coefficient > 0 ? 'increase' : 'decrease';
      } else if (edge.effect.type === 'multiplicative') {
        expectedDirection = edge.effect.factor > 1 ? 'increase' : 'decrease';
      }

      const actualDirection = actualChange > 0.01 ? 'increase' : actualChange < -0.01 ? 'decrease' : 'no change';

      if (expectedDirection !== 'unknown' && expectedDirection !== actualDirection) {
        result.issues.directionMismatch.push({
          edge: `${source.label} -> ${target.label}`,
          expected: expectedDirection,
          actual: actualDirection,
        });
      }
    }
  }

  return result;
}

// Main simulation across all queries
async function runSimulation() {
  console.log('='.repeat(80));
  console.log('CAUSAL GRAPH PROPAGATION SIMULATOR - MULTI-MODEL TEST');
  console.log('='.repeat(80));
  console.log(`Testing ${TEST_QUERIES.length} queries...`);

  const results: ModelTestResult[] = [];

  for (const query of TEST_QUERIES) {
    const result = await analyzeModel(query);
    if (result) {
      results.push(result);
    }
  }

  // Summary Report
  console.log('\n');
  console.log('='.repeat(80));
  console.log('AGGREGATE SUMMARY ACROSS ALL MODELS');
  console.log('='.repeat(80));

  let totalPriorDrift = 0;
  let totalClampedNodes = 0;
  let totalMultiplicativeExplosion = 0;
  let totalDirectionMismatch = 0;
  let totalInterventionsWithEffect = 0;
  let totalInterventions = 0;

  for (const result of results) {
    totalPriorDrift += result.issues.priorDrift.length;
    totalClampedNodes += result.issues.clampedNodes.length;
    totalMultiplicativeExplosion += result.issues.multiplicativeExplosion.length;
    totalDirectionMismatch += result.issues.directionMismatch.length;

    for (const ir of result.interventionResults) {
      totalInterventions++;
      if (Math.abs(ir.pctChange) > 1) {
        totalInterventionsWithEffect++;
      }
    }
  }

  console.log(`\nModels tested: ${results.length}`);
  console.log(`\nIssue Counts:`);
  console.log(`  Prior Drift (>2x or <0.5x): ${totalPriorDrift} nodes`);
  console.log(`  Clamped Nodes (std≈0): ${totalClampedNodes} nodes`);
  console.log(`  Multiplicative Explosion (multiplier >5x or <0.2x): ${totalMultiplicativeExplosion} edges`);
  console.log(`  Direction Mismatch: ${totalDirectionMismatch} edges`);
  console.log(`\nIntervention Effectiveness:`);
  console.log(`  Interventions with >1% effect: ${totalInterventionsWithEffect}/${totalInterventions} (${(totalInterventionsWithEffect/totalInterventions*100).toFixed(1)}%)`);

  // Detailed issues per model
  console.log('\n');
  console.log('='.repeat(80));
  console.log('DETAILED ISSUES BY MODEL');
  console.log('='.repeat(80));

  for (const result of results) {
    console.log(`\n--- ${result.title} ---`);
    console.log(`Query: ${result.query.substring(0, 70)}...`);

    if (result.issues.priorDrift.length > 0) {
      console.log(`\n  Prior Drift:`);
      for (const d of result.issues.priorDrift.slice(0, 5)) {
        console.log(`    ${d.label}: prior=${d.prior.toFixed(2)}, computed=${d.computed.toFixed(2)} (${d.ratio.toFixed(1)}x)`);
      }
    }

    if (result.issues.clampedNodes.length > 0) {
      console.log(`\n  Clamped Nodes:`);
      for (const c of result.issues.clampedNodes) {
        console.log(`    ${c.label}: std=${c.std.toFixed(4)}`);
      }
    }

    if (result.issues.multiplicativeExplosion.length > 0) {
      console.log(`\n  Multiplicative Explosion:`);
      for (const m of result.issues.multiplicativeExplosion) {
        console.log(`    ${m.edge}: factor=${m.factor}, baseline=${m.baseline}, parentPrior=${m.parentPrior.toFixed(1)} -> multiplier=${m.expectedMultiplier.toFixed(1)}x`);
      }
    }

    if (result.issues.directionMismatch.length > 0) {
      console.log(`\n  Direction Mismatch:`);
      for (const d of result.issues.directionMismatch) {
        console.log(`    ${d.edge}: expected ${d.expected}, got ${d.actual}`);
      }
    }

    // Show intervention effects summary
    const highEffects = result.interventionResults.filter(r => r.direction === 'high' && Math.abs(r.pctChange) > 1);
    if (highEffects.length > 0) {
      console.log(`\n  Intervention Effects (root +50%):`);
      for (const e of highEffects.slice(0, 3)) {
        console.log(`    ${e.rootNode} -> ${e.leafNode}: ${e.pctChange >= 0 ? '+' : ''}${e.pctChange.toFixed(1)}%`);
      }
    }
  }

  // Final scorecard
  console.log('\n');
  console.log('='.repeat(80));
  console.log('SCORECARD');
  console.log('='.repeat(80));
  const score = 100 - (totalPriorDrift * 2) - (totalClampedNodes * 5) - (totalMultiplicativeExplosion * 10) - (totalDirectionMismatch * 5);
  console.log(`\nHealth Score: ${Math.max(0, score)}/100`);
  console.log(`\nKey Metrics:`);
  console.log(`  • Prior Drift: ${totalPriorDrift === 0 ? '✓' : '⚠️ ' + totalPriorDrift} nodes with >2x drift`);
  console.log(`  • Clamping: ${totalClampedNodes === 0 ? '✓' : '⚠️ ' + totalClampedNodes} nodes hitting bounds`);
  console.log(`  • Multiplicative: ${totalMultiplicativeExplosion === 0 ? '✓' : '⚠️ ' + totalMultiplicativeExplosion} edges with explosion risk`);
  console.log(`  • Direction: ${totalDirectionMismatch === 0 ? '✓' : '⚠️ ' + totalDirectionMismatch} edges with wrong direction`);
  console.log(`  • Effectiveness: ${totalInterventionsWithEffect}/${totalInterventions} interventions produce >1% change`);
}

// Run the simulation
runSimulation().catch(console.error);
