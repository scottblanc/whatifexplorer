import { GoogleGenerativeAI } from '@google/generative-ai';
import type { CausalModel, CausalEdge } from '@/types/causal';

/**
 * Check if the graph is connected (treating edges as undirected for connectivity)
 * Returns the set of nodes in the largest connected component
 */
function findConnectedComponents(model: CausalModel): string[][] {
  const nodes = new Set(model.nodes.map(n => n.id));
  const adjacency = new Map<string, Set<string>>();

  // Build undirected adjacency list
  for (const node of model.nodes) {
    adjacency.set(node.id, new Set());
  }
  for (const edge of model.edges) {
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }

  const visited = new Set<string>();
  const components: string[][] = [];

  for (const nodeId of nodes) {
    if (visited.has(nodeId)) continue;

    // BFS to find connected component
    const component: string[] = [];
    const queue = [nodeId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      component.push(current);

      for (const neighbor of adjacency.get(current) || []) {
        if (!visited.has(neighbor)) {
          queue.push(neighbor);
        }
      }
    }

    components.push(component);
  }

  return components;
}

/**
 * Fix node types based on graph structure:
 * - Nodes with no incoming edges should be "exogenous"
 * - Nodes with outgoing edges should NOT be "terminal"
 * - Nodes with no outgoing edges should be "terminal"
 */
function fixNodeTypes(model: CausalModel): CausalModel {
  const incomingEdges = new Map<string, number>();
  const outgoingEdges = new Map<string, number>();

  // Initialize counts
  for (const node of model.nodes) {
    incomingEdges.set(node.id, 0);
    outgoingEdges.set(node.id, 0);
  }

  // Count edges
  for (const edge of model.edges) {
    incomingEdges.set(edge.target, (incomingEdges.get(edge.target) || 0) + 1);
    outgoingEdges.set(edge.source, (outgoingEdges.get(edge.source) || 0) + 1);
  }

  let fixedCount = 0;
  const fixedNodes = model.nodes.map(node => {
    const hasIncoming = (incomingEdges.get(node.id) || 0) > 0;
    const hasOutgoing = (outgoingEdges.get(node.id) || 0) > 0;

    let newType = node.type;
    let newShape = node.shape;

    // Fix type based on structure
    if (!hasIncoming && node.type !== 'exogenous') {
      // No incoming edges = should be exogenous
      newType = 'exogenous';
      newShape = 'diamond'; // parallelogram for exogenous
      fixedCount++;
    } else if (hasOutgoing && node.type === 'terminal') {
      // Has outgoing edges but marked terminal = should be endogenous
      newType = 'endogenous';
      newShape = 'circle'; // rounded rect for endogenous
      fixedCount++;
    } else if (!hasOutgoing && node.type !== 'terminal' && hasIncoming) {
      // No outgoing edges, has incoming = should be terminal
      newType = 'terminal';
      newShape = 'rectangle'; // hard corners for terminal
      fixedCount++;
    }

    if (newType !== node.type) {
      console.log(`[LLM] Fixed node "${node.id}": ${node.type} -> ${newType}`);
    }

    return { ...node, type: newType, shape: newShape };
  });

  if (fixedCount > 0) {
    console.log(`[LLM] Fixed ${fixedCount} incorrectly typed nodes`);
  }

  return { ...model, nodes: fixedNodes };
}

/**
 * Validate and fix graph connectivity by adding edges between disconnected components
 */
