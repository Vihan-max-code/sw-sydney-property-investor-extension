cd ~/Downloads/property-investor-backend/src && cat > analyser.js << 'ENDOFFILE'
// ═══════════════════════════════════════════════════════════════
// SW Sydney Property Investor — Full ML + Infrastructure Model
// ═══════════════════════════════════════════════════════════════
// 3 MODELS:
//   1. RENT: Linear Regression (52 listings, R²=0.681)
//   2. PRICE: Feature + infrastructure scoring
//   3. 5YR PROJECTION: Multi-factor with commission drag
// ═══════════════════════════════════════════════════════════════

// --- RENT MODEL ---
const ML_MODEL = {
  intercept: 497.4,
  coefficients: {
    beds: 68.6, baths: 59.9, cars: 11.8,
    is_unit: -42.8, is_townhouse: -50.4,
    "suburb_Glenfield": -155.8, "suburb_Holsworthy": -75.0,
    "suburb_Leumeah": -198.8, "suburb_Macquarie Fields": -153.4, "suburb_Minto": -156.2,
  },
  accuracy: { r2: 0.681, mae: 48, mape: 7.5, training_samples: 52 }
};

// --- 5YR PROJECTION MODEL (commission = negative) ---
const PROJECTION_MODEL = {
  "Macquarie Fields": { growth: 7.52, factors: "15% housing commission suppresses prices (-6%), offset by selective school (+5%), growth area (+2%)" },
  "Minto": { growth: 7.83, factors: "20% commission (-8%), renewal offset (+3%), growth area (+2%), walkable station (+4%)" },
  "Leumeah": { growth: 7.76, factors: "10% commission (-3%), 2 train lines (+2%), growth area (+2%), walkable station (+4%)" },
  "Glenfield": { growth: 9.56, factors: "Low commission, 7000-home rezoning (+3%), 4-line junction (+5%), Hurlstone selective (+5%)" },
  "Holsworthy": { growth: 2.00, factors: "Already expensive, no growth area, no development, army barracks constraint" },
  "East Hills": { growth: 6.31, factors: "Close CBD (+4%), walkable station (+4%), parks (+2%), affordability ceiling (-1.5%)" },
};

// --- SUBURB INFRASTRUCTURE DATA (for price adjustment) ---
const SUBURB_INFRA = {
  "Macquarie Fields": {
    priceAdj: 0.06,  // net +6% from infrastructure
    commission: 15, renewal: false, selective: true, schoolScore: 7,
    stationKm: 0.7, trainLines: 1, patronage: 1800,
    growthArea: true, rezoning: false, plannedHomes: 500,
    cbdKm: 38, parksPct: 27.7,
    explain: "Selective school (+5%), near station (+2%), growth area (+2%), parks (+2%), but 15% housing commission (-6%)"
  },
  "Minto": {
    priceAdj: 0.00,  // net 0% — commission drag offset by renewal + station
    commission: 20, renewal: true, selective: false, schoolScore: 6,
    stationKm: 0.5, trainLines: 1, patronage: 2200,
    growthArea: true, rezoning: false, plannedHomes: 800,
    cbdKm: 42, parksPct: 20,
    explain: "20% commission (-8%), renewal offset (+3%), walkable station (+4%), growth area (+2%), far CBD (-2%)"
  },
  "Leumeah": {
    priceAdj: 0.04,  // net +4%
    commission: 10, renewal: false, selective: false, schoolScore: 6,
    stationKm: 0.3, trainLines: 2, patronage: 2500,
    growthArea: true, rezoning: false, plannedHomes: 600,
    cbdKm: 45, parksPct: 22,
    explain: "10% commission (-3%), walkable station (+4%), 2 train lines (+2%), growth area (+2%), far CBD (-2%)"
  },
  "Glenfield": {
    priceAdj: 0.21,  // net +21% — best infrastructure
    commission: 5, renewal: false, selective: true, schoolScore: 9,
    stationKm: 0.4, trainLines: 4, patronage: 8122,
    growthArea: true, rezoning: true, plannedHomes: 7000,
    cbdKm: 35, parksPct: 25,
    explain: "Selective school (+5%), excellent schools (+3%), 4-line junction (+5%), walkable station (+4%), rezoning (+3%), parks (+2%), moderate CBD (+2%), but high supply (-3%)"
  },
  "Holsworthy": {
    priceAdj: 0.02,  // net +2%
    commission: 2, renewal: false, selective: false, schoolScore: 4,
    stationKm: 1.2, trainLines: 1, patronage: 4038,
    growthArea: false, rezoning: false, plannedHomes: 50,
    cbdKm: 32, parksPct: 15,
    explain: "Moderate CBD distance (+2%), but no growth area, no selective school, station 1.2km away"
  },
  "East Hills": {
    priceAdj: 0.11,  // net +11%
    commission: 3, renewal: false, selective: false, schoolScore: 7,
    stationKm: 0.5, trainLines: 1, patronage: 1239,
    growthArea: false, rezoning: false, plannedHomes: 30,
    cbdKm: 22, parksPct: 30,
    explain: "Close CBD (+4%), walkable station (+4%), parks (+2%), good schools (+1%)"
  },
};

