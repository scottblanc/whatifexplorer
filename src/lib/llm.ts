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

## Effect Types (use small coefficients to avoid unrealistic propagation):
- linear: { "type": "linear", "coefficient": 0.1, "saturation": 5 }
- multiplicative: { "type": "multiplicative", "factor": 1.05, "baseline": 1 }
- threshold: { "type": "threshold", "cutoff": X, "below": Y, "above": Z }

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
