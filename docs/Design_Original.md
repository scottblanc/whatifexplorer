# CausalGraph: Interactive Causal Model Explorer

## Vision

A web-based tool that transforms natural language questions about cause-and-effect relationships into interactive, queryable causal graphs. Users describe what they want to understand (e.g., "How does inflation affect unemployment?"), and the system generates a Structural Causal Model (SCM) they can explore by conditioning on nodes and observing downstream effects.

---

## Core User Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Natural Lang   │────▶│   LLM Generates │────▶│  Graph Renders  │────▶│  User Interacts │
│     Query       │     │   SCM Structure │     │  with D3/Cyto   │     │  & Conditions   │
└─────────────────┘     └─────────────────┘     └─────────────────┘     └─────────────────┘
```

**Example Query:** "What drives housing prices in urban markets?"

**Output:** Interactive DAG with nodes for interest rates, supply constraints, demand factors, speculation, etc., each with appropriate distributions that update when the user intervenes.

---

## Data Model

### Node Schema

```typescript
interface CausalNode {
  id: string;                          // e.g., "V1", "interest_rate"
  label: string;                       // Human-readable name
  description: string;                 // Tooltip explanation

  // Causal Role
  type: 'exogenous' | 'endogenous' | 'terminal' | 'moderator' | 'mediator';

  // Visual
  zone: 'biological' | 'administrative' | 'economic' | 'behavioral' | 'environmental';
  shape: 'circle' | 'octagon' | 'diamond' | 'rectangle';

  // Distribution
  distribution: Distribution;

  // Current state
  observed: boolean;                   // Has user set this value?
  conditionedValue: number | null;     // User-set value (intervention)
  currentDistribution: Distribution;  // Updated based on parents
}
```

### Distribution Types

Different node types require different probability distributions:

```typescript
type Distribution =
  | { type: 'binary'; p: number }                                    // Bernoulli
  | { type: 'categorical'; categories: string[]; probs: number[] }   // Multinomial
  | { type: 'continuous'; dist: 'normal' | 'lognormal' | 'beta' | 'gamma'; params: number[] }
  | { type: 'bounded'; min: number; max: number; mode: number }      // Triangular/PERT
  | { type: 'count'; lambda: number }                                // Poisson
  | { type: 'rate'; alpha: number; beta: number };                   // Beta for rates/proportions
```

#### Distribution Selection Heuristics

| Node Semantic Type | Recommended Distribution | Example |
|-------------------|-------------------------|---------|
| Yes/No outcomes | `binary` | Infection status, Death occurred |
| Rates/Proportions | `beta` | Mortality rate, Test positivity |
| Counts | `poisson` | Number of cases, Hospital admissions |
| Continuous positive | `lognormal` | Income, Prices, Time durations |
| Bounded continuous | `beta` or `bounded` | Capacity utilization (0-100%) |
| Symmetric continuous | `normal` | Temperature deviation, Growth rates |
| Severity/Intensity scales | `categorical` | Mild/Moderate/Severe/Critical |
| Multiplicative factors | `lognormal` | Transmissibility multiplier |

### Edge Schema

```typescript
interface CausalEdge {
  source: string;           // Source node ID
  target: string;           // Target node ID

  // Causal semantics
  relationship: 'causes' | 'moderates' | 'mediates' | 'selects';

  // Effect specification
  effect: EffectFunction;

  // Visual
  style: 'solid' | 'dashed';
  weight: 'heavy' | 'normal' | 'light';
}

// How parent values influence child distribution
type EffectFunction =
  | { type: 'linear'; coefficient: number; intercept?: number }
  | { type: 'logistic'; coefficient: number; threshold: number }
  | { type: 'multiplicative'; factor: number }
  | { type: 'threshold'; cutoff: number; below: number; above: number }
  | { type: 'custom'; formula: string };  // For complex relationships
```

---

## LLM Prompt Engineering

### System Prompt Template

```markdown
You are a causal inference expert. Given a user's question about cause-and-effect
relationships, generate a Structural Causal Model (SCM) in the following JSON format.

## Requirements:
1. Identify 8-20 relevant causal variables
2. Classify each as exogenous (no parents), endogenous, terminal (final outcomes),
   moderator (affects strength of other relationships), or mediator (transmits effects)
3. Assign appropriate probability distributions based on the variable's semantics
4. Define directed edges representing causal relationships with effect functions
5. Group nodes into thematic "zones" for visual organization
6. Identify "gatekeeper" nodes that filter/transform information flow (use octagon shape)
7. Ensure the graph is acyclic (no circular dependencies)

## JSON Schema:

{
  "title": "string - Descriptive title for the causal model",
  "description": "string - 1-2 sentence explanation of what this model captures",

  "zones": {
    "<zone_id>": {
      "label": "string - Human readable zone name",
      "color": "string - Hex color code (e.g., '#3B82F6')",
      "description": "string - What this zone represents"
    }
  },

  "nodes": [
    {
      "id": "string - Unique identifier (snake_case, e.g., 'interest_rate')",
      "label": "string - Human readable name",
      "description": "string - Tooltip explanation of this variable",
      "type": "exogenous | endogenous | terminal | moderator | mediator",
      "zone": "string - Must match a key in zones object",
      "shape": "circle | octagon | diamond | rectangle",
      "units": "string - Optional unit of measurement (e.g., '%', 'USD', 'count')",
      "distribution": {
        // One of the following distribution types:

        // For yes/no outcomes (e.g., infected, defaulted)
        "type": "binary",
        "p": "number 0-1 - Prior probability of true"

        // OR for discrete categories (e.g., severity levels)
        "type": "categorical",
        "categories": ["string - category labels"],
        "probs": ["number - probability for each category, must sum to 1"]

        // OR for continuous variables
        "type": "continuous",
        "dist": "normal | lognormal | beta | gamma",
        "params": ["number - distribution parameters"],
        // For normal: [mean, std_dev]
        // For lognormal: [mu, sigma] (log-scale parameters)
        // For beta: [alpha, beta] (shape parameters)
        // For gamma: [shape, rate]

        // OR for bounded continuous (e.g., percentages, rates)
        "type": "bounded",
        "min": "number - minimum possible value",
        "max": "number - maximum possible value",
        "mode": "number - most likely value"

        // OR for count data (e.g., number of events)
        "type": "count",
        "lambda": "number > 0 - expected count (Poisson parameter)"

        // OR for rates/proportions specifically
        "type": "rate",
        "alpha": "number > 0 - successes + 1",
        "beta": "number > 0 - failures + 1"
      },

      // Physical constraints to prevent unrealistic values
      "circuitBreakers": {
        "minValue": "number | null - Physical floor (e.g., 0 for rates)",
        "maxValue": "number | null - Physical ceiling (e.g., 100 for percentages)",
        "priorWeight": "number 0-1 - Mean reversion strength (default: 0.1)",
        "maxStdDevRatio": "number - Max uncertainty relative to mean (default: 2.0)"
      }
    }
  ],

  "edges": [
    {
      "source": "string - id of source node",
      "target": "string - id of target node",
      "relationship": "causes | moderates | mediates | selects",
      "label": "string - Optional short description of the relationship",
      "style": "solid | dashed",
      "weight": "heavy | normal | light",
      // Temporal properties (for Milestone 2: feedback loops)
      "delay": "number - ticks before effect manifests (default: 0)",
      "decayRate": "number 0-1 - effect decay per tick (default: 0.05, use 0 for permanent)",

      "effect": {
        // One of the following effect types:

        // Linear effect: child_param = base + coefficient * parent_value
        "type": "linear",
        "coefficient": "number - how much parent changes child per unit",
        "intercept": "number - optional baseline adjustment",
        "saturation": "number - optional cap for diminishing returns (uses tanh)"

        // OR Logistic effect (for binary outcomes)
        "type": "logistic",
        "coefficient": "number - log-odds change per unit of parent",
        "threshold": "number - parent value where effect is neutral"

        // OR Multiplicative effect: child_param = base * (factor ^ (parent/baseline))
        "type": "multiplicative",
        "factor": "number - multiplier per unit of parent",
        "baseline": "number - parent value where multiplier equals 1.0"

        // OR Threshold effect: smooth sigmoid transition
        "type": "threshold",
        "cutoff": "number - parent value where effect switches",
        "below": "number - effect when parent << cutoff",
        "above": "number - effect when parent >> cutoff",
        "smoothness": "number - how sharp the transition is (default: 2)"
      }
    }
  ],

  "keyInsights": [
    "string - Important structural insight about the causal model",
    "string - Key bottleneck, feedback mechanism, or intervention point"
  ]
}

## Distribution Selection Guide:

| Variable Type | Distribution | Example |
|--------------|--------------|---------|
| Yes/No events | binary | Infection, Default, Conversion |
| Proportions/Rates 0-1 | rate or beta | Mortality rate, Click-through rate |
| Counts of events | count (Poisson) | Cases, Arrivals, Defects |
| Positive continuous | lognormal | Income, Prices, Durations |
| Bounded percentage | bounded | Capacity utilization, Unemployment rate |
| Unbounded continuous | normal | Growth rate, Temperature anomaly |
| Ordered categories | categorical | Severity (Low/Med/High), Rating (1-5) |

## Edge Effect Guide:

| Relationship Type | Effect Type | When to Use |
|------------------|-------------|-------------|
| Direct proportional | linear (positive coef) | Higher X → Higher Y |
| Direct inverse | linear (negative coef) | Higher X → Lower Y |
| Probability modifier | logistic | X affects probability of binary Y |
| Scaling factor | multiplicative | X amplifies or dampens Y |
| Trigger/Gate | threshold | X must exceed level to affect Y |

