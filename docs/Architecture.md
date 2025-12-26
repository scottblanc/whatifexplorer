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

**CausalGraph** is the most complex component—it manages a D3.js visualization inside a React lifecycle. On mount, it dynamically imports dagre (the layout library), then uses D3 to render SVG elements for nodes, edges, and the zone legend. Click handlers call back to the store's `selectNode()`.

**NodeInspector** appears when a node is selected. It shows the node's description, probability distribution as a density curve, and an intervention slider. The slider range is derived from the node's distribution bounds. Clicking "Set Value" calls `setIntervention()`.

**QueryInput** is intentionally simple—a text field and a button. On submit, it calls the `/api/generate` endpoint, shows a loading spinner, and on success calls `setModel()`. It knows nothing about causal inference or graph rendering.

**DistributionChart** renders small KDE curves using D3. It takes a `RenderableDistribution` (array of {x, y} points) and draws an area chart with percentile markers.

**InsightsPanel** displays LLM-generated insights about the causal structure—key relationships, bottlenecks, and non-obvious pathways.

### State Management

Zustand was chosen over Redux or React Context for simplicity. The entire store is one file with no boilerplate—actions are just functions that call `set()`. Components subscribe to specific slices using selector functions, so they only re-render when their slice changes.

The store manages four categories:

**Model state**: The causal graph from the LLM (nodes, edges, zones). Set once when the model loads, unchanged until a new query.

**Intervention state**: A Map from node ID to intervention value. The inference engine checks this for each node—if present, it uses the fixed value instead of sampling.

**Computed state**: Monte Carlo samples and KDE distributions for each node. Recomputed whenever model or interventions change.

**UI state**: Selected node, hovered node, panel visibility. Purely presentational.

The store exposes granular selector hooks (`useModel()`, `useInterventions()`, `useNodeDistribution(id)`) so components subscribe to exactly what they need.

### Graph Rendering

D3.js renders the graph because React's reconciliation doesn't handle complex SVG manipulation well. When you need pixel-perfect arrow positioning and custom shapes, D3's imperative approach is cleaner.

**Layout**: Dagre computes optimal node positions for the DAG, minimizing edge crossings and maintaining hierarchical flow (causes above effects). We configure top-to-bottom flow with tuned spacing.

**Rendering**: The SVG is cleared and rebuilt on each render. This sounds expensive but is faster than diffing for our use case. Layers are rendered in order: arrow definitions, zone legend, edges, nodes.

**Shapes**: Node shapes encode type—rounded rectangles for standard nodes, hard rectangles for terminals, parallelograms for exogenous inputs, octagons for gatekeepers.

**Visual feedback**: Selected nodes get thick borders and shadows. Intervened nodes turn yellow with orange borders and glow effects. Each node displays its current mean and units.

## Technology Stack

**Next.js 14** with the App Router provides the framework. We use it lightly—one page and one API route (to proxy Gemini calls and keep the API key server-side).

**Zustand** for state management because it's 10× simpler than Redux. The entire store is one file.

**D3.js + Dagre** for visualization. D3 does SVG rendering, Dagre does DAG layout. We considered vis.js and Cytoscape but needed more control over node shapes.

**jStat** for statistical functions—sampling from distributions and computing KDEs. Well-tested and covers all distribution types we need.

**Tailwind CSS** for styling. Utility classes are faster to iterate with than CSS files.

## File Structure

```
src/
├── app/
│   ├── page.tsx              # Single page app - composes all components
│   └── api/generate/route.ts # Proxies Gemini API calls
├── components/
│   ├── CausalGraph.tsx       # D3 visualization - most complex component
│   ├── NodeInspector.tsx     # Side panel for selected node
│   ├── QueryInput.tsx        # Text input + generate button
│   ├── DistributionChart.tsx # Small KDE curve renderer
│   └── InsightsPanel.tsx     # LLM-generated insights
├── lib/
│   ├── inference.ts          # Monte Carlo propagation (see CausalModeling.md)
│   ├── distributions.ts      # jStat wrappers + KDE computation
│   ├── llm.ts                # Prompt construction + response validation
│   └── sampleModels.ts       # Hardcoded models for testing
├── store/
│   └── graphStore.ts         # All application state in one Zustand store
└── types/
    └── causal.ts             # TypeScript interfaces for the causal model
```

## Performance

The performance budget targets interactive feel—interventions should update instantly.

**Model generation**: 2-10 seconds depending on query complexity. Acceptable with loading feedback since it's a one-time cost.

**Propagation**: Must complete in under 100ms. With 100 samples and ~20 nodes, we see 20-50ms. The algorithm is O(nodes × samples × avg_parents).

**KDE computation**: 10-30ms additional. We compute 50 density points using Silverman's bandwidth rule.

**Rendering**: Targets 16ms (60fps). D3's full re-render finishes in 5-10ms for typical graphs.

The 100-sample count balances smoothness against speed. More samples would give marginally smoother distributions, but the visual difference above ~100 is negligible while computation scales linearly.
