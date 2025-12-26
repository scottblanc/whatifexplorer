# What If Explorer: Product Requirements Document

## Vision

What If Explorer lets anyone explore cause-and-effect relationships through an interactive visual interface. You describe what you want to understand—"How does the Fed's interest rate policy affect inflation and unemployment?"—and the system generates a causal model you can manipulate to see how changes propagate through the system.

The core insight is that understanding causality requires interaction, not just observation. A static diagram shows you that A causes B causes C. But what happens if you force A to a specific value? How much does C change? What if there are multiple paths? Static diagrams can't answer these questions; interactive simulation can.

## Problem Statement

Understanding causal relationships in complex systems—economics, healthcare, policy, business—is genuinely hard:

**Mental models break down** beyond a few variables. Humans can trace "A affects B affects C" but struggle with "A affects B and D, B affects C and E, D affects C with a threshold effect, and E feeds back to B." Real systems have these structures.

**Interventions have unintended consequences.** A policy designed to reduce unemployment might increase inflation, or might trigger second-order effects through confidence channels that dwarf the direct effect. Without simulation, these are invisible.

**Existing tools require expertise.** Statistical causal inference packages (DoWhy, Ananke) assume you can write code and understand concepts like d-separation. Most people who need causal reasoning can't use these tools.

**Static diagrams are inert.** Textbook causal diagrams show structure but not dynamics. You can't ask "what if?" and get an answer.

What If Explorer addresses this by combining LLM-powered model generation (no coding required) with real-time Monte Carlo simulation (instant feedback on interventions).

## Target Users

**Policy analysts** evaluating intervention effects—what happens if we raise the minimum wage, increase housing supply, or change immigration policy? They need to explore scenarios quickly, not build formal econometric models.

**Business strategists** modeling market dynamics—how do pricing changes affect demand, competitor response, and long-term market position? They think in terms of causal stories but lack tools to formalize and test them.

**Students learning causal reasoning**—seeing the Phillips curve as an interactive model where you can set unemployment and watch inflation respond is more instructive than memorizing the equation.

**Researchers** rapidly prototyping causal hypotheses before investing in formal analysis. "Does this causal structure even make sense?" is faster to answer with visualization than with code.

## Core Interaction Model

The workflow is: **Query → Generate → Explore → Intervene → Learn**

1. User types a causal question in natural language
2. LLM generates a Structural Causal Model (nodes, edges, distributions, effects)
3. Graph renders with a hierarchical layout showing causes and effects
4. User clicks nodes to understand them, sees probability distributions and causal context
5. User sets intervention values ("set interest rate to 7%")
6. Effects propagate through the graph via Monte Carlo simulation
7. User sees downstream distributions shift and draws conclusions

The "aha moment" is when a user sets an intervention and watches the entire downstream graph update. That's when the causal structure becomes tangible.

## Feature Requirements

### Core Features (MVP)

**Natural Language Input**
Users shouldn't need to know what a "node" or "edge" is. They type a question, click Generate, and get a model. The LLM handles translation to formal structure.

**Graph Visualization**
The graph must be immediately readable: causes flow into effects top-to-bottom, related variables are grouped by color, and node shapes indicate roles (inputs vs. outputs vs. intermediates). Users should understand the causal story within seconds.

**Node Inspection**
Clicking a node reveals its description (what the variable represents), its probability distribution (visualized as a density curve), and its causal context (what affects it, what it affects). This is where users build understanding before intervening.

**Interventions (do-operator)**
The slider-and-button interaction implements Pearl's do-operator. Setting a value says "pretend this variable is exactly X, regardless of its causes." The button click triggers propagation—all downstream distributions update to reflect the intervention.

**Effect Propagation**
Monte Carlo sampling makes propagation intuitive. Each node has 100 samples. Interventions fix those samples to a constant. Downstream samples are computed from upstream samples via effect functions. The resulting distributions answer "what would happen if?"

### Extended Features

**Distribution Visualization**
Beyond showing mean values, density curves communicate uncertainty. A tight distribution means we're confident; a wide one means outcomes vary. Percentile markers (5th, 50th, 95th) give users concrete "best case / expected / worst case" framings.

**Key Insights Panel**
The LLM generates textual insights alongside the model: "Interest rates have the strongest effect on housing prices, primarily through the mortgage cost channel" or "There are two paths from Fed policy to unemployment—direct through business investment, and indirect through inflation expectations." These guide exploration.

**Model Validation**
The system catches and repairs common LLM errors: disconnected subgraphs get linked, node types get corrected based on structure, and obviously invalid configurations are rejected with helpful errors.

## Node Types and Shapes

Shapes communicate semantics without requiring users to read labels:

**Parallelograms** are external inputs—variables that affect the system but aren't explained by it. Interest rates set by the Fed, natural disasters, policy changes. These are the levers users can pull.

**Rounded rectangles** are interior variables—they have causes and effects. GDP, consumer confidence, business investment. These sit in the middle of causal chains.

**Hard rectangles** are terminal outcomes—the endpoints we ultimately care about. Employment levels, inflation rates, poverty rates. These have causes but no downstream effects in the model.

**Octagons** are gatekeepers—variables that filter or transform information flow, like "crisis threshold" nodes that activate only under extreme conditions.

## Distribution Types

The LLM chooses appropriate distributions for each variable:

**Normal** for symmetric variables that can be positive or negative: GDP growth rate, temperature change, sentiment scores.

**Lognormal** for positive-only variables with right skew: prices, incomes, firm sizes. These can't go below zero and have long right tails.

**Bounded** for percentages and rates constrained to a range: unemployment (0-100%), conversion rates, capacity utilization.

**Beta** for proportions with flexible shapes: probability of events, market shares, compliance rates.

## Effect Types

Edges carry effect functions that transform how parent values influence children:

**Linear** for direct proportional effects: "A 1% increase in interest rates reduces mortgage applications by X%." These are the bread and butter of causal models.

**Multiplicative** for scaling effects: "Consumer confidence doesn't add to spending, it multiplies it." These capture amplification and dampening.

**Threshold** for regime changes: "Below 5% unemployment, inflation accelerates. Above 5%, it's stable." These model tipping points and phase transitions.

**Logistic** for probability effects: "Each point of economic stress increases the probability of crisis by X%." These are for binary outcomes.

## Success Criteria

**Usability**: A user with no causal inference background can generate and meaningfully explore a model in under 3 minutes.

**Correctness**: Interventions produce plausible distributions—no explosions (infinite values), no collapses (zero variance), no violations of physical constraints.

**Performance**: Intervention updates feel instant (<100ms). Model generation is acceptable with loading feedback (<10s typical).

**Insight**: Users report learning something non-obvious about the causal system—an effect they didn't expect, a pathway they hadn't considered, or a sensitivity they underestimated.

## Future Directions

**Counterfactual comparison**: Split-screen view showing "actual" vs. "what if" distributions. "If interest rates had been 2% instead of 5%, unemployment would have been 4.2% instead of 6.1%."

**Temporal dynamics**: Currently the model is static—one point in time. Temporal models would show how systems evolve: feedback loops, convergence, oscillations.

**Collaborative features**: Save models, share links, build template libraries for common domains (macroeconomics, epidemiology, marketing funnels).

**Model editing**: Let users modify the LLM-generated model—add nodes, remove edges, adjust effect strengths—to test alternative causal theories.