## Shape Guide:
- circle: Standard variables
- octagon: Gatekeeper nodes (filter/transform information)
- diamond: Decision points or moderators
- rectangle: Terminal outcomes or measurements
```

### Example LLM Output (Macroeconomy)

```json
{
  "title": "Macroeconomic Causal Dynamics: Monetary Policy Transmission",
  "description": "Models how Federal Reserve policy decisions propagate through the economy to affect inflation, employment, and growth.",

  "zones": {
    "monetary": {
      "label": "Monetary Policy",
      "color": "#3B82F6",
      "description": "Central bank controlled variables and direct policy instruments"
    },
    "financial": {
      "label": "Financial Conditions",
      "color": "#8B5CF6",
      "description": "Credit markets, asset prices, and financial intermediation"
    },
    "prices": {
      "label": "Price Level",
      "color": "#F59E0B",
      "description": "Inflation dynamics and price expectations"
    },
    "real_economy": {
      "label": "Real Economy",
      "color": "#10B981",
      "description": "Output, employment, and consumption"
    }
  },

  "nodes": [
    {
      "id": "fed_funds_rate",
      "label": "Fed Funds Rate",
      "description": "The target interest rate set by the Federal Reserve for overnight lending between banks",
      "type": "exogenous",
      "zone": "monetary",
      "shape": "diamond",
      "units": "%",
      "distribution": { "type": "bounded", "min": 0, "max": 20, "mode": 5.25 }
    },
    {
      "id": "money_supply",
      "label": "Money Supply (M2)",
      "description": "Total money in circulation including cash, checking deposits, and easily convertible near-money",
      "type": "endogenous",
      "zone": "monetary",
      "shape": "circle",
      "units": "trillion USD",
      "distribution": { "type": "continuous", "dist": "lognormal", "params": [3.0, 0.15] }
    },
    {
      "id": "credit_availability",
      "label": "Credit Availability",
      "description": "Ease of obtaining loans for businesses and consumers, affected by bank lending standards",
      "type": "endogenous",
      "zone": "financial",
      "shape": "circle",
      "units": "index",
      "distribution": { "type": "bounded", "min": 0, "max": 100, "mode": 60 }
    },
    {
      "id": "asset_prices",
      "label": "Asset Prices",
      "description": "Stock market valuations and real estate prices, representing wealth effects",
      "type": "endogenous",
      "zone": "financial",
      "shape": "circle",
      "units": "index",
      "distribution": { "type": "continuous", "dist": "lognormal", "params": [4.5, 0.25] }
    },
    {
      "id": "inflation_expectations",
      "label": "Inflation Expectations",
      "description": "Public and market expectations of future inflation, anchored by Fed credibility",
      "type": "mediator",
      "zone": "prices",
      "shape": "octagon",
      "units": "%",
      "distribution": { "type": "continuous", "dist": "normal", "params": [2.5, 0.8] }
    },
    {
      "id": "actual_inflation",
      "label": "CPI Inflation",
      "description": "Year-over-year change in Consumer Price Index measuring cost of living",
      "type": "endogenous",
      "zone": "prices",
      "shape": "circle",
      "units": "%",
      "distribution": { "type": "continuous", "dist": "normal", "params": [3.0, 1.5] }
    },
    {
      "id": "business_investment",
      "label": "Business Investment",
      "description": "Capital expenditure by firms on equipment, structures, and intellectual property",
      "type": "endogenous",
      "zone": "real_economy",
      "shape": "circle",
      "units": "% of GDP",
      "distribution": { "type": "continuous", "dist": "normal", "params": [14, 2] }
    },
    {
      "id": "consumer_spending",
      "label": "Consumer Spending",
      "description": "Household consumption expenditure on goods and services",
      "type": "endogenous",
      "zone": "real_economy",
      "shape": "circle",
      "units": "% growth",
      "distribution": { "type": "continuous", "dist": "normal", "params": [2.5, 1.5] }
    },
    {
      "id": "gdp_growth",
      "label": "Real GDP Growth",
      "description": "Annual growth rate of inflation-adjusted economic output",
      "type": "terminal",
      "zone": "real_economy",
      "shape": "rectangle",
      "units": "%",
      "distribution": { "type": "continuous", "dist": "normal", "params": [2.0, 1.5] }
    },
    {
      "id": "unemployment",
      "label": "Unemployment Rate",
      "description": "Percentage of labor force actively seeking but unable to find work",
      "type": "terminal",
      "zone": "real_economy",
      "shape": "rectangle",
      "units": "%",
      "distribution": { "type": "bounded", "min": 2, "max": 15, "mode": 4.0 }
    }
  ],

  "edges": [
    {
      "source": "fed_funds_rate",
      "target": "money_supply",
      "relationship": "causes",
      "label": "Higher rates reduce money creation",
      "style": "solid",
      "weight": "heavy",
      "effect": { "type": "linear", "coefficient": -0.08 }
    },
    {
      "source": "fed_funds_rate",
      "target": "credit_availability",
      "relationship": "causes",
      "label": "Higher rates tighten lending",
      "style": "solid",
      "weight": "heavy",
      "effect": { "type": "linear", "coefficient": -5.0 }
    },
    {
      "source": "fed_funds_rate",
      "target": "asset_prices",
      "relationship": "causes",
      "label": "Higher rates reduce valuations",
      "style": "solid",
      "weight": "normal",
      "effect": { "type": "linear", "coefficient": -8.0 }
    },
    {
      "source": "fed_funds_rate",
      "target": "inflation_expectations",
      "relationship": "causes",
      "label": "Policy signals commitment to price stability",
      "style": "dashed",
      "weight": "normal",
      "effect": { "type": "linear", "coefficient": -0.15 }
    },
    {
      "source": "money_supply",
      "target": "actual_inflation",
      "relationship": "causes",
      "label": "More money chases same goods",
      "style": "solid",
      "weight": "normal",
      "effect": { "type": "linear", "coefficient": 0.3 }
    },
    {
      "source": "inflation_expectations",
      "target": "actual_inflation",
      "relationship": "causes",
      "label": "Expectations become self-fulfilling",
      "style": "solid",
      "weight": "heavy",
      "effect": { "type": "linear", "coefficient": 0.6 }
    },
    {
      "source": "credit_availability",
      "target": "business_investment",
      "relationship": "causes",
      "label": "Easier credit enables capex",
      "style": "solid",
      "weight": "heavy",
      "effect": { "type": "linear", "coefficient": 0.08 }
    },
    {
      "source": "credit_availability",
      "target": "consumer_spending",
      "relationship": "causes",
      "label": "Credit access enables purchases",
      "style": "solid",
      "weight": "normal",
      "effect": { "type": "linear", "coefficient": 0.03 }
    },
    {
      "source": "asset_prices",
      "target": "consumer_spending",
      "relationship": "causes",
      "label": "Wealth effect on consumption",
      "style": "dashed",
      "weight": "light",
      "effect": { "type": "linear", "coefficient": 0.02 }
    },
    {
      "source": "business_investment",
      "target": "gdp_growth",
      "relationship": "causes",
      "label": "Investment drives output",
      "style": "solid",
      "weight": "heavy",
      "effect": { "type": "linear", "coefficient": 0.15 }
    },
    {
      "source": "consumer_spending",
      "target": "gdp_growth",
      "relationship": "causes",
      "label": "Consumption is 70% of GDP",
      "style": "solid",
      "weight": "heavy",
      "effect": { "type": "linear", "coefficient": 0.5 }
    },
    {
      "source": "gdp_growth",
      "target": "unemployment",
      "relationship": "causes",
      "label": "Okun's Law: growth reduces unemployment",
      "style": "solid",
      "weight": "heavy",
      "effect": { "type": "linear", "coefficient": -0.5 }
    },
    {
      "source": "actual_inflation",
      "target": "consumer_spending",
      "relationship": "causes",
      "label": "Inflation erodes purchasing power",
      "style": "dashed",
      "weight": "light",
      "effect": { "type": "linear", "coefficient": -0.2 }
    }
  ],

  "keyInsights": [
    "The Fed controls inflation primarily through two channels: (1) direct credit tightening that slows demand, and (2) anchoring inflation expectations which are self-fulfilling.",
    "There is a policy lag: rate changes affect financial conditions immediately but take 12-18 months to fully impact GDP and unemployment.",
    "The Phillips Curve trade-off (inflation vs unemployment) is mediated by inflation expectations—if expectations are well-anchored, the Fed can fight inflation with less employment cost.",
    "Asset prices create a 'wealth effect' feedback loop: lower rates boost asset prices, increasing consumer spending, which can fuel inflation."
  ]
}
```

---

## Inference Engine

### Conditioning (do-calculus)

When a user clicks a node and sets a value, this is an **intervention** (do-operator), not mere observation:

```typescript
function intervene(graph: CausalGraph, nodeId: string, value: number): CausalGraph {
  // 1. Set the node's value (cuts incoming edges conceptually)
  graph.nodes[nodeId].conditionedValue = value;
  graph.nodes[nodeId].observed = true;

  // 2. Topologically sort nodes
  const sorted = topologicalSort(graph);

  // 3. Forward propagate through descendants only
  for (const node of sorted) {
    if (node.id === nodeId) continue;
    if (!isDescendant(graph, nodeId, node.id)) continue;

    // Update this node's distribution based on parent values
    node.currentDistribution = computeConditionalDistribution(graph, node);
  }

  return graph;
}
```

### Propagation Strategy: Monte Carlo Sampling

Complex causal graphs with non-linear effects (multiplicative, threshold) make analytical propagation mathematically intractable. We use **Monte Carlo sampling** for flexibility and robustness.

#### Why Monte Carlo?

| Method | Speed | Accuracy | Complexity | Non-linear Support |
|--------|-------|----------|------------|-------------------|
| Analytical | Instant | Perfect | Very High | Breaks quickly |
| Monte Carlo | Fast (~50ms) | Approximate | Low | Excellent |
| Moment Matching | Fast | Good | Medium | Limited |

**Decision:** Use Monte Carlo. Modern browsers handle 1,000-point arrays across 20-node graphs in milliseconds.

#### Core Propagation Loop

```typescript
const SAMPLE_COUNT = 1000;

interface NodeSamples {
  [nodeId: string]: number[];  // Array of SAMPLE_COUNT values
}

