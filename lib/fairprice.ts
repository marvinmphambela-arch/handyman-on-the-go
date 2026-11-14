/** FairPrice calculation contract. Never show numeric estimates until verified catalogue rates are configured. */
export type Complexity = "simple" | "standard" | "complex";
export type FairPriceInputs = {
  serviceId: string;
  complexity: Complexity;
  labourHours: number;
  materialsEstimateZar: number;
  travelFeeZar: number;
  calloutFeeZar: number;
  emergencyMultiplier: number;
};
export type FairPriceRates = {
  hourlyRateZar: number;
  complexityMultipliers: Record<Complexity, number>;
  emergencyMultiplier: number;
  version: string;
};
export type FairPriceResult = {
  lowZar: number;
  highZar: number;
  recommendedOfferZar: number;
  source: "admin_catalogue";
  catalogueVersion: string;
};
export function calculateFairPrice(input: FairPriceInputs, rates: FairPriceRates): FairPriceResult {
  if (!input.serviceId || input.labourHours <= 0 || input.materialsEstimateZar < 0 || input.travelFeeZar < 0 || input.calloutFeeZar < 0) {
    throw new Error("FairPrice inputs are invalid.");
  }
  if (rates.hourlyRateZar <= 0 || !rates.version) throw new Error("Verified FairPrice catalogue rates are required.");
  const emergency = Math.max(1, input.emergencyMultiplier, rates.emergencyMultiplier);
  const labour = input.labourHours * rates.hourlyRateZar * rates.complexityMultipliers[input.complexity] * emergency;
  const total = labour + input.materialsEstimateZar + input.travelFeeZar + input.calloutFeeZar;
  return {
    lowZar: Math.round(total * 0.9),
    highZar: Math.round(total * 1.15),
    recommendedOfferZar: Math.round(total),
    source: "admin_catalogue",
    catalogueVersion: rates.version
  };
}