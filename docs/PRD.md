# What If Explorer: Product Requirements Document

## Vision

What If Explorer is a web-based tool that transforms natural language questions about cause-and-effect relationships into interactive, explorable causal graphs. Users describe what they want to understand, and the system generates a Structural Causal Model (SCM) they can manipulate through interventions to observe downstream effects.

## Problem Statement

Understanding causal relationships in complex systems (economics, healthcare, policy) is difficult because:

1. Mental models are limited - humans struggle to trace multi-step causal chains
2. Interventions have unintended consequences that are hard to predict
3. Existing tools require statistical expertise to build and interpret causal models
4. Static diagrams don't show how changes propagate through a system

What If Explorer solves this by letting anyone explore "what if?" scenarios through an intuitive visual interface.

## Target Users

| User Type | Need | How What If Explorer Helps |
|-----------|------|----------------------|
| Policy Analyst | Understand intervention effects | Simulate policy changes, see downstream impacts |
| Business Strategist | Model market dynamics | Explore competitive scenarios, identify leverage points |
| Student | Learn causal reasoning | Interactive exploration beats static textbook diagrams |
| Researcher | Rapid prototyping | Quickly sketch causal hypotheses before formal analysis |

## Core User Flow

```
User enters question → LLM generates causal model → Graph renders → User intervenes → Effects propagate
```

**Example:**
- Input: "How does the Federal Reserve's interest rate policy affect inflation and unemployment?"
- Output: Interactive DAG with nodes for Fed rate, money supply, inflation, unemployment, GDP, etc.
- Interaction: User sets Fed rate to 7%, watches inflation decrease and unemployment rise

## Feature Requirements

### P0: Must Have (MVP)

1. **Natural Language Query Input**
   - Text field for causal questions
   - Generate button triggers LLM call
   - Loading state during generation

2. **Graph Visualization**
   - DAG layout with clear directional flow
   - Nodes grouped by thematic zones (color-coded)
   - Different shapes for node types (exogenous, endogenous, terminal, gatekeeper)
   - Edges showing causal relationships

3. **Node Inspection**
   - Click node to view details
   - Show description, distribution type, current mean
   - Display parent nodes (what affects this) and child nodes (what this affects)

4. **Interventions (do-operator)**
   - Slider to set node value
   - "Set Value" button to apply intervention
   - Visual indicator on intervened nodes (glow effect)
   - "Clear" button to remove intervention

5. **Effect Propagation**
   - Monte Carlo sampling for probabilistic propagation
   - Updates propagate through all descendants
   - Distribution charts update in real-time

### P1: Should Have

1. **Distribution Visualization**
   - Density curves (KDE) for each node
   - Percentile markers (p5, p50, p95)
   - Intervention line overlay

2. **Key Insights Panel**
   - LLM-generated insights about the causal structure
   - Highlights important relationships and bottlenecks

3. **Graph Validation**
   - Ensure graph is connected (no isolated nodes)
   - Fix node types based on structure (terminals have no children)
   - Prevent cycles

### P2: Nice to Have

1. **Counterfactual Mode**
   - Compare two scenarios side-by-side
   - Overlay "actual" vs "counterfactual" distributions
   - Delta report showing differences

2. **Animation**
   - Ripple effect when interventions propagate
   - Distribution morphing between states

3. **Export/Share**
   - Save model as JSON
   - Share link to specific configuration

## Interaction Modes

### Observe Mode (Default)
- View causal structure
- Hover nodes for descriptions
- Click edges for relationship details

### Intervene Mode
- Click node to select
- Set value via slider or input
- Apply intervention to see effects
- Clear individual or all interventions

## Node Types and Shapes

| Type | Shape | Description |
|------|-------|-------------|
| Exogenous | Parallelogram | External inputs with no parents |
| Endogenous | Rounded rectangle | Intermediate variables |
| Terminal | Hard-corner rectangle | Final outcomes with no children |
| Gatekeeper | Octagon | Filters/transforms information flow |

## Distribution Types

| Variable Type | Distribution | Example |
|--------------|--------------|---------|
| Continuous symmetric | Normal | GDP growth rate |
| Continuous positive | Lognormal | Prices, income |
| Bounded percentage | Bounded | Unemployment rate (0-100%) |
| Rates/proportions | Beta | Mortality rate |
| Counts | Poisson | Number of events |

## Effect Types

| Relationship | Effect Type | Example |
|--------------|-------------|---------|
| Direct proportional | Linear (positive) | Higher investment → Higher GDP |
| Inverse relationship | Linear (negative) | Higher rates → Lower borrowing |
| Scaling factor | Multiplicative | Confidence amplifies spending |
| Trigger/gate | Threshold | Crisis only triggers above X |

## Success Metrics

1. **Usability**: Users can generate and explore a model in < 2 minutes
2. **Correctness**: Propagation produces realistic distributions (no explosions/collapses)
3. **Performance**: Interventions update in < 100ms
4. **Engagement**: Users make 3+ interventions per session

## Future Roadmap

### Milestone 1: Counterfactual Toggle
- Compare "actual" vs "what if" scenarios
- Dual distribution overlays
- LLM-generated comparison narrative

### Milestone 2: Temporal Dynamics
- Support for feedback loops
- Discrete time simulation with decay
- Convergence detection
- Playback controls for time evolution

### Milestone 3: Collaborative Features
- Save and share models
- Template library for common domains
- Annotation and commenting