function propagateWithSampling(
  graph: CausalGraph,
  interventions: Map<string, number>
): NodeSamples {
  const samples: NodeSamples = {};
  const sorted = topologicalSort(graph);

  for (const node of sorted) {
    if (interventions.has(node.id)) {
      // Intervention: all samples are the fixed value (do-operator)
      samples[node.id] = Array(SAMPLE_COUNT).fill(interventions.get(node.id));
    } else if (node.type === 'exogenous') {
      // Exogenous: sample from prior distribution
      samples[node.id] = sampleFromDistribution(node.distribution, SAMPLE_COUNT);
    } else {
      // Endogenous: compute from parents
      samples[node.id] = computeChildSamples(graph, node, samples);
    }

    // Apply circuit breakers
    samples[node.id] = applyCircuitBreakers(node, samples[node.id]);
  }

  return samples;
}

function computeChildSamples(
  graph: CausalGraph,
  node: CausalNode,
  parentSamples: NodeSamples
): number[] {
  const parentEdges = graph.edges.filter(e => e.target === node.id);
  const baseSamples = sampleFromDistribution(node.distribution, SAMPLE_COUNT);

  // For each sample index, apply all parent effects
  return baseSamples.map((baseValue, i) => {
    let value = baseValue;

    for (const edge of parentEdges) {
      const parentValue = parentSamples[edge.source][i];
      value = applyEffectToSample(value, edge.effect, parentValue, node);
    }

    return value;
  });
}
```

---

### Stable Effect Functions (Damping & Normalization)

To prevent distributions from "exploding" through compounding effects, all effect functions include **damping** and **boundary awareness**.

#### Linear Effect (with Saturation)

```typescript
function applyLinearEffect(
  baseValue: number,
  effect: { coefficient: number; intercept?: number; saturation?: number },
  parentValue: number
): number {
  const delta = effect.coefficient * parentValue + (effect.intercept ?? 0);

  // Optional saturation: diminishing returns as delta grows
  if (effect.saturation) {
    const saturatedDelta = effect.saturation * Math.tanh(delta / effect.saturation);
    return baseValue + saturatedDelta;
  }

  return baseValue + delta;
}
```

#### Multiplicative Effect (with Damping)

Raw multipliers (`y = x * factor`) cause runaway growth. We use **log-linear scaling** with hard caps.

```typescript
function applyMultiplicativeEffect(
  baseValue: number,
  effect: { factor: number; baseline?: number },
  parentValue: number
): number {
  const baseline = effect.baseline ?? 1;

  // Exponential scaling relative to baseline
  const rawMultiplier = Math.pow(effect.factor, parentValue / baseline);

  // CRITICAL: Cap multiplier to prevent explosion (0.1x to 10x range)
  const dampedMultiplier = Math.min(Math.max(rawMultiplier, 0.1), 10);

  return baseValue * dampedMultiplier;
}
```

**Why this works:** If `factor = 1.2` and `parentValue` doubles from baseline, the multiplier is `1.2^2 = 1.44`, not `1.2 * 2 = 2.4`. Growth is logarithmic, not linear.

#### Threshold Effect (Soft Sigmoid)

Hard thresholds create jarring discontinuities. We use a **sigmoid transition** for smooth gating.

```typescript
function applyThresholdEffect(
  baseValue: number,
  effect: { cutoff: number; below: number; above: number; smoothness?: number },
  parentValue: number
): number {
  // Smoothness controls how 'hard' the threshold is (higher = sharper)
  const k = effect.smoothness ?? 2;

  // Sigmoid interpolation: 0 when far below cutoff, 1 when far above
  const weight = 1 / (1 + Math.exp(-k * (parentValue - effect.cutoff)));

  // Blend between 'below' and 'above' effects
  const effectiveDelta = effect.below * (1 - weight) + effect.above * weight;

  return baseValue + effectiveDelta;
}
```

**Visual intuition:**
```
Effect
  │           ╭────── above
  │         ╱
  │       ╱
  │─────╯         below
  └────────┼──────────── parentValue
        cutoff
```

#### Logistic Effect (for Binary Outcomes)

```typescript
function applyLogisticEffect(
  baseProbability: number,
  effect: { coefficient: number; threshold: number },
  parentValue: number
): number {
  // Convert probability to log-odds
  const clampedP = Math.min(Math.max(baseProbability, 0.001), 0.999);
  const logOdds = Math.log(clampedP / (1 - clampedP));

  // Shift log-odds based on parent deviation from threshold
  const newLogOdds = logOdds + effect.coefficient * (parentValue - effect.threshold);

  // Clamp log-odds to prevent extreme probabilities
  const clampedLogOdds = Math.min(Math.max(newLogOdds, -10), 10);

  // Convert back to probability
  return 1 / (1 + Math.exp(-clampedLogOdds));
}
```

---

### Circuit Breakers

Global constraints that keep the graph "playable" regardless of how effects compound.

```typescript
interface CircuitBreakerConfig {
  maxStdDevRatio: number;      // Max std_dev relative to mean (default: 2.0)
  minValue: number | null;     // Physical floor (e.g., 0 for unemployment)
  maxValue: number | null;     // Physical ceiling (e.g., 100 for percentages)
  priorWeight: number;         // Mean reversion strength (0-1, default: 0.1)
}

function applyCircuitBreakers(
  node: CausalNode,
  samples: number[]
): number[] {
  const config = node.circuitBreakers ?? DEFAULT_CIRCUIT_BREAKERS;

  return samples.map(value => {
    let bounded = value;

    // 1. Boundary Awareness: Respect physical limits
    if (config.minValue !== null) {
      bounded = Math.max(bounded, config.minValue);
    }
    if (config.maxValue !== null) {
      bounded = Math.min(bounded, config.maxValue);
    }

    // 2. Elastic Band Effect (Mean Reversion)
    // The further from prior mean, the more "pull" back toward it
    const priorMean = expectedValue(node.distribution);
    const deviation = bounded - priorMean;
    bounded = priorMean + deviation * (1 - config.priorWeight);

    return bounded;
  });
}

// After all samples are computed, clamp variance if needed
function clampVariance(samples: number[], config: CircuitBreakerConfig): number[] {
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length;
  const stdDev = Math.sqrt(variance);

  const maxStdDev = Math.abs(mean) * config.maxStdDevRatio;

  if (stdDev > maxStdDev) {
    // Compress samples toward mean to reduce variance
    const compressionFactor = maxStdDev / stdDev;
    return samples.map(s => mean + (s - mean) * compressionFactor);
  }

  return samples;
}
```

#### Circuit Breaker Behaviors

| Breaker | Problem Solved | Example |
|---------|----------------|---------|
| **Boundary Awareness** | Negative unemployment, >100% rates | `unemployment = max(0, value)` |
| **Variance Clamping** | Flat-line distributions after 5+ hops | Keep std_dev < 2× mean |
| **Elastic Band** | Values drifting to extremes | 10% pull toward prior mean |
| **Multiplier Cap** | Exponential explosion | Multipliers capped at 0.1x–10x |

---

### Converting Samples to Distributions (for UI)

After propagation, convert sample arrays to renderable distributions using **Kernel Density Estimation (KDE)**.

```typescript
interface RenderableDistribution {
  type: 'kde';
  points: { x: number; y: number }[];  // Density curve points
  mean: number;
  stdDev: number;
  percentiles: { p5: number; p25: number; p50: number; p75: number; p95: number };
}

function samplesToKDE(samples: number[], numPoints: number = 100): RenderableDistribution {
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length;
  const stdDev = Math.sqrt(variance);

  // Silverman's rule of thumb for bandwidth
  const bandwidth = 1.06 * stdDev * Math.pow(samples.length, -0.2);

  // Generate density curve
  const min = sorted[0] - 2 * stdDev;
  const max = sorted[sorted.length - 1] + 2 * stdDev;
  const step = (max - min) / numPoints;

  const points: { x: number; y: number }[] = [];
  for (let x = min; x <= max; x += step) {
    // Gaussian kernel
    const density = samples.reduce((sum, s) => {
      const z = (x - s) / bandwidth;
      return sum + Math.exp(-0.5 * z * z);
    }, 0) / (samples.length * bandwidth * Math.sqrt(2 * Math.PI));

    points.push({ x, y: density });
  }

  return {
    type: 'kde',
    points,
    mean,
    stdDev,
    percentiles: {
      p5: sorted[Math.floor(samples.length * 0.05)],
      p25: sorted[Math.floor(samples.length * 0.25)],
      p50: sorted[Math.floor(samples.length * 0.50)],
      p75: sorted[Math.floor(samples.length * 0.75)],
      p95: sorted[Math.floor(samples.length * 0.95)],
    }
  };
}
```

---

### Zustand Store: Handling Slider Interventions

The store manages the reactive flow from user input to graph update.

```typescript
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

interface CausalGraphStore {
  // Graph structure (from LLM)
  graph: CausalGraph;

  // Current intervention state
  interventions: Map<string, number>;

  // Computed samples for each node
  nodeSamples: NodeSamples;

  // Renderable distributions (derived from samples)
  nodeDistributions: Map<string, RenderableDistribution>;

  // Actions
  setIntervention: (nodeId: string, value: number) => void;
  clearIntervention: (nodeId: string) => void;
  clearAllInterventions: () => void;

  // Internal
  _recompute: () => void;
}