// --- PROPERTY FEATURE WEIGHTS ---
const PRICE_WEIGHTS = {
  perBed: 0.18,        // Each bedroom adds ~18% to price
  perBath: 0.10,       // Each bathroom adds ~10%
  perCar: 0.03,        // Each car space adds ~3%
  perSqmLand: 0.0004,  // Each sqm above 400 baseline adds ~0.04%
  landBaseline: 400,
  unitDiscount: 0.30,
  townhouseDiscount: 0.15,
  bedBaseline: 3,
  bathBaseline: 1,
  carBaseline: 1,
};

function capitalise(str) { return (str||"").split(" ").map(w=>w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()).join(" "); }

// ═══════════════════════════════════════════════════════════════
// PREDICT PRICE — uses property features + infrastructure
// ═══════════════════════════════════════════════════════════════
function predictPrice(beds, baths, cars, landSize, propertyType, suburbData) {
  const isUnit = /unit|apartment|studio/i.test(propertyType || "");
  const isTownhouse = /townhouse|villa/i.test(propertyType || "");
  const suburbName = capitalise(suburbData?.name || "Macquarie Fields");
  const medianHouse = suburbData?.house?.medianPrice || 1000000;
  const medianUnit = suburbData?.unit?.medianPrice || 688000;

  // Start from suburb median
  let price = isUnit ? medianUnit : medianHouse;

  // 1. PROPERTY FEATURE ADJUSTMENTS
  const bedDiff = (beds || 3) - PRICE_WEIGHTS.bedBaseline;
  price *= (1 + bedDiff * PRICE_WEIGHTS.perBed);

  const bathDiff = (baths || 1) - PRICE_WEIGHTS.bathBaseline;
  price *= (1 + bathDiff * PRICE_WEIGHTS.perBath);

  const carDiff = (cars || 1) - PRICE_WEIGHTS.carBaseline;
  price *= (1 + carDiff * PRICE_WEIGHTS.perCar);

  if (!isUnit && landSize && landSize > 0) {
    const landDiff = landSize - PRICE_WEIGHTS.landBaseline;
    price *= (1 + landDiff * PRICE_WEIGHTS.perSqmLand);
  }

  if (isTownhouse && !isUnit) {
    price *= (1 - PRICE_WEIGHTS.townhouseDiscount);
  }

  // 2. INFRASTRUCTURE ADJUSTMENTS
  const infra = SUBURB_INFRA[suburbName];
  if (infra) {
    price *= (1 + infra.priceAdj);
  }

  return Math.round(price / 5000) * 5000;
}

// ═══════════════════════════════════════════════════════════════
// PREDICT RENT — ML linear regression
// ═══════════════════════════════════════════════════════════════
function predictRent(beds, baths, cars, propertyType, suburbName) {
  const isUnit = /unit|apartment|studio/i.test(propertyType || "");
  const isTownhouse = /townhouse|villa/i.test(propertyType || "");
  let rent = ML_MODEL.intercept;
  rent += (beds || 3) * ML_MODEL.coefficients.beds;
  rent += (baths || 1) * ML_MODEL.coefficients.baths;
  rent += (cars || 1) * ML_MODEL.coefficients.cars;
  if (isUnit) rent += ML_MODEL.coefficients.is_unit;
  if (isTownhouse) rent += ML_MODEL.coefficients.is_townhouse;
  const subKey = "suburb_" + capitalise(suburbName);
  if (ML_MODEL.coefficients[subKey] !== undefined) rent += ML_MODEL.coefficients[subKey];
  return Math.round(Math.max(rent, 250));
}

// ═══════════════════════════════════════════════════════════════
// 5-YEAR PROJECTION — infrastructure-based growth rates
// ═══════════════════════════════════════════════════════════════
function getProjectedGrowth(suburbName) {
  const name = capitalise(suburbName);
  const model = PROJECTION_MODEL[name];
  if (model) return { growth: model.growth, factors: model.factors, method: "Multi-factor model" };
  return { growth: 6.0, factors: "Sydney long-term average", method: "Default" };
}

