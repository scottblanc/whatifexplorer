'use client';

import { useState } from 'react';
import { useCausalGraphStore } from '@/store/graphStore';
import { runSensitivityAnalysis, formatAnalysisForLLM, type SensitivityAnalysis } from '@/lib/sensitivity';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function SensitivityPanel({ isOpen, onClose }: Props) {
  const model = useCausalGraphStore((s) => s.model);
  const sampleCount = useCausalGraphStore((s) => s.sampleCount);
  const setModel = useCausalGraphStore((s) => s.setModel);

  const [analysis, setAnalysis] = useState<SensitivityAnalysis | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isRecalibrating, setIsRecalibrating] = useState(false);
  const [recalibrationResult, setRecalibrationResult] = useState<{
    summary: string;
    changes: Array<{ source: string; target: string; reason: string }>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !model) return null;

  const handleRunAnalysis = () => {
    setIsRunning(true);
    setError(null);
    setRecalibrationResult(null);

    // Run in a timeout to allow UI to update
    setTimeout(() => {
      try {
        const result = runSensitivityAnalysis(model, sampleCount);
        setAnalysis(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Analysis failed');
      } finally {
        setIsRunning(false);
      }
    }, 50);
  };

  const handleRecalibrate = async () => {
    if (!analysis) return;

    setIsRecalibrating(true);
    setError(null);

    try {
      const report = formatAnalysisForLLM(analysis);
      const response = await fetch('/api/recalibrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, sensitivityReport: report }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Recalibration failed');
      }

      const result = await response.json();
      setRecalibrationResult({
        summary: result.summary,
        changes: result.changes,
      });

      // Update the model in the store
      setModel(result.model);

      // Re-run analysis with new model
      setTimeout(() => {
        const newAnalysis = runSensitivityAnalysis(result.model, sampleCount);
        setAnalysis(newAnalysis);
      }, 100);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Recalibration failed');
    } finally {
      setIsRecalibrating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-medium text-gray-900">Sensitivity Analysis</h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {!analysis && !isRunning && (
            <div className="text-center py-8">
              <p className="text-gray-600 mb-4">
                Run sensitivity analysis to test how changes to input nodes affect downstream outcomes.
              </p>
              <button
                onClick={handleRunAnalysis}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Run Analysis
              </button>
            </div>
          )}

          {isRunning && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent mx-auto mb-4"></div>
              <p className="text-gray-600">Running sensitivity analysis...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded p-3 mb-4 text-red-700 text-sm">
              {error}
            </div>
          )}

          {recalibrationResult && (
            <div className="bg-green-50 border border-green-200 rounded p-3 mb-4">
              <div className="font-medium text-green-800 mb-1">Recalibration Applied</div>
              <p className="text-green-700 text-sm mb-2">{recalibrationResult.summary}</p>
              {recalibrationResult.changes.length > 0 && (
                <div className="text-xs text-green-600">
                  <div className="font-medium mb-1">Changes made:</div>
                  {recalibrationResult.changes.map((c, i) => (
                    <div key={i}>• {c.source} → {c.target}: {c.reason}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {analysis && !isRunning && (
            <div className="space-y-6">
              {/* Summary */}
              <div>
                <h4 className="font-medium text-gray-900 mb-3">Summary</h4>

                {/* Bottleneck Warnings - Highest Priority */}
                {analysis.summary.bottlenecks.length > 0 && (
                  <div className="mb-4 bg-red-50 border border-red-200 rounded p-3">
                    <div className="text-sm font-medium text-red-700 mb-2 flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      Bottleneck Warnings - Weak End-to-End Propagation
                    </div>
                    <div className="text-sm text-red-600 space-y-1.5">
                      {analysis.summary.bottlenecks.map((b, i) => (
                        <div key={i} className="bg-white rounded px-2 py-1">
                          <div className="font-medium">
                            {b.exogenousNode} → {b.terminalNode}
                          </div>
                          <div className="text-xs text-red-500">
                            {b.inputChange} only produces {b.terminalPctChange.toFixed(1)}% change
                            ({b.terminalAbsoluteChange >= 0 ? '+' : ''}{b.terminalAbsoluteChange.toFixed(1)} {b.units || ''})
                          </div>
                          {b.suspectedBottleneck && (
                            <div className="text-xs text-red-400 italic">
                              Suspected bottleneck: {b.suspectedBottleneck}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {analysis.summary.strongEffects.length > 0 && (
                  <div className="mb-3">
                    <div className="text-sm font-medium text-green-700 mb-1">Strong Effects (&gt;5%)</div>
                    <div className="text-sm text-gray-600 space-y-0.5">
                      {analysis.summary.strongEffects.map((e, i) => (
                        <div key={i}>
                          {e.source} → {e.target}: {e.avgPctChange.toFixed(1)}% avg
                          <span className="text-gray-400 ml-1">
                            ({e.avgAbsoluteChange >= 0 ? '+' : ''}{e.avgAbsoluteChange.toFixed(1)} {e.units || ''})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {analysis.summary.weakEffects.length > 0 && (
                  <div className="mb-3">
                    <div className="text-sm font-medium text-orange-700 mb-1">Weak Effects (&lt;1%) - May need calibration</div>
                    <div className="text-sm text-gray-600 space-y-0.5">
                      {analysis.summary.weakEffects.map((e, i) => (
                        <div key={i}>
                          {e.source} → {e.target}: {e.avgPctChange.toFixed(2)}% avg
                          <span className="text-gray-400 ml-1">
                            ({e.avgAbsoluteChange >= 0 ? '+' : ''}{e.avgAbsoluteChange.toFixed(2)} {e.units || ''})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {analysis.summary.asymmetricEffects.length > 0 && (
                  <div className="mb-3">
                    <div className="text-sm font-medium text-purple-700 mb-1">Asymmetric Effects</div>
                    <div className="text-sm text-gray-600 space-y-0.5">
                      {analysis.summary.asymmetricEffects.map((e, i) => (
                        <div key={i}>
                          {e.source} → {e.target}: +{e.increaseEffect.toFixed(1)}% / -{e.decreaseEffect.toFixed(1)}%
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {analysis.summary.bottlenecks.length === 0 &&
                  analysis.summary.weakEffects.length === 0 &&
                  analysis.summary.asymmetricEffects.length === 0 && (
                    <div className="text-sm text-green-600">
                      No issues detected - model propagation looks healthy.
                    </div>
                  )}
              </div>

              {/* Detailed Results */}
              <div>
                <h4 className="font-medium text-gray-900 mb-3">Detailed Results</h4>
                <div className="space-y-4">
                  {analysis.results.map((result) => (
                    <div key={result.exogenousNodeId} className="border border-gray-200 rounded p-3">
                      <div className="font-medium text-gray-800 text-sm mb-2">
                        {result.exogenousNodeLabel}
                        <span className="text-gray-500 font-normal ml-2">
                          (baseline: {result.priorMean.toFixed(2)} {result.units || ''})
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {result.interventions.map((intervention) => (
                          <div key={intervention.level} className="bg-gray-50 rounded p-2">
                            <div className="text-xs font-medium text-gray-600 mb-1">
                              {intervention.level}
                            </div>
                            <div className="text-xs text-gray-500 space-y-0.5">
                              {intervention.impacts
                                .filter((i) => Math.abs(i.pctChange) > 0.5)
                                .slice(0, 5)
                                .map((impact) => (
                                  <div key={impact.nodeId}>
                                    {impact.nodeLabel}:{' '}
                                    <span className={impact.pctChange >= 0 ? 'text-green-600' : 'text-red-600'}>
                                      {impact.pctChange >= 0 ? '+' : ''}{impact.pctChange.toFixed(1)}%
                                    </span>
                                    <span className="text-gray-400 ml-1">
                                      ({impact.baseline.toFixed(1)}→{impact.intervened.toFixed(1)})
                                    </span>
                                  </div>
                                ))}
                              {intervention.impacts.filter((i) => Math.abs(i.pctChange) > 0.5).length === 0 && (
                                <div className="text-gray-400 italic">No significant changes</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {analysis && !isRunning && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between bg-gray-50">
            <button
              onClick={handleRunAnalysis}
              className="text-sm text-gray-600 hover:text-gray-800"
            >
              Re-run Analysis
            </button>
            <div className="flex gap-2">
              {(analysis.summary.bottlenecks.length > 0 || analysis.summary.weakEffects.length > 0 || analysis.summary.asymmetricEffects.length > 0) && (
                <button
                  onClick={handleRecalibrate}
                  disabled={isRecalibrating}
                  className="px-4 py-1.5 bg-purple-600 text-white text-sm rounded hover:bg-purple-700 disabled:opacity-50"
                >
                  {isRecalibrating ? 'Recalibrating...' : 'Recalibrate with AI'}
                </button>
              )}
              <button
                onClick={onClose}
                className="px-4 py-1.5 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
