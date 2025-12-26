# What If Explorer: Technical Architecture

## System Overview

What If Explorer is a client-side web application that generates and visualizes causal models. The system transforms natural language queries into interactive directed acyclic graphs (DAGs) using an LLM, then enables users to perform causal interventions with real-time probabilistic propagation.

![System Overview](./images/system-overview.png)

<!--
```mermaid
flowchart LR
    subgraph Client["Browser (Next.js)"]
        UI[React Components]
        Store[Zustand Store]
        Inference[Inference Engine]
        Viz[D3.js Visualization]
    end

    subgraph External["External Services"]
        LLM[Gemini API]
    end

    User([User]) --> UI
    UI --> Store
    Store --> Inference
    Inference --> Store
    Store --> Viz
    UI --> LLM
    LLM --> UI
```
-->

## Data Flow

The application follows a unidirectional data flow pattern. User actions trigger state updates, which cascade through the inference engine and update the visualization.

![Data Flow](./images/data-flow.png)

<!--
```mermaid
sequenceDiagram
    participant U as User
    participant Q as QueryInput
    participant L as LLM API
    participant S as Zustand Store
    participant I as Inference Engine
    participant G as Graph Viz

    U->>Q: Enter causal question
    Q->>L: Generate model request
    L-->>Q: Causal model JSON
    Q->>S: setModel(model)
    S->>I: recompute()
    I-->>S: samples + distributions
    S->>G: Trigger re-render
    G-->>U: Display graph

    U->>G: Click node
    G->>S: selectNode(id)
    U->>S: setIntervention(id, value)
    S->>I: recompute()
    I-->>S: Updated distributions
    S->>G: Trigger re-render
```
-->

## Component Architecture

The frontend is organized into presentation components, a centralized store, and pure logic modules.

![Component Architecture](./images/component-architecture.png)

<!--
```mermaid
graph TB
    subgraph Pages["Pages (App Router)"]
        Home[page.tsx]
    end

    subgraph Components["React Components"]
        CG[CausalGraph]
        NI[NodeInspector]
        QI[QueryInput]
        DC[DistributionChart]
        IP[InsightsPanel]
    end

    subgraph Store["State Management"]
        ZS[graphStore.ts]
    end

    subgraph Logic["Pure Logic"]
        INF[inference.ts]
        DIST[distributions.ts]
        LLM[llm.ts]
    end

    Home --> CG
    Home --> NI
    Home --> QI
    Home --> IP
    NI --> DC

    CG --> ZS
    NI --> ZS
    QI --> LLM
    LLM --> ZS
    ZS --> INF
    INF --> DIST
```
-->

## State Management

Zustand provides a simple, centralized store for all application state. The store holds the causal model, intervention state, and computed distributions.

<!--
```mermaid
stateDiagram-v2
    [*] --> Empty: App loads
    Empty --> Loading: User submits query
    Loading --> ModelLoaded: LLM returns model
    ModelLoaded --> Computing: Intervention changed
    Computing --> ModelLoaded: Propagation complete
    ModelLoaded --> Loading: New query submitted
```
-->

### Store Structure

The store is divided into three concerns:

1. **Model State**: The causal graph structure from the LLM
2. **Intervention State**: User-set node values (do-operator)
3. **Computed State**: Monte Carlo samples and KDE distributions

When interventions change, the store triggers recomputation, which updates all downstream distributions.

## Inference Engine

The inference engine implements Pearl's do-calculus through Monte Carlo sampling. This approach handles non-linear effects and produces realistic uncertainty propagation.

![Inference Engine](./images/inference-engine.png)

<!--
```mermaid
flowchart TD
    subgraph Input
        M[Causal Model]
        I[Interventions Map]
    end

    subgraph Processing
        TS[Topological Sort]
        LOOP[For each node in order]

        subgraph NodeProcessing["Node Processing"]
            CHECK{Node type?}
            INT[Fixed intervention value]
            EXO[Sample from prior]
            ENDO[Compute from parents]
        end

        CB[Apply Circuit Breakers]
        VAR[Clamp Variance]
    end

    subgraph Output
        SAMP[Node Samples]
        KDE[KDE Distributions]
    end

    M --> TS
    I --> TS
    TS --> LOOP
    LOOP --> CHECK
    CHECK -->|Intervened| INT
    CHECK -->|Exogenous| EXO
    CHECK -->|Endogenous| ENDO
    INT --> CB
    EXO --> CB
    ENDO --> CB
    CB --> VAR
    VAR --> SAMP
    SAMP --> KDE
```
-->

### Propagation Algorithm

Nodes are processed in topological order (parents before children). For each node:

1. **Intervened nodes**: All samples set to the intervention value
2. **Exogenous nodes**: Samples drawn from prior distribution
3. **Endogenous nodes**: Base samples modified by parent effects

Effects are applied sample-by-sample, preserving correlations across the graph.

### Effect Functions

Four effect types transform how parent values influence children:

| Effect Type | Formula | Output |
|-------------|---------|--------|
| Linear | y = base + coef × parent | Shifted distribution |
| Multiplicative | y = base × factor^parent | Scaled distribution |
| Threshold | sigmoid transition | Regime-dependent |
| Logistic | log-odds shift | Probability change |

<!--
```mermaid
graph LR
    subgraph Effects["Effect Types"]
        LIN[Linear]
        MULT[Multiplicative]
        THRESH[Threshold]
        LOG[Logistic]
    end

    LIN -->|"y = base + coef × parent"| OUT1[Shifted distribution]
    MULT -->|"y = base × factor^parent"| OUT2[Scaled distribution]
    THRESH -->|"sigmoid transition"| OUT3[Regime-dependent]
    LOG -->|"log-odds shift"| OUT4[Probability change]
```
-->

### Circuit Breakers

Safety mechanisms prevent distributions from exploding through cascading effects:

| Breaker | Purpose | Implementation |
|---------|---------|----------------|
| Boundary Awareness | Respect physical limits | Clamp to min/max values |
| Variance Clamping | Prevent flat distributions | Compress if std > 3× mean |
| Multiplier Cap | Prevent exponential growth | Limit to 0.1x - 10x range |

## Graph Visualization

D3.js renders the causal graph with dagre providing the layout algorithm. The visualization pipeline:

**Layout** → Dagre Layout Engine → **Rendering** (SVG Container, Arrow Markers, Zone Legend, Edge Paths, Node Groups) → **Shapes** (Rounded Rect, Hard Rect, Parallelogram, Octagon)

<!--
```mermaid
flowchart LR
    subgraph Layout
        DAGRE[Dagre Layout Engine]
    end

    subgraph Rendering
        SVG[SVG Container]
        DEFS[Arrow Markers]
        ZONES[Zone Legend]
        EDGES[Edge Paths]
        NODES[Node Groups]
    end

    subgraph Shapes
        RECT[Rounded Rect]
        HARD[Hard Rect]
        PARA[Parallelogram]
        OCT[Octagon]
    end

    DAGRE --> SVG
    SVG --> DEFS
    SVG --> ZONES
    SVG --> EDGES
    SVG --> NODES
    NODES --> RECT
    NODES --> HARD
    NODES --> PARA
    NODES --> OCT
```
-->

### Node Shape Mapping

Shapes communicate node semantics at a glance:

| Shape | SVG Element | Node Type | Visual Meaning |
|-------|-------------|-----------|----------------|
| Rounded rectangle | `rect` with rx | Standard | Interior variable |
| Hard rectangle | `rect` no rx | Terminal | Final outcome |
| Parallelogram | `polygon` | Exogenous | External input |
| Wide octagon | `polygon` | Gatekeeper | Filter/gate |

## LLM Integration

The LLM generates causal models from natural language through structured prompting. A validation layer ensures model correctness.

**Generation**: User Query → System Prompt + Query → Gemini API → Raw JSON Response

**Validation**: JSON Parse → Structure Validation → Connectivity Check → Node Type Fixing → Valid CausalModel

<!--
```mermaid
flowchart TD
    subgraph Generation
        QUERY[User Query]
        PROMPT[System Prompt + Query]
        GEMINI[Gemini API]
        JSON[Raw JSON Response]
    end

    subgraph Validation
        PARSE[JSON Parse]
        STRUCT[Structure Validation]
        CONNECT[Connectivity Check]
        TYPES[Node Type Fixing]
    end

    subgraph Output
        MODEL[Valid CausalModel]
    end

    QUERY --> PROMPT
    PROMPT --> GEMINI
    GEMINI --> JSON
    JSON --> PARSE
    PARSE --> STRUCT
    STRUCT --> CONNECT
    CONNECT -->|Add edges if needed| TYPES
    TYPES -->|Fix based on structure| MODEL
```
-->

### Validation Steps

1. **Structure Validation**: Verify nodes, edges, and zones arrays exist
2. **Connectivity Check**: Find disconnected components, add edges to connect them
3. **Node Type Fixing**:
   - Nodes with no incoming edges → exogenous
   - Nodes with no outgoing edges → terminal
   - Nodes marked terminal but with children → endogenous

## Technology Stack

| Category | Technology |
|----------|------------|
| Framework | Next.js 14, React 18 |
| State | Zustand |
| Visualization | D3.js, Dagre Layout |
| Statistics | jStat |
| Styling | Tailwind CSS |
| LLM | Google Gemini |

<!--
```mermaid
graph TB
    subgraph Framework
        NEXT[Next.js 14]
        REACT[React 18]
    end

    subgraph State
        ZUSTAND[Zustand]
    end

    subgraph Visualization
        D3[D3.js]
        DAGRE[Dagre Layout]
    end

    subgraph Statistics
        JSTAT[jStat]
    end

    subgraph Styling
        TAILWIND[Tailwind CSS]
    end

    subgraph LLM
        GEMINI[Google Gemini]
    end

    NEXT --> REACT
    REACT --> ZUSTAND
    REACT --> D3
    D3 --> DAGRE
    ZUSTAND --> JSTAT
```
-->

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