export const useCausalGraphStore = create<CausalGraphStore>()(
  subscribeWithSelector((set, get) => ({
    graph: initialGraph,
    interventions: new Map(),
    nodeSamples: {},
    nodeDistributions: new Map(),

    setIntervention: (nodeId, value) => {
      const interventions = new Map(get().interventions);
      interventions.set(nodeId, value);
      set({ interventions });
      get()._recompute();
    },

    clearIntervention: (nodeId) => {
      const interventions = new Map(get().interventions);
      interventions.delete(nodeId);
      set({ interventions });
      get()._recompute();
    },

    clearAllInterventions: () => {
      set({ interventions: new Map() });
      get()._recompute();
    },

    _recompute: () => {
      const { graph, interventions } = get();

      // Run Monte Carlo propagation (~20-50ms)
      const nodeSamples = propagateWithSampling(graph, interventions);

      // Convert to renderable distributions
      const nodeDistributions = new Map<string, RenderableDistribution>();
      for (const [nodeId, samples] of Object.entries(nodeSamples)) {
        nodeDistributions.set(nodeId, samplesToKDE(samples));
      }

      set({ nodeSamples, nodeDistributions });
    },
  }))
);
```

#### Debounced Slider Updates

To prevent lag during slider dragging, debounce recomputation:

```typescript
import { useMemo } from 'react';
import { debounce } from 'lodash-es';

function InterventionSlider({ nodeId }: { nodeId: string }) {
  const node = useCausalGraphStore(s => s.graph.nodes[nodeId]);
  const intervention = useCausalGraphStore(s => s.interventions.get(nodeId));
  const setIntervention = useCausalGraphStore(s => s.setIntervention);

  // Debounce to 16ms (~60fps) for smooth dragging
  const debouncedSet = useMemo(
    () => debounce((value: number) => setIntervention(nodeId, value), 16),
    [nodeId, setIntervention]
  );

  const [localValue, setLocalValue] = useState(intervention ?? expectedValue(node.distribution));

  return (
    <input
      type="range"
      min={node.circuitBreakers?.minValue ?? 0}
      max={node.circuitBreakers?.maxValue ?? 100}
      step={0.1}
      value={localValue}
      onChange={(e) => {
        const value = parseFloat(e.target.value);
        setLocalValue(value);      // Immediate UI update
        debouncedSet(value);       // Debounced propagation
      }}
    />
  );
}
```

---

### Extended Node Schema (Circuit Breakers)

Add to the LLM output schema:

```typescript
interface CausalNode {
  // ... existing fields ...

  // NEW: Physical constraints for this variable
  circuitBreakers?: {
    minValue?: number;           // Physical floor (e.g., 0)
    maxValue?: number;           // Physical ceiling (e.g., 100)
    priorWeight?: number;        // Mean reversion strength (0-1)
    maxStdDevRatio?: number;     // Variance cap relative to mean
  };
}
```

**Example in LLM output:**

```json
{
  "id": "unemployment",
  "label": "Unemployment Rate",
  "distribution": { "type": "bounded", "min": 2, "max": 15, "mode": 4 },
  "circuitBreakers": {
    "minValue": 0,
    "maxValue": 100,
    "priorWeight": 0.15,
    "maxStdDevRatio": 1.5
  }
}
```

---

### Emergent Behaviors from Monte Carlo

The sample-based approach creates realistic emergent effects that analytical methods can't produce:

#### Bimodal Distributions Near Thresholds

When a parent value is near a threshold, some samples cross it while others don't. This creates a **bimodal distribution** (two humps) in the child node—a natural representation of uncertainty about which "regime" the system is in.

```
Parent near threshold:          Child distribution:

  │    ╱╲                         │  ╱╲    ╱╲
  │   ╱  ╲                        │ ╱  ╲  ╱  ╲
  │  ╱    ╲                       │╱    ╲╱    ╲
  └──┼──────────                  └──────────────
  cutoff                          "below"  "above"
                                  outcomes outcomes
```

This happens automatically—no special code needed. The 1,000 samples naturally split between "crossed threshold" and "didn't cross."

#### Outlier Dilution

One extreme parent sample won't ruin the whole distribution—it only affects 1/1000th of the child samples. This makes the system robust to edge cases without explicit outlier detection.

#### Uncertainty Propagation

As effects compound through the graph, uncertainty naturally grows (wider distributions) unless circuit breakers constrain it. This is the correct causal behavior—we're more uncertain about distant downstream effects.

---

### Animating the "Ripple Effect"

To make interventions feel tangible, the UI should animate the propagation of changes through the graph.

#### Animation Strategy

```typescript
interface AnimationState {
  activeRipple: {
    sourceNodeId: string;
    affectedNodes: Set<string>;
    progress: number;  // 0 to 1
  } | null;
}

