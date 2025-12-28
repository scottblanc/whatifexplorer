'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useCausalGraphStore } from '@/store/graphStore';
import { expectedValue } from '@/lib/distributions';
import DistributionChart from './DistributionChart';

export default function NodeInspector() {
  const [isComputing, setIsComputing] = useState(false);
  const model = useCausalGraphStore((s) => s.model);
  const selectedNodeId = useCausalGraphStore((s) => s.selectedNodeId);
  const interventions = useCausalGraphStore((s) => s.interventions);
  const nodeDistributions = useCausalGraphStore((s) => s.nodeDistributions);
  const setIntervention = useCausalGraphStore((s) => s.setIntervention);
  const clearIntervention = useCausalGraphStore((s) => s.clearIntervention);
  const selectNode = useCausalGraphStore((s) => s.selectNode);

  const node = useMemo(() => {
    if (!model || !selectedNodeId) return null;
    return model.nodes.find((n) => n.id === selectedNodeId);
  }, [model, selectedNodeId]);

  const distribution = useMemo(() => {
    if (!selectedNodeId) return null;
    return nodeDistributions.get(selectedNodeId);
  }, [nodeDistributions, selectedNodeId]);

  const intervention = interventions.get(selectedNodeId || '');
  const isIntervened = intervention !== undefined;

  const priorMean = node ? expectedValue(node.distribution) : 0;
  const minValue = node?.circuitBreakers?.minValue ?? (priorMean - priorMean * 2);
  const maxValue = node?.circuitBreakers?.maxValue ?? (priorMean + priorMean * 2);

  const [localValue, setLocalValue] = useState<number>(intervention ?? priorMean);

  // Update local value when node changes or intervention changes externally
  useEffect(() => {
    if (intervention !== undefined) {
      setLocalValue(intervention);
    } else if (node) {
      setLocalValue(expectedValue(node.distribution));
    }
  }, [node, intervention]);

  // Slider only updates local state - no recomputation until "Set Value" clicked
  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseFloat(e.target.value);
      setLocalValue(value);
    },
    []
  );

  const handleApplyIntervention = useCallback(() => {
    if (!selectedNodeId) return;
    setIsComputing(true);
    // Use setTimeout to allow UI to update before heavy computation
    setTimeout(() => {
      try {
        setIntervention(selectedNodeId, localValue);
      } catch (error) {
        console.error('[NodeInspector] Error setting intervention:', error);
      } finally {
        setIsComputing(false);
      }
    }, 10);
  }, [selectedNodeId, localValue, setIntervention]);

  const handleClearIntervention = useCallback(() => {
    if (!selectedNodeId) return;
    clearIntervention(selectedNodeId);
    if (node) {
      setLocalValue(expectedValue(node.distribution));
    }
  }, [selectedNodeId, node, clearIntervention]);

  // Get parent and child nodes
  const parentNodes = useMemo(() => {
    if (!model || !selectedNodeId) return [];
    return model.edges
      .filter((e) => e.target === selectedNodeId)
      .map((e) => model.nodes.find((n) => n.id === e.source))
      .filter(Boolean);
  }, [model, selectedNodeId]);

  const childNodes = useMemo(() => {
    if (!model || !selectedNodeId) return [];
    return model.edges
      .filter((e) => e.source === selectedNodeId)
      .map((e) => model.nodes.find((n) => n.id === e.target))
      .filter(Boolean);
  }, [model, selectedNodeId]);

  if (!node) {
    return (
      <div className="p-4 text-gray-500 text-sm">
        Select a node to inspect
      </div>
    );
  }

  const zone = model?.zones[node.zone];

  return (
    <div className="p-4 space-y-4 overflow-y-auto max-h-full">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-lg">{node.label}</h3>
          <span
            className="inline-block px-2 py-0.5 text-xs rounded-full"
            style={{ backgroundColor: zone?.color + '20', color: zone?.color }}
          >
            {zone?.label}
          </span>
        </div>
        <button
          onClick={() => selectNode(null)}
          className="text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>
      </div>

      {/* Description */}
      <p className="text-sm text-gray-600">{node.description}</p>

      {/* Distribution Chart */}
      {distribution && (
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-2">
            Distribution
            <span className="ml-1 text-gray-400">
              ({node.distribution.type === 'continuous'
                ? (node.distribution.dist || 'normal')
                : node.distribution.type === 'rate'
                ? 'beta'
                : node.distribution.type})
            </span>
          </div>
          <DistributionChart
            distribution={distribution}
            interventionValue={isIntervened ? intervention : undefined}
            width={240}
            height={100}
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>p5: {distribution.percentiles.p5.toFixed(2)}</span>
            <span>μ: {distribution.mean.toFixed(2)}</span>
            <span>p95: {distribution.percentiles.p95.toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* Intervention Control */}
      {node.type === 'terminal' ? (
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-sm font-medium text-gray-500 mb-1">Output Node</div>
          <p className="text-xs text-gray-400">
            Terminal nodes are model outputs. Intervene on upstream variables to see how this value changes.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Intervene (do-operator)</span>
            {isIntervened && (
              <button
                onClick={handleClearIntervention}
                className="text-xs text-orange-600 hover:text-orange-700"
              >
                Clear
              </button>
            )}
          </div>

          <div className="space-y-1">
            <input
              type="range"
              min={minValue}
              max={maxValue}
              step={(maxValue - minValue) / 100}
              value={localValue}
              onChange={handleSliderChange}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
            />
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={localValue.toFixed(2)}
                onChange={(e) => {
                  const value = parseFloat(e.target.value);
                  if (!isNaN(value)) {
                    setLocalValue(value);
                  }
                }}
                className="flex-1 px-2 py-1 text-sm border rounded"
              />
              <span className="text-sm text-gray-500">{node.units || ''}</span>
            </div>
          </div>

          {/* Show button when value differs from current intervention (or when not intervened) */}
          {(!isIntervened || Math.abs(localValue - (intervention ?? 0)) > 0.001) && (
            <button
              onClick={handleApplyIntervention}
              disabled={isComputing}
              className="w-full py-2 text-sm bg-orange-500 text-white rounded hover:bg-orange-600 disabled:bg-orange-300 transition flex items-center justify-center gap-2"
            >
              {isComputing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Computing...
                </>
              ) : (
                isIntervened ? 'Update Value' : 'Set Value'
              )}
            </button>
          )}
        </div>
      )}

      {/* Node relationships */}
      <div className="space-y-2">
        {parentNodes.length > 0 && (
          <div>
            <div className="text-xs text-gray-500 mb-1">Affected by:</div>
            <div className="flex flex-wrap gap-1">
              {parentNodes.map((parent) => (
                <button
                  key={parent!.id}
                  onClick={() => selectNode(parent!.id)}
                  className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                >
                  {parent!.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {childNodes.length > 0 && (
          <div>
            <div className="text-xs text-gray-500 mb-1">Affects:</div>
            <div className="flex flex-wrap gap-1">
              {childNodes.map((child) => (
                <button
                  key={child!.id}
                  onClick={() => selectNode(child!.id)}
                  className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
                >
                  {child!.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Node metadata */}
      <div className="text-xs text-gray-400 space-y-1 pt-2 border-t">
        <div>Type: {node.type}</div>
        {node.circuitBreakers && (
          <div>
            Bounds: [{node.circuitBreakers.minValue ?? '-∞'}, {node.circuitBreakers.maxValue ?? '∞'}]
          </div>
        )}
      </div>
    </div>
  );
}
