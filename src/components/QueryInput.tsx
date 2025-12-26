'use client';

import { useState } from 'react';
import { useCausalGraphStore } from '@/store/graphStore';
import type { CausalModel } from '@/types/causal';

interface Props {
  onLoadingChange?: (loading: boolean) => void;
}

export default function QueryInput({ onLoadingChange }: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const query = useCausalGraphStore((s) => s.query);
  const setQuery = useCausalGraphStore((s) => s.setQuery);
  const setModel = useCausalGraphStore((s) => s.setModel);
  const setError = useCausalGraphStore((s) => s.setError);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isLoading) return;

    setIsLoading(true);
    onLoadingChange?.(true);
    setError(null);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate model');
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

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
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
  );
}