function ensureConnectedGraph(model: CausalModel): CausalModel {
  const components = findConnectedComponents(model);

  if (components.length <= 1) {
    console.log('[LLM] Graph is connected');
    return model;
  }

  console.warn(`[LLM] Graph has ${components.length} disconnected components, connecting them...`);

  // Sort components by size (largest first)
  components.sort((a, b) => b.length - a.length);

  const newEdges: CausalEdge[] = [...model.edges];

  // Connect each smaller component to the largest one
  for (let i = 1; i < components.length; i++) {
    const smallComponent = components[i];
    const largeComponent = components[0];

    // Find a node in the small component to connect
    // Prefer exogenous nodes as targets (they should receive effects)
    const smallNode = model.nodes.find(
      n => smallComponent.includes(n.id) && n.type !== 'exogenous'
    ) || model.nodes.find(n => smallComponent.includes(n.id));

    // Find a node in the large component to be the source
    const largeNode = model.nodes.find(
      n => largeComponent.includes(n.id) && n.type !== 'terminal'
    ) || model.nodes.find(n => largeComponent.includes(n.id));

    if (smallNode && largeNode) {
      console.log(`[LLM] Adding edge: ${largeNode.id} -> ${smallNode.id}`);
      newEdges.push({
        source: largeNode.id,
        target: smallNode.id,
        relationship: 'causes',
        style: 'dashed',
        weight: 'light',
        effect: { type: 'linear', coefficient: 0.1 }
      });

      // Add the small component nodes to the large component for next iteration
      components[0].push(...smallComponent);
    }
  }

  return { ...model, edges: newEdges };
}

/**
 * Validation result for user queries
 */
export interface QueryValidation {
  isValid: boolean;
  feedback: string;
  suggestedQuery?: string;
}

const VALIDATION_PROMPT = `You are an expert at evaluating whether questions are suitable for causal modeling.

A GOOD query for causal modeling:
- Asks about cause-and-effect relationships between variables
- Involves multiple interconnected factors
- Can be represented as a directed graph of influences
- Examples: "How does inflation affect unemployment?", "What factors drive housing prices?", "How does education level impact income?"

A BAD query for causal modeling:
- Simple factual questions ("What is the capital of France?")
- Opinion or preference questions ("What's the best programming language?")
- Vague or too broad ("Tell me about economics")
- Single-variable questions with no causal chain
- Requests for predictions without causal structure ("Will the stock market go up?")
- How-to or procedural questions ("How do I make a cake?")

Evaluate the user's query and respond with JSON:
{
  "isValid": true/false,
  "feedback": "Explanation of why it is or isn't suitable, and specific suggestions for improvement if needed",
  "suggestedQuery": "An improved version of the query if the original isn't suitable (omit if already valid)"
}

Respond ONLY with valid JSON. No markdown code blocks.`;

/**
 * Validate if a query is suitable for causal model generation
 */
export async function validateQuery(
  query: string,
  apiKey: string
): Promise<QueryValidation> {
  console.log('[LLM] Validating query:', query);

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: VALIDATION_PROMPT,
  });

  try {
    const result = await model.generateContent(
      `Evaluate this query for causal modeling suitability:\n\n"${query}"`
    );

    let jsonText = result.response.text().trim();

    // Remove markdown code blocks if present
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const validation = JSON.parse(jsonText) as QueryValidation;
    console.log('[LLM] Validation result:', validation);
    return validation;
  } catch (e) {
    console.error('[LLM] Validation error:', e);
    // Default to valid if validation fails, let the main generation handle it
    return {
      isValid: true,
      feedback: 'Validation skipped due to error'
    };
  }
}

