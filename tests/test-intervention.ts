/**
 * Intervention Propagation Test Suite
 *
 * Tests that interventions on exogenous nodes produce realistic downstream effects.
 *
 * Usage:
 *   npx tsx tests/test-intervention.ts                    # Run all embedded tests
 *   npx tsx tests/test-intervention.ts model.json         # Test a specific model file
 */

import * as fs from 'fs';
import * as path from 'path';
import { propagateWithSampling } from '../src/lib/inference';
import { expectedValue } from '../src/lib/distributions';
import type { CausalModel, CausalNode } from '../src/types/causal';

// ============================================================================
// Utilities
// ============================================================================

function mean(samples: number[]): number {
  return samples.reduce((a, b) => a + b, 0) / samples.length;
}

function suppressLogs() {
  (global as any)._originalLog = console.log;
  console.log = () => {};
}

function restoreLogs() {
  console.log = (global as any)._originalLog || console.log;
}

function findExogenousNodes(model: CausalModel): CausalNode[] {
  return model.nodes.filter(n => n.type === 'exogenous');
}

function findLeafNodes(model: CausalModel): CausalNode[] {
  const hasOutgoing = new Set(model.edges.map(e => e.source));
  return model.nodes.filter(n => !hasOutgoing.has(n.id));
}

function findDownstreamNodes(model: CausalModel, nodeId: string): Set<string> {
  const downstream = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of model.edges) {
      if (edge.source === current && !downstream.has(edge.target)) {
        downstream.add(edge.target);
        queue.push(edge.target);
      }
    }
  }
  return downstream;
}

// ============================================================================
// Test Runner
// ============================================================================

interface InterventionResult {
  nodeId: string;
  nodeLabel: string;
  baseline: number;
  intervened: number;
  pctChange: number;
}

interface TestResult {
  exogenousNode: string;
  interventionLevel: string;
  interventionValue: number;
  baselineValue: number;
  leafResults: InterventionResult[];
  allDownstreamResults: InterventionResult[];
  passed: boolean;
  issues: string[];
}

function runInterventionTest(
  model: CausalModel,
  exogenousNodeId: string,
  interventionMultiplier: number,
  baselineSamples: Record<string, number[]>
): TestResult {
  const node = model.nodes.find(n => n.id === exogenousNodeId)!;
  const prior = expectedValue(node.distribution);
  const interventionValue = prior * interventionMultiplier;
  const levelLabel = interventionMultiplier < 1
    ? `${((1 - interventionMultiplier) * 100).toFixed(0)}% decrease`
    : `${((interventionMultiplier - 1) * 100).toFixed(0)}% increase`;

  suppressLogs();
  const result = propagateWithSampling(model, new Map([[exogenousNodeId, interventionValue]]));
  restoreLogs();

  const leafNodes = findLeafNodes(model);
  const downstreamNodes = findDownstreamNodes(model, exogenousNodeId);
  const issues: string[] = [];

  const leafResults: InterventionResult[] = [];
  const allDownstreamResults: InterventionResult[] = [];

  // Check all downstream nodes
  for (const nodeId of downstreamNodes) {
    const targetNode = model.nodes.find(n => n.id === nodeId)!;
    const baselineMean = mean(baselineSamples[nodeId]);
    const intervenedMean = mean(result.samples[nodeId]);
    const pctChange = baselineMean !== 0
      ? ((intervenedMean - baselineMean) / Math.abs(baselineMean)) * 100
      : 0;

    const resultEntry: InterventionResult = {
      nodeId,
      nodeLabel: targetNode.label,
      baseline: baselineMean,
      intervened: intervenedMean,
      pctChange
    };

    allDownstreamResults.push(resultEntry);

    if (leafNodes.some(l => l.id === nodeId)) {
      leafResults.push(resultEntry);
    }
  }

  // Check for issues
  const inputChange = Math.abs((interventionMultiplier - 1) * 100);

  // Issue: Leaf nodes should change when input changes significantly
  if (inputChange >= 25) {
    for (const leaf of leafResults) {
      if (Math.abs(leaf.pctChange) < 1) {
        issues.push(`Leaf "${leaf.nodeLabel}" barely changed (${leaf.pctChange.toFixed(1)}%) despite ${inputChange.toFixed(0)}% input change`);
      }
    }
  }

  // Issue: At least some downstream nodes should change
  const nodesWithChange = allDownstreamResults.filter(r => Math.abs(r.pctChange) > 1);
  if (nodesWithChange.length === 0 && inputChange >= 10) {
    issues.push(`No downstream nodes changed more than 1%`);
  }

  return {
    exogenousNode: node.label,
    interventionLevel: levelLabel,
    interventionValue,
    baselineValue: prior,
    leafResults,
    allDownstreamResults,
    passed: issues.length === 0,
    issues
  };
}

