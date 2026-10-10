// SW Sydney Property Investor — Content Script v13
// Fixes: consistent values between search/listing, proper price range handling
(function() {
  "use strict";

  var API_BASE = "https://sw-sydney-property-investor-api-production.up.railway.app";
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get("apiBase", function(d) { if (d.apiBase) API_BASE = d.apiBase; });
  }

  var site = location.hostname.includes("domain") ? "domain" : location.hostname.includes("realestate") ? "rea" : "other";
  var lastUrl = "";
  var suburbCache = {};

  var SUBURB_PATTERNS = [
    { regex: /macquarie[\-\+%20\s]*fields/i, name: "macquarie fields", postcode: "2564" },
    { regex: /minto(?![\-\s]heights)/i, name: "minto", postcode: "2566" },
    { regex: /leumeah/i, name: "leumeah", postcode: "2560" },
    { regex: /glenfield/i, name: "glenfield", postcode: "2167" },
    { regex: /holsworthy/i, name: "holsworthy", postcode: "2173" },
    { regex: /east[\-\+%20\s]*hills/i, name: "east hills", postcode: "2213" }
  ];

  var POSTCODE_MAP = {
    "2564": "macquarie fields", "2566": "minto", "2560": "leumeah",
    "2167": "glenfield", "2173": "holsworthy", "2213": "east hills"
  };

  function detectSuburbFromUrl(url) {
    var u = (url || location.href).toLowerCase();
    for (var i = 0; i < SUBURB_PATTERNS.length; i++) {
      if (SUBURB_PATTERNS[i].regex.test(u)) return { name: SUBURB_PATTERNS[i].name, postcode: SUBURB_PATTERNS[i].postcode };
    }
    var keys = Object.keys(POSTCODE_MAP);
    for (var j = 0; j < keys.length; j++) {
      if (u.includes(keys[j])) return { name: POSTCODE_MAP[keys[j]], postcode: keys[j] };
    }
    return null;
  }

  function isSearchPage(url) {
    var u = (url || location.href).toLowerCase();
    if (!detectSuburbFromUrl(u)) return false;
    if (site === "domain") return u.includes("/sale/") && !u.match(/\d{9,}/);
    if (site === "rea") return (u.includes("/buy/") || u.includes("/rent/")) && (u.includes("list") || u.includes("/in-"));
    return false;
  }

  function isListingPage(url) {
    var u = (url || location.href).toLowerCase();
    if (!detectSuburbFromUrl(u)) return false;
    if (site === "domain") return !!u.match(/\d{9,}/);
    if (site === "rea") return u.includes("/property-");
    return false;
  }

  // --- API calls ---

  function sendMsg(msg) {
    return new Promise(function(resolve) {
      var timeout = setTimeout(function() { resolve(null); }, 5000);
      try {
        chrome.runtime.sendMessage(msg, function(resp) {
          clearTimeout(timeout);
          if (chrome.runtime.lastError) { resolve(null); return; }
          resolve(resp && resp.data ? resp.data : null);
        });
      } catch (e) { clearTimeout(timeout); resolve(null); }
    });
  }

  function directFetch(url, options) {
    return fetch(url, Object.assign({}, options, { mode: "cors" }))
      .then(function(resp) { return resp.ok ? resp.json() : null; })
      .catch(function() { return null; });
  }

  function fetchSuburbData(name, postcode) {
    var key = name.toLowerCase();
    if (suburbCache[key] && (Date.now() - suburbCache[key]._t < 3600000)) return Promise.resolve(suburbCache[key]);
    return sendMsg({ action: "getSuburb", name: name, postcode: postcode || "" }).then(function(data) {
      if (!data) return directFetch(API_BASE + "/api/suburb/" + name.replace(/\s+/g, "-") + "?postcode=" + (postcode || ""));
      return data;
    }).then(function(data) {
      if (data) { data._t = Date.now(); suburbCache[key] = data; }
      return data;
    });
  }

  function fetchAnalysis(suburb, postcode, price, beds, baths, landSize, propertyType, priceLow, priceHigh) {
    var payload = { suburb: suburb, postcode: postcode, price: price, beds: beds, baths: baths, landSize: landSize, propertyType: propertyType, priceLow: priceLow || null, priceHigh: priceHigh || null };
    return sendMsg({ action: "analyse", payload: payload }).then(function(data) {
      if (!data) return directFetch(API_BASE + "/api/analyse", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
      });
      return data;
    });
  }

  // --- PRICE PARSING — extracts both low and high from ranges ---

  function parsePriceRange(s) {
    if (!s) return { price: null, low: null, high: null };
    // Look for range like "$700,000 - $750,000" or "$700k - $750k"
    var rangeMatch = s.match(/\$\s*([\d]{1,3}(?:,\d{3})*)\s*[-–]\s*\$\s*([\d]{1,3}(?:,\d{3})*)/);
    if (rangeMatch) {
      var low = parseInt(rangeMatch[1].replace(/,/g, ""));
      var high = parseInt(rangeMatch[2].replace(/,/g, ""));
      if (low >= 100000 && low <= 5000000 && high >= 100000 && high <= 5000000) {
        return { price: Math.round((low + high) / 2), low: low, high: high };
      }
    }
    // Single price
    var singles = s.match(/\$\s*[\d]{1,3}(?:,\d{3})*(?:\.\d+)?/g);
    if (singles) {
      var vals = singles.map(function(x) { return parseInt(x.replace(/[$\s,]/g, "")); }).filter(function(n) { return n >= 100000 && n <= 5000000; });
      if (vals.length >= 2) {
        return { price: Math.round((vals[0] + vals[1]) / 2), low: vals[0], high: vals[1] };
      }
      if (vals.length === 1) {
        return { price: vals[0], low: vals[0], high: null };
      }
    }
    return { price: null, low: null, high: null };
  }

  function fmt(n) { return n >= 1e6 ? "$" + (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? "$" + (n / 1e3).toFixed(0) + "k" : "$" + n; }

  // --- FEATURE EXTRACTION (shared between search + listing) ---

  function extractFeatures(t) {
    var beds = 0, baths = 0, cars = 0, land = 0, type = "House";
    var b1 = t.match(/(\d+)\s*(?:Bed|bed|Beds|beds)/i); if (b1) beds = Math.min(parseInt(b1[1]), 12);
    var b2 = t.match(/(\d+)\s*(?:Bath|bath|Baths|baths)/i); if (b2) baths = Math.min(parseInt(b2[1]), 8);
    var b3 = t.match(/(\d+)\s*(?:Car|car|Cars|cars|Park|park|Garag)/i); if (b3) cars = Math.min(parseInt(b3[1]), 8);
    // Icon-based: look for sequence of numbers
    if (beds === 0) {
      var seqMatch = t.match(/(?:^|[\s])(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s/);
      if (seqMatch) { beds = Math.min(parseInt(seqMatch[1]), 12); baths = Math.min(parseInt(seqMatch[2]), 8); cars = Math.min(parseInt(seqMatch[3]), 8); }
    }
    if (beds === 0) {
      var nums = [];
      var parts = t.split(/[\s·•,|]+/);
      for (var i = 0; i < parts.length; i++) {
        var trimmed = parts[i].trim();
        if (/^\d{1,2}$/.test(trimmed) && parseInt(trimmed) > 0 && parseInt(trimmed) <= 12) nums.push(parseInt(trimmed));
        if (/m²|House|Unit|Duplex|Townhouse|Apartment|Villa|Semi/i.test(trimmed)) break;
      }
      if (nums.length >= 3) { beds = nums[0]; baths = nums[1]; cars = nums[2]; }
      else if (nums.length === 2) { beds = nums[0]; baths = nums[1]; }
      else if (nums.length === 1) { beds = nums[0]; }
    }
    var lm = t.match(/(\d{2,4})(?:\.\d+)?\s*m/g);
    if (lm) {
      for (var li = 0; li < lm.length; li++) {
        var fval = parseFloat(lm[li].match(/[\d.]+/)[0]);
        var landVal = Math.round(fval);
        if (landVal >= 50 && landVal <= 5000) { land = landVal; break; }
      }
    }
    var types = ["Apartment", "Unit", "Townhouse", "Villa", "Terrace", "Studio", "House"];
    for (var ti = 0; ti < types.length; ti++) {
      if (t.toLowerCase().indexOf(types[ti].toLowerCase()) !== -1) { type = types[ti]; break; }
    }
    return { beds: beds, baths: baths, cars: cars, land: land, type: type };
  }

  function removeAll() {
    var els = document.querySelectorAll(".mfi-bar,.mfi-detail-panel");
    for (var i = 0; i < els.length; i++) els[i].remove();
  }

  function scoreColor(score) {
    if (score >= 80) return { bg: "#059669", text: "#ecfdf5" };
    if (score >= 65) return { bg: "#10b981", text: "#ecfdf5" };
    if (score >= 50) return { bg: "#f59e0b", text: "#451a03" };
    return { bg: "#ef4444", text: "#fef2f2" };
  }

  // === SEARCH RESULTS ===

  function handleSearch() {
    var urlSuburb = detectSuburbFromUrl();
    if (!urlSuburb) return Promise.resolve();

    return fetchSuburbData(urlSuburb.name, urlSuburb.postcode).then(function(subData) {
      var cards = [];
      if (site === "domain") {
        document.querySelectorAll('[data-testid^="listing-card-wrapper"]').forEach(function(c) { cards.push(c); });
        if (!cards.length) document.querySelectorAll('li[class*="listing"]').forEach(function(c) { if (cards.indexOf(c) === -1) cards.push(c); });
      }
      if (site === "rea") {
        document.querySelectorAll("article").forEach(function(el) {
          if (el.querySelector('a[href*="/property-"]')) cards.push(el);
        });
        if (!cards.length) {
          document.querySelectorAll('a[href*="/property-"]').forEach(function(l) {
            var p = l.parentElement;
            for (var i = 0; i < 6 && p; i++) {
              var cn = (p.className || "").toLowerCase();
              if (p.tagName === "ARTICLE" || cn.indexOf("card") !== -1 || cn.indexOf("listing") !== -1 || cn.indexOf("result") !== -1) {
                if (cards.indexOf(p) === -1) cards.push(p); break;
              }
              p = p.parentElement;
            }
          });
        }
      }

      console.log("[MFI] Search: " + cards.length + " cards");
      var cardQueue = [];

      for (var ci = 0; ci < cards.length; ci++) {
        var card = cards[ci];
        if (card.dataset.mfiDone) continue;
        card.dataset.mfiDone = "1";
        var text = card.textContent || "";
        var cardSuburb = null;
        for (var si = 0; si < SUBURB_PATTERNS.length; si++) {
          if (SUBURB_PATTERNS[si].regex.test(text)) { cardSuburb = { name: SUBURB_PATTERNS[si].name, postcode: SUBURB_PATTERNS[si].postcode }; break; }
        }
        if (!cardSuburb) cardSuburb = urlSuburb;
        var priceData = parsePriceRange(text);
        var price = priceData.price;
        var isEstimated = false;
        var f = extractFeatures(text);
        if (!price) {
          var estByBed = (subData && subData.estByBed) ? subData.estByBed : {};
          var bedKey = Math.min(Math.max(f.beds || 3, 1), 6);
          price = estByBed[bedKey] || (subData && subData.house ? subData.house.medianPrice : 900000);
          if (/unit|apartment|studio|townhouse|villa/i.test(f.type)) price = Math.round(price * 0.75);
          isEstimated = true;
        }
        if (!price) continue;
        cardQueue.push({ card: card, cardSuburb: cardSuburb, price: price, priceLow: priceData.low, priceHigh: priceData.high, f: f, isEstimated: isEstimated, subData: subData });
      }

      console.log("[MFI] Processing " + cardQueue.length + " cards");

      return Promise.all(cardQueue.map(function(item) {
        return fetchAnalysis(item.cardSuburb.name, item.cardSuburb.postcode, item.price, item.f.beds, item.f.baths, item.f.land, item.f.type, item.priceLow, item.priceLow && item.priceHigh ? item.priceHigh : null).then(function(apiResult) {
          if (!apiResult || !apiResult.analysis) return;
          var a = apiResult.analysis;
          var sc = scoreColor(a.score);
          var subName = (item.subData && item.subData.name) ? item.subData.name : item.cardSuburb.name.split(" ").map(function(w) { return w[0].toUpperCase() + w.slice(1); }).join(" ");
          // Use modelPrice for display, fall back to extracted price
          var displayPrice = a.modelPrice ? fmt(a.modelPrice) : fmt(item.price);

          var bar = document.createElement("div");
          bar.className = "mfi-bar";
          bar.innerHTML = '<div class="mfi-bar-score" style="background:' + sc.bg + ';color:' + sc.text + '"><div class="mfi-bar-score-num">' + a.score + '</div><div class="mfi-bar-score-label">' + a.verdict + '</div></div><div class="mfi-bar-metrics"><div class="mfi-bar-metric"><div class="mfi-bar-metric-val">' + displayPrice + '</div><div class="mfi-bar-metric-label">Est. Price</div></div><div class="mfi-bar-metric"><div class="mfi-bar-metric-val">$' + a.rent + '/wk</div><div class="mfi-bar-metric-label">Est. Rent</div></div><div class="mfi-bar-metric"><div class="mfi-bar-metric-val">' + a.grossYield + '%</div><div class="mfi-bar-metric-label">Gross Yield</div></div><div class="mfi-bar-metric"><div class="mfi-bar-metric-val">' + fmt(a.proj5) + '</div><div class="mfi-bar-metric-label">5yr Projection</div></div><div class="mfi-bar-metric"><div class="mfi-bar-metric-val">' + a.dom + ' days</div><div class="mfi-bar-metric-label">Days on Market</div></div></div>' + (item.isEstimated ? '<div class="mfi-bar-est">Price estimated from suburb median</div>' : '') + '<div class="mfi-bar-brand">' + subName + ' - SW Sydney Property Investor</div>';
          item.card.after(bar);
        }).catch(function() {});
      }));
    });
  }

  // === SINGLE LISTING ===

  function handleListing() {
    if (document.querySelector(".mfi-detail-panel")) return Promise.resolve(true);
    var suburbInfo = detectSuburbFromUrl();
    if (!suburbInfo) return Promise.resolve(false);

    return fetchSuburbData(suburbInfo.name, suburbInfo.postcode).then(function(subData) {
      var subName = (subData && subData.name) ? subData.name : suburbInfo.name.split(" ").map(function(w) { return w[0].toUpperCase() + w.slice(1); }).join(" ");

      // Price extraction — scan page for price, SAME parser as search
      var allText = document.body.textContent || "";
      var priceData = { price: null, low: null, high: null };
      // First try specific price elements
      var priceEls = document.querySelectorAll('[class*="rice"], [class*="Price"], [data-testid*="price"]');
      for (var pi = 0; pi < priceEls.length; pi++) {
        if (priceData.price) break;
        var t = priceEls[pi].textContent.trim();
        if (t.indexOf("$") !== -1 && t.length < 60) priceData = parsePriceRange(t);
      }
      // Then try headings
      if (!priceData.price) {
        var headings = document.querySelectorAll("h1, h2, h3, p, span");
        for (var hi = 0; hi < headings.length; hi++) {
          if (priceData.price) break;
          var ht = headings[hi].textContent.trim();
          if (ht.indexOf("$") !== -1 && ht.length < 60 && ht.match(/\$\s*[\d]{1,3}(?:,\d{3}){1,2}/)) {
            priceData = parsePriceRange(ht);
          }
        }
      }
      if (priceData.price && (priceData.price < 100000 || priceData.price > 5000000)) priceData.price = null;

      var address = "";
      var h1 = document.querySelector("h1");
      if (h1) address = h1.textContent.trim();

      // Feature extraction — use SAME extractFeatures as search cards
      // Extract from the first 1000 chars near the property header
      var nearHeader = "";
      var h1El = document.querySelector("h1");
      if (h1El) {
        // Get text from h1 and the next several siblings
        nearHeader = h1El.textContent + " ";
        var el = h1El;
        for (var ni = 0; ni < 8 && el; ni++) {
          el = el.nextElementSibling;
          if (el) nearHeader += " " + el.textContent;
        }
      }
      // Also check the URL for property type
      var urlText = location.href.toLowerCase();
      if (urlText.indexOf("/property-unit") !== -1) nearHeader += " Unit";
      else if (urlText.indexOf("/property-apartment") !== -1) nearHeader += " Apartment";
      else if (urlText.indexOf("/property-townhouse") !== -1) nearHeader += " Townhouse";
      else if (urlText.indexOf("/property-villa") !== -1) nearHeader += " Villa";
      else if (urlText.indexOf("/property-house") !== -1) nearHeader += " House";

      // Use the EXACT same function as search cards
      var f = extractFeatures(nearHeader.substring(0, 1000));

      var price = priceData.price;
      var isEstimated = false;

      if (!price) {
        var estByBed = (subData && subData.estByBed) ? subData.estByBed : {};
        var bedKey = Math.min(Math.max(f.beds || 3, 1), 6);
        price = estByBed[bedKey] || (subData && subData.house ? subData.house.medianPrice : 900000);
        if (/unit|apartment|studio|townhouse|villa/i.test(f.type)) price = Math.round(price * 0.75);
        isEstimated = true;
      }

      if (!price) return false;

      console.log("[MFI] Listing: " + f.beds + "bed/" + f.baths + "bath/" + f.cars + "car, " + f.land + "m2, " + f.type + ", price=" + price + (priceData.low && priceData.high ? " (range: " + priceData.low + "-" + priceData.high + ")" : ""));

      return fetchAnalysis(suburbInfo.name, suburbInfo.postcode, price, f.beds, f.baths, f.land, f.type, priceData.low, priceData.low && priceData.high ? priceData.high : null).then(function(apiResult) {
        if (!apiResult || !apiResult.analysis) return false;
        var a = apiResult.analysis;
        var sc = scoreColor(a.score);
        var displayPrice = a.modelPrice ? fmt(a.modelPrice) : fmt(price);

        var panel = document.createElement("div");
        panel.className = "mfi-detail-panel";
        panel.innerHTML = '<div class="mfi-panel-header"><span>🏠 ' + subName + ' Investor</span><button class="mfi-panel-close">✕</button></div>' + (address ? '<div class="mfi-panel-addr">' + address + '</div>' : '') + '<div class="mfi-panel-score" style="background:' + sc.bg + ';color:' + sc.text + '"><div class="mfi-panel-score-num">' + a.score + '/100</div><div class="mfi-panel-score-label">' + a.verdict + '</div></div><div class="mfi-panel-metrics"><div class="mfi-panel-metric"><div class="mfi-panel-metric-val">' + displayPrice + '</div><div class="mfi-panel-metric-label">Est. Price</div></div><div class="mfi-panel-metric"><div class="mfi-panel-metric-val">$' + a.rent + '/wk</div><div class="mfi-panel-metric-label">Est. Rent</div></div><div class="mfi-panel-metric"><div class="mfi-panel-metric-val">' + a.grossYield + '%</div><div class="mfi-panel-metric-label">Gross Yield</div></div><div class="mfi-panel-metric"><div class="mfi-panel-metric-val">' + fmt(a.proj5) + '</div><div class="mfi-panel-metric-label">5yr Projection</div></div><div class="mfi-panel-metric"><div class="mfi-panel-metric-val">' + a.dom + ' days</div><div class="mfi-panel-metric-label">Days on Market</div></div></div>' + (isEstimated ? '<div class="mfi-panel-est">Price estimated from suburb median</div>' : '') + '<div class="mfi-panel-footer">' + subName + ' ' + suburbInfo.postcode + ' - Median ' + fmt((subData && subData.house ? subData.house.medianPrice : 0)) + ' - Growth ' + a.growth + '% p.a. (modelled)<br>Source: ML Model + CoreLogic - Not financial advice</div>';

        document.body.appendChild(panel);
        panel.querySelector(".mfi-panel-close").addEventListener("click", function() { panel.remove(); });

        var dragging = false, ox, oy;
        var hdr = panel.querySelector(".mfi-panel-header");
        hdr.style.cursor = "grab";
        hdr.addEventListener("mousedown", function(e) { dragging = true; hdr.style.cursor = "grabbing"; var r = panel.getBoundingClientRect(); ox = e.clientX - r.left; oy = e.clientY - r.top; e.preventDefault(); });
        document.addEventListener("mousemove", function(e) { if (!dragging) return; panel.style.left = (e.clientX - ox) + "px"; panel.style.top = (e.clientY - oy) + "px"; panel.style.right = "auto"; panel.style.bottom = "auto"; });
        document.addEventListener("mouseup", function() { dragging = false; hdr.style.cursor = "grab"; });
        return true;
      });
    });
  }

  // === ROUTER ===

  function route() {
    var url = location.href;
    if (url === lastUrl) return;
    lastUrl = url;
    removeAll();
    var done = document.querySelectorAll("[data-mfi-done]");
    for (var i = 0; i < done.length; i++) delete done[i].dataset.mfiDone;

    if (isSearchPage(url)) {
      setTimeout(function() { handleSearch(); }, 2500);
      setTimeout(function() { handleSearch(); }, 5000);
      setTimeout(function() { handleSearch(); }, 8000);
    } else if (isListingPage(url)) {
      var att = 0;
      var go = function() {
        if (document.querySelector(".mfi-detail-panel")) return;
        att++;
        handleListing().then(function(ok) { if (!ok && att < 8) setTimeout(go, 1500); });
      };
      setTimeout(go, 2500);
    }
  }

  var _p = history.pushState, _r = history.replaceState;
  history.pushState = function() { _p.apply(this, arguments); setTimeout(route, 500); };
  history.replaceState = function() { _r.apply(this, arguments); setTimeout(route, 500); };
  window.addEventListener("popstate", function() { setTimeout(route, 500); });
  setInterval(function() { if (location.href !== lastUrl) route(); }, 2000);

  var sd = null;
  new MutationObserver(function() {
    if (isSearchPage()) { clearTimeout(sd); sd = setTimeout(function() { handleSearch(); }, 2000); }
  }).observe(document.body, { childList: true, subtree: true });

  route();

  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function(m, s, r) {
      if (m.action === "scrape") r({ site: site, bars: document.querySelectorAll(".mfi-bar").length });
      return true;
    });
  }
})();
