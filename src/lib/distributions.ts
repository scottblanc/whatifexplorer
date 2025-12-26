import type {
  Distribution,
  RenderableDistribution,
  BinaryDistribution,
  CategoricalDistribution,
  ContinuousDistribution,
  BoundedDistribution,
  CountDistribution,
  RateDistribution,
} from '@/types/causal';

// Use jstat for distribution sampling
// We'll implement fallbacks for when jstat isn't available

/**
 * Box-Muller transform for normal distribution sampling
 */
function randomNormal(mean: number, stdDev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + stdDev * z;
}

/**
 * Sample from a lognormal distribution
 */
function randomLognormal(mu: number, sigma: number): number {
  const normal = randomNormal(mu, sigma);
  return Math.exp(normal);
}

/**
 * Sample from a beta distribution using Johnk's algorithm
 */
function randomBeta(alpha: number, beta: number): number {
  // For alpha, beta > 1, use a more efficient algorithm
  if (alpha > 1 && beta > 1) {
    const a = alpha - 1;
    const b = beta - 1;
    const c = a + b;
    const L = c * Math.log(c);
    const mu = a / c;
    const sigma = 0.5 / Math.sqrt(c);

    while (true) {
      const u = Math.random();
      let x = randomNormal(mu, sigma);

      if (x < 0 || x > 1) continue;

      const logY = a * Math.log(x / a) + b * Math.log((1 - x) / b) + L + Math.log(sigma) + 0.5 * Math.log(2 * Math.PI);
      if (Math.log(u) <= logY) return x;
    }
  }

  // Johnk's algorithm for general case
  while (true) {
    const u1 = Math.random();
    const u2 = Math.random();
    const x = Math.pow(u1, 1 / alpha);
    const y = Math.pow(u2, 1 / beta);
    if (x + y <= 1) {
      return x / (x + y);
    }
  }
}

/**
 * Sample from a gamma distribution using Marsaglia and Tsang's method
 */
function randomGamma(shape: number, rate: number): number {
  if (shape < 1) {
    // Boost shape if less than 1
    return randomGamma(shape + 1, rate) * Math.pow(Math.random(), 1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  while (true) {
    let x: number;
    let v: number;

    do {
      x = randomNormal(0, 1);
      v = 1 + c * x;
    } while (v <= 0);

    v = v * v * v;
    const u = Math.random();

    if (u < 1 - 0.0331 * (x * x) * (x * x)) {
      return d * v / rate;
    }

    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
      return d * v / rate;
    }
  }
}

/**
 * Sample from a Poisson distribution
 */
function randomPoisson(lambda: number): number {
  if (lambda < 30) {
    // Direct method for small lambda
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= Math.random();
    } while (p > L);
    return k - 1;
  } else {
    // Normal approximation for large lambda
    return Math.max(0, Math.round(randomNormal(lambda, Math.sqrt(lambda))));
  }
}

/**
 * Sample from a PERT/triangular distribution (bounded)
 */
function randomPERT(min: number, max: number, mode: number): number {
  // PERT distribution uses beta distribution scaled to [min, max]
  const range = max - min;
  const mu = (min + 4 * mode + max) / 6;
  const alpha = 1 + 4 * (mu - min) / range;
  const beta = 1 + 4 * (max - mu) / range;

  const betaSample = randomBeta(Math.max(0.5, alpha), Math.max(0.5, beta));
  return min + betaSample * range;
}

/**
 * Safe version of randomBeta with iteration limit
 */
function randomBetaSafe(alpha: number, beta: number): number {
  const a = Math.max(0.1, alpha);
  const b = Math.max(0.1, beta);
  const maxIterations = 100;

  for (let iter = 0; iter < maxIterations; iter++) {
    const u1 = Math.random();
    const u2 = Math.random();
    const x = Math.pow(u1, 1 / a);
    const y = Math.pow(u2, 1 / b);
    if (x + y <= 1 && x + y > 0) {
      return x / (x + y);
    }
  }
  // Fallback: return mean of beta distribution
  return a / (a + b);
}

/**
 * Safe version of randomGamma with iteration limit
 */
function randomGammaSafe(shape: number, rate: number): number {
  const s = Math.max(0.1, shape);
  const r = Math.max(0.1, rate);
  const maxIterations = 100;

  if (s < 1) {
    return randomGammaSafe(s + 1, r) * Math.pow(Math.random(), 1 / s);
  }

  const d = s - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  for (let iter = 0; iter < maxIterations; iter++) {
    let x: number;
    let v: number;
    let attempts = 0;

    do {
      x = randomNormal(0, 1);
      v = 1 + c * x;
      attempts++;
    } while (v <= 0 && attempts < 10);

    if (v <= 0) continue;

    v = v * v * v;
    const u = Math.random();

    if (u < 1 - 0.0331 * (x * x) * (x * x)) {
      return d * v / r;
    }

    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
      return d * v / r;
    }
  }
  // Fallback: return mean
  return s / r;
}

/**
 * Safe version of randomPERT
 */
