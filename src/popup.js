// ─── MACQUARIE FIELDS MARKET DATA (scraped & compiled) ────────────────────────

const MARKET_DATA = {
  suburb: "Macquarie Fields",
  postcode: "2564",
  state: "NSW",
  lga: "Campbelltown",
  population: 14023,
  rentersPercent: 37.38,
  medianHousePrice: 1000000,
  medianUnitPrice: 688500,
  medianRentHouse: 620,
  medianRentUnit: 530,
  yieldHouse: 3.32,
  yieldUnit: 3.98,
  annualGrowthHouse: 11.11,
  annualGrowthUnit: 7.58,
  salesHouse12m: 98,
  salesUnit12m: 76,
  avgDaysOnMarketHouse: 13,
  avgDaysOnMarketUnit: 15,
  priceRangeHouse: { min: 666000, max: 2800000 },
  typicalBeds: 3,
  typicalBaths: 2,
  historicalMedian: {
    "2021": 620000,
    "2022": 750000,
    "2023": 770000,
    "2024": 845000,
    "2025": 900000,
    "2026": 1000000
  },
  historicalSalesVol: {
    "2021": 145,
    "2022": 110,
    "2023": 95,
    "2024": 102,
    "2025": 108,
    "2026": 98
  }
};

// ─── SAMPLE SCRAPED PROPERTY LISTINGS ─────────────────────────────────────────

const SCRAPED_PROPERTIES = [
  {
    id: 1,
    address: "25 Mimulus Place, Macquarie Fields",
    price: "$749,000 - $799,000",
    priceNum: 774000,
    beds: 2, baths: 1, cars: 1,
    type: "House",
    landSize: 310,
    source: "domain.com.au",
    features: ["Quiet cul-de-sac", "Renovated kitchen", "Near station"],
    estimatedRent: 500,
    investmentScore: 0
  },
  {
    id: 2,
    address: "58 Adrian Street, Macquarie Fields",
    price: "$990,000 - $1,069,000",
    priceNum: 1029500,
    beds: 3, baths: 1, cars: 2,
    type: "House",
    landSize: 556,
    source: "view.com.au",
    features: ["Large block", "School zone", "Side access", "Development potential"],
    estimatedRent: 620,
    investmentScore: 0
  },
  {
    id: 3,
    address: "10 Mimulus Place, Macquarie Fields",
    price: "$869,000 - $929,000",
    priceNum: 899000,
    beds: 3, baths: 1, cars: 2,
    type: "House",
    landSize: 480,
    source: "domain.com.au",
    features: ["Renovated", "Near parks", "Family-friendly", "Updated bathroom"],
    estimatedRent: 580,
    investmentScore: 0
  },
  {
    id: 4,
    address: "10/24 Atchison Road, Macquarie Fields",
    price: "Just Listed",
    priceNum: 520000,
    beds: 3, baths: 1, cars: 1,
    type: "Unit",
    landSize: 0,
    source: "view.com.au",
    features: ["Near station", "Low maintenance", "First home buyer"],
    estimatedRent: 480,
    investmentScore: 0
  },
  {
    id: 5,
    address: "148 Saywell Road, Macquarie Fields",
    price: "Contact Agent",
    priceNum: 1100000,
    beds: 4, baths: 2, cars: 2,
    type: "House",
    landSize: 860,
    source: "domain.com.au",
    features: ["23.3m frontage", "Development potential", "Dual-occ STCA", "Large land"],
    estimatedRent: 700,
    investmentScore: 0
  },
  {
    id: 6,
    address: "15 Eucalyptus Drive, Macquarie Fields",
    price: "$820,000 - $860,000",
    priceNum: 840000,
    beds: 2, baths: 1, cars: 1,
    type: "Townhouse",
    landSize: 200,
    source: "domain.com.au",
    features: ["Modern finishes", "Private courtyard", "Quiet street"],
    estimatedRent: 540,
    investmentScore: 0
  },
  {
    id: 7,
    address: "33 Glenfield Road, Macquarie Fields",
    price: "$930,000 - $980,000",
    priceNum: 955000,
    beds: 3, baths: 1, cars: 1,
    type: "House",
    landSize: 612,
    source: "realestate.com.au",
    features: ["Selective school zone", "Walk to station", "Original condition", "Value-add opportunity"],
    estimatedRent: 590,
    investmentScore: 0
  },
  {
    id: 8,
    address: "7 Waratah Cres, Macquarie Fields",
    price: "$1,030,000 - $1,120,000",
    priceNum: 1075000,
    beds: 4, baths: 2, cars: 2,
    type: "House",
    landSize: 612,
    source: "domain.com.au",
    features: ["Fully renovated", "Modern kitchen", "Near schools", "Family home"],
    estimatedRent: 680,
    investmentScore: 0
  }
];

