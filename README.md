# MarketPulse: AI market research for SGX, NASDAQ and NSE (Android)

An Android app (Android 8.0+) that tracks, scans and explains the market. It shows which stocks are breaking out, which are in the news, and what an AI analyst makes of them.

## Versions and changelog
- The installed version shows in the app under **Profile → About**, and **What's new** lists every release.
- `CHANGELOG.md` is the single source. For each release: bump `versionCode` and `versionName` in `app/build.gradle`, and add a `## [version] - YYYY-MM-DD` section at the top of the changelog with `### Added` / `### Changed` / `### Fixed` lists.
- The build copies the changelog into the app and **fails if the changelog has no section for the current versionName**. GitHub Releases get a `vX.Y` release plus `latest`, with the changelog section as release notes.

## New in v3.1
- **Score backtest** (Radar → Backtest): replays ~2 years of prices to show whether high breakout scores beat the index over 5, 10 and 20 days, per market.
- **Backup & restore** (Profile → Data): save everything to a file and load it on any phone. The API key is not included.
- **Offline mode**: the last quotes, charts and news are kept on the phone and shown with an "Offline" banner when there's no connection.
- **Chart-signal alerts**: 20-day breakout, RSI crossing 70/30, golden and death cross, volume spikes, checked in the background.
- **Market-open digest**: one notification after SGX, NSE or NASDAQ opens, with the index move, your biggest movers and today's results or dividends.

## New in v3
- **Candlestick charts** with volume bars and 20/50-day moving averages (Line/Candles toggle on any stock page).
- **Sector heatmap** on Radar and **relative strength vs the index** (STI, Nasdaq, Nifty 50) built into the breakout score.
- **Portfolio**: record buys and sells; holdings, today's change, unrealised and realised P&L, allocation by market and sector, totals in SGD, USD or INR at live FX rates.
- **Results & dividends calendar** for your stocks (News tab), next dates and valuation (yield, P/E) on each stock page, and upcoming events on Home.
- **AI news sentiment**: Claude reads the headlines and explains the likely impact on each stock.
- **Home-screen widget** showing your first five watchlist stocks, refreshed about every 15 minutes.
- Every build is now signed with one permanent key (in `signing/`), so updates install over the previous version.

## Features
- **Home dashboard:** sliding wallet cards for the STI, Nasdaq and Nifty 50, each showing the top breakout pick for that market. Also market mood (breadth), watchlist movers, breakout picks, wishlist stocks near target, recent alerts and a one-tap **AI morning brief**.
- **Markets**
  - *Watchlist:* live prices, sparklines and % change. Swipe left to remove.
  - *Wishlist:* stocks you want to buy, with a target price, a progress bar and an automatic buy-target alert.
  - *Analysed:* every stock you've opened or the AI has studied, with its score then and before.
- **Radar (breakout scanner):** scores about 30 SGX names (STI-linked), about 55 NASDAQ names (Nasdaq-100 leaders) and the Nifty 50 from 0 to 100. The score combines:
  - 20-day breakout or proximity to the 20-day high
  - volume against the 20-day average
  - trend (price vs the 20- and 50-day averages)
  - one-month momentum and RSI
  - 48-hour news buzz and headline tone
  Filters: breakouts, volume surges, in the news, breaking down.
- **Stock page:** a chart from 1D to 5Y you can scrub, a signals gauge with tags, key stats and news. Buttons: Ask the AI analyst, Watchlist, Wishlist, Set alert.
- **News:** topics (SGX, NASDAQ, NSE, tech, economy), search, a strip of stocks detected in the headlines, and a positive or negative tone dot on each story.
- **AI Analyst:** a Claude agent with tools: scan_market, analyze_stock, get_news, find_symbol, your lists, plus web search. It researches before it answers and gives bull and bear scenarios with key levels. It needs your own Anthropic API key (Profile > AI analyst), billed to your Anthropic account.
- **Alerts and notifications:** price above or below a level, a daily move over X%, wishlist buy targets, and breakout-watch alerts for your stocks. Price checks run in the background about every 15 minutes, even when the app is closed.
- **Profile:** name, focus markets, theme (System/Light/Dark), **fingerprint lock** (fingerprint, with your phone PIN as fallback; re-locks after 30 s away), notifications, AI model and web search, data reset.
- Animated transitions, gauges and number tickers, all of which respect the system reduce-motion setting.

Data: Yahoo Finance (quotes and history, delays vary by exchange) and Google News RSS. No keys needed except for the AI analyst.

**Important:** scores and AI outlooks are research aids, not predictions. Breakouts often fail. Nothing here is financial advice.

## Get the APK
### Option A: GitHub Actions (no tools needed)
1. Create a GitHub repository and upload this whole folder, including the hidden `.github/` folder.
2. Open **Actions**, then **Build APK**, then the latest run, and download **MarketPulse-apk**.
3. Unzip, copy `MarketPulse.apk` to your phone and open it. Allow "Install unknown apps" when asked.

### Option B: Android Studio
Open the folder in Android Studio and choose **Build > Build APK(s)**. From a terminal with the Android SDK installed, run `./gradlew assembleRelease`.

The release APK is signed with the debug key so it installs directly. Use your own keystore before publishing on Google Play.

## Code map
- `MainActivity.java`: WebView host, native bridge (allow-listed HTTPS, fingerprint lock, notifications, alert storage).
- `AlertJobService.java`: background price-alert checks (JobScheduler) and notifications.
- `assets/index.html`: layout and styles.
- `assets/app.js`: data, watchlist, stock page, news.
- `assets/radar.js`: indicators, breakout score, scanner.
- `assets/agent.js`: the AI analyst and its tools.
- `assets/features.js`: dashboard, wishlist, analysed history, alerts, profile, theme, swipe.
- `assets/universe.js`: stock lists per market. Edit them freely.
