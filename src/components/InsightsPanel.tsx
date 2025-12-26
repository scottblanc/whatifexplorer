'use client';

import { useCausalGraphStore } from '@/store/graphStore';

export default function InsightsPanel() {
  const model = useCausalGraphStore((s) => s.model);
  const showInsights = useCausalGraphStore((s) => s.showInsights);
  const toggleInsights = useCausalGraphStore((s) => s.toggleInsights);
  const interventions = useCausalGraphStore((s) => s.interventions);

  if (!model) return null;

  return (
    <div className="bg-white border-t border-gray-200">
      <button
        onClick={toggleInsights}
        className="w-full px-4 py-2 flex items-center justify-between text-left hover:bg-gray-50"
      >
        <span className="font-medium text-gray-700">Key Insights</span>
        <span className="text-gray-400">{showInsights ? '▼' : '▶'}</span>
      </button>

      {showInsights && (
        <div className="px-4 pb-4 space-y-3">
          {/* Active interventions summary */}
          {interventions.size > 0 && (
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="text-sm font-medium text-orange-800 mb-1">
                Active Interventions ({interventions.size})
              </div>
              <div className="text-sm text-orange-700">
                {Array.from(interventions.entries()).map(([nodeId, value]) => {
                  const node = model.nodes.find(n => n.id === nodeId);
                  return (
                    <div key={nodeId}>
                      {node?.label}: <strong>{value.toFixed(2)}</strong>{node?.units || ''}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Model insights */}
          {model.keyInsights && model.keyInsights.length > 0 && (
            <div className="space-y-2">
              {model.keyInsights.map((insight, i) => (
                <div
                  key={i}
                  className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800"
                >
                  {insight}
                </div>
              ))}
            </div>
          )}

          {/* Model metadata */}
          <div className="text-xs text-gray-400 pt-2 border-t">
            <div>{model.nodes.length} nodes, {model.edges.length} edges</div>
            <div>{Object.keys(model.zones).length} zones: {Object.values(model.zones).map(z => z.label).join(', ')}</div>
          </div>
        </div>
      )}
    </div>
  );
}