const SYSTEM_PROMPT = `You are a causal inference expert. Given a user's question about cause-and-effect relationships, generate a Structural Causal Model (SCM) in JSON format.

## Requirements:
1. Identify 8-15 relevant causal variables
2. Classify each node type correctly:
   - "exogenous": Root nodes with NO incoming edges (external inputs)
   - "endogenous": Intermediate nodes with both incoming AND outgoing edges
   - "terminal": Leaf nodes with NO outgoing edges (final outcomes only!)
   - "moderator" or "mediator": Special intermediate nodes
3. Assign appropriate probability distributions with REALISTIC values based on real-world data
4. Define directed edges representing causal relationships with effect functions
5. Group nodes into 3-5 thematic "zones" for visual organization
6. Identify "gatekeeper" nodes that filter/transform information (use octagon shape)
7. Ensure the graph is acyclic (no circular dependencies)
8. CRITICAL: The graph MUST be fully connected - every node must be reachable from at least one other node. NO isolated nodes or disconnected subgraphs allowed.
9. CRITICAL: Only nodes with NO children should be "terminal" type. If a node has outgoing edges, it MUST be "endogenous" not "terminal".

## CRITICAL: Units are REQUIRED
Every node MUST include a "units" field with appropriate units:
- Percentages: "%"
- Currency: "$", "$B" (billions), "$T" (trillions)
- Ratios: "ratio", "x"
- Indices: "index", "0-100"
- Counts: "people", "jobs", "M" (millions)
- Rates: "per year", "bps" (basis points)

## Distribution Types (use realistic values!):
- continuous normal: { "type": "continuous", "dist": "normal", "params": [MEAN, STD_DEV] }
- rate: { "type": "rate", "alpha": X, "beta": Y }
- bounded: { "type": "bounded", "min": X, "max": Y, "mode": Z }

Example realistic values:
- Federal Funds Rate: params=[5.0, 0.5], units="%"
- Inflation Rate: params=[3.0, 1.0], units="%"
- Unemployment: params=[4.0, 0.8], units="%"
- GDP Growth: params=[2.5, 1.0], units="%"
- Debt-to-GDP: params=[120, 10], units="%"
- Treasury Yields: params=[4.5, 0.5], units="%"

## Effect Types - Choose Based on Relationship Nature:

### Linear (most common - use for direct proportional relationships)
When to use: Direct cause-effect where changes in parent proportionally affect target
Key test: "If parent doubles, does effect roughly double?" → use linear
Examples across domains:
- Economics: Interest rates → borrowing costs, wages → consumer spending
- Health: Drug dosage → blood concentration, exercise hours → calories burned
- Engineering: Load → stress, voltage → current
- Social: Study hours → test scores, marketing spend → awareness
ALSO use for derived ratios (any X/Y calculation): BMI, debt-to-GDP, efficiency metrics, conversion rates
Format: { "type": "linear", "coefficient": 0.3 }
- coefficient: Sensitivity/coupling strength (0.0 to 1.0 typical range)
  - 0.3 = moderate (if parent deviates 10% from mean, target moves 3%)
  - 1.0 = tight coupling (target moves proportionally with parent)
  - Use NEGATIVE values for inverse relationships (e.g., -0.3)
- saturation: Optional cap on deviation magnitude

### Multiplicative (use ONLY for compound/exponential processes)
When to use: Effects that compound or grow exponentially over time
Key test: "Does each unit of parent multiply (not add to) the effect?" → use multiplicative
Examples across domains:
- Biology: Viral spread, bacterial growth, population dynamics
- Finance: Compound interest, inflation erosion
- Learning: Skill acquisition curves, network effects
- Physics: Radioactive decay, signal attenuation
DO NOT use for: Simple ratios, derived metrics, or any X/Y calculation (use linear instead!)
Format: { "type": "multiplicative", "factor": 2.0, "baseline": 50 }
- factor: How much child scales when parent DOUBLES from baseline
  - factor = 2.0 means child doubles when parent doubles
  - factor = 1.5 means child increases 50% when parent doubles
- baseline: CRITICAL - Set this to the parent node's prior mean!

### Threshold (use for regime switches where sensitivity changes)
When to use: Sensitivity to parent changes at a critical value (e.g., risk becomes acute above a threshold)
Examples: Debt sustainability thresholds, capacity limits, policy triggers, market stress levels
Format: { "type": "threshold", "cutoff": 120, "below": 0.5, "above": 2.5, "smoothness": 2 }
- cutoff: The critical value where sensitivity regime changes
- below: Sensitivity coefficient when parent < cutoff (like linear coefficient)
- above: Sensitivity coefficient when parent > cutoff (like linear coefficient)
- smoothness: How gradual the transition between regimes (higher = sharper switch)
IMPORTANT: Choose coefficients based on threshold severity:
- **Subtle** (0.3-0.8): Minor sensitivity differences, soft preferences
- **Moderate** (0.8-2.0): Noticeable regime changes, risk premiums, congestion
- **Sharp** (2.0-5.0): Capacity limits, policy triggers, stress thresholds
- **Near-binary** (5.0-10.0): System failures, safety limits, breaking points
- **Catastrophic** (10.0+): Structural collapse, cascading failures, point-of-no-return
Example: Debt-to-GDP at 120% (moderate): below=0.5, above=1.5
Example: Server capacity at 90% (sharp): below=0.3, above=4.0
Example: Bridge load at 100% (catastrophic): below=0.1, above=12.0

### Logistic (use for probability/binary outcome effects)
When to use: Affects likelihood of binary outcomes, risk factors
Examples: Default probability, election outcomes, disease transmission
Format: { "type": "logistic", "coefficient": 0.5, "threshold": 0 }
- coefficient: How strongly source shifts the log-odds
- threshold: Reference point for the effect

## Node Shapes (actual geometric shapes):
- circle: Standard endogenous variables (rounded rectangle)
- rectangle: Terminal outcomes/final results (hard-corner rectangle)
- diamond: Exogenous inputs or decision points (parallelogram - slanted)
- octagon: Gatekeeper nodes that filter/transform (wide octagon)

## Circuit Breakers (REQUIRED for all nodes to prevent unrealistic values):
{ "minValue": X, "maxValue": Y, "priorWeight": 0.1, "maxStdDevRatio": 2.0 }

## Required JSON Structure:
{
  "title": "Model title",
  "description": "Brief description",
  "zones": { "zone_id": { "label": "Zone Name", "color": "#hexcolor", "description": "..." } },
  "nodes": [
    {
      "id": "node_id",
      "label": "Node Label",
      "type": "exogenous" or "endogenous" or "terminal",
      "zone": "zone_id",
      "units": "%" or "$B" or "index" etc,
      "description": "What this variable represents",
      "distribution": { "type": "continuous", "dist": "normal", "params": [5.0, 1.0] },
      "shape": "circle",
      "circuitBreakers": { "minValue": 0, "maxValue": 100 }
    }
  ],
  "edges": [
    {
      "source": "node_id",
      "target": "node_id",
      "relationship": "causes",
      "style": "solid",
      "weight": "normal",
      "effect": { "type": "linear", "coefficient": 0.1, "saturation": 5 },
      "description": "How source affects target"
    }
  ],
  "keyInsights": [ "Insight 1 about the causal relationships", "Insight 2", "Insight 3" ]
}

Respond ONLY with valid JSON. No markdown code blocks, no explanation.`;