function randomPERTSafe(min: number, max: number, mode: number): number {
  if (max <= min) {
    return min;
  }
  const range = max - min;
  const clampedMode = Math.max(min, Math.min(max, mode));
  const mu = (min + 4 * clampedMode + max) / 6;
  const alpha = Math.max(0.5, 1 + 4 * (mu - min) / range);
  const beta = Math.max(0.5, 1 + 4 * (max - mu) / range);

  const betaSample = randomBetaSafe(alpha, beta);
  return min + betaSample * range;
}

/**
 * Sample n values from a distribution
 */
export function sampleFromDistribution(dist: Distribution, n: number): number[] {
  // Initialize with zeros as fallback
  const samples: number[] = new Array(n).fill(0);

  try {
    switch (dist.type) {
      case 'binary': {
        const bd = dist as BinaryDistribution;
        const p = bd.p ?? 0.5;
        for (let i = 0; i < n; i++) {
          samples[i] = Math.random() < p ? 1 : 0;
        }
        break;
      }

      case 'categorical': {
        const cd = dist as CategoricalDistribution;
        if (cd.probs && cd.probs.length > 0) {
          const cumProbs: number[] = [];
          let cumSum = 0;
          for (const prob of cd.probs) {
            cumSum += prob;
            cumProbs.push(cumSum);
          }
          for (let i = 0; i < n; i++) {
            const u = Math.random();
            samples[i] = cumProbs.findIndex(cp => u <= cp);
          }
        }
        break;
      }

      case 'continuous': {
        const cont = dist as ContinuousDistribution;
        // Get params with fallback defaults
        const mean = cont.params?.[0] ?? 0;
        const std = Math.max(cont.params?.[1] ?? 1, 0.01); // Ensure positive std

        // Default to normal distribution
        const distType = cont.dist || 'normal';

        switch (distType) {
          case 'normal':
            for (let i = 0; i < n; i++) {
              samples[i] = randomNormal(mean, std);
            }
            break;
          case 'lognormal':
            for (let i = 0; i < n; i++) {
              samples[i] = randomLognormal(mean, std);
            }
            break;
          case 'beta':
            for (let i = 0; i < n; i++) {
              samples[i] = randomBetaSafe(mean, std);
            }
            break;
          case 'gamma':
            for (let i = 0; i < n; i++) {
              samples[i] = randomGammaSafe(mean, std);
            }
            break;
          default:
            // Fallback to normal
            for (let i = 0; i < n; i++) {
              samples[i] = randomNormal(mean, std);
            }
        }
        break;
      }

      case 'bounded': {
        const bd = dist as BoundedDistribution;
        const min = bd.min ?? 0;
        const max = bd.max ?? 100;
        const mode = bd.mode ?? (min + max) / 2;
        for (let i = 0; i < n; i++) {
          samples[i] = randomPERTSafe(min, max, mode);
        }
        break;
      }

      case 'count': {
        const cd = dist as CountDistribution;
        const lambda = Math.max(cd.lambda ?? 1, 0.1);
        for (let i = 0; i < n; i++) {
          samples[i] = randomPoisson(lambda);
        }
        break;
      }

      case 'rate': {
        const rd = dist as RateDistribution;
        const alpha = Math.max(rd.alpha ?? 1, 0.1);
        const beta = Math.max(rd.beta ?? 1, 0.1);
        for (let i = 0; i < n; i++) {
          samples[i] = randomBetaSafe(alpha, beta);
        }
        break;
      }

      default:
        // Unknown distribution type - use standard normal
        for (let i = 0; i < n; i++) {
          samples[i] = randomNormal(0, 1);
        }
    }
  } catch (error) {
    console.error('[Distributions] Error sampling:', error);
    // Return zeros on error
    return new Array(n).fill(0);
  }

  return samples;
}

/**
 * Calculate expected value of a distribution
 */
export function expectedValue(dist: Distribution): number {
  if (!dist || !dist.type) return 0;

  try {
    switch (dist.type) {
      case 'binary':
        return (dist as BinaryDistribution).p ?? 0.5;

      case 'categorical': {
        const cd = dist as CategoricalDistribution;
        if (!cd.probs || cd.probs.length === 0) return 0;
        return cd.probs.reduce((sum, p, i) => sum + (p ?? 0) * i, 0);
      }

      case 'continuous': {
        const cont = dist as ContinuousDistribution;
        const params = cont.params || [0, 1];
        const p0 = params[0] ?? 0;
        const p1 = params[1] ?? 1;

        switch (cont.dist) {
          case 'normal':
            return p0;
          case 'lognormal':
            return Math.exp(p0 + p1 ** 2 / 2);
          case 'beta':
            return p0 / (p0 + p1 || 1);
          case 'gamma':
            return p0 / (p1 || 1);
          default:
            return p0; // Fallback to first param as mean
        }
      }

      case 'bounded': {
        const bd = dist as BoundedDistribution;
        const min = bd.min ?? 0;
        const max = bd.max ?? 100;
        const mode = bd.mode ?? (min + max) / 2;
        return (min + 4 * mode + max) / 6;
      }

      case 'count':
        return (dist as CountDistribution).lambda ?? 1;

      case 'rate': {
        const rd = dist as RateDistribution;
        const alpha = rd.alpha ?? 1;
        const beta = rd.beta ?? 1;
        return alpha / (alpha + beta);
      }

      default:
        return 0;
    }
  } catch {
    return 0;
  }
}

