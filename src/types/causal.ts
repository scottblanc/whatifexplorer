// Distribution Types
export type Distribution =
  | BinaryDistribution
  | CategoricalDistribution
  | ContinuousDistribution
  | BoundedDistribution
  | CountDistribution
  | RateDistribution;

export interface BinaryDistribution {
  type: 'binary';
  p: number; // Probability of true (0-1)
}

export interface CategoricalDistribution {
  type: 'categorical';
  categories: string[];
  probs: number[]; // Must sum to 1
}

export interface ContinuousDistribution {
  type: 'continuous';
  dist: 'normal' | 'lognormal' | 'beta' | 'gamma';
  params: number[]; // Distribution-specific parameters
  // normal: [mean, stdDev]
  // lognormal: [mu, sigma]
  // beta: [alpha, beta]
  // gamma: [shape, rate]
}

export interface BoundedDistribution {
  type: 'bounded';
  min: number;
  max: number;
  mode: number;
}

export interface CountDistribution {
  type: 'count';
  lambda: number; // Poisson parameter
}

export interface RateDistribution {
  type: 'rate';
  alpha: number; // Beta distribution alpha
  beta: number; // Beta distribution beta
}

// Effect Functions
export type EffectFunction =
  | LinearEffect
  | LogisticEffect
  | MultiplicativeEffect
  | ThresholdEffect;

export interface LinearEffect {
  type: 'linear';
  coefficient: number;
  intercept?: number;
  saturation?: number; // Optional tanh saturation
}

export interface LogisticEffect {
  type: 'logistic';
  coefficient: number;
  threshold: number;
}

export interface MultiplicativeEffect {
  type: 'multiplicative';
  factor: number;
  baseline?: number;
}

export interface ThresholdEffect {
  type: 'threshold';
  cutoff: number;
  below: number;
  above: number;
  smoothness?: number; // Sigmoid smoothness (default: 2)
}

// Circuit Breakers
export interface CircuitBreakers {
  minValue?: number;
  maxValue?: number;
  priorWeight?: number; // Mean reversion strength (0-1)
  maxStdDevRatio?: number; // Variance cap relative to mean
}

// Node Types
export type NodeType = 'exogenous' | 'endogenous' | 'terminal' | 'moderator' | 'mediator';
export type NodeShape = 'circle' | 'octagon' | 'diamond' | 'rectangle';

export interface CausalNode {
  id: string;
  label: string;
  description: string;
  type: NodeType;
  zone: string;
  shape: NodeShape;
  units?: string;
  distribution: Distribution;
  circuitBreakers?: CircuitBreakers;
}

// Edge Types
export type EdgeRelationship = 'causes' | 'moderates' | 'mediates' | 'selects';
export type EdgeStyle = 'solid' | 'dashed';
export type EdgeWeight = 'heavy' | 'normal' | 'light';

export interface CausalEdge {
  source: string;
  target: string;
  relationship: EdgeRelationship;
  label?: string;
  style: EdgeStyle;
  weight: EdgeWeight;
  delay?: number; // Ticks before effect manifests
  decayRate?: number; // Effect decay per tick (0-1)
  effect: EffectFunction;
}

// Zone definition
export interface Zone {
  label: string;
  color: string;
  description: string;
}

// Complete Causal Model
export interface CausalModel {
  title: string;
  description: string;
  zones: Record<string, Zone>;
  nodes: CausalNode[];
  edges: CausalEdge[];
  keyInsights: string[];
}

// Renderable Distribution (after KDE)
export interface RenderableDistribution {
  type: 'kde';
  points: Array<{ x: number; y: number }>;
  mean: number;
  stdDev: number;
  percentiles: {
    p5: number;
    p25: number;
    p50: number;
    p75: number;
    p95: number;
  };
}

// Node state for runtime
export interface NodeState {
  nodeId: string;
  samples: number[];
  distribution: RenderableDistribution;
  isIntervened: boolean;
  interventionValue: number | null;
}

// Graph state for runtime
export interface GraphState {
  model: CausalModel;
  nodeStates: Record<string, NodeState>;
  interventions: Map<string, number>;
}
