'use client';

import { useState, useMemo, useCallback } from 'react';
import { useCausalGraphStore } from '@/store/graphStore';
import type { EffectFunction, LinearEffect, MultiplicativeEffect, ThresholdEffect, LogisticEffect } from '@/types/causal';

// Effect type colors matching CausalGraph
const effectColors: Record<string, { bg: string; text: string; border: string }> = {
  linear: { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300' },
  multiplicative: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300' },
  threshold: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-300' },
  logistic: { bg: 'bg-violet-100', text: 'text-violet-700', border: 'border-violet-300' },
};

const effectTypeLabels: Record<string, string> = {
  linear: 'Linear',
  multiplicative: 'Multiplicative',
  threshold: 'Threshold',
  logistic: 'Logistic',
};

const effectTypeDescriptions: Record<string, string> = {
  linear: 'Direct proportional relationship',
  multiplicative: 'Percentage-based or compounding effect',
  threshold: 'Step change at a critical value',
  logistic: 'Probability/binary outcome effect',
};

// Helper to create default effect for each type
function createDefaultEffect(type: EffectFunction['type']): EffectFunction {
  switch (type) {
    case 'linear':
      return { type: 'linear', coefficient: 0.1 };
    case 'multiplicative':
      return { type: 'multiplicative', factor: 1.05 };
    case 'threshold':
      return { type: 'threshold', cutoff: 0, below: 0, above: 1 };
    case 'logistic':
      return { type: 'logistic', coefficient: 0.5, threshold: 0 };
  }
}

export default function EdgeInspector() {
  const [isComputing, setIsComputing] = useState(false);
  const model = useCausalGraphStore((s) => s.model);
  const selectedEdgeId = useCausalGraphStore((s) => s.selectedEdgeId);
  const selectEdge = useCausalGraphStore((s) => s.selectEdge);
  const selectNode = useCausalGraphStore((s) => s.selectNode);
  const updateEdgeEffect = useCausalGraphStore((s) => s.updateEdgeEffect);

  // Parse edge ID to get source and target
  const [sourceId, targetId] = useMemo(() => {
    if (!selectedEdgeId) return [null, null];
    const parts = selectedEdgeId.split('->');
    return [parts[0], parts[1]];
  }, [selectedEdgeId]);

  // Find the edge and related nodes
  const edge = useMemo(() => {
    if (!model || !sourceId || !targetId) return null;
    return model.edges.find((e) => e.source === sourceId && e.target === targetId);
  }, [model, sourceId, targetId]);

  const sourceNode = useMemo(() => {
    if (!model || !sourceId) return null;
    return model.nodes.find((n) => n.id === sourceId);
  }, [model, sourceId]);

  const targetNode = useMemo(() => {
    if (!model || !targetId) return null;
    return model.nodes.find((n) => n.id === targetId);
  }, [model, targetId]);

  // Local state for editing
  const [localEffect, setLocalEffect] = useState<EffectFunction | null>(null);

  // Initialize local effect when edge changes
  useMemo(() => {
    if (edge) {
      setLocalEffect({ ...edge.effect });
    }
  }, [edge]);

  const effectType = localEffect?.type || edge?.effect.type;
  const colors = effectType ? effectColors[effectType] : effectColors.linear;

  // Check if local effect differs from saved
  const hasChanges = useMemo(() => {
    if (!edge || !localEffect) return false;
    return JSON.stringify(edge.effect) !== JSON.stringify(localEffect);
  }, [edge, localEffect]);

  const handleTypeChange = useCallback((newType: EffectFunction['type']) => {
    setLocalEffect(createDefaultEffect(newType));
  }, []);

  const handleApplyChanges = useCallback(() => {
    if (!sourceId || !targetId || !localEffect) return;
    setIsComputing(true);
    setTimeout(() => {
      try {
        updateEdgeEffect(sourceId, targetId, localEffect);
      } catch (error) {
        console.error('[EdgeInspector] Error updating edge effect:', error);
      } finally {
        setIsComputing(false);
      }
    }, 10);
  }, [sourceId, targetId, localEffect, updateEdgeEffect]);

  if (!edge || !sourceNode || !targetNode) {
    return (
      <div className="p-4 text-gray-500 text-sm">
        Select an edge to inspect
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 overflow-y-auto max-h-full">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-lg">Edge Effect</h3>
          <div className="flex items-center gap-1 text-sm text-gray-600 mt-1">
            <button
              onClick={() => selectNode(sourceId)}
              className="text-blue-600 hover:underline"
            >
              {sourceNode.label}
            </button>
            <span className="text-gray-400">→</span>
            <button
              onClick={() => selectNode(targetId)}
              className="text-blue-600 hover:underline"
            >
              {targetNode.label}
            </button>
          </div>
        </div>
        <button
          onClick={() => selectEdge(null)}
          className="text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>
      </div>

      {/* Effect Type Badge */}
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${colors.bg} ${colors.text} ${colors.border}`}>
        <span className="font-medium">{effectTypeLabels[effectType || 'linear']}</span>
      </div>
      <p className="text-sm text-gray-500">{effectTypeDescriptions[effectType || 'linear']}</p>

      {/* Effect Type Selector */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Effect Type</label>
        <div className="grid grid-cols-2 gap-2">
          {(['linear', 'multiplicative', 'threshold', 'logistic'] as const).map((type) => {
            const typeColors = effectColors[type];
            const isSelected = effectType === type;
            return (
              <button
                key={type}
                onClick={() => handleTypeChange(type)}
                className={`px-3 py-2 text-sm rounded border transition ${
                  isSelected
                    ? `${typeColors.bg} ${typeColors.text} ${typeColors.border} ring-2 ring-offset-1 ring-${type === 'linear' ? 'gray' : type === 'multiplicative' ? 'blue' : type === 'threshold' ? 'amber' : 'violet'}-400`
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                {effectTypeLabels[type]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Effect Parameters */}
      <div className="space-y-3 pt-2">
        <label className="text-sm font-medium text-gray-700">Parameters</label>

        {localEffect?.type === 'linear' && (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500">Coefficient</label>
              <input
                type="number"
                step="0.01"
                value={(localEffect as LinearEffect).coefficient}
                onChange={(e) => setLocalEffect({
                  ...localEffect,
                  coefficient: parseFloat(e.target.value) || 0,
                } as LinearEffect)}
                className="w-full px-2 py-1.5 text-sm border rounded"
              />
              <p className="text-xs text-gray-400 mt-1">How much target changes per unit of source</p>
            </div>
            <div>
              <label className="text-xs text-gray-500">Intercept (optional)</label>
              <input
                type="number"
                step="0.1"
                value={(localEffect as LinearEffect).intercept ?? ''}
                onChange={(e) => setLocalEffect({
                  ...localEffect,
                  intercept: e.target.value ? parseFloat(e.target.value) : undefined,
                } as LinearEffect)}
                className="w-full px-2 py-1.5 text-sm border rounded"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Saturation (optional)</label>
              <input
                type="number"
                step="0.5"
                value={(localEffect as LinearEffect).saturation ?? ''}
                onChange={(e) => setLocalEffect({
                  ...localEffect,
                  saturation: e.target.value ? parseFloat(e.target.value) : undefined,
                } as LinearEffect)}
                className="w-full px-2 py-1.5 text-sm border rounded"
              />
              <p className="text-xs text-gray-400 mt-1">Cap using tanh to prevent runaway values</p>
            </div>
          </div>
        )}

        {localEffect?.type === 'multiplicative' && (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500">Factor</label>
              <input
                type="number"
                step="0.01"
                value={(localEffect as MultiplicativeEffect).factor}
                onChange={(e) => setLocalEffect({
                  ...localEffect,
                  factor: parseFloat(e.target.value) || 1,
                } as MultiplicativeEffect)}
                className="w-full px-2 py-1.5 text-sm border rounded"
              />
              <p className="text-xs text-gray-400 mt-1">Multiplier applied exponentially (keep close to 1)</p>
            </div>
            <div>
              <label className="text-xs text-gray-500">Baseline (optional)</label>
              <input
                type="number"
                step="0.1"
                value={(localEffect as MultiplicativeEffect).baseline ?? ''}
                onChange={(e) => setLocalEffect({
                  ...localEffect,
                  baseline: e.target.value ? parseFloat(e.target.value) : undefined,
                } as MultiplicativeEffect)}
                className="w-full px-2 py-1.5 text-sm border rounded"
              />
              <p className="text-xs text-gray-400 mt-1">Reference point for normalization</p>
            </div>
          </div>
        )}

        {localEffect?.type === 'threshold' && (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500">Cutoff</label>
              <input
                type="number"
                step="0.1"
                value={(localEffect as ThresholdEffect).cutoff}
                onChange={(e) => setLocalEffect({
                  ...localEffect,
                  cutoff: parseFloat(e.target.value) || 0,
                } as ThresholdEffect)}
                className="w-full px-2 py-1.5 text-sm border rounded"
              />
              <p className="text-xs text-gray-400 mt-1">Critical value where behavior changes</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500">Below</label>
                <input
                  type="number"
                  step="0.1"
                  value={(localEffect as ThresholdEffect).below}
                  onChange={(e) => setLocalEffect({
                    ...localEffect,
                    below: parseFloat(e.target.value) || 0,
                  } as ThresholdEffect)}
                  className="w-full px-2 py-1.5 text-sm border rounded"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Above</label>
                <input
                  type="number"
                  step="0.1"
                  value={(localEffect as ThresholdEffect).above}
                  onChange={(e) => setLocalEffect({
                    ...localEffect,
                    above: parseFloat(e.target.value) || 0,
                  } as ThresholdEffect)}
                  className="w-full px-2 py-1.5 text-sm border rounded"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500">Smoothness (optional)</label>
              <input
                type="number"
                step="0.5"
                value={(localEffect as ThresholdEffect).smoothness ?? ''}
                onChange={(e) => setLocalEffect({
                  ...localEffect,
                  smoothness: e.target.value ? parseFloat(e.target.value) : undefined,
                } as ThresholdEffect)}
                className="w-full px-2 py-1.5 text-sm border rounded"
              />
              <p className="text-xs text-gray-400 mt-1">Higher = sharper transition</p>
            </div>
          </div>
        )}

        {localEffect?.type === 'logistic' && (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500">Coefficient</label>
              <input
                type="number"
                step="0.1"
                value={(localEffect as LogisticEffect).coefficient}
                onChange={(e) => setLocalEffect({
                  ...localEffect,
                  coefficient: parseFloat(e.target.value) || 0,
                } as LogisticEffect)}
                className="w-full px-2 py-1.5 text-sm border rounded"
              />
              <p className="text-xs text-gray-400 mt-1">How strongly source shifts the log-odds</p>
            </div>
            <div>
              <label className="text-xs text-gray-500">Threshold</label>
              <input
                type="number"
                step="0.1"
                value={(localEffect as LogisticEffect).threshold}
                onChange={(e) => setLocalEffect({
                  ...localEffect,
                  threshold: parseFloat(e.target.value) || 0,
                } as LogisticEffect)}
                className="w-full px-2 py-1.5 text-sm border rounded"
              />
              <p className="text-xs text-gray-400 mt-1">Reference point for the effect</p>
            </div>
          </div>
        )}
      </div>

      {/* Apply Button */}
      {hasChanges && (
        <button
          onClick={handleApplyChanges}
          disabled={isComputing}
          className="w-full py-2 text-sm bg-cyan-500 text-white rounded hover:bg-cyan-600 disabled:bg-cyan-300 transition flex items-center justify-center gap-2"
        >
          {isComputing ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Computing...
            </>
          ) : (
            'Apply Changes'
          )}
        </button>
      )}

      {/* Edge metadata */}
      <div className="text-xs text-gray-400 space-y-1 pt-2 border-t">
        <div>Relationship: {edge.relationship}</div>
        <div>Style: {edge.style} | Weight: {edge.weight}</div>
        {edge.label && <div>Label: {edge.label}</div>}
      </div>
    </div>
  );
}