function testModel(model: CausalModel): { passed: boolean; results: TestResult[] } {
  console.log('\n' + '='.repeat(70));
  console.log(`MODEL: ${model.title}`);
  console.log('='.repeat(70));
  console.log(`Nodes: ${model.nodes.length} | Edges: ${model.edges.length}`);

  const exogenousNodes = findExogenousNodes(model);
  const leafNodes = findLeafNodes(model);

  console.log(`Exogenous (input) nodes: ${exogenousNodes.map(n => n.label).join(', ')}`);
  console.log(`Leaf (output) nodes: ${leafNodes.map(n => n.label).join(', ')}`);

  // Run baseline
  suppressLogs();
  const baseline = propagateWithSampling(model, new Map());
  restoreLogs();

  const baselineSamples: Record<string, number[]> = {};
  for (const node of model.nodes) {
    baselineSamples[node.id] = baseline.samples[node.id];
  }

  // Test each exogenous node with various intervention levels
  const interventionLevels = [0.25, 0.5, 0.75, 1.5, 2.0];
  const results: TestResult[] = [];
  let allPassed = true;

  for (const exoNode of exogenousNodes) {
    console.log(`\n--- Testing: ${exoNode.label} (prior: ${expectedValue(exoNode.distribution).toFixed(2)} ${exoNode.units || ''}) ---`);

    for (const multiplier of interventionLevels) {
      const testResult = runInterventionTest(model, exoNode.id, multiplier, baselineSamples);
      results.push(testResult);

      if (!testResult.passed) {
        allPassed = false;
      }

      // Print summary for this intervention
      const icon = testResult.passed ? '✅' : '❌';
      const leafChanges = testResult.leafResults
        .map(r => `${r.nodeLabel}: ${r.pctChange >= 0 ? '+' : ''}${r.pctChange.toFixed(1)}%`)
        .join(', ');

      console.log(`  ${icon} ${testResult.interventionLevel} (${testResult.interventionValue.toFixed(2)})`);
      console.log(`     Leaf effects: ${leafChanges || 'none'}`);

      if (testResult.issues.length > 0) {
        for (const issue of testResult.issues) {
          console.log(`     ⚠️  ${issue}`);
        }
      }
    }
  }

  return { passed: allPassed, results };
}

// ============================================================================
// Embedded Test Models
// ============================================================================

const SIMPLE_LINEAR_MODEL: CausalModel = {
  title: "Simple Linear Chain",
  description: "A→B→C→D linear chain to test basic propagation",
  zones: { "test": { label: "Test", color: "#ccc", description: "" } },
  nodes: [
    { id: "a", label: "Input A", type: "exogenous", zone: "test", units: "units",
      description: "", distribution: { type: "continuous", dist: "normal", params: [100, 10] },
      shape: "diamond", circuitBreakers: { minValue: 0, maxValue: 500 } },
    { id: "b", label: "Node B", type: "endogenous", zone: "test", units: "units",
      description: "", distribution: { type: "continuous", dist: "normal", params: [50, 5] },
      shape: "circle", circuitBreakers: { minValue: 0, maxValue: 200 } },
    { id: "c", label: "Node C", type: "endogenous", zone: "test", units: "units",
      description: "", distribution: { type: "continuous", dist: "normal", params: [25, 3] },
      shape: "circle", circuitBreakers: { minValue: 0, maxValue: 100 } },
    { id: "d", label: "Output D", type: "terminal", zone: "test", units: "units",
      description: "", distribution: { type: "continuous", dist: "normal", params: [10, 1] },
      shape: "rectangle", circuitBreakers: { minValue: 0, maxValue: 50 } },
  ],
  edges: [
    { source: "a", target: "b", relationship: "causes", style: "solid", weight: "normal",
      effect: { type: "linear", coefficient: 0.8 } },
    { source: "b", target: "c", relationship: "causes", style: "solid", weight: "normal",
      effect: { type: "linear", coefficient: 0.7 } },
    { source: "c", target: "d", relationship: "causes", style: "solid", weight: "normal",
      effect: { type: "linear", coefficient: 0.6 } },
  ],
  keyInsights: []
};

