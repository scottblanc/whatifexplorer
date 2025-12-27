# What If Explorer
## Requirements Document

| | |
|---|---|
| **Project** | What If Explorer |
| **Author** | Scott White, Claude Code |
| **Version** | 0.1 |
| **Status** | Development |

---

## 1. Executive Summary

What If Explorer transforms natural language questions about cause-and-effect into interactive causal models that users can manipulate. The core hypothesis: people understand how systems work by seeing visual diagrams of causal relationships and by intervening in them to observe effects.

A user asks "How does the Fed's interest rate policy affect unemployment?" The system generates a causal graph showing the pathways: interest rates affect borrowing, borrowing affects investment, investment affects hiring. The user drags a slider to set interest rates to 7% and watches unemployment rise across the graph. That moment of seeing effects propagate is when abstract causal relationships become concrete.

The system combines two capabilities: LLMs that can generate causal diagrams capturing how variables influence each other, and Monte Carlo simulation that can propagate interventions through those structures in real-time. Neither capability alone solves the problem. Static LLM-generated diagrams don't let you explore, and simulation engines require expert-built models.

---

## 2. Problem Statement

### 2.1 Complexity Obscures Causation

Complex systems have dozens of interconnected variables where everything seems to affect everything else. Interest rates influence borrowing, which affects investment, which changes employment, which shifts consumer spending, which feeds back into inflation. The human mind can follow two or three links in a causal chain, but real systems have ten or twenty variables with overlapping pathways, opposing effects, and nonlinear relationships.

Without tools, people either oversimplify (picking one causal story and ignoring alternatives) or throw up their hands (declaring the system too complex to reason about). Neither response leads to good decisions.

### 2.2 Changes Are Hard to Trace

Even when people understand the structure of a system, they struggle to predict how a change propagates. If you raise the minimum wage by 10%, what happens to employment? The direct effect is clear, but the indirect effects through prices, demand, automation incentives, and regional competition are not. Multiple pathways exist, some reinforcing and some opposing.

Static diagrams show structure but not dynamics. Spreadsheets model dynamics but hide structure. Neither lets you see how a specific intervention ripples through interconnected variables while accounting for uncertainty.

### 2.3 Opportunity

LLMs trained on domain knowledge can generate plausible causal structures. Not because they understand causality, but because they've absorbed how experts describe causal relationships in economics, medicine, policy, and other fields. The structures won't be publication-quality, but they'll be good enough to explore.

Combining LLM-generated models with real-time Monte Carlo simulation lets anyone ask "what if?" and get an immediate, probabilistic answer. The interaction teaches causal intuition in a way that reading never can.

### 2.4 Target Users

**Policy analysts** evaluating how interventions ripple through economic or social systems. They need to explain causal chains to stakeholders who won't read regression tables.

**Business strategists** modeling market dynamics, pricing effects, or operational changes. They think causally but lack tools to formalize intuitions.

**Students and educators** learning how complex systems work. Interactive exploration builds intuition faster than static diagrams or equations.

**Curious generalists** who want to understand cause-and-effect in domains they care about (climate, health, economics) without becoming domain experts first.

---

## 3. Goals

### 3.1 Primary Goal

Enable non-experts to generate and meaningfully explore causal models for systems they care about, learning something non-obvious in the process.

### 3.2 Success Definition

A successful session is one where the user either:
- Discovers a causal pathway they hadn't considered
- Learns that an effect is larger or smaller than they expected
- Identifies which variables have the most leverage in the system
- Updates their mental model of how the system works

### 3.3 Non-Goals

- Replacing formal causal inference tools for researchers
- Producing publication-quality causal estimates
- Handling time-series or feedback loops (v1)

---

## 4. Core Design Philosophy

### 4.1 Exploration Over Precision

The goal is insight, not accuracy. A model that's directionally correct and explorable beats a model that's precise but static. Users learn by manipulating and observing, not by reading coefficients.

This means we optimize for:
- Fast generation (get to exploration quickly)
- Responsive interaction (interventions feel instant)
- Plausible distributions (not absurd, even if not calibrated)
- Clear visual communication (understand the graph at a glance)

### 4.2 The do-Operator as Core Interaction

Pearl's do-operator is the conceptual foundation. When users set an intervention, they're asking "what would happen if this variable were forced to this value, regardless of its natural causes?" This is different from observation and correlation; it's the causal question.

The slider-and-button interaction makes this concrete. Users don't need to understand the math; they experience the difference between observing and intervening through the interface.

### 4.3 Uncertainty as First-Class Citizen

Effects don't propagate as point estimates. They propagate as distributions. A 1% increase in interest rates doesn't produce a single unemployment number. It produces a range of outcomes with associated probabilities.

Showing uncertainty prevents false confidence and teaches users that causal systems have inherent variability. The width of a distribution is information.

