'use client';

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { CausalModel, RenderableDistribution } from '@/types/causal';
import { propagateWithSampling, type NodeSamples } from '@/lib/inference';

interface CausalGraphStore {
  // Model from LLM
  model: CausalModel | null;
  isLoading: boolean;
  error: string | null;

  // Query state
  query: string;

  // Intervention state
  interventions: Map<string, number>;

  // Computed state (from Monte Carlo)
  nodeSamples: NodeSamples;
  nodeDistributions: Map<string, RenderableDistribution>;

  // UI state
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  showInsights: boolean;

  // Actions
  setQuery: (query: string) => void;
  setModel: (model: CausalModel) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  setIntervention: (nodeId: string, value: number) => void;
  clearIntervention: (nodeId: string) => void;
  clearAllInterventions: () => void;

  selectNode: (nodeId: string | null) => void;
  hoverNode: (nodeId: string | null) => void;
  toggleInsights: () => void;

  // Internal
  recompute: () => void;
}

export const useCausalGraphStore = create<CausalGraphStore>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    model: null,
    isLoading: false,
    error: null,
    query: '',
    interventions: new Map(),
    nodeSamples: {},
    nodeDistributions: new Map(),
    selectedNodeId: null,
    hoveredNodeId: null,
    showInsights: true,

    // Query actions
    setQuery: (query) => set({ query }),

    // Model actions
    setModel: (model) => {
      console.log('[Store] Setting model:', model.title);
      console.log('[Store] Model has', model.nodes.length, 'nodes and', model.edges.length, 'edges');
      set({ model, error: null });
      get().recompute();
    },

    setLoading: (isLoading) => {
      console.log('[Store] setLoading called with:', isLoading);
      set({ isLoading });
    },
    setError: (error) => set({ error, isLoading: false }),

    // Intervention actions
    setIntervention: (nodeId, value) => {
      console.log('[Store] Setting intervention:', nodeId, '=', value);
      const interventions = new Map(get().interventions);
      interventions.set(nodeId, value);
      set({ interventions });
      get().recompute();
    },

    clearIntervention: (nodeId) => {
      console.log('[Store] Clearing intervention:', nodeId);
      const interventions = new Map(get().interventions);
      interventions.delete(nodeId);
      set({ interventions });
      get().recompute();
    },

    clearAllInterventions: () => {
      console.log('[Store] Clearing all interventions');
      set({ interventions: new Map() });
      get().recompute();
    },

    // UI actions
    selectNode: (nodeId) => {
      console.log('>>> [Store] selectNode called with:', nodeId);
      set({ selectedNodeId: nodeId });
    },
    hoverNode: (nodeId) => set({ hoveredNodeId: nodeId }),
    toggleInsights: () => set((state) => ({ showInsights: !state.showInsights })),

    // Recompute distributions
    recompute: () => {
      const { model, interventions } = get();
      if (!model) return;

      console.log('[Store] Recomputing distributions with', interventions.size, 'interventions');
      const startTime = performance.now();

      try {
        const { samples, distributions } = propagateWithSampling(model, interventions);
        const elapsed = performance.now() - startTime;
        console.log('[Store] Propagation complete in', elapsed.toFixed(1), 'ms');
        set({ nodeSamples: samples, nodeDistributions: distributions });
      } catch (error) {
        console.error('[Store] Recomputation failed:', error);
        // Don't crash - just log the error
      }
    },
  }))
);

// Selector hooks for performance
export const useModel = () => useCausalGraphStore((s) => s.model);
export const useQuery = () => useCausalGraphStore((s) => s.query);
export const useIsLoading = () => useCausalGraphStore((s) => s.isLoading);
export const useError = () => useCausalGraphStore((s) => s.error);
export const useInterventions = () => useCausalGraphStore((s) => s.interventions);
export const useSelectedNodeId = () => useCausalGraphStore((s) => s.selectedNodeId);
export const useHoveredNodeId = () => useCausalGraphStore((s) => s.hoveredNodeId);
export const useShowInsights = () => useCausalGraphStore((s) => s.showInsights);

export const useNodeDistribution = (nodeId: string) =>
  useCausalGraphStore((s) => s.nodeDistributions.get(nodeId));

export const useNodeSamples = (nodeId: string) =>
  useCausalGraphStore((s) => s.nodeSamples[nodeId]);