export async function generateCausalModel(
  query: string,
  apiKey: string
): Promise<CausalModel> {
  console.log('[LLM] Generating causal model for query:', query);

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-3-flash-preview',
    systemInstruction: SYSTEM_PROMPT,
  });

  console.log('[LLM] Calling Gemini 3 Flash API...');
  const result = await model.generateContent(
    `Generate a causal model for the following question:\n\n"${query}"\n\nRespond with valid JSON only.`
  );

  const response = result.response;
  let jsonText = response.text().trim();
  console.log('[LLM] Received response, length:', jsonText.length, 'chars');

  // Remove markdown code blocks if present
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  try {
    let causalModel = JSON.parse(jsonText) as CausalModel;

    // Validate basic structure
    if (!causalModel.nodes || !Array.isArray(causalModel.nodes)) {
      throw new Error('Invalid model: missing nodes array');
    }
    if (!causalModel.edges || !Array.isArray(causalModel.edges)) {
      throw new Error('Invalid model: missing edges array');
    }
    if (!causalModel.zones || typeof causalModel.zones !== 'object') {
      throw new Error('Invalid model: missing zones object');
    }

    console.log('[LLM] Parsed model:', causalModel.title);
    console.log('[LLM] Nodes:', causalModel.nodes.length, '| Edges:', causalModel.edges.length, '| Zones:', Object.keys(causalModel.zones).length);

    // Ensure graph is connected
    causalModel = ensureConnectedGraph(causalModel);

    // Fix node types based on graph structure
    causalModel = fixNodeTypes(causalModel);

    return causalModel;
  } catch (e) {
    console.error('Failed to parse LLM response:', jsonText);
    throw new Error(`Failed to parse causal model: ${e instanceof Error ? e.message : 'Unknown error'}`);
  }
}

