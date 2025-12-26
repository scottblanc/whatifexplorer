import type { CausalModel } from '@/types/causal';

export const MACRO_ECONOMY_MODEL: CausalModel = {
  title: "Macroeconomic Causal Dynamics: Monetary Policy Transmission",
  description: "Models how Federal Reserve policy decisions propagate through the economy to affect inflation, employment, and growth.",

  zones: {
    monetary: {
      label: "Monetary Policy",
      color: "#3B82F6",
      description: "Central bank controlled variables and direct policy instruments"
    },
    financial: {
      label: "Financial Conditions",
      color: "#8B5CF6",
      description: "Credit markets, asset prices, and financial intermediation"
    },
    prices: {
      label: "Price Level",
      color: "#F59E0B",
      description: "Inflation dynamics and price expectations"
    },
    real_economy: {
      label: "Real Economy",
      color: "#10B981",
      description: "Output, employment, and consumption"
    }
  },

  nodes: [
    {
      id: "fed_funds_rate",
      label: "Fed Funds Rate",
      description: "The target interest rate set by the Federal Reserve for overnight lending between banks",
      type: "exogenous",
      zone: "monetary",
      shape: "diamond",
      units: "%",
      distribution: { type: "bounded", min: 0, max: 20, mode: 5.25 },
      circuitBreakers: { minValue: 0, maxValue: 20, priorWeight: 0.05 }
    },
    {
      id: "money_supply",
      label: "Money Supply (M2)",
      description: "Total money in circulation including cash, checking deposits, and easily convertible near-money",
      type: "endogenous",
      zone: "monetary",
      shape: "circle",
      units: "T$",
      distribution: { type: "continuous", dist: "lognormal", params: [3.0, 0.15] },
      circuitBreakers: { minValue: 1, maxValue: 50, priorWeight: 0.1 }
    },
    {
      id: "credit_availability",
      label: "Credit Availability",
      description: "Ease of obtaining loans for businesses and consumers, affected by bank lending standards",
      type: "endogenous",
      zone: "financial",
      shape: "circle",
      units: "index",
      distribution: { type: "bounded", min: 0, max: 100, mode: 60 },
      circuitBreakers: { minValue: 0, maxValue: 100, priorWeight: 0.1 }
    },
    {
      id: "asset_prices",
      label: "Asset Prices",
      description: "Stock market valuations and real estate prices, representing wealth effects",
      type: "endogenous",
      zone: "financial",
      shape: "circle",
      units: "index",
      distribution: { type: "continuous", dist: "lognormal", params: [4.5, 0.25] },
      circuitBreakers: { minValue: 10, maxValue: 500, priorWeight: 0.1 }
    },
    {
      id: "inflation_expectations",
      label: "Inflation Expectations",
      description: "Public and market expectations of future inflation, anchored by Fed credibility",
      type: "mediator",
      zone: "prices",
      shape: "octagon",
      units: "%",
      distribution: { type: "continuous", dist: "normal", params: [2.5, 0.8] },
      circuitBreakers: { minValue: -2, maxValue: 15, priorWeight: 0.15 }
    },
    {
      id: "actual_inflation",
      label: "CPI Inflation",
      description: "Year-over-year change in Consumer Price Index measuring cost of living",
      type: "endogenous",
      zone: "prices",
      shape: "circle",
      units: "%",
      distribution: { type: "continuous", dist: "normal", params: [3.0, 1.5] },
      circuitBreakers: { minValue: -5, maxValue: 20, priorWeight: 0.1 }
    },
    {
      id: "business_investment",
      label: "Business Investment",
      description: "Capital expenditure by firms on equipment, structures, and intellectual property",
      type: "endogenous",
      zone: "real_economy",
      shape: "circle",
      units: "% GDP",
      distribution: { type: "continuous", dist: "normal", params: [14, 2] },
      circuitBreakers: { minValue: 5, maxValue: 25, priorWeight: 0.1 }
    },
    {
      id: "consumer_spending",
      label: "Consumer Spending",
      description: "Household consumption expenditure on goods and services",
      type: "endogenous",
      zone: "real_economy",
      shape: "circle",
      units: "% growth",
      distribution: { type: "continuous", dist: "normal", params: [2.5, 1.5] },
      circuitBreakers: { minValue: -10, maxValue: 15, priorWeight: 0.1 }
    },
    {
      id: "gdp_growth",
      label: "Real GDP Growth",
      description: "Annual growth rate of inflation-adjusted economic output",
      type: "terminal",
      zone: "real_economy",
      shape: "rectangle",
      units: "%",
      distribution: { type: "continuous", dist: "normal", params: [2.0, 1.5] },
      circuitBreakers: { minValue: -10, maxValue: 15, priorWeight: 0.1 }
    },
    {
      id: "unemployment",
      label: "Unemployment Rate",
      description: "Percentage of labor force actively seeking but unable to find work",
      type: "terminal",
      zone: "real_economy",
      shape: "rectangle",
      units: "%",
      distribution: { type: "bounded", min: 2, max: 15, mode: 4.0 },
      circuitBreakers: { minValue: 0, maxValue: 30, priorWeight: 0.1 }
    }
  ],

  edges: [
    {
      source: "fed_funds_rate",
      target: "money_supply",
      relationship: "causes",
      label: "Higher rates reduce money creation",
      style: "solid",
      weight: "heavy",
      effect: { type: "linear", coefficient: -0.08 }
    },
    {
      source: "fed_funds_rate",
      target: "credit_availability",
      relationship: "causes",
      label: "Higher rates tighten lending",
      style: "solid",
      weight: "heavy",
      effect: { type: "linear", coefficient: -5.0 }
    },
    {
      source: "fed_funds_rate",
      target: "asset_prices",
      relationship: "causes",
      label: "Higher rates reduce valuations",
      style: "solid",
      weight: "normal",
      effect: { type: "linear", coefficient: -8.0 }
    },
    {
      source: "fed_funds_rate",
      target: "inflation_expectations",
      relationship: "causes",
      label: "Policy signals commitment to price stability",
      style: "dashed",
      weight: "normal",
      effect: { type: "linear", coefficient: -0.15 }
    },
    {
      source: "money_supply",
      target: "actual_inflation",
      relationship: "causes",
      label: "More money chases same goods",
      style: "solid",
      weight: "normal",
      effect: { type: "linear", coefficient: 0.1 }
    },
    {
      source: "inflation_expectations",
      target: "actual_inflation",
      relationship: "causes",
      label: "Expectations become self-fulfilling",
      style: "solid",
      weight: "heavy",
      effect: { type: "linear", coefficient: 0.6 }
    },
    {
      source: "credit_availability",
      target: "business_investment",
      relationship: "causes",
      label: "Easier credit enables capex",
      style: "solid",
      weight: "heavy",
      effect: { type: "linear", coefficient: 0.08 }
    },
    {
      source: "credit_availability",
      target: "consumer_spending",
      relationship: "causes",
      label: "Credit access enables purchases",
      style: "solid",
      weight: "normal",
      effect: { type: "linear", coefficient: 0.03 }
    },
    {
      source: "asset_prices",
      target: "consumer_spending",
      relationship: "causes",
      label: "Wealth effect on consumption",
      style: "dashed",
      weight: "light",
      effect: { type: "linear", coefficient: 0.01 }
    },
    {
      source: "business_investment",
      target: "gdp_growth",
      relationship: "causes",
      label: "Investment drives output",
      style: "solid",
      weight: "heavy",
      effect: { type: "linear", coefficient: 0.15 }
    },
    {
      source: "consumer_spending",
      target: "gdp_growth",
      relationship: "causes",
      label: "Consumption is 70% of GDP",
      style: "solid",
      weight: "heavy",
      effect: { type: "linear", coefficient: 0.5 }
    },
    {
      source: "gdp_growth",
      target: "unemployment",
      relationship: "causes",
      label: "Okun's Law: growth reduces unemployment",
      style: "solid",
      weight: "heavy",
      effect: { type: "linear", coefficient: -0.5 }
    },
    {
      source: "actual_inflation",
      target: "consumer_spending",
      relationship: "causes",
      label: "Inflation erodes purchasing power",
      style: "dashed",
      weight: "light",
      effect: { type: "linear", coefficient: -0.2 }
    }
  ],

  keyInsights: [
    "The Fed controls inflation primarily through two channels: (1) direct credit tightening that slows demand, and (2) anchoring inflation expectations which are self-fulfilling.",
    "There is a policy lag: rate changes affect financial conditions immediately but take time to fully impact GDP and unemployment.",
    "The Phillips Curve trade-off (inflation vs unemployment) is mediated by inflation expectations—if expectations are well-anchored, the Fed can fight inflation with less employment cost.",
    "Asset prices create a 'wealth effect' feedback loop: lower rates boost asset prices, increasing consumer spending, which can fuel inflation."
  ]
};
