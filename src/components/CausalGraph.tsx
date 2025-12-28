'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import * as d3 from 'd3';
import type { CausalModel, CausalNode, CausalEdge, EffectFunction } from '@/types/causal';
import { useCausalGraphStore } from '@/store/graphStore';

// Dynamic import for dagre (CommonJS module)
let dagreModule: typeof import('dagre') | null = null;

// Color coding for effect types
const getEdgeColor = (effect: EffectFunction): string => {
  switch (effect.type) {
    case 'linear': return '#374151';       // gray-700 - neutral, most common
    case 'multiplicative': return '#2563eb'; // blue-600 - scaling/growth
    case 'threshold': return '#d97706';     // amber-600 - warning/switch
    case 'logistic': return '#7c3aed';      // violet-600 - probability
    default: return '#374151';
  }
};

interface NodePosition {
  id: string;
  x: number;
  y: number;
  node: CausalNode;
}

interface Props {
  width?: number;
  height?: number;
}

export default function CausalGraph({ width = 800, height = 600 }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dagreLoaded, setDagreLoaded] = useState(false);
  const model = useCausalGraphStore((s) => s.model);
  const interventions = useCausalGraphStore((s) => s.interventions);
  const nodeDistributions = useCausalGraphStore((s) => s.nodeDistributions);
  const selectedNodeId = useCausalGraphStore((s) => s.selectedNodeId);
  const selectedEdgeId = useCausalGraphStore((s) => s.selectedEdgeId);
  const selectNode = useCausalGraphStore((s) => s.selectNode);
  const selectEdge = useCausalGraphStore((s) => s.selectEdge);
  const hoverNode = useCausalGraphStore((s) => s.hoverNode);

  // Load dagre dynamically
  useEffect(() => {
    console.log('[CausalGraph] Component mounted, loading dagre...');
    import('dagre').then((module) => {
      // Handle both ESM default export and CommonJS module patterns
      dagreModule = module.default || module;
      console.log('[CausalGraph] Dagre loaded successfully, graphlib:', !!dagreModule?.graphlib);
      if (!dagreModule?.graphlib) {
        console.error('[CausalGraph] Dagre module missing graphlib!', Object.keys(module));
      }
      setDagreLoaded(true);
    }).catch((err) => {
      console.error('[CausalGraph] Failed to load dagre:', err);
    });
  }, []);

  // Calculate node positions using dagre for optimal DAG layout
  const calculatePositions = useCallback((model: CausalModel): NodePosition[] => {
    console.log('[CausalGraph] calculatePositions called, dagreModule:', !!dagreModule, 'graphlib:', !!dagreModule?.graphlib);
    if (!dagreModule) {
      console.log('[CausalGraph] Dagre not loaded yet, returning empty');
      return [];
    }
    if (!dagreModule.graphlib) {
      console.error('[CausalGraph] Dagre graphlib not available');
      return [];
    }

    console.log('[CausalGraph] Creating dagre graph for model:', model.title, 'with', model.nodes.length, 'nodes');

    try {
      // Create a new directed graph
      const g = new dagreModule.graphlib.Graph();

      // Set graph options - TB (top-to-bottom) works well for causal DAGs
      g.setGraph({
        rankdir: 'TB',
        nodesep: 80,     // Horizontal separation between nodes in same rank
        ranksep: 100,    // Vertical separation between ranks
        marginx: 40,
        marginy: 40,
      });

      // Default edge label (required by dagre)
      g.setDefaultEdgeLabel(() => ({}));

      // Add nodes with estimated dimensions
      model.nodes.forEach((node) => {
        // Estimate node width based on label length
        const estimatedWidth = Math.max(node.label.length * 8 + 40, 100);
        g.setNode(node.id, {
          label: node.label,
          width: estimatedWidth,
          height: 50,
          node: node
        });
      });

      console.log('[CausalGraph] Added', model.nodes.length, 'nodes to dagre graph');

      // Add edges
      model.edges.forEach((edge) => {
        g.setEdge(edge.source, edge.target);
      });

      console.log('[CausalGraph] Added', model.edges.length, 'edges to dagre graph');

      // Run the layout algorithm
      dagreModule.layout(g);
      console.log('[CausalGraph] Dagre layout algorithm completed');

      // Extract positions and scale to fit
      const nodeData = g.nodes().map(id => g.node(id)).filter(n => n);

      if (nodeData.length === 0) {
        console.error('[CausalGraph] Dagre returned no node positions');
        return [];
      }

      const minX = Math.min(...nodeData.map(n => n.x));
      const maxX = Math.max(...nodeData.map(n => n.x));
      const minY = Math.min(...nodeData.map(n => n.y));
      const maxY = Math.max(...nodeData.map(n => n.y));

      console.log('[CausalGraph] Dagre bounds:', { minX, maxX, minY, maxY });

      const graphWidth = maxX - minX || 1;
      const graphHeight = maxY - minY || 1;

      // Leave space for zone legend at top (50px) and padding
      const topPadding = 60;
      const sidePadding = 60;
      const bottomPadding = 40;

      const availableWidth = width - sidePadding * 2;
      const availableHeight = height - topPadding - bottomPadding;

      const scaleX = availableWidth / graphWidth;
      const scaleY = availableHeight / graphHeight;
      // Use the smaller scale to fit, but don't scale up too much
      const scale = Math.min(scaleX, scaleY, 1.2);

      // Center the graph in available space
      const scaledWidth = graphWidth * scale;
      const scaledHeight = graphHeight * scale;
      const offsetX = sidePadding + (availableWidth - scaledWidth) / 2;
      const offsetY = topPadding + (availableHeight - scaledHeight) / 2;

      console.log('[CausalGraph] Scale factors:', { scaleX, scaleY, scale, offsetX, offsetY });

      const positions: NodePosition[] = [];
      model.nodes.forEach((node) => {
        const dagreNode = g.node(node.id);
        if (!dagreNode) {
          console.warn('[CausalGraph] No dagre position for node:', node.id);
          return;
        }
        const x = offsetX + (dagreNode.x - minX) * scale;
        const y = offsetY + (dagreNode.y - minY) * scale;

        // Ensure positions are valid numbers
        if (isNaN(x) || isNaN(y)) {
          console.error('[CausalGraph] Invalid position for node:', node.id, { x, y });
          return;
        }

        positions.push({
          id: node.id,
          x,
          y,
          node,
        });
      });

      console.log('[CausalGraph] Dagre layout computed for', positions.length, 'nodes');
      return positions;
    } catch (err) {
      console.error('[CausalGraph] Error calculating positions:', err);
      return [];
    }
  }, [width, height]);

  // Render the graph
  useEffect(() => {
    console.log('[CausalGraph] useEffect triggered, model:', model ? model.title : 'null', 'dagreLoaded:', dagreLoaded);

    if (!svgRef.current || !model || !dagreLoaded) {
      console.log('[CausalGraph] Early return - svgRef:', !!svgRef.current, 'model:', !!model, 'dagreLoaded:', dagreLoaded);
      return;
    }

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const positions = calculatePositions(model);
    console.log('[CausalGraph] Calculated positions:', positions.length);

    if (positions.length === 0) {
      console.error('[CausalGraph] No positions calculated, cannot render');
      return;
    }

    const positionMap = new Map(positions.map(p => [p.id, p]));

    console.log('[CausalGraph] Rendering graph with', model.nodes.length, 'nodes and', model.edges.length, 'edges');

    // Add arrow marker definitions for each effect type color
    const defs = svg.append('defs');
    const effectColors = [
      { id: 'arrowhead-linear', color: '#374151' },
      { id: 'arrowhead-multiplicative', color: '#2563eb' },
      { id: 'arrowhead-threshold', color: '#d97706' },
      { id: 'arrowhead-logistic', color: '#7c3aed' },
      { id: 'arrowhead-selected', color: '#0ea5e9' }, // cyan for selected
    ];
    effectColors.forEach(({ id, color }) => {
      defs.append('marker')
        .attr('id', id)
        .attr('viewBox', '-0 -3 6 6')
        .attr('refX', 5)
        .attr('refY', 0)
        .attr('orient', 'auto')
        .attr('markerWidth', 5)
        .attr('markerHeight', 5)
        .append('path')
        .attr('d', 'M 0,-3 L 6,0 L 0,3')
        .attr('fill', color);
    });

    // Zone legend (horizontal bar at top) - properly spaced
    const zones = Object.entries(model.zones);
    const zoneCount = zones.length;
    const zoneWidth = Math.min(180, (width - 40) / zoneCount - 10);
    const totalLegendWidth = zoneCount * (zoneWidth + 10) - 10;
    const legendStartX = (width - totalLegendWidth) / 2;

    const zoneGroup = svg.append('g').attr('class', 'zone-legend');
    zones.forEach(([zoneId, zone], i) => {
      const x = legendStartX + i * (zoneWidth + 10);

      // Zone color indicator
      zoneGroup.append('rect')
        .attr('x', x)
        .attr('y', 8)
        .attr('width', zoneWidth)
        .attr('height', 22)
        .attr('fill', zone.color)
        .attr('opacity', 0.9)
        .attr('rx', 4);

      // Zone label - truncate if too long
      const maxChars = Math.floor(zoneWidth / 7);
      const displayLabel = zone.label.length > maxChars
        ? zone.label.substring(0, maxChars - 1) + '…'
        : zone.label;

      zoneGroup.append('text')
        .attr('x', x + zoneWidth / 2)
        .attr('y', 23)
        .attr('text-anchor', 'middle')
        .attr('fill', '#000000')
        .attr('font-size', '10px')
        .attr('font-weight', '600')
        .text(displayLabel);
    });

    // First pass: measure all node labels to determine box sizes
    const nodeDimensions = new Map<string, { width: number; height: number }>();
    const measureGroup = svg.append('g').attr('class', 'measure').style('visibility', 'hidden');

    positions.forEach((pos) => {
      const tempText = measureGroup.append('text')
        .attr('font-size', '11px')
        .attr('font-weight', '500')
        .text(pos.node.label);

      const textBBox = (tempText.node() as SVGTextElement).getBBox();
      const padding = 16;
      const rectWidth = Math.max(textBBox.width + padding * 2, 80);
      // Always use taller height since we always show mean now
      const rectHeight = 44;
      nodeDimensions.set(pos.id, { width: rectWidth, height: rectHeight });
    });

    measureGroup.remove();

    // Draw edges with proper arrow positioning using measured node sizes
    const edgeGroup = svg.append('g').attr('class', 'edges');

    console.log('[CausalGraph] Drawing', model.edges.length, 'edges');

    model.edges.forEach((edge: CausalEdge) => {
      const source = positionMap.get(edge.source);
      const target = positionMap.get(edge.target);
      if (!source || !target) return;

      const sourceDim = nodeDimensions.get(edge.source) || { width: 80, height: 32 };
      const targetDim = nodeDimensions.get(edge.target) || { width: 80, height: 32 };

      // Calculate edge endpoints at node boundaries
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist === 0) return;

      // Calculate intersection with rectangle boundary
      const sourceHalfW = sourceDim.width / 2;
      const sourceHalfH = sourceDim.height / 2;
      const targetHalfW = targetDim.width / 2;
      const targetHalfH = targetDim.height / 2;

      // Source offset - find where line exits source rectangle
      const sourceOffsetX = Math.abs(dx) > 0.001 ? Math.min(sourceHalfW, Math.abs(sourceHalfH * dx / dy)) : 0;
      const sourceOffsetY = Math.abs(dy) > 0.001 ? Math.min(sourceHalfH, Math.abs(sourceHalfW * dy / dx)) : 0;
      const sourceOffset = Math.sqrt(sourceOffsetX * sourceOffsetX + sourceOffsetY * sourceOffsetY) || sourceHalfW;

      // Target offset - find where line enters target rectangle (plus arrow space)
      const targetOffsetX = Math.abs(dx) > 0.001 ? Math.min(targetHalfW, Math.abs(targetHalfH * dx / dy)) : 0;
      const targetOffsetY = Math.abs(dy) > 0.001 ? Math.min(targetHalfH, Math.abs(targetHalfW * dy / dx)) : 0;
      const targetOffset = Math.sqrt(targetOffsetX * targetOffsetX + targetOffsetY * targetOffsetY) || targetHalfW;

      const startX = source.x + (dx / dist) * sourceOffset;
      const startY = source.y + (dy / dist) * sourceOffset;
      const endX = target.x - (dx / dist) * (targetOffset + 6);
      const endY = target.y - (dy / dist) * (targetOffset + 6);

      // Determine edge color and selection state
      const edgeId = `${edge.source}->${edge.target}`;
      const isEdgeSelected = edgeId === selectedEdgeId;
      const edgeColor = isEdgeSelected ? '#0ea5e9' : getEdgeColor(edge.effect);
      const arrowMarkerId = isEdgeSelected ? 'arrowhead-selected' : `arrowhead-${edge.effect.type}`;

      // Create a group for the edge to handle click events better
      const edgeG = edgeGroup.append('g')
        .attr('cursor', 'pointer')
        .on('click', (event) => {
          event.stopPropagation();
          console.log('>>> EDGE CLICK:', edge.source, '->', edge.target);
          selectEdge(edgeId);
        });

      // Invisible wider path for easier clicking
      edgeG.append('path')
        .attr('d', `M ${startX} ${startY} L ${endX} ${endY}`)
        .attr('fill', 'none')
        .attr('stroke', 'transparent')
        .attr('stroke-width', 12);

      // Visible path with effect type color
      const path = edgeG.append('path')
        .attr('d', `M ${startX} ${startY} L ${endX} ${endY}`)
        .attr('fill', 'none')
        .attr('stroke', edgeColor)
        .attr('stroke-width', isEdgeSelected ? 3 : (edge.weight === 'heavy' ? 2.5 : edge.weight === 'light' ? 1 : 1.5))
        .attr('marker-end', `url(#${arrowMarkerId})`);

      if (edge.style === 'dashed') {
        path.attr('stroke-dasharray', '5,5');
      }

      if (edge.weight === 'light' && !isEdgeSelected) {
        path.attr('opacity', 0.5);
      }

      // Selection glow effect
      if (isEdgeSelected) {
        path.attr('filter', 'drop-shadow(0 0 4px rgba(14, 165, 233, 0.5))');
      }
    });

    // Draw nodes
    const nodeGroup = svg.append('g').attr('class', 'nodes');

    console.log('[CausalGraph] Drawing', positions.length, 'nodes');

    positions.forEach((pos) => {
      const isSelected = pos.id === selectedNodeId;
      const isIntervened = interventions.has(pos.id);
      const zone = model.zones[pos.node.zone];
      const distribution = nodeDistributions.get(pos.id);
      const dim = nodeDimensions.get(pos.id) || { width: 80, height: 32 };

      const g = nodeGroup.append('g')
        .attr('transform', `translate(${pos.x}, ${pos.y})`)
        .attr('cursor', 'pointer')
        .on('click', (event) => {
          event.stopPropagation();
          console.log('>>> CLICK:', pos.node.label, pos.id);
          selectNode(pos.id);
        })
        .on('mouseenter', () => hoverNode(pos.id))
        .on('mouseleave', () => hoverNode(null));

      // Draw shape based on node type
      // - circle (default): rounded rectangle for standard nodes
      // - rectangle (terminal): hard-corner rectangle for outcomes
      // - diamond (exogenous): parallelogram for external inputs
      // - octagon (gatekeeper): wide octagon for gatekeepers

      // Use vivid, saturated colors for borders that pop
      const vividColors: Record<string, string> = {
        '#3B82F6': '#1D4ED8', // blue -> vivid blue
        '#8B5CF6': '#6D28D9', // purple -> vivid purple
        '#F59E0B': '#EA580C', // amber -> vivid orange
        '#10B981': '#047857', // green -> vivid green
        '#EF4444': '#B91C1C', // red -> vivid red
        '#EC4899': '#BE185D', // pink -> vivid pink
        '#06B6D4': '#0E7490', // cyan -> vivid cyan
      };
      const baseColor = zone?.color || '#3B82F6';
      const strokeColor = vividColors[baseColor] || baseColor;
      const baseStroke = isSelected ? 4 : 3;

      const w = dim.width;
      const h = dim.height;
      let shape: d3.Selection<SVGElement, unknown, null, undefined>;

      if (pos.node.shape === 'rectangle') {
        // Terminal outcomes: hard-corner rectangle (no rounded corners)
        shape = g.append('rect')
          .attr('x', -w / 2)
          .attr('y', -h / 2)
          .attr('width', w)
          .attr('height', h)
          .attr('rx', 0)
          .attr('fill', 'white')
          .attr('stroke', strokeColor)
          .attr('stroke-width', isSelected ? 5 : 4) as unknown as d3.Selection<SVGElement, unknown, null, undefined>;
      } else if (pos.node.shape === 'diamond') {
        // Exogenous/decision: parallelogram (slanted rectangle)
        const skew = 12; // How much to slant
        const points = [
          [-w/2 + skew, -h/2],  // top-left
          [w/2 + skew, -h/2],   // top-right
          [w/2 - skew, h/2],    // bottom-right
          [-w/2 - skew, h/2],   // bottom-left
        ].map(p => p.join(',')).join(' ');
        shape = g.append('polygon')
          .attr('points', points)
          .attr('fill', 'white')
          .attr('stroke', strokeColor)
          .attr('stroke-width', baseStroke) as unknown as d3.Selection<SVGElement, unknown, null, undefined>;
      } else if (pos.node.shape === 'octagon') {
        // Gatekeeper: wide octagon
        const cx = 10; // corner cut on x-axis
        const cy = 6;  // corner cut on y-axis (smaller for wide look)
        const points = [
          [-w/2 + cx, -h/2],      // top-left after cut
          [w/2 - cx, -h/2],       // top-right before cut
          [w/2, -h/2 + cy],       // top-right after cut
          [w/2, h/2 - cy],        // bottom-right before cut
          [w/2 - cx, h/2],        // bottom-right after cut
          [-w/2 + cx, h/2],       // bottom-left before cut
          [-w/2, h/2 - cy],       // bottom-left after cut
          [-w/2, -h/2 + cy],      // top-left before cut
        ].map(p => p.join(',')).join(' ');
        shape = g.append('polygon')
          .attr('points', points)
          .attr('fill', 'white')
          .attr('stroke', strokeColor)
          .attr('stroke-width', baseStroke) as unknown as d3.Selection<SVGElement, unknown, null, undefined>;
      } else {
        // Default (circle): rounded rectangle
        shape = g.append('rect')
          .attr('x', -w / 2)
          .attr('y', -h / 2)
          .attr('width', w)
          .attr('height', h)
          .attr('rx', 8)
          .attr('fill', 'white')
          .attr('stroke', strokeColor)
          .attr('stroke-width', baseStroke) as unknown as d3.Selection<SVGElement, unknown, null, undefined>;
      }

      // Intervention glow
      if (isIntervened) {
        shape
          .attr('fill', '#FEF3C7')
          .attr('stroke', '#F59E0B')
          .attr('filter', 'drop-shadow(0 0 8px rgba(251, 146, 60, 0.6))');
      }

      // Selection highlight
      if (isSelected && !isIntervened) {
        shape.attr('filter', 'drop-shadow(0 0 4px rgba(59, 130, 246, 0.5))');
      }

      // Always show mean and units - use computed distribution or fall back to prior
      const hasMean = distribution?.mean !== undefined || pos.node.distribution;

      // Node label
      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', hasMean ? '-0.1em' : '0.35em')
        .attr('font-size', '11px')
        .attr('font-weight', '500')
        .attr('fill', '#1f2937')
        .text(pos.node.label);

      // Mini distribution indicator with units in parentheses
      if (hasMean) {
        // Get mean from computed distribution, or calculate from prior
        let meanValue: number;
        if (distribution?.mean !== undefined) {
          meanValue = distribution.mean;
        } else {
          // Fall back to prior distribution mean
          const prior = pos.node.distribution;
          if (prior.type === 'continuous' && prior.params) {
            meanValue = prior.params[0]; // First param is mean for normal
          } else if (prior.type === 'bounded') {
            meanValue = (prior.min + prior.max) / 2;
          } else {
            meanValue = 0;
          }
        }

        const units = pos.node.units ? ` (${pos.node.units})` : '';
        g.append('text')
          .attr('text-anchor', 'middle')
          .attr('dy', '1.1em')
          .attr('font-size', '9px')
          .attr('fill', '#6b7280')
          .text(`μ=${meanValue.toFixed(1)}${units}`);
      }
    });

  }, [model, interventions, nodeDistributions, selectedNodeId, selectedEdgeId, calculatePositions, selectNode, selectEdge, hoverNode, dagreLoaded]);

  if (!model) {
    return (
      <div className="flex items-center justify-center h-[700px] bg-gray-50 rounded-lg border border-dashed border-gray-300">
        <div className="text-gray-400">Enter a query above to generate a causal model</div>
      </div>
    );
  }

  if (!dagreLoaded) {
    return (
      <div className="flex items-center justify-center h-[700px] bg-yellow-50 rounded-lg border border-yellow-200">
        <div className="text-center">
          <div className="animate-pulse text-yellow-600 font-medium">Loading layout engine...</div>
          <div className="text-yellow-500 text-sm mt-1">Initializing dagre graph library</div>
        </div>
      </div>
    );
  }

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      className="bg-white rounded-lg border border-gray-200"
    />
  );
}