function animateIntervention(nodeId: string) {
  const descendants = getDescendants(graph, nodeId);
  const maxDepth = getMaxDepth(graph, nodeId, descendants);

  // Animate over 300ms
  const startTime = performance.now();
  const duration = 300;

  function tick() {
    const elapsed = performance.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Highlight nodes based on their depth from intervention
    for (const descId of descendants) {
      const depth = getDepth(graph, nodeId, descId);
      const nodeProgress = Math.max(0, (progress * maxDepth - depth + 1) / 1);

      // Apply visual effect based on nodeProgress (0 = not reached, 1 = fully updated)
      setNodeHighlight(descId, nodeProgress);
    }

    if (progress < 1) {
      requestAnimationFrame(tick);
    }
  }

  requestAnimationFrame(tick);
}
```

#### Visual Effects During Ripple

| Phase | Visual Effect |
|-------|---------------|
| **Wave approaching** | Edge pulses with traveling dot |
| **Node updating** | Node glows, distribution curve morphs |
| **Settled** | Glow fades, new distribution stable |

#### Distribution Morphing

Instead of snapping to new distributions, interpolate between old and new KDE curves:

```typescript
function interpolateKDE(
  oldKDE: RenderableDistribution,
  newKDE: RenderableDistribution,
  t: number  // 0 to 1
): RenderableDistribution {
  // Interpolate each point on the density curve
  const points = oldKDE.points.map((oldPoint, i) => {
    const newPoint = newKDE.points[i] ?? { x: oldPoint.x, y: 0 };
    return {
      x: oldPoint.x + (newPoint.x - oldPoint.x) * t,
      y: oldPoint.y + (newPoint.y - oldPoint.y) * t,
    };
  });

  return {
    type: 'kde',
    points,
    mean: oldKDE.mean + (newKDE.mean - oldKDE.mean) * t,
    stdDev: oldKDE.stdDev + (newKDE.stdDev - oldKDE.stdDev) * t,
    percentiles: {
      p5: lerp(oldKDE.percentiles.p5, newKDE.percentiles.p5, t),
      p25: lerp(oldKDE.percentiles.p25, newKDE.percentiles.p25, t),
      p50: lerp(oldKDE.percentiles.p50, newKDE.percentiles.p50, t),
      p75: lerp(oldKDE.percentiles.p75, newKDE.percentiles.p75, t),
      p95: lerp(oldKDE.percentiles.p95, newKDE.percentiles.p95, t),
    },
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
```

This creates the "economy flight simulator" feel where the user sees distributions physically slide, stretch, and reshape as interventions propagate.

---

## UI Components

### Main Layout

```
┌────────────────────────────────────────────────────────────────────────┐
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  🔍 "How does the Federal Reserve's interest rate policy         │  │
│  │      affect inflation and unemployment?"                [Generate]│  │
│  └──────────────────────────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌─────────────────────────────────────────────┐  ┌─────────────────┐  │
│  │                                             │  │ Node Inspector  │  │
│  │           INTERACTIVE DAG CANVAS            │  │                 │  │
│  │                                             │  │ ┌─────────────┐ │  │
│  │    [M2] ──→ [Rate] ──→ [Inflation]          │  │ │ Inflation   │ │  │
│  │               │              │              │  │ │             │ │  │
│  │               ▼              ▼              │  │ │ Normal(2,1) │ │  │
│  │           [Investment]  [Unemployment]      │  │ │ ──────────  │ │  │
│  │               │              │              │  │ │ Set Value:  │ │  │
│  │               └──────┬───────┘              │  │ │ [===●===]   │ │  │
│  │                      ▼                      │  │ │    5.2%     │ │  │
│  │                   [GDP]                     │  │ └─────────────┘ │  │
│  │                                             │  │                 │  │
│  └─────────────────────────────────────────────┘  │ [Apply] [Reset] │  │
│                                                   └─────────────────┘  │
├────────────────────────────────────────────────────────────────────────┤
│  Insights: When inflation increases, unemployment tends to decrease    │
│  (Phillips Curve). However, this relationship breaks down when...      │
└────────────────────────────────────────────────────────────────────────┘
```

### Node Interaction Panel

When a node is selected:

```typescript
interface NodeInspectorProps {
  node: CausalNode;
  onIntervene: (value: number) => void;
  onReset: () => void;
}

// Shows:
// 1. Node name and description
// 2. Current distribution visualization (mini histogram/density plot)
// 3. Slider or input to set intervention value
// 4. List of parent nodes (what affects this)
// 5. List of child nodes (what this affects)
// 6. "What if?" scenarios
```

### Distribution Visualization

Each node displays its distribution inline or on hover:

- **Binary**: Probability bar (e.g., 73% filled)
- **Continuous**: Mini sparkline density curve
- **Categorical**: Small bar chart
- **Bounded**: Highlighted range with mode marker

---

## Technical Architecture

### Frontend Stack

```
┌─────────────────────────────────────────────────────────┐
│                      React/Next.js                       │
├─────────────────────────────────────────────────────────┤
│  State Management: Zustand or Redux                      │
│  - Graph structure                                       │
│  - Intervention state                                    │
│  - UI state (selected node, zoom, etc.)                 │
├─────────────────────────────────────────────────────────┤
│  Visualization: D3.js + React-Force-Graph               │
│  - Force-directed layout with constraints               │
│  - Zone-based grouping                                  │
│  - Animated transitions on intervention                 │
├─────────────────────────────────────────────────────────┤
│  Statistics: jStat or Simple-Statistics                  │
│  - Distribution sampling                                │
│  - PDF/CDF calculations                                 │
│  - Monte Carlo propagation                              │
├─────────────────────────────────────────────────────────┤
│  LLM Integration: OpenAI/Anthropic API                  │
│  - Structured output (JSON mode)                        │
│  - Streaming for progressive rendering                  │
└─────────────────────────────────────────────────────────┘
```

### Key Libraries

| Purpose | Library | Notes |
|---------|---------|-------|
| Graph visualization | `d3-dag` or `cytoscape.js` | DAG-specific layouts |
| Force layout | `d3-force` | For organic positioning |
| Statistics | `jstat` | Distribution operations |
| State | `zustand` | Simple, performant |
| UI Components | `shadcn/ui` | Clean, accessible |
| Charts | `visx` or `recharts` | Distribution plots |

---

## Interaction Modes

### 1. Observe Mode (Default)
- View the causal structure
- Hover nodes to see descriptions
- Click edges to see relationship details

### 2. Intervene Mode
- Click a node to "set" its value (do-operation)
- Downstream nodes update their distributions
- Visual feedback: intervened nodes glow, affected paths highlight

### 3. Query Mode
- Select two nodes
- System shows:
  - Direct effect
  - Total causal effect
  - Confounding paths
  - Required adjustments (backdoor criterion)

### 4. Simulate Mode
- Run Monte Carlo simulations
- See distribution of outcomes given interventions
- Compare scenarios side-by-side

---

## Example: Macro Economy Model

### Query
"Model how Federal Reserve policy affects the real economy"

### Generated Nodes

| ID | Label | Type | Distribution | Zone |
|----|-------|------|--------------|------|
| fed_rate | Fed Funds Rate | exogenous | bounded(0, 10, 5) | monetary |
| money_supply | M2 Money Supply | endogenous | lognormal(16, 0.2) | monetary |
| inflation | CPI Inflation | endogenous | normal(2, 2) | prices |
| inflation_expect | Inflation Expectations | endogenous | normal(2, 1) | prices |
| unemployment | Unemployment Rate | endogenous | bounded(2, 15, 4) | labor |
| gdp_growth | Real GDP Growth | terminal | normal(2, 1.5) | output |
| consumer_conf | Consumer Confidence | endogenous | bounded(0, 100, 70) | behavior |
| business_invest | Business Investment | endogenous | normal(0, 5) | output |

### Key Causal Paths

```
fed_rate ──(-0.8)──▶ money_supply ──(+0.6)──▶ inflation
    │                                              │
    │                                              ▼
    └──(-0.4)──▶ business_invest ──────▶ gdp_growth ◀── unemployment
                                              │
                                              ▼
                                        consumer_conf
```

### Intervention Example

**User action:** Set `fed_rate = 7%` (high)

**Propagation:**
1. `money_supply` distribution shifts left (tighter)
2. `inflation` mean decreases from 2% to ~1.2%
3. `business_invest` mean decreases (higher borrowing costs)
4. `unemployment` mean increases slightly
5. `gdp_growth` distribution shifts left

**Visual feedback:**
- `fed_rate` node shows intervention indicator
- All descendant nodes pulse briefly
- Distribution visualizations animate to new states

---

## Roadmap: Future Milestones

### Milestone 1: Counterfactual Toggle — "The Path Not Taken"

In causal inference, a counterfactual asks: *"Given that X happened, what would have happened if X had been Y?"*

#### User Flow

1. **Baseline State**: User sets interventions (e.g., `Fed Rate = 5%`). Graph shows "Actual" distributions.
2. **Toggle Activation**: User clicks "Add Counterfactual" — creates a ghost-layer of the graph.
3. **Secondary Intervention**: User changes a value on the ghost-layer (e.g., `Fed Rate = 2%`).
4. **Visual Comparison**: Every node shows two overlapping distribution curves:
   - Solid blue curve → "Actual" scenario
   - Dashed red curve → "Counterfactual" scenario

#### UI Mockup

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  [Actual: Fed Rate = 5%]        [+ Add Counterfactual]              │    │
│  │  [Counterfactual: Fed Rate = 2%]  ✕ Remove                          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌───────────────────────────────────────────┐  ┌────────────────────────┐  │
│  │                                           │  │ Delta Report           │  │
│  │   [Inflation]                             │  │                        │  │
│  │   ┌─────────────────┐                     │  │ In your counterfactual │  │
│  │   │  ╱╲  ╱╲         │ ← Two curves        │  │ where Fed Rate = 2%:   │  │
│  │   │ ╱  ╲╱  ╲        │   overlapping       │  │                        │  │
│  │   │╱ ━━━━━━ ╲       │                     │  │ • Inflation: +1.5%     │  │
│  │   └─────────────────┘                     │  │ • Unemployment: -0.8%  │  │
│  │   Actual: 2.1%  |  CF: 3.6%               │  │ • GDP Growth: +0.4%    │  │
│  │                                           │  │                        │  │
│  └───────────────────────────────────────────┘  └────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### LLM-Generated Delta Narrative

When counterfactual mode is active, the Insights panel generates a comparison report:

```markdown
**Counterfactual Analysis: Fed Rate 5% → 2%**

In your counterfactual scenario where the Fed Rate was lower (2% vs 5%),
the model predicts:

- **Inflation** would have peaked **1.5% higher** (3.6% vs 2.1%) due to
  looser monetary conditions and expanded credit availability.

- **Unemployment** would have stayed **0.8% lower** (3.2% vs 4.0%) as
  cheaper borrowing stimulated business investment and hiring.

- **GDP Growth** would have been **0.4% higher** (2.8% vs 2.4%), though
  this comes at the cost of elevated inflation expectations.

⚠️ **Trade-off detected**: The lower rate scenario trades price stability
for employment gains—a classic Phillips Curve dynamic.
```

---

### Milestone 2: Temporal Dynamics — Feedback Loops & Time Ticks

Economic systems are rarely acyclic. Loops like `Inflation → Expectations → Inflation` require **discrete time simulation**.

#### The Problem

A cycle like this cannot be evaluated in a single pass:
```
Inflation ──→ Inflation Expectations ──→ Wage Demands ──→ Inflation
```

#### The Solution: Temporal Unrolling

Instead of one calculation, the engine runs N iterations (ticks), with edges having `delay` and `decayRate` properties.

#### Critical: Decay Rate for Stability

**Without decay, feedback loops oscillate forever.** In real economic systems, shocks dissipate over time due to:
- Behavioral adaptation (people adjust expectations)
- Institutional friction (policy lags, contract stickiness)
- Natural mean reversion (markets find equilibrium)

The `decayRate` parameter (0–1) represents this "energy loss" per tick. A rate of 0.1 means 10% of the shock's magnitude fades each period.

```
Without decay (unstable):        With decay (stable):

Value                            Value
  │    ╱╲    ╱╲    ╱╲              │    ╱╲
  │   ╱  ╲  ╱  ╲  ╱  ╲  ...        │   ╱  ╲  ╱─╲
  │──╱    ╲╱    ╲╱    ╲──          │──╱    ╲╱   ╲────────
  └────────────────────            └────────────────────
   Oscillates forever               Converges to steady state
```

#### Simulation Engine

```typescript
interface TemporalSimulation {
  ticks: number;                    // Total simulation steps
  currentTick: number;              // Current position in playback
  history: SimulationState[];       // State at each tick
  steadyStateReached: boolean;      // Did values converge?
  divergenceDetected: boolean;      // Did values spiral out of control?
}

// Global damping factor applied to all effects (safety net)
const GLOBAL_DECAY_FLOOR = 0.02;  // Minimum 2% decay per tick

function runTemporalSimulation(
  graph: CausalGraph,
  interventions: Intervention[],
  maxTicks: number = 20
): TemporalSimulation {
  const history: SimulationState[] = [];

  for (let t = 0; t < maxTicks; t++) {
    // For each node, compute value based on parent values from (t - delay) ticks ago
    for (const node of topologicalSort(graph)) {
      const parentEdges = graph.edges.filter(e => e.target === node.id);

      for (const edge of parentEdges) {
        const delay = edge.delay ?? 0;
        const sourceTickIndex = Math.max(0, t - delay);
        const sourceValue = history[sourceTickIndex]?.nodes[edge.source].value;

        // Calculate time-decayed effect strength
        const ticksSinceSource = t - sourceTickIndex;
        const edgeDecay = edge.decayRate ?? GLOBAL_DECAY_FLOOR;
        const effectiveDecay = Math.max(edgeDecay, GLOBAL_DECAY_FLOOR);
        const decayMultiplier = Math.pow(1 - effectiveDecay, ticksSinceSource);

        // Apply effect with decay
        node.currentDistribution = applyEffectWithDecay(
          node.distribution,
          edge.effect,
          sourceValue,
          decayMultiplier
        );
      }
    }

    history.push(captureState(graph));

    // Check for convergence (values stable within 0.1% for 3 ticks)
    if (hasReachedSteadyState(history, { threshold: 0.001, windowSize: 3 })) {
      return { ticks: t, history, steadyStateReached: true, divergenceDetected: false };
    }

    // Check for divergence (values exploding beyond circuit breakers)
    if (hasDiverged(history)) {
      return { ticks: t, history, steadyStateReached: false, divergenceDetected: true };
    }
  }

  return { ticks: maxTicks, history, steadyStateReached: false, divergenceDetected: false };
}

function applyEffectWithDecay(
  baseDist: Distribution,
  effect: EffectFunction,
  parentValue: number,
  decayMultiplier: number  // 0 to 1, where 1 = full effect, 0 = fully decayed
): Distribution {
  // First compute the raw effect
  const rawEffect = computeRawEffect(effect, parentValue);

  // Apply decay: the effect diminishes over time
  const decayedEffect = rawEffect * decayMultiplier;

  // Apply to distribution
  return shiftDistribution(baseDist, decayedEffect);
}
```

#### Decay Rate Guidelines for LLM

| Relationship Type | Typical Decay | Rationale |
|-------------------|---------------|-----------|
| Expectations → Behavior | 0.05–0.10 | Expectations adjust slowly |
| Policy → Market | 0.15–0.25 | Markets react, then normalize |
| Shock → Prices | 0.10–0.20 | Prices sticky but adjust |
| Feedback loops | 0.08–0.15 | Must decay or system is unstable |
| Structural (permanent) | 0.0 | Some relationships don't decay |

#### UI: Playback Controls

```
┌──────────────────────────────────────────────────────────────────────┐
│  Temporal Simulation                                                  │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  [◀◀] [◀] [▶ Play] [▶▶]     Tick: 7 / 20     [Loop: ○]         │  │
│  │  ════════════●══════════════════════════════════════════════   │  │
│  │              ↑                                                  │  │
│  │         Current position                                        │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  Status: ● Converging to steady state (Δ < 0.1% per tick)           │
│                                                                      │
│  [Show time series chart for: [Inflation ▼]]                        │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │     5% │            ╭──────────────                            │  │
│  │        │         ╭──╯                                          │  │
│  │     3% │      ╭──╯                                             │  │
│  │        │   ╭──╯                                                │  │
│  │     2% │───╯                                                   │  │
│  │        └────────────────────────────────────────────────────   │  │
│  │         T0   T2   T4   T6   T8   T10  T12  T14  T16  T18  T20  │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

#### Visual Feedback

- **Shock ripple**: When user intervenes, an animated "wave" travels outward through edges
- **Steady state glow**: Nodes that have stabilized get a subtle green border
- **Divergence warning**: If values spiral, nodes flash red with warning icon

---

### Milestone 3: Sensitivity Analysis — "The Heatmap of Influence"

Users need to know which levers actually matter. This prevents the "spaghetti graph" problem where 20+ nodes overwhelm without clear guidance.

#### The Calculation

For a selected target node (e.g., GDP Growth), the engine:

1. Perturbs each exogenous/interventionable node by ±1 standard deviation
2. Measures the resulting change in the target node's expected value
3. Ranks nodes by their "influence score"

```typescript
interface SensitivityResult {
  targetNode: string;
  influences: NodeInfluence[];
}

interface NodeInfluence {
  nodeId: string;
  label: string;
  influenceScore: number;        // Absolute effect magnitude
  direction: 'positive' | 'negative';
  elasticity: number;            // % change in target per 1% change in source
}

function computeSensitivity(
  graph: CausalGraph,
  targetNodeId: string,
  perturbationSize: number = 0.1  // 10% of std dev
): SensitivityResult {
  const baselineValue = expectedValue(graph.nodes[targetNodeId].currentDistribution);
  const influences: NodeInfluence[] = [];

  for (const node of graph.nodes) {
    if (node.type !== 'exogenous' && !node.observed) continue;

    // Perturb upward
    const perturbedGraph = intervene(graph, node.id,
      expectedValue(node.distribution) * (1 + perturbationSize));
    const perturbedValue = expectedValue(
      perturbedGraph.nodes[targetNodeId].currentDistribution
    );

    const delta = perturbedValue - baselineValue;
    const elasticity = (delta / baselineValue) / perturbationSize;

    influences.push({
      nodeId: node.id,
      label: node.label,
      influenceScore: Math.abs(delta),
      direction: delta > 0 ? 'positive' : 'negative',
      elasticity
    });
  }

  return {
    targetNode: targetNodeId,
    influences: influences.sort((a, b) => b.influenceScore - a.influenceScore)
  };
}
```

#### UI Elements

**Dynamic Edge Thickness**: Edges transmitting more variance become thicker/brighter

```
Normal edge:        ────────→
High influence:     ════════→  (thicker, glowing)
Low influence:      ╌╌╌╌╌╌╌→  (faded, thin)
```

**Influence Sidebar**:

```
┌─────────────────────────────┐
│ Top Drivers of GDP Growth   │
│ ─────────────────────────── │
│                             │
│ 1. Fed Funds Rate     ████████ -0.82
│    ↓ 1% rate → ↓ 0.82% GDP │
│                             │
│ 2. Consumer Spending  ██████   +0.65
│    ↑ 1% spend → ↑ 0.65% GDP│
│                             │
│ 3. Business Invest    ████     +0.41
│                             │
│ 4. Credit Avail       ███      +0.28
│                             │
│ 5. Inflation          ██       -0.15
│    (weak negative)          │
│                             │
│ [Show on graph]             │
└─────────────────────────────┘
```

**Heatmap Mode**: Toggle that colors all nodes by their influence on selected target

---

### Milestone 4: Model Comparison — "Battle of the Schools"

The economy isn't a single machine; it's a set of competing theories. This feature teaches that **causality is a hypothesis, not an absolute fact**.

#### LLM Persona System

The LLM generates multiple SCMs for the same query using different theoretical "lenses":

```typescript
interface ModelPersona {
  id: string;
  name: string;
  school: string;
  description: string;
  assumptions: string[];
  systemPromptModifier: string;
}

const PERSONAS: ModelPersona[] = [
  {
    id: 'keynesian',
    name: 'Keynesian',
    school: 'Demand-Side Economics',
    description: 'Focuses on aggregate demand, sticky prices, and the role of government spending',
    assumptions: [
      'Prices and wages are sticky in the short run',
      'Aggregate demand drives output and employment',
      'Government spending can stimulate demand during recessions',
      'Monetary policy works through interest rate channels'
    ],
    systemPromptModifier: `
      You are modeling from a Keynesian perspective. Emphasize:
      - Aggregate demand as the primary driver of short-run output
      - The multiplier effect of government spending
      - Liquidity preference and interest rate transmission
      - Sticky prices creating output gaps
    `
  },
  {
    id: 'monetarist',
    name: 'Monetarist',
    school: 'Chicago School',
    description: 'Focuses on money supply as the primary determinant of nominal GDP and inflation',
    assumptions: [
      'Inflation is always a monetary phenomenon',
      'Velocity of money is stable and predictable',
      'Markets clear quickly; minimal sticky prices',
      'Rules-based monetary policy is optimal'
    ],
    systemPromptModifier: `
      You are modeling from a Monetarist perspective. Emphasize:
      - Money supply as the primary policy lever
      - Quantity theory of money (MV = PQ)
      - Long-run neutrality of money
      - Skepticism of fiscal policy effectiveness
    `
  },
  {
    id: 'supply_side',
    name: 'Supply-Side',
    school: 'Supply-Side Economics',
    description: 'Focuses on tax rates, regulation, and incentives for production',
    assumptions: [
      'Tax rates affect incentives to work and invest',
      'Regulatory burden impacts business formation',
      'Supply creates its own demand (Say\'s Law)',
      'Capital formation drives long-run growth'
    ],
    systemPromptModifier: `
      You are modeling from a Supply-Side perspective. Emphasize:
      - Tax rates and their effect on labor supply and investment
      - Regulatory costs as friction on business activity
      - Capital accumulation as the engine of growth
      - Laffer Curve dynamics
    `
  },
  {
    id: 'mmt',
    name: 'MMT',
    school: 'Modern Monetary Theory',
    description: 'Focuses on sovereign currency issuance and functional finance',
    assumptions: [
      'Sovereign currency issuers cannot run out of money',
      'Taxes drive currency demand, not spending',
      'Inflation is the real constraint, not deficits',
      'Job Guarantee as automatic stabilizer'
    ],
    systemPromptModifier: `
      You are modeling from an MMT perspective. Emphasize:
      - Government spending as money creation
      - Taxes as inflation control, not revenue
      - Sectoral balances (government deficit = private surplus)
      - Functional finance over balanced budgets
    `
  }
];
```

#### UI: Tabbed Model Comparison

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ┌──────────┬──────────┬────────────┬─────────┐                             │
│  │ Keynesian│Monetarist│ Supply-Side│   MMT   │  [+ Add Custom Model]       │
│  │  ●       │          │            │         │                             │
│  └──────────┴──────────┴────────────┴─────────┘                             │
│                                                                             │
│  Model: Keynesian                                                           │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Assumptions:                                                               │
│  • Prices and wages are sticky in the short run                            │
│  • Aggregate demand drives output and employment                           │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                     │    │
│  │   [Gov Spending] ──→ [Aggregate Demand] ──→ [Output] ──→ [Jobs]    │    │
│  │         │                    ↑                                      │    │
│  │         │              [Multiplier]                                 │    │
│  │         └────────────────────┘                                      │    │
│  │                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Compare Models: What happens if we increase Government Spending?    │    │
│  │                                                                     │    │
│  │              │ Keynesian │ Monetarist │ Supply-Side │     MMT      │    │
│  │ ─────────────┼───────────┼────────────┼─────────────┼──────────────│    │
│  │ GDP Growth   │   +1.8%   │   +0.2%    │    +0.5%    │    +2.1%     │    │
│  │ Inflation    │   +0.4%   │   +1.2%    │    +0.3%    │    +0.6%     │    │
│  │ Unemployment │   -1.2%   │   -0.1%    │    -0.3%    │    -1.5%     │    │
│  │                                                                     │    │
│  │ Key difference: Monetarists predict crowding-out neutralizes       │    │
│  │ fiscal stimulus, while Keynesians predict multiplier effects.      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Educational Value

This feature teaches users that:
- The same intervention can have **opposite predicted effects** depending on assumptions
- Causal graphs encode **theories**, not ground truth
- Disagreements in economics often stem from **different mental models**, not different data

---

## Structural Changes Required

To support these milestones, the following schema additions are needed:

### Extended Edge Schema (for Milestone 2)

```typescript
interface CausalEdge {
  // ... existing fields ...

  // NEW: Temporal properties
  delay?: number;              // Ticks before effect manifests (default: 0)
  decayRate?: number;          // Effect diminishes over time (0-1, default: 0)
}
```

### Extended Node Schema (for Milestones 1 & 3)

```typescript
interface CausalNode {
  // ... existing fields ...

  // NEW: Multi-scenario support
  scenarios: {
    [scenarioId: string]: {
      conditionedValue: number | null;
      currentDistribution: Distribution;
    }
  };

  // NEW: Sensitivity metadata (computed, not from LLM)
  sensitivity?: {
    influenceOn: { [targetId: string]: number };
    influencedBy: { [sourceId: string]: number };
  };
}
```

### Extended Graph Schema (for Milestone 4)

```typescript
interface CausalModel {
  // ... existing fields ...

  // NEW: Model metadata
  persona?: {
    id: string;
    name: string;
    school: string;
    assumptions: string[];
  };
}

// Container for multiple competing models
interface ModelComparison {
  query: string;                    // Original user query
  models: CausalModel[];           // Different theoretical takes
  comparisonInsights: string[];    // LLM-generated comparison
}
```

### Extended Store Schema

```typescript
interface CausalGraphStore {
  // Existing
  graph: CausalGraph;
  selectedNode: string | null;

  // NEW: Scenario management (Milestone 1)
  scenarios: {
    baseline: ScenarioState;
    counterfactual: ScenarioState | null;
  };
  activeScenario: 'baseline' | 'counterfactual';

  // NEW: Temporal simulation (Milestone 2)
  simulation: TemporalSimulation | null;
  isPlaying: boolean;
  playbackSpeed: number;

  // NEW: Sensitivity state (Milestone 3)
  sensitivityTarget: string | null;
  sensitivityResults: SensitivityResult | null;
  showInfluenceHeatmap: boolean;

  // NEW: Model comparison (Milestone 4)
  models: CausalModel[];
  activeModelId: string;
  comparisonMode: boolean;
}
```

---

## Updated File Structure

```
causalgraph/
├── src/
│   ├── components/
│   │   ├── QueryInput.tsx
│   │   ├── CausalGraph.tsx
│   │   ├── NodeInspector.tsx
│   │   ├── DistributionViz.tsx
│   │   ├── InterventionSlider.tsx
│   │   ├── CounterfactualToggle.tsx      # NEW: Milestone 1
│   │   ├── DeltaReport.tsx               # NEW: Milestone 1
│   │   ├── DualDistributionViz.tsx       # NEW: Milestone 1
│   │   ├── TemporalControls.tsx          # NEW: Milestone 2
│   │   ├── TimeSeriesChart.tsx           # NEW: Milestone 2
│   │   ├── SensitivityPanel.tsx          # NEW: Milestone 3
│   │   ├── InfluenceHeatmap.tsx          # NEW: Milestone 3
│   │   ├── ModelTabs.tsx                 # NEW: Milestone 4
│   │   └── ModelComparisonTable.tsx      # NEW: Milestone 4
│   ├── lib/
│   │   ├── inference.ts
│   │   ├── distributions.ts
│   │   ├── graph.ts
│   │   ├── llm.ts
│   │   ├── counterfactual.ts             # NEW: Milestone 1
│   │   ├── temporal.ts                   # NEW: Milestone 2
│   │   ├── sensitivity.ts                # NEW: Milestone 3
│   │   └── personas.ts                   # NEW: Milestone 4
│   ├── types/
│   │   ├── causal.ts
│   │   ├── scenarios.ts                  # NEW: Milestone 1
│   │   ├── simulation.ts                 # NEW: Milestone 2
│   │   └── comparison.ts                 # NEW: Milestone 4
│   ├── store/
│   │   └── graphStore.ts                 # Extended for all milestones
│   ├── prompts/
│   │   ├── scm-generator.md
│   │   └── personas/                     # NEW: Milestone 4
│   │       ├── keynesian.md
│   │       ├── monetarist.md
│   │       ├── supply-side.md
│   │       └── mmt.md
│   └── pages/
│       └── dev/
│           └── test-bench.tsx            # Causal Test Bench UI
├── __tests__/
│   ├── math/
│   │   ├── distributions.test.ts         # Layer 1: Sampling accuracy
│   │   ├── topological.test.ts           # Layer 1: Graph ordering
│   │   └── variance.test.ts              # Layer 1: Uncertainty propagation
│   ├── logic/
│   │   ├── intervention.test.ts          # Layer 2: do-calculus
│   │   └── coefficients.test.ts          # Layer 2: Effect accuracy
│   ├── economics/
│   │   ├── sign-test.test.ts             # Layer 3: Directional consistency
│   │   ├── stability.test.ts             # Layer 3: Structural stability
│   │   └── axioms.ts                     # Economic relationship definitions
│   └── performance/
│       ├── fps.test.ts                   # Layer 4: Render performance
│       └── circuit-breakers.test.ts      # Layer 4: Edge case handling
├── public/
├── package.json
└── README.md
```

---

## Milestone Dependencies

```
                    ┌─────────────────┐
                    │   MVP (Core)    │
                    │  Single graph   │
                    │  Intervention   │
                    │  Propagation    │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
     ┌────────────────┐ ┌────────────┐ ┌────────────────┐
     │  Milestone 1   │ │ Milestone 3│ │  Milestone 4   │
     │ Counterfactual │ │ Sensitivity│ │ Model Compare  │
     │    Toggle      │ │  Analysis  │ │ (independent)  │
     └───────┬────────┘ └─────┬──────┘ └────────────────┘
             │                │
             │                │
             ▼                │
     ┌────────────────┐       │
     │  Milestone 2   │◀──────┘
     │   Temporal     │  (Sensitivity helps identify
     │  Simulation    │   which loops matter most)
     └────────────────┘
```

**Recommended build order:**
1. **MVP** — Core graph + intervention
2. **Milestone 3** — Sensitivity (adds immediate value, simpler than others)
3. **Milestone 1** — Counterfactual (builds on intervention, high impact)
4. **Milestone 4** — Model Comparison (independent, can parallelize)
5. **Milestone 2** — Temporal (most complex, benefits from sensitivity insights)

---

## Additional Future Features

### Data Integration
Upload CSV to fit distributions and effect coefficients from real data.

### Export/Share
- Export to Dagitty format for formal analysis
- Generate Mermaid.js for documentation
- Share interactive model via URL

### Collaborative Editing
Multiple users annotate and debate causal structures in real-time.

### Causal Discovery
Use algorithms (PC, FCI, GES) to suggest edges from uploaded data.

---

## Testing Strategy: Four-Layer Verification

Traditional unit tests are insufficient for a probabilistic, generative system. This testing strategy spans from low-level math to high-level "Economic Sanity."

### Layer 1: Math Layer — Monte Carlo Integrity

Verify that the sampling engine respects the distributions defined in the JSON.

#### Distribution Unit Tests

```typescript
describe('Distribution Sampling', () => {
  it('lognormal samples match parameters within 1%', () => {
    const dist: Distribution = {
      type: 'continuous',
      dist: 'lognormal',
      params: [2.0, 0.5]  // mu, sigma
    };

    const samples = sampleFromDistribution(dist, 10000);
    const sampleMean = mean(samples);
    const sampleVariance = variance(samples);

    // Lognormal expected values
    const expectedMean = Math.exp(2.0 + 0.5 ** 2 / 2);  // e^(μ + σ²/2)
    const expectedVariance = (Math.exp(0.5 ** 2) - 1) * Math.exp(2 * 2.0 + 0.5 ** 2);

    expect(sampleMean).toBeWithin(expectedMean, 0.01);  // ±1%
    expect(sampleVariance).toBeWithin(expectedVariance, 0.01);
  });

  it('beta samples stay within [0, 1] bounds', () => {
    const dist: Distribution = { type: 'continuous', dist: 'beta', params: [2, 5] };
    const samples = sampleFromDistribution(dist, 10000);

    expect(samples.every(s => s >= 0 && s <= 1)).toBe(true);
  });
});
```

#### Topological Integrity

```typescript
describe('Propagation Order', () => {
  it('never updates parent after child', () => {
    const graph = createTestGraph();  // A → B → C
    const updateOrder: string[] = [];

    // Patch to track update order
    const originalUpdate = updateNode;
    updateNode = (node) => {
      updateOrder.push(node.id);
      return originalUpdate(node);
    };

    propagateWithSampling(graph, new Map([['A', 5]]));

    // Verify topological order
    expect(updateOrder.indexOf('A')).toBeLessThan(updateOrder.indexOf('B'));
    expect(updateOrder.indexOf('B')).toBeLessThan(updateOrder.indexOf('C'));
  });
});
```

#### Conservation of Variance

```typescript
describe('Uncertainty Propagation', () => {
  it('child variance >= parent variance (unless gatekeeper)', () => {
    const graph = createLinearChain();  // A → B → C (no gatekeepers)
    const samples = propagateWithSampling(graph, new Map());

    const varA = variance(samples['A']);
    const varB = variance(samples['B']);
    const varC = variance(samples['C']);

    // Uncertainty should grow downstream
    expect(varB).toBeGreaterThanOrEqual(varA * 0.95);  // Allow 5% tolerance
    expect(varC).toBeGreaterThanOrEqual(varB * 0.95);
  });

  it('gatekeeper nodes can reduce variance', () => {
    const graph = createGraphWithGatekeeper();  // A → [Gatekeeper] → B
    const samples = propagateWithSampling(graph, new Map());

    const gatekeeper = graph.nodes.find(n => n.shape === 'octagon');
    // Gatekeepers are allowed to filter/reduce uncertainty
    expect(gatekeeper).toBeDefined();
  });
});
```

---

### Layer 2: Logic Layer — Do-Calculus Verification

Test that interventions correctly "break" causal connections.

#### The Independence Test

When you intervene on a child, the parent must not change.

```typescript
describe('Intervention Independence', () => {
  it('P(Parent | do(Child)) = P(Parent)', () => {
    const graph = createTestGraph();  // A → B → C

    // Baseline: no intervention
    const baselineSamples = propagateWithSampling(graph, new Map());
    const baselineParentMean = mean(baselineSamples['A']);
    const baselineParentVar = variance(baselineSamples['A']);

    // Intervene on child
    const interventionSamples = propagateWithSampling(graph, new Map([['C', 100]]));
    const interventionParentMean = mean(interventionSamples['A']);
    const interventionParentVar = variance(interventionSamples['A']);

    // Parent should be unchanged (within sampling error)
    expect(interventionParentMean).toBeCloseTo(baselineParentMean, 2);
    expect(interventionParentVar).toBeCloseTo(baselineParentVar, 1);
  });

  it('intervened node has zero variance', () => {
    const graph = createTestGraph();
    const samples = propagateWithSampling(graph, new Map([['B', 42]]));

    // All samples should be exactly the intervention value
    expect(samples['B'].every(s => s === 42)).toBe(true);
    expect(variance(samples['B'])).toBe(0);
  });
});
```

#### The Sensitivity Baseline

```typescript
describe('Effect Coefficient Accuracy', () => {
  it('linear effect matches manual calculation', () => {
    // Graph: A → B with coefficient 0.5
    const graph: CausalGraph = {
      nodes: [
        { id: 'A', distribution: { type: 'continuous', dist: 'normal', params: [10, 1] } },
        { id: 'B', distribution: { type: 'continuous', dist: 'normal', params: [0, 1] } }
      ],
      edges: [
        { source: 'A', target: 'B', effect: { type: 'linear', coefficient: 0.5 } }
      ]
    };

    // Intervene: A = 20 (10 units above baseline)
    const samples = propagateWithSampling(graph, new Map([['A', 20]]));
    const bMean = mean(samples['B']);

    // Expected: B baseline (0) + 0.5 * 20 = 10
    expect(bMean).toBeCloseTo(10, 1);
  });
});
```

---

### Layer 3: Economic Sanity Layer — LLM Evaluation

Since the LLM generates coefficients and structure, benchmark its "Economic IQ."

#### Directional Consistency (The Sign Test)

Create a test suite of known economic relationships:

```typescript
const ECONOMIC_AXIOMS = [
  { cause: 'interest_rate', effect: 'inflation', expectedSign: 'negative' },
  { cause: 'interest_rate', effect: 'investment', expectedSign: 'negative' },
  { cause: 'money_supply', effect: 'inflation', expectedSign: 'positive' },
  { cause: 'unemployment', effect: 'wage_growth', expectedSign: 'negative' },
  { cause: 'gdp_growth', effect: 'unemployment', expectedSign: 'negative' },
  { cause: 'consumer_confidence', effect: 'spending', expectedSign: 'positive' },
  // ... 50+ relationships
];

describe('LLM Economic Consistency', () => {
  it('generates correct coefficient signs 90%+ of the time', async () => {
    const results: boolean[] = [];

    for (const axiom of ECONOMIC_AXIOMS) {
      // Generate model 10 times
      const signs: string[] = [];
      for (let i = 0; i < 10; i++) {
        const model = await generateCausalModel(
          `How does ${axiom.cause} affect ${axiom.effect}?`
        );
        const edge = model.edges.find(
          e => e.source.includes(axiom.cause) && e.target.includes(axiom.effect)
        );
        if (edge) {
          signs.push(edge.effect.coefficient > 0 ? 'positive' : 'negative');
        }
      }

      // Check consistency
      const correctCount = signs.filter(s => s === axiom.expectedSign).length;
      results.push(correctCount >= 9);  // 9/10 correct = pass
    }

    const passRate = results.filter(Boolean).length / results.length;
    expect(passRate).toBeGreaterThanOrEqual(0.9);
  });
});
```

#### Structural Stability (Redundancy Testing)

```typescript
describe('LLM Structural Stability', () => {
  it('generates similar graphs for identical prompts', async () => {
    const prompt = 'Model how Federal Reserve policy affects inflation and unemployment';

    const model1 = await generateCausalModel(prompt);
    const model2 = await generateCausalModel(prompt);

    // Compare adjacency matrices
    const similarity = graphSimilarityScore(model1, model2);

    // Expect 70%+ structural overlap
    expect(similarity).toBeGreaterThanOrEqual(0.7);
  });
});

function graphSimilarityScore(g1: CausalModel, g2: CausalModel): number {
  const edges1 = new Set(g1.edges.map(e => `${e.source}->${e.target}`));
  const edges2 = new Set(g2.edges.map(e => `${e.source}->${e.target}`));

  const intersection = [...edges1].filter(e => edges2.has(e)).length;
  const union = new Set([...edges1, ...edges2]).size;

  return intersection / union;  // Jaccard similarity
}
```

---

### Layer 4: UI/Stress Layer — Performance & Edge Cases

Ensure the browser doesn't lock up during interaction.

#### FPS Monitoring

```typescript
describe('Render Performance', () => {
  it('maintains 60fps during slider drag', async () => {
    const graph = createLargeGraph(20);  // 20 nodes
    const store = useCausalGraphStore.getState();
    store.setGraph(graph);

    const frameTimings: number[] = [];
    let lastFrame = performance.now();

    const measureFrame = () => {
      const now = performance.now();
      frameTimings.push(now - lastFrame);
      lastFrame = now;
    };

    // Simulate slider drag (60 updates over 1 second)
    for (let i = 0; i < 60; i++) {
      store.setIntervention('fed_rate', i / 10);
      measureFrame();
      await new Promise(r => setTimeout(r, 16));  // ~60fps
    }

    const avgFrameTime = mean(frameTimings);
    const p95FrameTime = percentile(frameTimings, 0.95);

    expect(avgFrameTime).toBeLessThan(16);   // 60fps average
    expect(p95FrameTime).toBeLessThan(33);   // Never drop below 30fps
  });
});
```

#### Circuit Breaker Stress Test

```typescript
describe('Circuit Breakers', () => {
  it('handles extreme intervention values gracefully', () => {
    const graph = createMacroGraph();
    const store = useCausalGraphStore.getState();
    store.setGraph(graph);

    // Extreme intervention: Fed Rate = 500%
    store.setIntervention('fed_rate', 500);

    const distributions = store.nodeDistributions;

    // All nodes should have valid distributions
    for (const [nodeId, dist] of distributions) {
      expect(dist.mean).not.toBeNaN();
      expect(dist.stdDev).not.toBeNaN();
      expect(dist.points.every(p => !isNaN(p.y))).toBe(true);

      // Values should be clamped to circuit breaker limits
      const node = graph.nodes.find(n => n.id === nodeId);
      if (node?.circuitBreakers?.maxValue) {
        expect(dist.percentiles.p95).toBeLessThanOrEqual(node.circuitBreakers.maxValue);
      }
      if (node?.circuitBreakers?.minValue) {
        expect(dist.percentiles.p5).toBeGreaterThanOrEqual(node.circuitBreakers.minValue);
      }
    }
  });

  it('prevents NaN propagation', () => {
    const graph = createTestGraph();

    // Force a problematic state
    graph.nodes[0].distribution = { type: 'continuous', dist: 'normal', params: [NaN, 1] };

    const samples = propagateWithSampling(graph, new Map());

    // Should not propagate NaN through the graph
    for (const [nodeId, nodeSamples] of Object.entries(samples)) {
      expect(nodeSamples.some(isNaN)).toBe(false);
    }
  });
});
```

---

### Automated Test Bench

Create a hidden dev page that runs all simulations and outputs a report:

```typescript
// src/pages/dev/test-bench.tsx
export default function CausalTestBench() {
  const [results, setResults] = useState<TestResult[]>([]);
  const [running, setRunning] = useState(false);

  const runAllTests = async () => {
    setRunning(true);
    const testResults: TestResult[] = [];

    // Layer 1: Math
    testResults.push(await runDistributionTests());
    testResults.push(await runTopologicalTests());
    testResults.push(await runVarianceTests());

    // Layer 2: Logic
    testResults.push(await runIndependenceTests());
    testResults.push(await runCoefficientTests());

    // Layer 3: Economic
    testResults.push(await runSignTests());
    testResults.push(await runStabilityTests());

    // Layer 4: Performance
    testResults.push(await runFPSTests());
    testResults.push(await runCircuitBreakerTests());

    setResults(testResults);
    setRunning(false);
  };

  return (
    <div className="p-8 font-mono">
      <h1>Causal Test Bench</h1>
      <button onClick={runAllTests} disabled={running}>
        {running ? 'Running...' : 'Run All Tests (100 iterations)'}
      </button>

      <table className="mt-8 w-full">
        <thead>
          <tr>
            <th>Test Case</th>
            <th>Status</th>
            <th>Expected</th>
            <th>Actual</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => (
            <tr key={i} className={r.status === 'PASS' ? 'bg-green-50' :
                                   r.status === 'WARN' ? 'bg-yellow-50' : 'bg-red-50'}>
              <td>{r.name}</td>
              <td>{r.status === 'PASS' ? '✅' : r.status === 'WARN' ? '⚠️' : '❌'} {r.status}</td>
              <td>{r.expected}</td>
              <td>{r.actual}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

#### Sample Test Report

| Test Case | Status | Expected | Actual |
|-----------|--------|----------|--------|
| Lognormal Sampling | ✅ PASS | μ=7.39, σ²=14.2 | μ=7.41, σ²=14.1 |
| Topological Order | ✅ PASS | A < B < C | A < B < C |
| Variance Conservation | ✅ PASS | Increasing | ✓ |
| Intervene on Child | ✅ PASS | Parent Δ = 0 | Parent Δ = 0.00 |
| Coefficient Accuracy | ✅ PASS | B = 10.0 | B = 9.98 |
| Phillips Curve Sign | ✅ PASS | Negative | -0.42 |
| Structural Stability | ✅ PASS | Jaccard > 0.7 | 0.83 |
| Circuit Breaker | ✅ PASS | Max 100% | 100.0% |
| NaN Prevention | ✅ PASS | No NaN | ✓ |
| FPS (20 nodes) | ⚠️ WARN | > 60fps | 48fps |
| FPS (50 nodes) | ❌ FAIL | > 30fps | 22fps |

---

## Success Metrics

1. **Interpretability**: Users can explain the causal structure after 2 minutes
2. **Responsiveness**: Interventions propagate and render in <100ms
3. **Accuracy**: LLM-generated models match expert domain knowledge 80%+
4. **Engagement**: Users perform 5+ interventions per session on average
5. **Educational Impact** (Milestone 4): Users can articulate why different economic schools predict different outcomes
