// ── Editable inputs — confirm with FP&A before the event ──────────────
export const FINANCE_INPUTS = {
  applicationsPerWeek: 120,       // source: Recruiting ops
  minutesPerApplication: 8,       // source: Enrollment Coordinator
  hourlyRateFullyLoaded: 45,      // source: Finance (USD)
  activeWeeksPerYear: 48,         // standard calendar assumption
} as const;

export type FinancialInputs = typeof FINANCE_INPUTS;

export type FinancialImpact = {
  headline: string;
  value: number;          // annual USD
  unit: string;
  basis: string;
};

export function computeFinancialImpact(inputs: FinancialInputs = FINANCE_INPUTS): FinancialImpact {
  const hoursPerWeek =
    (inputs.applicationsPerWeek * inputs.minutesPerApplication) / 60;
  const annualCost = Math.round(
    hoursPerWeek * inputs.activeWeeksPerYear * inputs.hourlyRateFullyLoaded
  );
  const kValue = Math.floor(annualCost / 1000);

  return {
    headline: `Cross-training a backup and templating the eligibility step removes a single point of failure spanning two initiatives, returns about ${hoursPerWeek.toFixed(0)} hours per week (about $${kValue}K per year), and protects roughly ${inputs.applicationsPerWeek} applications per week of enrollment throughput that today depends on one person.`,
    value: annualCost,
    unit: "USD/year",
    basis: `${inputs.applicationsPerWeek} applications/week × ${inputs.minutesPerApplication} min manual review = ${hoursPerWeek.toFixed(0)} hrs/week; ${hoursPerWeek.toFixed(0)} hrs × ${inputs.activeWeeksPerYear} weeks × $${inputs.hourlyRateFullyLoaded}/hr fully loaded ≈ $${annualCost.toLocaleString()}/year. Inputs are placeholders pending FP&A confirmation.`,
  };
}
