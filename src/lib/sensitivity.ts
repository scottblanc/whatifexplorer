/**
 * Sensitivity Analysis Module
 *
 * Runs interventions on all exogenous nodes and measures downstream impacts.
 */

import { propagateWithSampling, DEFAULT_SAMPLE_COUNT } from './inference';
import { expectedValue } from './distributions';
import type { CausalModel, CausalNode } from '@/types/causal';

export interface NodeImpact {
  nodeId: string;
  nodeLabel: string;
  baseline: number;
  intervened: number;
  absoluteChange: number;
  pctChange: number;
  units?: string;
}

export interface InterventionResult {
  level: string;
  multiplier: number;
  value: number;
  impacts: NodeImpact[];
}

export interface SensitivityResult {
  exogenousNodeId: string;
  exogenousNodeLabel: string;
  units?: string;
  priorMean: number;
  interventions: InterventionResult[];
}

export interface EffectSummary {
  source: string;
  target: string;
  avgPctChange: number;
  avgAbsoluteChange: number;
  units?: string;
}

export interface BottleneckWarning {
  exogenousNode: string;
  terminalNode: string;
  inputChange: string;
  terminalPctChange: number;
  terminalAbsoluteChange: number;
  units?: string;
  suspectedBottleneck?: string;
}

export interface SensitivityAnalysis {
  modelTitle: string;
  timestamp: string;
  sampleCount: number;
  results: SensitivityResult[];
  summary: {
    strongEffects: EffectSummary[];
    weakEffects: EffectSummary[];
    asymmetricEffects: { source: string; target: string; increaseEffect: number; decreaseEffect: number }[];
    bottlenecks: BottleneckWarning[];
  };
}

