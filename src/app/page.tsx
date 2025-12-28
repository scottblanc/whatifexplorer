'use client';

import { useState } from 'react';
import CausalGraph from '@/components/CausalGraph';
import NodeInspector from '@/components/NodeInspector';
import EdgeInspector from '@/components/EdgeInspector';
import QueryInput from '@/components/QueryInput';
import InsightsPanel from '@/components/InsightsPanel';
import SensitivityPanel from '@/components/SensitivityPanel';
import { useCausalGraphStore } from '@/store/graphStore';

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showSensitivityPanel, setShowSensitivityPanel] = useState(false);
  const [copied, setCopied] = useState(false);
  const model = useCausalGraphStore((s) => s.model);
  const error = useCausalGraphStore((s) => s.error);
  const interventions = useCausalGraphStore((s) => s.interventions);
  const clearAllInterventions = useCausalGraphStore((s) => s.clearAllInterventions);
  const selectedEdgeId = useCausalGraphStore((s) => s.selectedEdgeId);
  const sampleCount = useCausalGraphStore((s) => s.sampleCount);
  const setSampleCount = useCausalGraphStore((s) => s.setSampleCount);

  const handleCopyJson = async () => {
    if (!model) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(model, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

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
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{model.title}</span>
                    <span className="text-sm text-gray-500">
                      ({model.nodes.length} nodes, {model.edges.length} edges)
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500">Samples:</label>
                      <select
                        value={sampleCount}
                        onChange={(e) => setSampleCount(Number(e.target.value))}
                        className="text-xs border border-gray-300 rounded px-1.5 py-0.5 bg-white"
                      >
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value={200}>200</option>
                        <option value={500}>500</option>
                        <option value={1000}>1000</option>
                      </select>
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
                  <div className="space-y-1.5 mb-3">
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
                  <div className="font-medium text-gray-700 mb-1.5 pt-2 border-t border-gray-200">Effect Types</div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <svg width="24" height="8" viewBox="0 0 24 8">
                        <line x1="0" y1="4" x2="20" y2="4" stroke="#374151" strokeWidth="2"/>
                        <polygon points="20,1 24,4 20,7" fill="#374151"/>
                      </svg>
                      <span className="text-gray-600">Linear</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <svg width="24" height="8" viewBox="0 0 24 8">
                        <line x1="0" y1="4" x2="20" y2="4" stroke="#2563eb" strokeWidth="2"/>
                        <polygon points="20,1 24,4 20,7" fill="#2563eb"/>
                      </svg>
                      <span className="text-gray-600">Multiplicative</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <svg width="24" height="8" viewBox="0 0 24 8">
                        <line x1="0" y1="4" x2="20" y2="4" stroke="#d97706" strokeWidth="2"/>
                        <polygon points="20,1 24,4 20,7" fill="#d97706"/>
                      </svg>
                      <span className="text-gray-600">Threshold</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <svg width="24" height="8" viewBox="0 0 24 8">
                        <line x1="0" y1="4" x2="20" y2="4" stroke="#7c3aed" strokeWidth="2"/>
                        <polygon points="20,1 24,4 20,7" fill="#7c3aed"/>
                      </svg>
                      <span className="text-gray-600">Logistic</span>
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
            {/* Action Buttons */}
            {model && (
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => setShowExportModal(true)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition"
                  title="Export model JSON"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Export
                </button>
                <button
                  onClick={() => setShowSensitivityPanel(true)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition"
                  title="Run sensitivity analysis"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Analyze
                </button>
              </div>
            )}

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 sticky top-6 overflow-hidden">
              <div className="px-3 py-2 border-b border-gray-200">
                <h2 className="font-medium text-gray-900 text-sm">
                  {selectedEdgeId ? 'Edge Inspector' : 'Node Inspector'}
                </h2>
              </div>
              <div className="max-h-[calc(100vh-200px)] overflow-y-auto overflow-x-hidden">
                {selectedEdgeId ? <EdgeInspector /> : <NodeInspector />}
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
            Click edges to view and edit effect types.
          </p>
        </div>
      </footer>

      {/* Export Modal */}
      {showExportModal && model && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-medium text-gray-900">Model JSON Export</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyJson}
                  className={`px-3 py-1 text-sm rounded ${
                    copied
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {copied ? 'Copied!' : 'Copy to clipboard'}
                </button>
                <button
                  onClick={() => setShowExportModal(false)}
                  className="p-1 text-gray-500 hover:text-gray-700"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="p-4 overflow-auto flex-1">
              <pre className="text-xs font-mono bg-gray-50 p-4 rounded border border-gray-200 overflow-x-auto">
                {JSON.stringify(model, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Sensitivity Analysis Panel */}
      <SensitivityPanel
        isOpen={showSensitivityPanel}
        onClose={() => setShowSensitivityPanel(false)}
      />
    </main>
  );
}