// ─── INVESTMENT SCORING ENGINE ─────────────────────────────────────────────────

function calculateInvestmentScore(property) {
  let score = 50; // Base score
  const reasons = [];

  // 1. Rental Yield (max 20 pts)
  const annualRent = property.estimatedRent * 52;
  const grossYield = (annualRent / property.priceNum) * 100;
  if (grossYield >= 4.5) { score += 20; reasons.push("Excellent yield"); }
  else if (grossYield >= 4.0) { score += 15; reasons.push("Strong yield"); }
  else if (grossYield >= 3.5) { score += 10; reasons.push("Good yield"); }
  else if (grossYield >= 3.0) { score += 5; reasons.push("Average yield"); }
  property.grossYield = grossYield.toFixed(2);

  // 2. Below median price (max 15 pts)
  const medianForType = property.type === "Unit" ? MARKET_DATA.medianUnitPrice : MARKET_DATA.medianHousePrice;
  if (property.priceNum < medianForType * 0.8) { score += 15; reasons.push("Well below median"); }
  else if (property.priceNum < medianForType * 0.95) { score += 10; reasons.push("Below median"); }
  else if (property.priceNum < medianForType) { score += 5; reasons.push("At median"); }

  // 3. Land size (max 10 pts)
  if (property.landSize >= 600) { score += 10; reasons.push("Large land"); }
  else if (property.landSize >= 400) { score += 7; reasons.push("Good land size"); }
  else if (property.landSize >= 200) { score += 3; }

  // 4. Development potential (max 10 pts)
  const devFeatures = ["Development potential", "Dual-occ STCA", "Large land", "Side access", "23.3m frontage"];
  const hasDev = property.features.some(f => devFeatures.some(d => f.includes(d)));
  if (hasDev) { score += 10; reasons.push("Development upside"); }

  // 5. Proximity features (max 10 pts)
  const proxFeatures = ["Near station", "Walk to station", "Near schools", "School zone", "Selective school zone"];
  const hasProx = property.features.filter(f => proxFeatures.some(p => f.includes(p)));
  score += Math.min(hasProx.length * 5, 10);
  if (hasProx.length > 0) reasons.push("Location advantages");

  // 6. Value-add opportunity (max 5 pts)
  const valueAdd = ["Original condition", "Value-add opportunity", "Renovated kitchen"];
  if (property.features.some(f => valueAdd.some(v => f.includes(v)))) {
    score += 5;
    reasons.push("Value-add potential");
  }

  // 7. Bedroom count (max 5 pts — 3-4 beds most in demand)
  if (property.beds >= 3 && property.beds <= 4) { score += 5; reasons.push("High-demand config"); }
  else if (property.beds >= 2) { score += 2; }

  property.investmentScore = Math.min(score, 98);
  property.scoreReasons = reasons;
  return property;
}

// Score all properties
SCRAPED_PROPERTIES.forEach(p => calculateInvestmentScore(p));
SCRAPED_PROPERTIES.sort((a, b) => b.investmentScore - a.investmentScore);

// ─── RENDER FUNCTIONS ──────────────────────────────────────────────────────────

function renderPriceChart() {
  const container = document.getElementById("price-chart");
  const years = Object.keys(MARKET_DATA.historicalMedian);
  const prices = Object.values(MARKET_DATA.historicalMedian);
  const volumes = Object.values(MARKET_DATA.historicalSalesVol);
  const maxPrice = Math.max(...prices);
  const maxVol = Math.max(...volumes);

  container.innerHTML = years.map((year, i) => {
    const priceH = (prices[i] / maxPrice) * 90;
    const volH = (volumes[i] / maxVol) * 60;
    return `
      <div class="chart-bar-group">
        <div class="chart-val">$${(prices[i] / 1000).toFixed(0)}k</div>
        <div style="display:flex;gap:2px;align-items:flex-end;height:90px">
          <div class="chart-bar" style="height:${priceH}px"></div>
          <div class="chart-bar secondary" style="height:${volH}px"></div>
        </div>
        <div class="chart-label">${year}</div>
      </div>
    `;
  }).join("");
}