function mean(samples: number[]): number {
  return samples.reduce((a, b) => a + b, 0) / samples.length;
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

export function runSensitivityAnalysis(
  model: CausalModel,
  sampleCount: number = DEFAULT_SAMPLE_COUNT
): SensitivityAnalysis {
  const exogenousNodes = findExogenousNodes(model);
  const leafNodes = findLeafNodes(model);
  const nodeMap = new Map(model.nodes.map(n => [n.id, n]));

  // Run baseline
  const baseline = propagateWithSampling(model, new Map(), sampleCount);
  const baselineMeans: Record<string, number> = {};
  for (const node of model.nodes) {
    baselineMeans[node.id] = mean(baseline.samples[node.id]);
  }

  const interventionLevels = [
    { label: '50% decrease', multiplier: 0.5 },
    { label: '25% decrease', multiplier: 0.75 },
    { label: '25% increase', multiplier: 1.25 },
    { label: '50% increase', multiplier: 1.5 },
  ];

  const results: SensitivityResult[] = [];

  for (const exoNode of exogenousNodes) {
    const prior = expectedValue(exoNode.distribution);
    const downstream = findDownstreamNodes(model, exoNode.id);
    const interventions: InterventionResult[] = [];

    for (const { label, multiplier } of interventionLevels) {
      const interventionValue = prior * multiplier;
      const result = propagateWithSampling(
        model,
        new Map([[exoNode.id, interventionValue]]),
        sampleCount
      );

      const impacts: NodeImpact[] = [];

      // Only track downstream nodes (including leaves)
      for (const nodeId of downstream) {
        const node = nodeMap.get(nodeId)!;
        const baseVal = baselineMeans[nodeId];
        const intVal = mean(result.samples[nodeId]);
        const absoluteChange = intVal - baseVal;
        const pctChange = baseVal !== 0
          ? ((intVal - baseVal) / Math.abs(baseVal)) * 100
          : 0;

        impacts.push({
          nodeId,
          nodeLabel: node.label,
          baseline: baseVal,
          intervened: intVal,
          absoluteChange,
          pctChange,
          units: node.units,
        });
      }

      interventions.push({
        level: label,
        multiplier,
        value: interventionValue,
        impacts,
      });
    }

    results.push({
      exogenousNodeId: exoNode.id,
      exogenousNodeLabel: exoNode.label,
      units: exoNode.units,
      priorMean: prior,
      interventions,
    });
  }

  // Generate summary
  const effectStrengths: Map<string, {
    increases: number[];
    decreases: number[];
    absoluteChanges: number[];
    units?: string;
  }> = new Map();

  // Find terminal nodes for bottleneck detection
  const terminalNodes = new Set(model.nodes.filter(n => n.type === 'terminal').map(n => n.id));

  for (const result of results) {
    for (const intervention of result.interventions) {
      const isIncrease = intervention.multiplier > 1;
      for (const impact of intervention.impacts) {
        const key = `${result.exogenousNodeLabel} → ${impact.nodeLabel}`;
        if (!effectStrengths.has(key)) {
          effectStrengths.set(key, { increases: [], decreases: [], absoluteChanges: [], units: impact.units });
        }
        const entry = effectStrengths.get(key)!;
        entry.absoluteChanges.push(Math.abs(impact.absoluteChange));
        if (isIncrease) {
          entry.increases.push(Math.abs(impact.pctChange));
        } else {
          entry.decreases.push(Math.abs(impact.pctChange));
        }
      }
    }
  }

  const strongEffects: EffectSummary[] = [];
  const weakEffects: EffectSummary[] = [];
  const asymmetricEffects: { source: string; target: string; increaseEffect: number; decreaseEffect: number }[] = [];
  const bottlenecks: BottleneckWarning[] = [];

  for (const [key, { increases, decreases, absoluteChanges, units }] of effectStrengths) {
    const [source, target] = key.split(' → ');
    const avgIncrease = increases.length > 0 ? increases.reduce((a, b) => a + b, 0) / increases.length : 0;
    const avgDecrease = decreases.length > 0 ? decreases.reduce((a, b) => a + b, 0) / decreases.length : 0;
    const avgOverall = (avgIncrease + avgDecrease) / 2;
    const avgAbsoluteChange = absoluteChanges.length > 0 ? absoluteChanges.reduce((a, b) => a + b, 0) / absoluteChanges.length : 0;

    if (avgOverall > 5) {
      strongEffects.push({ source, target, avgPctChange: avgOverall, avgAbsoluteChange, units });
    } else if (avgOverall < 1) {
      weakEffects.push({ source, target, avgPctChange: avgOverall, avgAbsoluteChange, units });
    }

    // Check for asymmetry (>2x difference between increase and decrease effects)
    if (avgIncrease > 0 && avgDecrease > 0) {
      const ratio = Math.max(avgIncrease, avgDecrease) / Math.min(avgIncrease, avgDecrease);
      if (ratio > 2) {
        asymmetricEffects.push({
          source,
          target,
          increaseEffect: avgIncrease,
          decreaseEffect: avgDecrease,
        });
      }
    }
  }

  // Detect bottlenecks: large input changes (50%) producing small terminal output changes (<10%)
  for (const result of results) {
    // Look at 50% increase intervention
    const largeIntervention = result.interventions.find(i => i.multiplier === 1.5);
    if (!largeIntervention) continue;

    for (const impact of largeIntervention.impacts) {
      // Only check terminal nodes
      if (!terminalNodes.has(impact.nodeId)) continue;

      // Flag if 50% input change produces <10% terminal change
      if (Math.abs(impact.pctChange) < 10) {
        // Find the intermediate node with smallest change to identify bottleneck
        let suspectedBottleneck: string | undefined;
        let smallestIntermediateChange = Infinity;

        for (const intermediateImpact of largeIntervention.impacts) {
          if (intermediateImpact.nodeId === impact.nodeId) continue;
          if (terminalNodes.has(intermediateImpact.nodeId)) continue;

          if (Math.abs(intermediateImpact.pctChange) < smallestIntermediateChange) {
            smallestIntermediateChange = Math.abs(intermediateImpact.pctChange);
            suspectedBottleneck = intermediateImpact.nodeLabel;
          }
        }

        bottlenecks.push({
          exogenousNode: result.exogenousNodeLabel,
          terminalNode: impact.nodeLabel,
          inputChange: '50% increase',
          terminalPctChange: impact.pctChange,
          terminalAbsoluteChange: impact.absoluteChange,
          units: impact.units,
          suspectedBottleneck: smallestIntermediateChange < 5 ? suspectedBottleneck : undefined,
        });
      }
    }
  }

  // Sort by strength
  strongEffects.sort((a, b) => b.avgPctChange - a.avgPctChange);
  weakEffects.sort((a, b) => a.avgPctChange - b.avgPctChange);

  return {
    modelTitle: model.title,
    timestamp: new Date().toISOString(),
    sampleCount,
    results,
    summary: {
      strongEffects: strongEffects.slice(0, 10),
      weakEffects: weakEffects.slice(0, 10),
      asymmetricEffects,
      bottlenecks,
    },
  };
}

/**
 * Format absolute change for display
 */
function formatAbsoluteChange(value: number, units?: string): string {
  const sign = value >= 0 ? '+' : '';
  if (Math.abs(value) >= 1000) {
    return `${sign}${(value / 1000).toFixed(1)}K ${units || ''}`.trim();
  } else if (Math.abs(value) >= 1) {
    return `${sign}${value.toFixed(1)} ${units || ''}`.trim();
  } else {
    return `${sign}${value.toFixed(2)} ${units || ''}`.trim();
  }
}

/**
 * Format sensitivity analysis for LLM consumption
 */
export function formatAnalysisForLLM(analysis: SensitivityAnalysis): string {
  let output = `# Sensitivity Analysis Report\n\n`;
  output += `Model: ${analysis.modelTitle}\n`;
  output += `Samples: ${analysis.sampleCount}\n\n`;

  output += `## Summary\n\n`;

  // Bottlenecks are highest priority - these indicate serious propagation issues
  if (analysis.summary.bottlenecks.length > 0) {
    output += `### ⚠️ BOTTLENECK WARNINGS - Weak End-to-End Propagation\n`;
    output += `These paths show large input changes producing small terminal output changes:\n\n`;
    for (const b of analysis.summary.bottlenecks) {
      output += `- **${b.exogenousNode} → ${b.terminalNode}**: ${b.inputChange} only produces ${b.terminalPctChange.toFixed(1)}% change (${formatAbsoluteChange(b.terminalAbsoluteChange, b.units)})\n`;
      if (b.suspectedBottleneck) {
        output += `  - Suspected bottleneck: ${b.suspectedBottleneck} (weak intermediate effect)\n`;
      }
    }
    output += `\n`;
  }

  if (analysis.summary.strongEffects.length > 0) {
    output += `### Strong Effects (>5% average change)\n`;
    for (const e of analysis.summary.strongEffects) {
      output += `- ${e.source} → ${e.target}: ${e.avgPctChange.toFixed(1)}% avg (${formatAbsoluteChange(e.avgAbsoluteChange, e.units)})\n`;
    }
    output += `\n`;
  }

  if (analysis.summary.weakEffects.length > 0) {
    output += `### Weak Effects (<1% average change) - May need stronger coefficients\n`;
    for (const e of analysis.summary.weakEffects) {
      output += `- ${e.source} → ${e.target}: ${e.avgPctChange.toFixed(2)}% avg (${formatAbsoluteChange(e.avgAbsoluteChange, e.units)})\n`;
    }
    output += `\n`;
  }

  if (analysis.summary.asymmetricEffects.length > 0) {
    output += `### Asymmetric Effects - Different response to increases vs decreases\n`;
    for (const e of analysis.summary.asymmetricEffects) {
      output += `- ${e.source} → ${e.target}: +${e.increaseEffect.toFixed(1)}% on increase, -${e.decreaseEffect.toFixed(1)}% on decrease\n`;
    }
    output += `\n`;
  }

  output += `## Detailed Results\n\n`;

  for (const result of analysis.results) {
    output += `### ${result.exogenousNodeLabel} (baseline: ${result.priorMean.toFixed(2)} ${result.units || ''})\n\n`;

    for (const intervention of result.interventions) {
      output += `**${intervention.level}** (${intervention.value.toFixed(2)}):\n`;
      const significantImpacts = intervention.impacts.filter(i => Math.abs(i.pctChange) > 0.5);
      if (significantImpacts.length > 0) {
        for (const impact of significantImpacts) {
          const sign = impact.pctChange >= 0 ? '+' : '';
          output += `  - ${impact.nodeLabel}: ${sign}${impact.pctChange.toFixed(1)}% (${impact.baseline.toFixed(1)} → ${impact.intervened.toFixed(1)} ${impact.units || ''})\n`;
        }
      } else {
        output += `  - No significant downstream changes\n`;
      }
    }
    output += `\n`;
  }

  return output;
}
