const MARKET_DATA = {
  medianHousePrice: 1000000, medianRentHouse: 620, yieldHouse: 3.32,
  annualGrowthHouse: 11.11, avgDaysOnMarketHouse: 13,
  historicalMedian: {"2021":620000,"2022":750000,"2023":770000,"2024":845000,"2025":900000,"2026":1000000},
  historicalSalesVol: {"2021":145,"2022":110,"2023":95,"2024":102,"2025":108,"2026":98}
};

function renderPriceChart() {
  const c = document.getElementById("price-chart");
  const years = Object.keys(MARKET_DATA.historicalMedian);
  const prices = Object.values(MARKET_DATA.historicalMedian);
  const maxP = Math.max(...prices);
  c.innerHTML = years.map((y, i) => {
    const h = (prices[i] / maxP) * 90;
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
      <div style="font-size:9px;color:#94a3b8;font-weight:600">$${(prices[i]/1000).toFixed(0)}k</div>
      <div style="width:100%;max-width:36px;height:${h}px;background:linear-gradient(to top,#10b981,#34d399);border-radius:4px 4px 0 0;min-height:4px"></div>
      <div style="font-size:9px;color:#64748b">${y}</div>
    </div>`;
  }).join("");
}

document.addEventListener("DOMContentLoaded", () => {
  renderPriceChart();

  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");
    });
  });

  document.getElementById("btn-save-settings").addEventListener("click", () => {
    const settings = {
      apiKey: document.getElementById("api-key-input").value,
      apiBase: document.getElementById("api-base-input").value || "http://localhost:3001",
      maxBudget: document.getElementById("max-budget").value,
      minBeds: document.getElementById("min-beds").value,
      propTypes: document.getElementById("prop-types").value
    };
    chrome.storage?.local.set(settings, () => {
      const btn = document.getElementById("btn-save-settings");
      btn.textContent = "✅ Saved!";
      setTimeout(() => { btn.textContent = "Save Settings"; }, 2000);
    });
  });

  document.getElementById("btn-test-api").addEventListener("click", () => {
    const apiBase = document.getElementById("api-base-input").value || "http://localhost:3001";
    const statusEl = document.getElementById("api-status");
    statusEl.innerHTML = '<div class="status-dot inactive"></div><span>Testing...</span>';
    chrome.storage?.local.set({ apiBase });
    setTimeout(() => {
      chrome.runtime?.sendMessage({ action: "healthCheck" }, (resp) => {
        if (resp?.data?.status === "ok") {
          statusEl.innerHTML = '<div class="status-dot active"></div><span>✅ Connected</span>';
          chrome.runtime?.sendMessage({ action: "getSuburbs" }, (subResp) => {
            if (subResp?.data?.suburbs?.length) {
              const names = subResp.data.suburbs.map(s => s.name).join(", ");
              statusEl.innerHTML += `<br><span style="font-size:10px;margin-left:14px;color:#64748b">${names}</span>`;
            }
          });
        } else {
          statusEl.innerHTML = '<div class="status-dot inactive"></div><span>❌ Cannot connect</span>';
        }
      });
    }, 500);
  });

  try {
    chrome.storage?.local.get(["apiKey","apiBase","maxBudget","minBeds","propTypes"], (data) => {
      if (data.apiKey) document.getElementById("api-key-input").value = data.apiKey;
      if (data.apiBase) document.getElementById("api-base-input").value = data.apiBase;
      if (data.maxBudget) document.getElementById("max-budget").value = data.maxBudget;
      if (data.minBeds) document.getElementById("min-beds").value = data.minBeds;
      if (data.propTypes) document.getElementById("prop-types").value = data.propTypes;
    });
  } catch(e){}
});