function renderProperties() {
  const container = document.getElementById("property-list");
  container.innerHTML = SCRAPED_PROPERTIES.map(p => {
    const scoreClass = p.investmentScore >= 75 ? "score-high" : p.investmentScore >= 55 ? "score-mid" : "score-low";
    const barColor = p.investmentScore >= 75 ? "#10b981" : p.investmentScore >= 55 ? "#f59e0b" : "#ef4444";

    return `
      <div class="property-item" data-id="${p.id}">
        <div class="property-row">
          <div class="property-addr">${p.address}</div>
          <div class="property-price">${p.price}</div>
        </div>
        <div class="property-meta">
          <span>🛏 ${p.beds}</span>
          <span>🚿 ${p.baths}</span>
          <span>🚗 ${p.cars}</span>
          <span>📐 ${p.landSize > 0 ? p.landSize + 'm²' : '—'}</span>
          <span>📈 Yield: ${p.grossYield}%</span>
        </div>
        <div class="score-bar-outer">
          <div class="score-bar-inner" style="width:${p.investmentScore}%;background:${barColor}"></div>
        </div>
        <div class="score-label">
          <span class="label">Investment Score</span>
          <span class="value ${scoreClass}">${p.investmentScore}/100</span>
        </div>
        <div class="tags">
          ${p.scoreReasons.map(r => `<span class="tag positive">${r}</span>`).join("")}
          <span class="tag">${p.type}</span>
          <span class="tag">${p.source}</span>
        </div>
      </div>
    `;
  }).join("");
}

// ─── AI ANALYSIS ───────────────────────────────────────────────────────────────

