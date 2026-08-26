// ─── SW Sydney Property Investor — Content Script v10 ─────────────────────────
// Pulls ALL data from backend API. No hardcoded suburb data.
// Backend: http://localhost:3001 (configurable in extension settings)

(function () {
  "use strict";

  // ─── CONFIG ─────────────────────────────────────────────────────────────────
  // API calls are routed through the background service worker
  // to avoid HTTPS→HTTP mixed content blocks.

  const site = location.hostname.includes("domain") ? "domain"
             : location.hostname.includes("realestate") ? "rea" : "other";
  const siteName = site === "rea" ? "realestate.com.au" : site === "domain" ? "domain.com.au" : "Listing Site";

  let lastUrl = "";
  let suburbCache = {}; // In-memory cache for this session

  // ─── SUBURB DETECTION ───────────────────────────────────────────────────────

  // Known suburb patterns to match in URLs
  const SUBURB_PATTERNS = [
    { regex: /macquarie[\-\+%20\s]*fields/i, name: "macquarie fields", postcode: "2564" },
    { regex: /minto(?![\-\s]heights)/i, name: "minto", postcode: "2566" },
    { regex: /leumeah/i, name: "leumeah", postcode: "2560" },
    { regex: /glenfield/i, name: "glenfield", postcode: "2167" },
    { regex: /holsworthy/i, name: "holsworthy", postcode: "2173" },
    { regex: /east[\-\+%20\s]*hills/i, name: "east hills", postcode: "2213" },
    // Add more suburbs here — or they'll be detected from the backend dynamically
  ];

  // Postcodes as fallback
  const POSTCODE_MAP = {
    "2564": "macquarie fields", "2566": "minto", "2560": "leumeah",
    "2167": "glenfield", "2173": "holsworthy", "2213": "east hills"
  };

  function detectSuburbFromUrl(url) {
    const u = (url || location.href).toLowerCase();

    // Try pattern match first
    for (const p of SUBURB_PATTERNS) {
      if (p.regex.test(u)) return { name: p.name, postcode: p.postcode };
    }

    // Try postcode match
    for (const [pc, name] of Object.entries(POSTCODE_MAP)) {
      if (u.includes(pc)) return { name, postcode: pc };
    }

    return null;
  }

  function isSearchPage(url) {
    const u = (url || location.href).toLowerCase();
    if (!detectSuburbFromUrl(u)) return false;
    if (site === "domain") return u.includes("/sale/") && !u.match(/\d{9,}/);
    if (site === "rea") return (u.includes("/buy/") || u.includes("/rent/")) && (u.includes("list") || u.includes("/in-"));
    return false;
  }

  function isListingPage(url) {
    const u = (url || location.href).toLowerCase();
    if (!detectSuburbFromUrl(u)) return false;
    if (site === "domain") return !!u.match(/\d{9,}/);
    if (site === "rea") return u.includes("/property-");
    return false;
  }

  // ─── API CALLS (background worker → fallback to direct fetch) ──────────────

  let API_BASE = "http://localhost:3001";
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    chrome.storage.local.get("apiBase", (d) => { if (d.apiBase) API_BASE = d.apiBase; });
  }

  function sendMsg(msg) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.log("[MFI] Background worker timeout, trying direct fetch");
        resolve(null);
      }, 5000);

      try {
        chrome.runtime.sendMessage(msg, (resp) => {
          clearTimeout(timeout);
          if (chrome.runtime.lastError) {
            console.log("[MFI] sendMessage error:", chrome.runtime.lastError.message);
            resolve(null);
          } else {
            resolve(resp?.data || null);
          }
        });
      } catch (e) {
        clearTimeout(timeout);
        console.log("[MFI] sendMessage exception:", e.message);
        resolve(null);
      }
    });
  }

  // Direct fetch fallback (works when background worker is unavailable)
  async function directFetch(url, options) {
    try {
      const resp = await fetch(url, { ...options, mode: "cors" });
      if (!resp.ok) return null;
      return await resp.json();
    } catch (e) {
      console.log("[MFI] Direct fetch failed:", e.message);
      return null;
    }
  }

  async function fetchSuburbData(suburbName, postcode) {
    const cacheKey = suburbName.toLowerCase();
    if (suburbCache[cacheKey] && (Date.now() - suburbCache[cacheKey]._fetchedAt < 3600000)) {
      return suburbCache[cacheKey];
    }

    // Try background worker first
    let data = await sendMsg({ action: "getSuburb", name: suburbName, postcode: postcode || "" });

    // Fallback: direct fetch
    if (!data) {
      const slug = suburbName.replace(/\s+/g, "-");
      data = await directFetch(`${API_BASE}/api/suburb/${slug}?postcode=${postcode || ""}`);
    }

    if (data) {
      data._fetchedAt = Date.now();
      suburbCache[cacheKey] = data;
    } else {
      console.log(`[MFI] No data for ${suburbName} from any source`);
    }
    return data;
  }

  async function fetchAnalysis(suburb, postcode, price, beds, baths, landSize, propertyType) {
    const payload = { suburb, postcode, price, beds, baths, landSize, propertyType };

    // Try background worker first
    let data = await sendMsg({ action: "analyse", payload });

    // Fallback: direct fetch
    if (!data) {
      data = await directFetch(`${API_BASE}/api/analyse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    }

    return data;
  }

  // ─── HELPERS ────────────────────────────────────────────────────────────────

  function parsePrice(s) {
    if (!s) return null;
    const matches = s.match(/\$\s*[\d]{1,3}(?:,\d{3})*(?:\.\d+)?/g);
    if (!matches) return null;
    const vals = matches.map(m => parseInt(m.replace(/[$\s,]/g, ""))).filter(n => n >= 100000 && n <= 5000000);
    if (!vals.length) return null;
    return vals.length >= 2 ? Math.round((vals[0] + vals[1]) / 2) : vals[0];
  }

  function fmt(n) {
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return "$" + (n / 1e3).toFixed(0) + "k";
    return "$" + n;
  }

  function extractFeatures(t) {
    let beds = 0, baths = 0, cars = 0, land = 0, type = "House";
    const b1 = t.match(/(\d+)\s*(?:Bed|bed)/i); if (b1) beds = Math.min(+b1[1], 12);
    const b2 = t.match(/(\d+)\s*(?:Bath|bath)/i); if (b2) baths = Math.min(+b2[1], 8);
    const b3 = t.match(/(\d+)\s*(?:Car|car|Park|park|Garag)/i); if (b3) cars = Math.min(+b3[1], 8);
    const landMatches = t.match(/(\d{2,4})\s*m²/g);
    if (landMatches) {
      for (const lm of landMatches) {
        const val = parseInt(lm.replace(/[^\d]/g, ""));
        if (val >= 50 && val <= 5000) { land = val; break; }
      }
    }
    for (const k of ["Duplex/semi-detached", "Duplex", "Apartment", "Unit", "Townhouse", "Villa", "Semi-detached", "Semi", "Terrace", "Studio", "House"]) {
      const kLower = k.toLowerCase();
      if (t.toLowerCase().includes(kLower)) { type = k.includes("Duplex") ? "Duplex" : k.includes("Semi") ? "Semi" : k; break; }
    }
    return { beds, baths, cars, land, type };
  }

  function removeAll() { document.querySelectorAll(".mfi-bar,.mfi-detail-panel").forEach(el => el.remove()); }

  function row3(label, siteVal, seekrVal, oursVal, oursClass) {
    return `<tr>
      <td class="mfi-t-label">${label}</td>
      <td class="mfi-t-site">${siteVal}</td>
      <td class="mfi-t-seekr">${seekrVal}</td>
      <td class="mfi-t-ours ${oursClass || ''}">${oursVal}</td>
    </tr>`;
  }

  // ─── BUILD ANALYSIS BAR (used for both search & listing) ──────────────────

  function buildBarHtml(a, listedPrice, isEstimated, subName) {
    const vsClass = +a.vsMedian <= 0 ? "mfi-green" : +a.vsMedian <= 20 ? "mfi-amber" : "mfi-red";
    const cfClass = a.weekCashflow >= 0 ? "mfi-green" : "mfi-red";
    const estTag = isEstimated ? '<span class="mfi-tag mfi-tag-est">⚡ Est. Price</span>' : '';

    return `
      <div class="mfi-bar-top">
        <div class="mfi-bar-score-area" style="background:${a.color}">
          <span class="mfi-bar-score-num">${a.score}</span>
          <span class="mfi-bar-score-verdict">${a.verdict}</span>
        </div>
        <div class="mfi-bar-headline">
          <span>${subName || 'Investment'} Analysis</span>
          <span class="mfi-bar-subhead">Rent $${a.rent}/wk · Yield ${a.grossYield}% · ${+a.vsMedian > 0 ? '+' : ''}${a.vsMedian}% vs median</span>
        </div>
        <div class="mfi-bar-tags">
          ${a.reasons.slice(0, 3).map(r => `<span class="mfi-tag">${r}</span>`).join("")}
          ${estTag}
        </div>
      </div>
      <table class="mfi-compare-table mfi-compact-table">
        <thead><tr>
          <th class="mfi-t-label"></th>
          <th class="mfi-t-site"><span class="mfi-th-dot mfi-dot-grey"></span>${siteName}</th>
          <th class="mfi-t-seekr"><span class="mfi-th-dot mfi-dot-orange"></span>Property Seekr</th>
          <th class="mfi-t-ours"><span class="mfi-th-dot mfi-dot-green"></span>MF Investor</th>
        </tr></thead>
        <tbody>
          ${row3("Price", listedPrice, listedPrice, isEstimated ? `<b>~${fmt(a.price || 0)}</b> (est.)` : listedPrice)}
          ${row3("Rental Est.", "❌", "❌", `<b>$${a.rent}/wk</b>`, "mfi-green")}
          ${row3("Gross Yield", "❌", "❌", `<b>${a.grossYield}%</b>`, "mfi-green")}
          ${row3("vs Median", "❌", "❌", `<b>${+a.vsMedian > 0 ? '+' : ''}${a.vsMedian}%</b>`, vsClass)}
          ${row3("5yr Projection", "❌", "❌", `<b>${fmt(a.proj5)}</b>`, "mfi-green")}
          ${row3("Cashflow", "❌", "❌", `<b>${a.weekCashflow >= 0 ? '+' : ''}$${a.weekCashflow}/wk</b>`, cfClass)}
          ${row3("Score Basis", "❌ None", "Lifestyle fit", "<b>Financial ROI</b>", "mfi-green")}
        </tbody>
      </table>
      <div class="mfi-bar-source">Data: ${subName ? subName + ' via' : ''} CoreLogic · Live from backend API · Not financial advice</div>
    `;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SEARCH RESULTS
  // ═══════════════════════════════════════════════════════════════════════════

  async function handleSearch() {
    const urlSuburb = detectSuburbFromUrl();
    if (!urlSuburb) return;

    // Pre-fetch data for the URL suburb (primary)
    const subData = await fetchSuburbData(urlSuburb.name, urlSuburb.postcode);

    let cards = [];
    if (site === "domain") {
      document.querySelectorAll('[data-testid^="listing-card-wrapper"]').forEach(c => cards.push(c));
      if (!cards.length) document.querySelectorAll('li[class*="listing"], div[class*="listing-result"]').forEach(c => { if (!cards.includes(c)) cards.push(c); });
    }
    if (site === "rea") {
      // REA cards: articles, card divs, or anything wrapping a property link
      document.querySelectorAll("article").forEach(el => {
        if (el.querySelector('a[href*="/property-"]')) cards.push(el);
      });
      // Broader: any element wrapping a /property- link
      if (!cards.length) {
        document.querySelectorAll('a[href*="/property-"]').forEach(l => {
          let p = l.parentElement;
          for (let i = 0; i < 6 && p; i++) {
            const cn = (p.className || "").toLowerCase();
            const tn = p.tagName;
            if (tn === "ARTICLE" || tn === "SECTION" ||
                cn.includes("card") || cn.includes("listing") ||
                cn.includes("result") || cn.includes("property")) {
              if (!cards.includes(p)) cards.push(p);
              break;
            }
            p = p.parentElement;
          }
        });
      }
      // Last resort: direct parent divs of property links
      if (!cards.length) {
        document.querySelectorAll('a[href*="/property-"]').forEach(l => {
          const p = l.closest("div");
          if (p && !cards.includes(p) && p.textContent.length > 30 && p.textContent.length < 3000) cards.push(p);
        });
      }
    }

    console.log(`[MFI] Search: found ${cards.length} cards on ${site}`);

    const cardQueue = [];
    for (const card of cards) {
      if (card.dataset.mfiDone) continue;
      card.dataset.mfiDone = "1";

      const text = card.textContent || "";

      // Detect which suburb THIS card belongs to (for multi-suburb searches)
      let cardSuburb = null;
      for (const p of SUBURB_PATTERNS) {
        if (p.regex.test(text)) { cardSuburb = { name: p.name, postcode: p.postcode }; break; }
      }
      if (!cardSuburb) cardSuburb = urlSuburb;

      // Get suburb data (use cached if already fetched)
      let cardSubData = subData;
      if (cardSuburb.name !== urlSuburb.name) {
        cardSubData = await fetchSuburbData(cardSuburb.name, cardSuburb.postcode);
      }
      const subName = cardSubData?.name || cardSuburb.name.split(" ").map(w => w[0].toUpperCase() + w.slice(1)).join(" ");

      let price = parsePrice(text);
      let isEstimated = false;
      const f = extractFeatures(text);

      // If no price found, ALWAYS estimate for listing cards
      // (REA often shows no price text at all, not just "Contact Agent")
      if (!price) {
        const estByBed = cardSubData?.estByBed || {};
        const bedKey = Math.min(Math.max(f.beds || 3, 1), 6);
        price = estByBed[bedKey] || cardSubData?.house?.medianPrice || 900000;
        const isUnit = /unit|apartment|studio|townhouse|villa/i.test(f.type);
        if (isUnit) price = Math.round(price * 0.75);
        isEstimated = true;
      }

      if (!price) continue;

      // Queue the analysis (don't await here — batch later)
      cardQueue.push({ card, cardSuburb, price, f, isEstimated, subName });
    }

    // Process all cards in parallel (batch API calls)
    console.log(`[MFI] Processing ${cardQueue.length} cards in parallel`);
    const results = await Promise.allSettled(
      cardQueue.map(async ({ card, cardSuburb, price, f, isEstimated, subName }) => {
        const apiResult = await fetchAnalysis(cardSuburb.name, cardSuburb.postcode, price, f.beds, f.baths, f.land, f.type);
        if (!apiResult?.analysis) return;

        const a = apiResult.analysis;
        a.price = price;

        let listedPrice = "—";
        const text = card.textContent || "";
        const pm = text.match(/\$\d{1,3}(?:,\d{3}){1,2}\s*[-–]\s*\$\d{1,3}(?:,\d{3}){1,2}|\$\d{1,3}(?:,\d{3}){1,2}/);
        if (pm) listedPrice = pm[0].trim();
        if (isEstimated) listedPrice = "Contact Agent";

        const bar = document.createElement("div");
        bar.className = "mfi-bar";
        bar.innerHTML = buildBarHtml(a, listedPrice, isEstimated, subName);
        card.after(bar);
      })
    );
    console.log(`[MFI] Done: ${results.filter(r => r.status === 'fulfilled').length} succeeded, ${results.filter(r => r.status === 'rejected').length} failed`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SINGLE LISTING
  // ═══════════════════════════════════════════════════════════════════════════

  async function handleListing() {
    if (document.querySelector(".mfi-detail-panel")) return true;

    const suburbInfo = detectSuburbFromUrl();
    if (!suburbInfo) return false;

    const subData = await fetchSuburbData(suburbInfo.name, suburbInfo.postcode);
    const subName = subData?.name || suburbInfo.name.split(" ").map(w => w[0].toUpperCase() + w.slice(1)).join(" ");

    const pageText = document.body.textContent || "";

    // --- PRICE ---
    let price = null, listedPriceStr = "—";
    document.querySelectorAll('[class*="rice"], [class*="Price"], [data-testid*="price"]').forEach(el => {
      if (price) return;
      const t = el.textContent.trim();
      if (t.includes("$") && t.length < 60) { price = parsePrice(t); if (price) listedPriceStr = t; }
    });
    if (!price) {
      document.querySelectorAll("h1, h2, h3, p, span").forEach(el => {
        if (price) return;
        const t = el.textContent.trim();
        if (t.includes("$") && t.length < 60 && t.match(/\$\s*[\d]{1,3}(?:,\d{3}){1,2}/) && el.children.length <= 2) {
          price = parsePrice(t); if (price) listedPriceStr = t;
        }
      });
    }
    if (!price) {
      const m = pageText.match(/\$\d{1,3}(?:,\d{3}){1,2}\s*[-–]\s*\$\d{1,3}(?:,\d{3}){1,2}/);
      if (m) { price = parsePrice(m[0]); listedPriceStr = m[0]; }
    }
    if (price && (price < 100000 || price > 5000000)) { price = null; }

    let address = ""; const h1 = document.querySelector("h1"); if (h1) address = h1.textContent.trim();
    const f = extractFeatures(pageText);

    let isEstimated = false;
    if (!price) {
      const estByBed = subData?.estByBed || {};
      price = estByBed[Math.min(Math.max(f.beds || 3, 1), 6)] || subData?.house?.medianPrice || 900000;
      const isUnit = /unit|apartment|studio|townhouse|villa/i.test(f.type);
      if (isUnit) price = Math.round(price * 0.75);
      isEstimated = true;
      listedPriceStr = "Contact Agent";
    }

    if (!price) return false;

    // Call backend for analysis
    const apiResult = await fetchAnalysis(suburbInfo.name, suburbInfo.postcode, price, f.beds, f.baths, f.land, f.type);
    const a = apiResult?.analysis;
    if (!a) return false;

    const sd = apiResult.suburbData || {};
    const vsClass = +a.vsMedian <= 0 ? "mfi-green" : "mfi-red";
    const cfClass = a.weekCashflow >= 0 ? "mfi-green" : "mfi-red";

    const panel = document.createElement("div");
    panel.className = "mfi-detail-panel";
    panel.innerHTML = `
      <div class="mfi-panel-header">
        <span>🏠 ${subName} Investor</span>
        <button class="mfi-panel-close">✕</button>
      </div>
      ${address ? `<div class="mfi-panel-addr-bar">${address}</div>` : ""}
      <div class="mfi-panel-score-box" style="background:${a.color}12;border:2px solid ${a.color}">
        <div class="mfi-score-big" style="color:${a.color}">${a.score}/100</div>
        <div class="mfi-verdict-big" style="color:${a.color}">${a.verdict}</div>
      </div>
      <div class="mfi-panel-compare-wrap">
        <table class="mfi-compare-table">
          <thead><tr>
            <th class="mfi-t-label">Basic Info</th>
            <th class="mfi-t-site"><span class="mfi-th-dot mfi-dot-grey"></span>${siteName}</th>
            <th class="mfi-t-seekr"><span class="mfi-th-dot mfi-dot-orange"></span>PropertySeekr</th>
            <th class="mfi-t-ours"><span class="mfi-th-dot mfi-dot-green"></span>MF Investor</th>
          </tr></thead>
          <tbody>
            ${row3("Price", listedPriceStr, listedPriceStr, isEstimated ? `~${fmt(price)} (est.)` : listedPriceStr)}
            ${row3("Beds / Bath / Car", `${f.beds}/${f.baths}/${f.cars}`, `${f.beds}/${f.baths}/${f.cars}`, `${f.beds}/${f.baths}/${f.cars}`)}
            ${row3("Land Size", f.land ? f.land.toLocaleString() + "m²" : "—", f.land ? f.land.toLocaleString() + "m²" : "—", f.land ? f.land.toLocaleString() + "m²" : "—")}
            ${row3("Type", f.type, f.type, f.type)}
          </tbody>
        </table>
        <div class="mfi-compare-divider"></div>
        <table class="mfi-compare-table">
          <thead><tr>
            <th class="mfi-t-label">Investment Intel</th><th class="mfi-t-site"></th><th class="mfi-t-seekr"></th><th class="mfi-t-ours"></th>
          </tr></thead>
          <tbody>
            ${row3("Est. Weekly Rent", '<span class="mfi-no">❌</span>', '<span class="mfi-no">❌</span>', `<b>$${a.rent}/wk</b>`, "mfi-green")}
            ${row3("Annual Income", '<span class="mfi-no">❌</span>', '<span class="mfi-no">❌</span>', `<b>$${a.annualRent?.toLocaleString()}/yr</b>`, "mfi-green")}
            ${row3("Gross Yield", '<span class="mfi-no">❌</span>', '<span class="mfi-no">❌</span>', `<b>${a.grossYield}%</b>`, "mfi-green")}
            ${row3("Net Yield (est.)", '<span class="mfi-no">❌</span>', '<span class="mfi-no">❌</span>', `<b>${a.netYield}%</b>`, "mfi-green")}
            ${row3("vs Suburb Median", '<span class="mfi-no">❌</span>', '<span class="mfi-no">❌</span>', `<b>${+a.vsMedian > 0 ? '+' : ''}${a.vsMedian}%</b>`, vsClass)}
            ${row3("Mortgage (80% LVR)", '<span class="mfi-no">❌</span>', '<span class="mfi-no">❌</span>', `<b>$${a.weeklyRepayment}/wk</b>`, "")}
            ${row3("Weekly Cashflow", '<span class="mfi-no">❌</span>', '<span class="mfi-no">❌</span>', `<b>${a.weekCashflow >= 0 ? '+' : ''}$${a.weekCashflow}/wk</b>`, cfClass)}
            ${row3("5yr Projection", '<span class="mfi-no">❌</span>', '<span class="mfi-no">❌</span>', `<b>${fmt(a.proj5)}</b>`, "mfi-green")}
            ${row3("Capital Gain (5yr)", '<span class="mfi-no">❌</span>', '<span class="mfi-no">❌</span>', `<b>+${fmt(a.equity5)}</b>`, "mfi-green")}
            ${row3("10yr Projection", '<span class="mfi-no">❌</span>', '<span class="mfi-no">❌</span>', `<b>${fmt(a.proj10)}</b>`, "mfi-green")}
            ${row3("Growth Rate", '<span class="mfi-no">❌</span>', '<span class="mfi-no">❌</span>', `<b>+${a.growth}% p.a.</b>`, "mfi-green")}
            ${row3("Days on Market", '<span class="mfi-no">❌</span>', '<span class="mfi-no">❌</span>', `<b>${a.dom} days</b>`, "mfi-green")}
            ${a.isDuplex ? row3("Dual Income", '<span class="mfi-no">❌</span>', '<span class="mfi-no">❌</span>', '<b>🏠🏠 Yes</b>', "mfi-green") : ""}
          </tbody>
        </table>
        <div class="mfi-compare-divider"></div>
        <table class="mfi-compare-table">
          <thead><tr><th class="mfi-t-label">Approach</th><th class="mfi-t-site"></th><th class="mfi-t-seekr"></th><th class="mfi-t-ours"></th></tr></thead>
          <tbody>
            ${row3("Scoring", '<span class="mfi-no">❌ None</span>', "AI Match Score", `<b>${a.score}/100</b>`, "mfi-green")}
            ${row3("Score Basis", '<span class="mfi-no">❌ None</span>', "Lifestyle preferences", "<b>Financial ROI</b>", "mfi-green")}
            ${row3("Target User", "Browsers", "Home buyers", "<b>Investors</b>", "mfi-green")}
            ${row3("AI Analysis", '<span class="mfi-no">❌</span>', "✅ Dream home match", "✅ Investment analysis", "mfi-green")}
            ${row3("Suburb Insights", "Basic median", '<span class="mfi-no">❌</span>', "✅ Full market data", "mfi-green")}
          </tbody>
        </table>
      </div>
      <div class="mfi-panel-reasons">
        ${a.reasons.map(r => `<span class="mfi-reason-tag">${r}</span>`).join("")}
      </div>
      <div class="mfi-panel-footer">
        <b>Data:</b> Live from backend API · ${subName} ${suburbInfo.postcode} · Source: CoreLogic via YIP<br>
        <b>Suburb:</b> Median ${fmt(sd.medianHouse || 0)} · Rent $${sd.rentHouse || '?'}/wk · Growth ${sd.growthHouse || '?'}% · ${sd.dom || '?'} days<br>
        ${isEstimated ? '<b>⚡ Price estimated</b> from suburb median<br>' : ''}
        <b>⚠️ Not financial advice.</b> Verify independently.
      </div>
    `;

    document.body.appendChild(panel);
    panel.querySelector(".mfi-panel-close").addEventListener("click", () => panel.remove());

    // Draggable
    let dragging = false, ox, oy;
    const hdr = panel.querySelector(".mfi-panel-header");
    hdr.style.cursor = "grab";
    hdr.addEventListener("mousedown", e => { dragging = true; hdr.style.cursor = "grabbing"; const r = panel.getBoundingClientRect(); ox = e.clientX - r.left; oy = e.clientY - r.top; e.preventDefault(); });
    document.addEventListener("mousemove", e => { if (!dragging) return; panel.style.left = (e.clientX - ox) + "px"; panel.style.top = (e.clientY - oy) + "px"; panel.style.right = "auto"; panel.style.bottom = "auto"; });
    document.addEventListener("mouseup", () => { dragging = false; hdr.style.cursor = "grab"; });

    return true;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ROUTER + SPA HOOKS
  // ═══════════════════════════════════════════════════════════════════════════

  function route() {
    const url = location.href;
    if (url === lastUrl) return;
    lastUrl = url;
    removeAll();
    document.querySelectorAll("[data-mfi-done]").forEach(el => delete el.dataset.mfiDone);

    if (isSearchPage(url)) {
      setTimeout(() => handleSearch(), 2500);
      setTimeout(() => handleSearch(), 5000);
      setTimeout(() => handleSearch(), 8000);
    } else if (isListingPage(url)) {
      let att = 0;
      const go = () => {
        if (document.querySelector(".mfi-detail-panel")) return;
        att++;
        handleListing().then(ok => { if (!ok && att < 8) setTimeout(go, 1500); });
      };
      setTimeout(go, 2500);
    }
  }

  const _p = history.pushState, _r = history.replaceState;
  history.pushState = function () { _p.apply(this, arguments); setTimeout(route, 500); };
  history.replaceState = function () { _r.apply(this, arguments); setTimeout(route, 500); };
  window.addEventListener("popstate", () => setTimeout(route, 500));
  setInterval(() => { if (location.href !== lastUrl) route(); }, 2000);

  let sd = null;
  new MutationObserver(() => {
    if (isSearchPage()) { clearTimeout(sd); sd = setTimeout(() => handleSearch(), 2000); }
  }).observe(document.body, { childList: true, subtree: true });

  route();

  if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((m, s, r) => {
      if (m.action === "scrape") r({ site, bars: document.querySelectorAll(".mfi-bar").length });
      if (m.action === "setApiBase") { API_BASE = m.url; r({ status: "ok" }); }
      return true;
    });
  }
})();