// ═══════════════════════════════════════════════════════════════
// FULL ANALYSIS — combines all 3 models
// ═══════════════════════════════════════════════════════════════
function analyseProperty(price, beds, baths, landSize, propertyType, suburbData) {
  if (!price || price < 50000 || price > 10000000) return null;
  const isDuplex = /duplex|dual/i.test(propertyType || "");
  const isUnit = /unit|apartment|studio/i.test(propertyType || "");
  const medianHouse = suburbData?.house?.medianPrice || 1000000;
  const medianUnit = suburbData?.unit?.medianPrice || 688000;
  const dom = isUnit ? (suburbData?.unit?.daysOnMarket || 20) : (suburbData?.house?.daysOnMarket || 15);
  const median = isDuplex ? medianHouse * 1.5 : isUnit ? medianUnit : medianHouse;
  const vsMedian = ((price - median) / median) * 100;
  const suburbName = suburbData?.name || "Macquarie Fields";

  // MODEL 1: Predicted rent
  const rent = predictRent(beds, baths, 1, propertyType, suburbName);
  const annualRent = rent * 52;
  const grossYield = (annualRent / price) * 100;
  const netYield = grossYield * 0.72;

  // Mortgage
  const loanAmount = price * 0.8;
  const monthlyRepayment = (loanAmount / 100000) * 613;
  const weeklyRepayment = Math.round(monthlyRepayment * 12 / 52);
  const weekCashflow = rent - weeklyRepayment;

  // MODEL 2: Predicted price (single value, infrastructure-adjusted)
  const modelPrice = predictPrice(beds, baths, 1, landSize, propertyType, suburbData);
  const infra = SUBURB_INFRA[capitalise(suburbName)];
  const priceFactors = infra ? infra.explain : "No infrastructure data";

  // MODEL 3: 5-year projection (infrastructure-based growth)
  const projection = getProjectedGrowth(suburbName);
  const growth = projection.growth;
  const proj5 = Math.round(price * Math.pow(1 + growth / 100, 5));
  const proj10 = Math.round(price * Math.pow(1 + growth / 100, 10));
  const equity5 = proj5 - price;

  // Scoring
  let score = 40; const reasons = [];
  if (grossYield >= 5) { score += 25; reasons.push("Excellent yield"); }
  else if (grossYield >= 4.5) { score += 20; reasons.push("Strong yield"); }
  else if (grossYield >= 4) { score += 16; reasons.push("Good yield"); }
  else if (grossYield >= 3.5) { score += 12; reasons.push("Solid yield"); }
  else if (grossYield >= 3) { score += 8; reasons.push("Average yield"); }
  else if (grossYield >= 2.5) { score += 4; reasons.push("Below-avg yield"); }
  if (vsMedian < -30) { score += 15; reasons.push("Deep value"); }
  else if (vsMedian < -15) { score += 12; reasons.push("Well below median"); }
  else if (vsMedian < -5) { score += 8; reasons.push("Below median"); }
  else if (vsMedian < 5) { score += 5; reasons.push("At median"); }
  if (landSize >= 700) { score += 10; reasons.push("Large land"); }
  else if (landSize >= 500) { score += 7; reasons.push("Good land"); }
  else if (landSize >= 300) { score += 4; }
  if (isDuplex) { score += 12; reasons.push("Dual income"); }
  if (beds >= 3 && beds <= 4) { score += 5; reasons.push("High-demand config"); }
  else if (beds >= 5) { score += 3; reasons.push("Large home"); }
  else if (beds === 2) { score += 3; }
  if (baths >= 2 && beds >= 3) score += 3;
  score = Math.min(Math.max(score, 10), 98);
  const verdict = score >= 80 ? "STRONG BUY" : score >= 65 ? "BUY" : score >= 50 ? "HOLD" : "WEAK";
  const color = score >= 80 ? "#10b981" : score >= 65 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";

  return {
    score, verdict, color, reasons, isDuplex,
    grossYield: grossYield.toFixed(2), netYield: netYield.toFixed(2),
    rent, rentMethod: "ML Model (R²=0.681, MAE=$48/wk)",
    annualRent, vsMedian: vsMedian.toFixed(1),
    weeklyRepayment, weekCashflow,
    growth: growth.toFixed(2), growthMethod: projection.method, growthFactors: projection.factors,
    dom, proj5, proj10, equity5,
    modelPrice, priceFactors
  };
}

module.exports = { analyseProperty, predictRent, predictPrice, getProjectedGrowth, ML_MODEL, PROJECTION_MODEL, SUBURB_INFRA };
ENDOFFILE
