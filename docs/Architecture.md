# What If Explorer: Technical Architecture

This document covers the system and UI architecture of What If Explorer. For details on the causal modeling and inference algorithms, see [CausalModeling.md](./CausalModeling.md).

## System Architecture

![System Overview](./images/system-overview.png)

### Client-Side Design

The architecture is entirely client-side except for LLM calls. This keeps the system simple (no backend to deploy) and enables real-time interactivity—when a user drags an intervention slider, the inference engine runs immediately in the browser without network latency.

This design means:
- **No backend infrastructure** beyond static hosting
- **No user data leaves the browser** (except queries sent to Gemini)
- **Instant feedback** on interventions (sub-100ms updates)
- **Offline capable** once a model is loaded (except for generating new models)

The tradeoff is that heavy computation must happen client-side. For our use case (100 samples, ~20 nodes), this is fine—propagation completes in 20-50ms. Larger models would need Web Worker offloading or reduced sample counts.

### Data Flow

![Data Flow](./images/data-flow.png)

Data flows in one direction: user action → state change → recomputation → render. This unidirectional pattern eliminates bugs where UI gets out of sync with underlying data—there's exactly one path for updates to take.

**Model Generation Flow**

When the user submits a query, the `QueryInput` component calls the Gemini API via a Next.js API route (to keep the API key server-side). The LLM returns a complete causal model as JSON—nodes with probability distributions, edges with effect functions, and zones for visual grouping.

The component doesn't render anything itself. It calls `setModel()` on the store, which triggers a cascade: save the model, call `recompute()` to generate initial distributions via Monte Carlo sampling, and React's subscription system causes all dependent components to re-render.

**Intervention Flow**

When a user clicks a node, the graph calls `selectNode(id)`. When they adjust the slider and click "Set Value", the NodeInspector calls `setIntervention(nodeId, value)`.

The store immediately triggers `recompute()`. The inference engine sees the intervention, fixes that node's samples to the intervention value, propagates effects to descendants, and returns new distributions. Every subscribed component re-renders.

The slider interaction feels instant because all computation happens synchronously in the browser—no network round-trip.

## UI Architecture

![Component Architecture](./images/component-architecture.png)

The codebase separates concerns into three layers: React components handle user interaction and display, the Zustand store manages all application state, and pure logic modules contain the computational core with no UI dependencies.

### Components

The UI is built from five React components. CausalGraph handles the visualization—it dynamically loads dagre for layout computation, then uses D3 to render the SVG with nodes, edges, and a zone legend. When users click nodes, the component notifies the store, which updates the selection state and triggers the NodeInspector to appear.

NodeInspector is where users interact with individual variables. It displays the node's description and shows its probability distribution as a density curve. The intervention slider lets users set a value, and clicking "Set Value" triggers the inference engine to propagate effects through the graph.

QueryInput handles model generation—users type a causal question, click Generate, and wait for the LLM to return a model. The component manages loading state and error handling, then hands the resulting model to the store.

DistributionChart and InsightsPanel round out the UI. The chart renders small KDE curves with percentile markers. The insights panel shows LLM-generated observations about the causal structure.

### State Management

All application state lives in a single Zustand store. The store holds the causal model from the LLM, a map of active interventions, the computed distributions from Monte Carlo sampling, and UI state like which node is selected.

When interventions change, the store automatically triggers recomputation. The inference engine receives the current model and intervention map, runs Monte Carlo propagation, and returns updated distributions. Components subscribe to specific pieces of state through selector hooks—a component displaying one node's distribution only re-renders when that distribution changes, not when unrelated state updates.

### Graph Rendering

The graph renders as SVG using D3 for element manipulation and dagre for layout. Dagre computes node positions that minimize edge crossings while maintaining a top-to-bottom causal flow—causes appear above their effects.

The rendering rebuilds the entire SVG on each update, layering elements in order: arrow marker definitions, the zone legend bar, edge paths with arrowheads, and finally node groups containing shapes and labels. Node shapes communicate type at a glance—parallelograms for exogenous inputs, rounded rectangles for intermediate variables, hard rectangles for terminal outcomes. Selected and intervened nodes get visual emphasis through borders, shadows, and color changes.

## Technology Stack

**Next.js 14**: React framework with one page and one API route for proxying LLM calls.

**Zustand**: Single-file state store with selector-based subscriptions.

**D3.js + Dagre**: SVG rendering with DAG layout computation.

**jStat**: Statistical sampling and kernel density estimation.

**Tailwind CSS**: Utility-class styling.