/**
 * Calculate standard deviation of a distribution
 */
export function standardDeviation(dist: Distribution): number {
  switch (dist.type) {
    case 'binary': {
      const p = (dist as BinaryDistribution).p;
      return Math.sqrt(p * (1 - p));
    }

    case 'continuous': {
      const cont = dist as ContinuousDistribution;
      switch (cont.dist) {
        case 'normal':
          return cont.params[1];
        case 'lognormal': {
          const [mu, sigma] = cont.params;
          return Math.sqrt((Math.exp(sigma ** 2) - 1) * Math.exp(2 * mu + sigma ** 2));
        }
        case 'beta': {
          const [a, b] = cont.params;
          return Math.sqrt((a * b) / ((a + b) ** 2 * (a + b + 1)));
        }
        case 'gamma': {
          const [shape, rate] = cont.params;
          return Math.sqrt(shape) / rate;
        }
      }
      break;
    }

    case 'bounded': {
      const bd = dist as BoundedDistribution;
      // PERT std dev approximation
      return (bd.max - bd.min) / 6;
    }

    case 'count':
      return Math.sqrt((dist as CountDistribution).lambda);

    case 'rate': {
      const rd = dist as RateDistribution;
      const a = rd.alpha;
      const b = rd.beta;
      return Math.sqrt((a * b) / ((a + b) ** 2 * (a + b + 1)));
    }

    default:
      return 1;
  }

  return 1;
}

/**
 * Convert samples to a renderable KDE distribution
 */
export function samplesToKDE(samples: number[], numPoints: number = 50): RenderableDistribution {
  // Handle edge cases
  if (!samples || samples.length === 0) {
    return {
      type: 'kde',
      points: [{ x: 0, y: 1 }],
      mean: 0,
      stdDev: 1,
      percentiles: { p5: 0, p25: 0, p50: 0, p75: 0, p95: 0 },
    };
  }

  // Filter out NaN/Infinity values
  const validSamples = samples.filter(s => isFinite(s));
  if (validSamples.length === 0) {
    return {
      type: 'kde',
      points: [{ x: 0, y: 1 }],
      mean: 0,
      stdDev: 1,
      percentiles: { p5: 0, p25: 0, p50: 0, p75: 0, p95: 0 },
    };
  }

  const n = validSamples.length;
  const sorted = [...validSamples].sort((a, b) => a - b);

  // Calculate statistics
  const mean = validSamples.reduce((a, b) => a + b, 0) / n;
  const variance = validSamples.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance) || 1; // Ensure non-zero

  // Silverman's rule of thumb for bandwidth - ensure minimum bandwidth
  const iqr = (sorted[Math.floor(n * 0.75)] || 0) - (sorted[Math.floor(n * 0.25)] || 0);
  const rawBandwidth = 0.9 * Math.min(stdDev, (iqr / 1.34) || stdDev) * Math.pow(n, -0.2);
  const bandwidth = Math.max(rawBandwidth, 0.01); // Ensure minimum bandwidth

  // Generate density curve
  const padding = Math.max(2 * stdDev, 1);
  const min = (sorted[0] ?? 0) - padding;
  const max = (sorted[n - 1] ?? 0) + padding;

  // Ensure we have a valid range
  const range = max - min;
  if (range <= 0) {
    return {
      type: 'kde',
      points: [{ x: mean, y: 1 }],
      mean,
      stdDev,
      percentiles: { p5: mean, p25: mean, p50: mean, p75: mean, p95: mean },
    };
  }

  const step = range / numPoints;
  const points: Array<{ x: number; y: number }> = [];
  const sqrtTwoPi = Math.sqrt(2 * Math.PI);

  for (let i = 0; i <= numPoints; i++) {
    const x = min + i * step;
    // Gaussian kernel
    let density = 0;
    for (const s of validSamples) {
      const z = (x - s) / bandwidth;
      density += Math.exp(-0.5 * z * z);
    }
    density /= n * bandwidth * sqrtTwoPi;
    points.push({ x, y: isFinite(density) ? density : 0 });
  }

  // Calculate percentiles safely
  const getPercentile = (p: number) => sorted[Math.min(Math.floor(n * p), n - 1)] ?? mean;
  const percentiles = {
    p5: getPercentile(0.05),
    p25: getPercentile(0.25),
    p50: getPercentile(0.50),
    p75: getPercentile(0.75),
    p95: getPercentile(0.95),
  };

  return {
    type: 'kde',
    points,
    mean,
    stdDev,
    percentiles,
  };
}

/**
 * Basic statistics helpers
 */
export function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function variance(values: number[]): number {
  const m = mean(values);
  return values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length;
}

export function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.floor(sorted.length * p);
  return sorted[index];
}
