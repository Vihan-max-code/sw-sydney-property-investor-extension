# Macquarie Fields Property Investor — Chrome Extension

AI-powered investment analysis for Macquarie Fields NSW 2564. Scrapes property data from major Australian real estate websites, shows historical trends, and uses AI to suggest the best properties to invest in.

## Features

### 📊 Market Dashboard (Popup)
- **Live market stats**: Median price ($1M), rental yield (3.32%), growth (11.1%), days on market (13)
- **5-year price history chart**: Visual trend from $620k (2021) to $1M (2026)
- **Suburb snapshot**: Population, demographics, schools, transport, infrastructure
- **Scraped property listings**: Ranked by AI investment score (0-100)

### 🔍 Property Scraping
Automatically scrapes Macquarie Fields listings from:
- **domain.com.au** — Search results and individual listings
- **realestate.com.au** — Search results and individual listings
- **allhomes.com.au** — Search results

### 🏷️ On-Page Investment Badges
When browsing Macquarie Fields listings on Domain or REA, the extension injects:
- **Investment score badge** on each listing card (0-100)
- **Estimated rent, gross yield, and vs-median comparison**
- **5-year price projection** based on historical growth

### 📋 Floating Detail Panel
On individual property pages, a floating panel shows:
- Investment score and verdict (Strong Buy / Buy / Hold / Weak)
- Estimated weekly rent and gross yield
- Price vs suburb median comparison
- Annual growth forecast and 5-year projection

### 🤖 AI Investment Analysis
- **Market Analysis**: AI-generated suburb investment overview (growth outlook, rental demand, risks, verdict)
- **Best Property Suggestion**: AI recommends the single best property from scraped listings with reasoning
- Powered by Claude API (requires Anthropic API key)

## Investment Scoring Algorithm

Properties are scored 0-100 based on:

| Factor | Max Points | Criteria |
|---|---|---|
| Rental Yield | 20 | ≥4.5% = 20pts, ≥4.0% = 15pts, ≥3.5% = 10pts |
| Below Median Price | 15 | >20% below = 15pts, >5% below = 10pts |
| Land Size | 10 | ≥600m² = 10pts, ≥400m² = 7pts |
| Development Potential | 10 | Dual-occ, wide frontage, side access |
| Location Proximity | 10 | Near station, schools, amenities |
| Value-Add Opportunity | 5 | Original condition, renovation potential |
| Bedroom Config | 5 | 3-4 beds (highest demand) |

## Installation

1. Download or clone this extension folder
2. Open Chrome → navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top-right)
4. Click **Load unpacked** → select this folder
5. The extension icon appears in your toolbar

## Setup

1. Click the extension icon → go to **Settings** tab
2. Enter your **Anthropic API key** (for AI features)
3. Set your **Max Budget**, **Min Bedrooms**, and **Property Types**
4. Click **Save Settings**

## Usage

### Browse with insights
1. Go to [domain.com.au](https://www.domain.com.au/sale/macquarie-fields-nsw-2564/) and search for Macquarie Fields
2. Investment badges auto-appear on each listing card
3. Click into a property — floating analysis panel appears

### Dashboard analysis
1. Click the extension icon in your toolbar
2. **Overview** tab: Market stats, price history chart, suburb snapshot
3. **Properties** tab: Scraped listings ranked by investment score
4. **AI Insights** tab: Click "Analyse with AI" or "Suggest Best Property"

### Scrape fresh data
1. Navigate to a Macquarie Fields search results page on Domain/REA
2. Click extension icon → **Overview** tab → **Scrape Latest Listings Now**

## Data Sources

| Source | Data |
|---|---|
| CoreLogic / YIP | Median prices, growth rates, rental yields, sales volumes |
| Domain.com.au | Current listings, property features, prices |
| realestate.com.au | Current listings, property features, prices |
| PropertyValue.com.au | Historical median prices, suburb stats |
| view.com.au | Market trends, price ranges, days on market |
| ABS Census 2021 | Population, demographics, renter percentage |

## Market Snapshot (August 2026)

| Metric | Houses | Units |
|---|---|---|
| Median Price | $1,000,000 | $688,500 |
| Annual Growth | 11.11% | 7.58% |
| Median Rent | $620/wk | $530/wk |
| Rental Yield | 3.32% | 3.98% |
| Sales (12m) | 98 | 76 |
| Days on Market | 13 | 15 |

## Important Notes

- This tool is for **research purposes only** — not financial advice
- Always seek professional advice before making investment decisions
- Scraped data may not capture all listings or price updates
- AI analysis uses general market data and should be independently verified
- Web scraping may be subject to website terms of service