const RECALIBRATION_PROMPT = `You are a causal inference expert reviewing a sensitivity analysis of a causal model. The analysis shows how interventions on input nodes affect downstream nodes.

Your task is to recalibrate the model's edge effect coefficients to address identified issues:

1. **Bottleneck Warnings** (HIGHEST PRIORITY): If a 50% input change produces <10% terminal output change, there's a propagation bottleneck. Look at the suspected bottleneck node and increase coefficients on edges leading to/from it.

2. **Weak Effects**: If an input change produces <1% downstream effect, the coefficient chain is too weak. Increase coefficients along the path.

3. **Asymmetric Effects**: If increases and decreases have very different effect magnitudes, check for:
   - Threshold effects that only activate in one direction - may need higher coefficients on both sides
   - Circuit breakers clamping values
   - Coefficients that should be larger

4. **Strong Effects**: Effects >30% might be too strong and could cause instability. Consider dampening.

## Rules for Recalibration:
- Linear coefficients should typically be 0.3-0.8 for meaningful propagation
- Negative coefficients for inverse relationships
- Threshold effects (choose based on severity):
  - Subtle (0.3-0.8): Minor sensitivity differences
  - Moderate (0.8-2.0): Noticeable regime changes
  - Sharp (2.0-5.0): Capacity limits, policy triggers
  - Near-binary (5.0-10.0): System failures, breaking points
  - Catastrophic (10.0+): Structural collapse
  - If coefficients are too small for the domain, increase them to match severity
- Multiplicative factors: 1.5-2.5 for doubling effects

Return a JSON object with ONLY the edges that need changes:
{
  "changes": [
    {
      "source": "node_id",
      "target": "node_id",
      "reason": "Brief explanation",
      "newEffect": { "type": "linear", "coefficient": 0.6 }
    }
  ],
  "summary": "1-2 sentence summary of changes made"
}

Respond ONLY with valid JSON. No markdown code blocks.`;

export async function recalibrateModel(
  model: CausalModel,
  sensitivityReport: string,
  apiKey: string
): Promise<{ model: CausalModel; summary: string; changes: Array<{ source: string; target: string; reason: string }> }> {
  console.log('[LLM] Recalibrating model based on sensitivity analysis');

  const genAI = new GoogleGenerativeAI(apiKey);
  const llm = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: RECALIBRATION_PROMPT,
  });

  const prompt = `Here is the current causal model:

\`\`\`json
${JSON.stringify(model, null, 2)}
\`\`\`

Here is the sensitivity analysis report:

${sensitivityReport}

Based on this analysis, suggest edge coefficient changes to fix weak or asymmetric effects. Return JSON only.`;

  const result = await llm.generateContent(prompt);
  let jsonText = result.response.text().trim();

  // Remove markdown code blocks if present
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  try {
    const response = JSON.parse(jsonText) as {
      changes: Array<{
        source: string;
        target: string;
        reason: string;
        newEffect: CausalEdge['effect'];
      }>;
      summary: string;
    };

    // Apply changes to model
    let updatedModel = { ...model };
    const appliedChanges: Array<{ source: string; target: string; reason: string }> = [];

    for (const change of response.changes) {
      const edgeIndex = updatedModel.edges.findIndex(
        e => e.source === change.source && e.target === change.target
      );

      if (edgeIndex >= 0) {
        updatedModel = {
          ...updatedModel,
          edges: updatedModel.edges.map((edge, i) =>
            i === edgeIndex ? { ...edge, effect: change.newEffect } : edge
          ),
        };
        appliedChanges.push({
          source: change.source,
          target: change.target,
          reason: change.reason,
        });
        console.log(`[LLM] Updated edge ${change.source} -> ${change.target}: ${change.reason}`);
      }
    }

    return {
      model: updatedModel,
      summary: response.summary,
      changes: appliedChanges,
    };
  } catch (e) {
    console.error('Failed to parse recalibration response:', jsonText);
    throw new Error(`Failed to parse recalibration: ${e instanceof Error ? e.message : 'Unknown error'}`);
  }
}
