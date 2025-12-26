# What If Explorer: Technical Architecture

## System Overview

What If Explorer is a client-side web application that generates and visualizes causal models. The system transforms natural language queries into interactive directed acyclic graphs (DAGs) using an LLM, then enables users to perform causal interventions with real-time probabilistic propagation.

![System Overview](./images/system-overview.png)

### Architecture Components

**Browser (Next.js)**
- React Components - UI layer
- Zustand Store - State management
- Inference Engine - Monte Carlo propagation
- D3.js Visualization - Graph rendering

**External Services**
- Gemini API - LLM for model generation

### Data Connections
- User interacts with React Components
- Components read/write to Zustand Store
- Store triggers Inference Engine on changes
- Inference Engine updates Store with computed distributions
- Store changes trigger D3.js Visualization updates
- Components call Gemini API for model generation

## Data Flow

The application follows a unidirectional data flow pattern. User actions trigger state updates, which cascade through the inference engine and update the visualization.

![Data Flow](./images/data-flow.png)

### Flow 1: Model Generation
| Step | From | To | Action |
|------|------|-----|--------|
| 1 | User | QueryInput | Enter causal question |
| 2 | QueryInput | LLM API | Generate model request |
| 3 | LLM API | QueryInput | Return causal model JSON |
| 4 | QueryInput | Zustand Store | setModel(model) |
| 5 | Zustand Store | Inference Engine | recompute() |
| 6 | Inference Engine | Zustand Store | Return samples + distributions |
| 7 | Zustand Store | Graph Viz | Trigger re-render |
| 8 | Graph Viz | User | Display graph |

### Flow 2: Intervention
| Step | From | To | Action |
|------|------|-----|--------|
| 1 | User | Graph Viz | Click node |
| 2 | Graph Viz | Zustand Store | selectNode(id) |
| 3 | User | Zustand Store | setIntervention(id, value) |
| 4 | Zustand Store | Inference Engine | recompute() |
| 5 | Inference Engine | Zustand Store | Return updated distributions |
| 6 | Zustand Store | Graph Viz | Trigger re-render |

## Component Architecture

The frontend is organized into presentation components, a centralized store, and pure logic modules.

![Component Architecture](./images/component-architecture.png)

### Pages (App Router)
- `page.tsx` - Main page layout, renders all components

### React Components
| Component | Purpose | Dependencies |
|-----------|---------|--------------|
| CausalGraph | D3 graph visualization | graphStore |
| NodeInspector | Node details panel | graphStore |
| QueryInput | Query input form | llm.ts |
| DistributionChart | KDE visualization (child of NodeInspector) | - |
| InsightsPanel | Key insights display | graphStore |

### State Management
- `graphStore.ts` - Zustand store for all application state

### Pure Logic Modules
| Module | Purpose | Dependencies |
|--------|---------|--------------|
| inference.ts | Monte Carlo propagation | distributions.ts |
| distributions.ts | Probability distributions, KDE | - |
| llm.ts | Gemini API integration + validation | graphStore |

## State Management

Zustand provides a simple, centralized store for all application state. The store holds the causal model, intervention state, and computed distributions.

### State Machine

| State | Transition | Next State |
|-------|------------|------------|
| (initial) | App loads | Empty |
| Empty | User submits query | Loading |
| Loading | LLM returns model | ModelLoaded |
| ModelLoaded | Intervention changed | Computing |
| Computing | Propagation complete | ModelLoaded |
| ModelLoaded | New query submitted | Loading |

### Store Structure

The store is divided into four concerns:

1. **Model State**: The causal graph structure from the LLM
2. **Intervention State**: User-set node values (do-operator)
3. **Computed State**: Monte Carlo samples and KDE distributions
4. **UI State**: Selected node, hovered node, panel visibility

When interventions change, the store triggers recomputation, which updates all downstream distributions.

## Inference Engine

The inference engine implements Pearl's do-calculus through Monte Carlo sampling. This approach handles non-linear effects and produces realistic uncertainty propagation.

![Inference Engine](./images/inference-engine.png)

### Processing Pipeline

**Input**
- Causal Model (nodes, edges, distributions)
- Interventions Map (nodeId → fixed value)

**Processing**
1. Topological Sort - Order nodes so parents are processed before children
2. For each node in order:
   - If **Intervened**: Set all samples to the fixed intervention value
   - If **Exogenous**: Sample from prior distribution
   - If **Endogenous**: Compute from parent samples using effect functions
3. Apply Circuit Breakers - Enforce boundaries, prevent explosions
4. Clamp Variance - Prevent distributions from becoming too flat

**Output**
- Node Samples - Array of 100 sample values per node
- KDE Distributions - Kernel density estimates for visualization

### Propagation Algorithm

Nodes are processed in topological order (parents before children). For each node:

1. **Intervened nodes**: All samples set to the intervention value
2. **Exogenous nodes**: Samples drawn from prior distribution
3. **Endogenous nodes**: Base samples modified by parent effects