const THRESHOLD_MODEL: CausalModel = {
  title: "Threshold Effect Test",
  description: "Tests that threshold effects propagate correctly",
  zones: { "test": { label: "Test", color: "#ccc", description: "" } },
  nodes: [
    { id: "input", label: "Risk Level", type: "exogenous", zone: "test", units: "index",
      description: "", distribution: { type: "continuous", dist: "normal", params: [50, 10] },
      shape: "diamond", circuitBreakers: { minValue: 0, maxValue: 100 } },
    { id: "gate", label: "Risk Gate", type: "endogenous", zone: "test", units: "index",
      description: "", distribution: { type: "continuous", dist: "normal", params: [100, 20] },
      shape: "octagon", circuitBreakers: { minValue: 0, maxValue: 300 } },
    { id: "output", label: "Premium", type: "terminal", zone: "test", units: "bps",
      description: "", distribution: { type: "continuous", dist: "normal", params: [50, 10] },
      shape: "rectangle", circuitBreakers: { minValue: 0, maxValue: 200 } },
  ],
  edges: [
    { source: "input", target: "gate", relationship: "causes", style: "solid", weight: "normal",
      effect: { type: "linear", coefficient: 0.9 } },
    { source: "gate", target: "output", relationship: "causes", style: "solid", weight: "normal",
      effect: { type: "threshold", cutoff: 80, below: 0.2, above: 0.7, smoothness: 2 } },
  ],
  keyInsights: []
};

const MULTIPLICATIVE_MODEL: CausalModel = {
  title: "Multiplicative Effect Test",
  description: "Tests that multiplicative effects scale correctly",
  zones: { "test": { label: "Test", color: "#ccc", description: "" } },
  nodes: [
    { id: "growth", label: "Growth Rate", type: "exogenous", zone: "test", units: "%",
      description: "", distribution: { type: "continuous", dist: "normal", params: [5, 1] },
      shape: "diamond", circuitBreakers: { minValue: -5, maxValue: 20 } },
    { id: "compound", label: "Compounded Value", type: "terminal", zone: "test", units: "index",
      description: "", distribution: { type: "continuous", dist: "normal", params: [100, 10] },
      shape: "rectangle", circuitBreakers: { minValue: 10, maxValue: 500 } },
  ],
  edges: [
    { source: "growth", target: "compound", relationship: "causes", style: "solid", weight: "normal",
      effect: { type: "multiplicative", factor: 2.0, baseline: 5 } },
  ],
  keyInsights: []
};

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  console.log('='.repeat(70));
  console.log('CAUSAL MODEL INTERVENTION TEST SUITE');
  console.log('='.repeat(70));

  let models: CausalModel[] = [];

  if (args.length > 0) {
    // Load model from file
    const filePath = args[0];
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);

    if (!fs.existsSync(absolutePath)) {
      console.error(`Error: File not found: ${absolutePath}`);
      process.exit(1);
    }

    const content = fs.readFileSync(absolutePath, 'utf-8');
    const model = JSON.parse(content) as CausalModel;
    models = [model];
    console.log(`\nLoaded model from: ${filePath}`);
  } else {
    // Run embedded tests
    models = [SIMPLE_LINEAR_MODEL, THRESHOLD_MODEL, MULTIPLICATIVE_MODEL];
    console.log('\nRunning embedded test models...');
  }

  let totalPassed = 0;
  let totalFailed = 0;

  for (const model of models) {
    const { passed, results } = testModel(model);

    const failedTests = results.filter(r => !r.passed);
    if (passed) {
      totalPassed++;
    } else {
      totalFailed++;
    }
  }

  // Final summary
  console.log('\n' + '='.repeat(70));
  console.log('FINAL SUMMARY');
  console.log('='.repeat(70));
  console.log(`Models tested: ${models.length}`);
  console.log(`Passed: ${totalPassed}`);
  console.log(`Failed: ${totalFailed}`);

  if (totalFailed > 0) {
    console.log('\n❌ Some tests failed - interventions may not be propagating correctly');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed - interventions propagate to downstream nodes');
  }
}

main().catch(console.error);
