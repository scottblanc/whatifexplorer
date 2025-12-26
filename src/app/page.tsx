'use client';

import { useState } from 'react';
import CausalGraph from '@/components/CausalGraph';
import NodeInspector from '@/components/NodeInspector';
import QueryInput from '@/components/QueryInput';
import InsightsPanel from '@/components/InsightsPanel';
import { useCausalGraphStore } from '@/store/graphStore';

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const model = useCausalGraphStore((s) => s.model);
  const error = useCausalGraphStore((s) => s.error);
  const interventions = useCausalGraphStore((s) => s.interventions);
  const clearAllInterventions = useCausalGraphStore((s) => s.clearAllInterventions);

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-[1600px] mx-auto">
          <h1 className="text-xl font-semibold text-gray-900">
            What If Explorer - Transform questions into explorable causal graphs
          </h1>
        </div>
      </header>

      {/* Query Input */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-[1600px] mx-auto">
          <QueryInput onLoadingChange={setIsLoading} />
          {error && (
            <div className="mt-2 text-sm text-red-600">
              Error: {error}
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1600px] mx-auto p-6 overflow-x-hidden">
        <div className="flex gap-4">
          {/* Graph Area */}
          <div className="flex-1 min-w-0">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              {/* Toolbar */}
              {model && (
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <div>
                    <span className="font-medium text-gray-900">{model.title}</span>
                    <span className="ml-2 text-sm text-gray-500">
                      ({model.nodes.length} nodes, {model.edges.length} edges)
                    </span>
                  </div>
                  {interventions.size > 0 && (
                    <button
                      onClick={clearAllInterventions}
                      className="text-sm text-orange-600 hover:text-orange-700"
                    >
                      Clear all interventions ({interventions.size})
                    </button>
                  )}
                </div>
              )}

              {/* Graph */}
              <div className="p-4 relative">
                {isLoading ? (
                  <div className="flex items-center justify-center h-[700px] bg-blue-50 rounded-lg border border-blue-200">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mx-auto mb-4"></div>
                      <div className="text-lg font-medium text-blue-700">Generating causal model...</div>
                      <div className="text-sm text-blue-500 mt-2">Analyzing query and building causal relationships</div>
                      <div className="text-xs text-blue-400 mt-1">This may take 10-20 seconds</div>
                    </div>
                  </div>
                ) : (
                  <CausalGraph width={1100} height={700} />
                )}

                {/* Legend */}
                <div className="absolute bottom-6 right-6 bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs shadow-sm">
                  <div className="font-medium text-gray-700 mb-1.5">Node Shapes</div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <svg width="32" height="16" viewBox="0 0 32 16">
                        <rect x="1" y="1" width="30" height="14" rx="4" fill="white" stroke="#2563eb" strokeWidth="2"/>
                      </svg>
                      <span className="text-gray-600">Standard</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <svg width="32" height="16" viewBox="0 0 32 16">
                        <rect x="1" y="1" width="30" height="14" fill="white" stroke="#2563eb" strokeWidth="2"/>
                      </svg>
                      <span className="text-gray-600">Terminal</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <svg width="32" height="16" viewBox="0 0 32 16">
                        <polygon points="5,1 31,1 27,15 1,15" fill="white" stroke="#2563eb" strokeWidth="2"/>
                      </svg>
                      <span className="text-gray-600">Exogenous</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <svg width="32" height="16" viewBox="0 0 32 16">
                        <polygon points="5,1 27,1 31,5 31,11 27,15 5,15 1,11 1,5" fill="white" stroke="#2563eb" strokeWidth="2"/>
                      </svg>
                      <span className="text-gray-600">Gatekeeper</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Insights */}
              <InsightsPanel />
            </div>
          </div>

          {/* Inspector Sidebar */}
          <div className="w-72 flex-shrink-0">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 sticky top-6 overflow-hidden">
              <div className="px-3 py-2 border-b border-gray-200">
                <h2 className="font-medium text-gray-900 text-sm">Node Inspector</h2>
              </div>
              <div className="max-h-[calc(100vh-200px)] overflow-y-auto overflow-x-hidden">
                <NodeInspector />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 px-6 py-4 mt-8">
        <div className="max-w-7xl mx-auto text-center text-sm text-gray-500">
          <p>
            What If Explorer uses Monte Carlo sampling with 100 particles for propagation.
            Click nodes to intervene (do-operator) and see downstream effects.
          </p>
        </div>
      </footer>
    </main>
  );
}