Effects are applied sample-by-sample, preserving correlations across the graph.

### Effect Functions

Four effect types transform how parent values influence children:

| Effect Type | Formula | Output | Use Case |
|-------------|---------|--------|----------|
| Linear | y = base + coef × parent | Shifted distribution | Direct proportional effects |
| Multiplicative | y = base × factor^parent | Scaled distribution | Compound growth effects |
| Threshold | sigmoid transition at cutoff | Regime-dependent | Tipping points, phase changes |
| Logistic | log-odds shift | Probability change | Binary outcomes |

### Circuit Breakers

Safety mechanisms prevent distributions from exploding through cascading effects:

| Breaker | Purpose | Implementation |
|---------|---------|----------------|
| Boundary Awareness | Respect physical limits | Clamp to min/max values |
| Variance Clamping | Prevent flat distributions | Compress if std > 3× mean |
| Multiplier Cap | Prevent exponential growth | Limit to 0.1x - 10x range |

## Graph Visualization

D3.js renders the causal graph with dagre providing the layout algorithm.

### Visualization Pipeline

| Stage | Component | Purpose |
|-------|-----------|---------|
| Layout | Dagre Layout Engine | Computes optimal node positions for DAG |
| Container | SVG Container | Root element for all graphics |
| Definitions | Arrow Markers | Reusable arrowhead definitions |
| Legend | Zone Legend | Color-coded category indicators |
| Connections | Edge Paths | Lines connecting nodes with arrows |
| Nodes | Node Groups | Grouped shapes, labels, and indicators |

### Node Shape Mapping

Shapes communicate node semantics at a glance:

| Shape | SVG Element | Node Type | Visual Meaning |
|-------|-------------|-----------|----------------|
| Rounded rectangle | `rect` with rx | Standard | Interior variable |
| Hard rectangle | `rect` no rx | Terminal | Final outcome |
| Parallelogram | `polygon` | Exogenous | External input |
| Wide octagon | `polygon` | Gatekeeper | Filter/gate |

### Visual Indicators

- **Zone colors**: Background color indicates category (e.g., Economic, Social, Environmental)
- **Selection**: Thick border + glow effect on selected node
- **Intervention**: Yellow background + orange border + glow on intervened nodes
- **Mean display**: Each node shows μ=value with units

## LLM Integration

The LLM generates causal models from natural language through structured prompting. A validation layer ensures model correctness.

### Generation Pipeline

| Step | Component | Input | Output |
|------|-----------|-------|--------|
| 1 | User Query | Natural language question | Raw text |
| 2 | System Prompt | Query + schema instructions | Formatted prompt |
| 3 | Gemini API | Prompt | Raw JSON response |
| 4 | JSON Parse | Raw response | Parsed object |

### Validation Pipeline

| Step | Check | Action on Failure |
|------|-------|-------------------|
| 1 | Structure Validation | Verify nodes, edges, zones arrays exist | Throw error |
| 2 | Connectivity Check | Find disconnected components | Add edges to connect |
| 3 | Node Type Fixing | Validate type matches structure | Auto-fix types |

### Node Type Fixing Rules

- Nodes with no incoming edges → `exogenous`
- Nodes with no outgoing edges → `terminal`
- Nodes marked terminal but with children → `endogenous`

## Technology Stack

| Category | Technology | Purpose |
|----------|------------|---------|
| Framework | Next.js 14 | React framework with App Router |
| UI Library | React 18 | Component-based UI |
| State | Zustand | Lightweight state management |
| Visualization | D3.js | SVG-based graph rendering |
| Layout | Dagre | DAG layout algorithm |
| Statistics | jStat | Probability distributions |
| Styling | Tailwind CSS | Utility-first CSS |
| LLM | Google Gemini | Causal model generation |

## File Structure

```
src/
├── app/
│   └── page.tsx              # Main page layout
├── components/
│   ├── CausalGraph.tsx       # D3 graph visualization
│   ├── NodeInspector.tsx     # Node details panel
│   ├── QueryInput.tsx        # Query form
│   ├── DistributionChart.tsx # KDE visualization
│   └── InsightsPanel.tsx     # Key insights display
├── lib/
│   ├── inference.ts          # Monte Carlo propagation
│   ├── distributions.ts      # Probability distributions
│   └── llm.ts               # Gemini integration + validation
├── store/
│   └── graphStore.ts         # Zustand state management
└── types/
    └── causal.ts             # TypeScript type definitions
```

## Performance Considerations

| Operation | Target | Approach |
|-----------|--------|----------|
| Model generation | < 20s | Streaming response, loading indicator |
| Propagation | < 100ms | 100 samples, optimized loops |
| KDE computation | < 50ms | 50 density points, Silverman bandwidth |
| Graph rendering | < 16ms | D3 efficient updates, dagre caching |

The 100-sample Monte Carlo provides a good balance between accuracy and speed. Increasing to 1000 samples would improve precision but risks UI lag during slider interactions.
