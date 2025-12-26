'use client';

import { useMemo } from 'react';
import type { RenderableDistribution } from '@/types/causal';

interface Props {
  distribution: RenderableDistribution;
  interventionValue?: number;
  width?: number;
  height?: number;
}

export default function DistributionChart({
  distribution,
  interventionValue,
  width = 200,
  height = 80,
}: Props) {
  const { pathD, xScale, yMax } = useMemo(() => {
    const points = distribution.points;
    if (points.length === 0) return { pathD: '', xScale: (x: number) => 0, yMax: 0 };

    const xMin = points[0].x;
    const xMax = points[points.length - 1].x;
    const yMax = Math.max(...points.map((p) => p.y));

    const padding = 10;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    const xScale = (x: number) => padding + ((x - xMin) / (xMax - xMin)) * chartWidth;
    const yScale = (y: number) => height - padding - (y / yMax) * chartHeight;

    // Build SVG path
    const pathPoints = points.map((p, i) => {
      const x = xScale(p.x);
      const y = yScale(p.y);
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    });

    // Close the path for filled area
    const lastX = xScale(points[points.length - 1].x);
    const firstX = xScale(points[0].x);
    const baseline = height - padding;
    pathPoints.push(`L ${lastX} ${baseline}`);
    pathPoints.push(`L ${firstX} ${baseline}`);
    pathPoints.push('Z');

    return { pathD: pathPoints.join(' '), xScale, yMax };
  }, [distribution, width, height]);

  const interventionX = interventionValue !== undefined ? xScale(interventionValue) : null;

  return (
    <svg width={width} height={height} className="overflow-visible">
      {/* Distribution curve */}
      <path
        d={pathD}
        fill="rgba(59, 130, 246, 0.2)"
        stroke="rgb(59, 130, 246)"
        strokeWidth={2}
      />

      {/* Mean line */}
      <line
        x1={xScale(distribution.mean)}
        y1={10}
        x2={xScale(distribution.mean)}
        y2={height - 10}
        stroke="rgb(59, 130, 246)"
        strokeWidth={1}
        strokeDasharray="3,3"
      />

      {/* Intervention line */}
      {interventionX !== null && (
        <>
          <line
            x1={interventionX}
            y1={10}
            x2={interventionX}
            y2={height - 10}
            stroke="rgb(251, 146, 60)"
            strokeWidth={2}
          />
          <circle
            cx={interventionX}
            cy={height - 10}
            r={4}
            fill="rgb(251, 146, 60)"
          />
        </>
      )}

      {/* Percentile markers */}
      <line
        x1={xScale(distribution.percentiles.p5)}
        y1={height - 8}
        x2={xScale(distribution.percentiles.p5)}
        y2={height - 12}
        stroke="#9ca3af"
        strokeWidth={1}
      />
      <line
        x1={xScale(distribution.percentiles.p95)}
        y1={height - 8}
        x2={xScale(distribution.percentiles.p95)}
        y2={height - 12}
        stroke="#9ca3af"
        strokeWidth={1}
      />

      {/* IQR box */}
      <rect
        x={xScale(distribution.percentiles.p25)}
        y={height - 12}
        width={xScale(distribution.percentiles.p75) - xScale(distribution.percentiles.p25)}
        height={4}
        fill="rgba(59, 130, 246, 0.3)"
        rx={2}
      />
    </svg>
  );
}