---

## 5. Functional Requirements

### 5.1 Model Generation

User enters a natural language question about a causal system. The LLM generates a Structural Causal Model containing:
- Nodes with probability distributions and descriptive metadata
- Directed edges with effect functions (linear, multiplicative, threshold, logistic)
- Thematic zones for visual grouping

Generation should complete in under 10 seconds with clear loading feedback. If the LLM produces an invalid or disconnected graph, the system repairs it automatically.

### 5.2 Graph Visualization

The graph renders with causes above effects (top-to-bottom flow). Node shapes encode type: parallelograms for external inputs, rounded rectangles for intermediate variables, hard rectangles for terminal outcomes, and octagons for gatekeepers that filter or transform information flow.

Zone colors group related variables. Each node displays its current mean value. The layout minimizes edge crossings while keeping the graph compact.

### 5.3 Node Inspection

Clicking a node opens an inspector panel showing:
- Description of what the variable represents
- Probability distribution as a density curve with percentile markers
- List of parent nodes (what affects this variable)
- List of child nodes (what this variable affects)
- Intervention controls

### 5.4 Intervention Flow

The intervention slider range derives from the node's distribution bounds. Users adjust the slider and click "Set Value" to apply the intervention. The system:
1. Fixes the intervened node's samples to the set value
2. Propagates effects to all downstream nodes via Monte Carlo sampling
3. Updates all distribution visualizations
4. Highlights the intervened node with distinct visual treatment

Propagation must complete in under 100ms to feel instant. Users can clear individual interventions or all interventions at once.

### 5.5 Insights Panel

The LLM generates textual insights alongside the model:
- Key causal pathways and their relative strengths
- Potential bottlenecks or leverage points
- Non-obvious relationships that might surprise users

These guide exploration for users who aren't sure where to start.

---

## 6. Technical Considerations

### 6.1 Client-Side Computation

All inference runs in the browser. This eliminates server round-trips for interventions, enabling the instant feedback that makes exploration feel responsive. The tradeoff is computation limits: 100 Monte Carlo samples across ~20 nodes is the practical ceiling before UI lag becomes noticeable.

### 6.2 LLM Model Quality

The LLM must produce:
- **Connected graphs**: No isolated subgraphs (repair if necessary)
- **Appropriate distributions**: Bounded variables stay bounded, positive variables stay positive
- **Plausible effect types**: Linear for direct effects, threshold for regime changes, multiplicative for amplification
- **Coherent causal stories**: The graph should make sense to someone with domain knowledge

Validation and repair run on every LLM response. Node types are corrected based on graph structure (nodes without parents become exogenous, nodes without children become terminal).

### 6.3 Distribution Stability

Without safeguards, cascading effects produce absurd distributions: infinite variance, values outside physical bounds, numerical overflow. Circuit breakers enforce:
- Boundary clamping to physical limits
- Variance compression when uncertainty explodes
- Multiplier caps on exponential effects

---

## 7. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| LLM produces nonsensical causal structures | Users lose trust; exploration is meaningless | Validation layer repairs common errors; surface confidence indicators |
| Propagation produces implausible distributions | Users see absurd numbers; breaks immersion | Circuit breakers clamp bounds and variance |
| Users don't understand they're exploring, not predicting | Overconfidence in model outputs | Clear messaging that models are for exploration; show uncertainty prominently |
| Generation too slow | Users abandon before exploring | Optimize prompt; show progress; cache common queries |
| Intervention feels laggy | Breaks the "instant feedback" core experience | Keep computation under 100ms; reduce sample count if needed |

---

## 8. Open Questions

**Model quality assessment**: How do we know if a generated model is "good enough" to explore? What signals indicate a model that will mislead rather than teach?

**User guidance**: For users unfamiliar with causal thinking, what onboarding or guidance helps them get value from exploration?

**Domain coverage**: Which domains produce the best LLM-generated models? Economics and policy seem strong; what about healthcare, engineering, social systems?

**Confidence communication**: How do we communicate that this is exploration, not prediction, without undermining the tool's value?

---

## 9. Future Directions

### 9.1 Counterfactual Comparison

Side-by-side view showing "actual" versus "what if" distributions. Users could compare scenarios: "If interest rates had been 2% instead of 5%, unemployment would have been 4.2% instead of 6.1%."

### 9.2 Temporal Dynamics

Current models are static snapshots. Temporal models would show how systems evolve over time, including feedback loops, convergence, and oscillation. This requires a different inference approach and UI for time navigation.

### 9.3 Model Editing

Let users modify LLM-generated models (add nodes, remove edges, adjust effect strengths) to test alternative causal theories. This bridges the gap between fully automated generation and expert model building.

### 9.4 Collaborative Features

Save and share models. Build template libraries for common domains. Enable teams to explore shared causal models together.
