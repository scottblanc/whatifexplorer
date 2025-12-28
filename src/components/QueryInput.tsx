'use client';

import { useState } from 'react';
import { useCausalGraphStore } from '@/store/graphStore';
import type { CausalModel } from '@/types/causal';

interface Props {
  onLoadingChange?: (loading: boolean) => void;
}

interface ValidationFeedback {
  feedback: string;
  suggestedQuery?: string;
}

export default function QueryInput({ onLoadingChange }: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [validation, setValidation] = useState<ValidationFeedback | null>(null);
  const query = useCausalGraphStore((s) => s.query);
  const setQuery = useCausalGraphStore((s) => s.setQuery);
  const setModel = useCausalGraphStore((s) => s.setModel);
  const setError = useCausalGraphStore((s) => s.setError);

  const handleSubmit = async (e: React.FormEvent, skipValidation = false) => {
    e.preventDefault();
    if (!query.trim() || isLoading) return;

    setIsLoading(true);
    onLoadingChange?.(true);
    setError(null);
    setValidation(null);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, skipValidation }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate model');
      }

      // Check if we got validation feedback instead of a model
      if (data.validation && !data.validation.isValid) {
        setValidation({
          feedback: data.validation.feedback,
          suggestedQuery: data.validation.suggestedQuery
        });
        return;
      }

      try {
        setModel(data.model as CausalModel);
      } catch (modelError) {
        console.error('[QueryInput] Error setting model:', modelError);
        throw modelError;
      }
    } catch (error) {
      console.error('[QueryInput] Error:', error);
      setError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      console.log('[QueryInput] Finally block - stopping loading');
      setIsLoading(false);
      onLoadingChange?.(false);
    }
  };

  const useSuggestedQuery = () => {
    if (validation?.suggestedQuery) {
      setQuery(validation.suggestedQuery);
      setValidation(null);
    }
  };

  return (
    <div className="space-y-3">
      <form onSubmit={(e) => handleSubmit(e)} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setValidation(null);
          }}
          placeholder="Enter causal query to generate, e.g. How does Federal Reserve policy affect inflation and employment?"
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !query.trim()}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {isLoading ? 'Generating...' : 'Generate'}
        </button>
      </form>

      {validation && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-amber-800 text-sm mb-2">{validation.feedback}</p>
          {validation.suggestedQuery && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-sm text-amber-700">Try:</span>
              <button
                onClick={useSuggestedQuery}
                className="text-sm text-blue-600 hover:text-blue-800 underline"
              >
                {validation.suggestedQuery}
              </button>
            </div>
          )}
          <button
            onClick={(e) => handleSubmit(e as unknown as React.FormEvent, true)}
            className="mt-3 text-xs text-gray-500 hover:text-gray-700 underline"
          >
            Generate anyway
          </button>
        </div>
      )}
    </div>
  );
}