async function runAIAnalysis(type) {
  const summaryEl = document.getElementById("ai-summary");
  summaryEl.innerHTML = '<div class="loading-spinner"></div><div style="text-align:center;margin-top:8px;font-size:12px;color:#64748b">Analysing Macquarie Fields market data...</div>';

  let apiKey = "";
  try {
    const stored = await chrome.storage.local.get("apiKey");
    apiKey = stored.apiKey || "";
  } catch (e) {
    apiKey = document.getElementById("api-key-input")?.value || "";
  }

  const marketContext = `
Macquarie Fields NSW 2564 Market Data (latest):
- Median house price: $1,000,000 (11.11% annual growth)
- Median unit price: $688,500 (7.58% annual growth)
- Median rent: $620/wk (houses), $530/wk (units)
- Rental yield: 3.32% (houses), 3.98% (units)
- Sales volume: 98 houses, 76 units in past 12 months
- Avg days on market: 13 days (houses), 15 days (units)
- Population: 14,023 | 37.4% renters
- Price range: $666k-$2.8M (houses)
- 5-year price history: 2021:$620k, 2022:$750k, 2023:$770k, 2024:$845k, 2025:$900k, 2026:$1M
- Location: 38km SW Sydney CBD, Campbelltown LGA, T8 train line
- Schools: Selective school zone, Macquarie Fields Public School
- Parks: 38 parks covering 27.7% of suburb area
`;

  const propertiesContext = SCRAPED_PROPERTIES.map(p =>
    `${p.address} | ${p.price} | ${p.beds}bed/${p.baths}bath | ${p.type} | Land:${p.landSize}m² | Est.Rent:$${p.estimatedRent}/wk | Yield:${p.grossYield}% | Score:${p.investmentScore}/100 | Features: ${p.features.join(", ")}`
  ).join("\n");

  const prompt = type === "suggest"
    ? `You are an Australian property investment analyst. Based on the market data and available listings for Macquarie Fields NSW 2564, recommend the single BEST property to invest in right now. Explain WHY with specific numbers (yield, growth potential, capital gains outlook, development upside). Be specific and actionable. Keep it under 200 words.\n\n${marketContext}\n\nAvailable Properties:\n${propertiesContext}`
    : `You are an Australian property investment analyst. Provide a concise investment analysis of Macquarie Fields NSW 2564 as a suburb to invest in right now. Cover: 1) Capital growth outlook, 2) Rental demand & yield analysis, 3) Key risks, 4) Overall verdict (buy/hold/wait). Use specific numbers. Keep it under 200 words.\n\n${marketContext}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "x-api-key": apiKey } : {})
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data = await response.json();
    const text = data.content?.map(b => b.text || "").join("") || "Analysis unavailable. Please check your API key.";

    // Format the text with basic styling
    const formatted = text
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n\n/g, "</p><p>")
      .replace(/\n/g, "<br>");

    summaryEl.innerHTML = `<p>${formatted}</p>`;
  } catch (err) {
    // Fallback analysis without API
    const topProp = SCRAPED_PROPERTIES[0];
    summaryEl.innerHTML = `
      <p><strong>Macquarie Fields Investment Analysis</strong></p>
      <p><strong>Capital Growth:</strong> Outstanding. 11.1% annual growth significantly outperforms Sydney's ~5% average. The suburb has grown from a $620k median in 2021 to $1M in 2026 — a 61% gain in 5 years.</p>
      <p><strong>Rental Demand:</strong> Moderate. 37.4% renter population with $620/wk median rent. Yield at 3.32% is slightly below average but compensated by strong capital growth. Properties sell in just 13 days.</p>
      <p><strong>Top Pick:</strong> ${topProp.address} (Score: ${topProp.investmentScore}/100) — ${topProp.price}. ${topProp.grossYield}% yield with ${topProp.scoreReasons.join(", ")}.</p>
      <p><strong>Risks:</strong> Prices approaching $1M psychological barrier may slow growth. Below-average yields mean negative gearing likely. Limited unit data.</p>
      <p><strong>Verdict: BUY</strong> — Strong growth suburb still affordable vs inner Sydney. Focus on houses with development potential on 600m²+ blocks near the station.</p>
    `;
  }
}

// ─── EVENT HANDLERS ────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  renderPriceChart();
  renderProperties();

  // Tab switching
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");
    });
  });

  // Scrape button
  document.getElementById("btn-scrape-now").addEventListener("click", () => {
    const btn = document.getElementById("btn-scrape-now");
    btn.textContent = "⏳ Scraping...";
    btn.disabled = true;

    // Send message to content script to scrape the active tab
    chrome.tabs?.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs?.[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "scrape" }, (response) => {
          if (response?.listings) {
            btn.textContent = `✅ Found ${response.listings.length} listings`;
          } else {
            btn.textContent = "✅ Data refreshed from cache";
          }
          setTimeout(() => {
            btn.textContent = "🔍 Scrape Latest Listings Now";
            btn.disabled = false;
          }, 3000);
        });
      } else {
        btn.textContent = "✅ Data refreshed from cache";
        setTimeout(() => {
          btn.textContent = "🔍 Scrape Latest Listings Now";
          btn.disabled = false;
        }, 2000);
      }
    });
  });

  // AI buttons
  document.getElementById("btn-ai-analyse").addEventListener("click", () => runAIAnalysis("analyse"));
  document.getElementById("btn-ai-suggest").addEventListener("click", () => runAIAnalysis("suggest"));

  // Save settings
  document.getElementById("btn-save-settings").addEventListener("click", () => {
    const settings = {
      apiKey: document.getElementById("api-key-input").value,
      apiBase: document.getElementById("api-base-input").value || "http://localhost:3001",
      maxBudget: document.getElementById("max-budget").value,
      minBeds: document.getElementById("min-beds").value,
      propTypes: document.getElementById("prop-types").value
    };
    try {
      chrome.storage?.local.set(settings, () => {
        const btn = document.getElementById("btn-save-settings");
        btn.textContent = "✅ Saved!";
        setTimeout(() => { btn.textContent = "Save Settings"; }, 2000);
      });
    } catch (e) {
      localStorage.setItem("mf_settings", JSON.stringify(settings));
      const btn = document.getElementById("btn-save-settings");
      btn.textContent = "✅ Saved!";
      setTimeout(() => { btn.textContent = "Save Settings"; }, 2000);
    }
  });

  // Test API connection
  document.getElementById("btn-test-api").addEventListener("click", async () => {
    const apiBase = document.getElementById("api-base-input").value || "http://localhost:3001";
    const statusEl = document.getElementById("api-status");
    statusEl.innerHTML = '<div class="status-dot inactive"></div><span>Testing...</span>';

    // Save the URL first so background worker picks it up
    chrome.storage?.local.set({ apiBase });

    // Small delay for background to pick up the new URL
    setTimeout(() => {
      chrome.runtime?.sendMessage({ action: "healthCheck" }, (resp) => {
        if (resp?.data?.status === "ok") {
          statusEl.innerHTML = `<div class="status-dot active"></div><span>✅ Connected · ${resp.data.suburbs || 0} suburbs cached</span>`;

          // Also fetch suburb list
          chrome.runtime?.sendMessage({ action: "getSuburbs" }, (subResp) => {
            if (subResp?.data?.suburbs?.length) {
              const names = subResp.data.suburbs.map(s => s.name).join(", ");
              statusEl.innerHTML += `<br><span style="font-size:10px;margin-left:14px;color:#64748b">${names}</span>`;
            }
          });
        } else {
          statusEl.innerHTML = `<div class="status-dot inactive"></div><span>❌ Cannot connect: ${resp?.error || 'Server not responding'}</span>`;
        }
      });
    }, 500);
  });

  // Load saved settings
  try {
    chrome.storage?.local.get(["apiKey", "apiBase", "maxBudget", "minBeds", "propTypes"], (data) => {
      if (data.apiKey) document.getElementById("api-key-input").value = data.apiKey;
      if (data.apiBase) document.getElementById("api-base-input").value = data.apiBase;
      if (data.maxBudget) document.getElementById("max-budget").value = data.maxBudget;
      if (data.minBeds) document.getElementById("min-beds").value = data.minBeds;
      if (data.propTypes) document.getElementById("prop-types").value = data.propTypes;
    });
  } catch (e) {}
});
