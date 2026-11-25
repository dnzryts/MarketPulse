# Changelog

All notable changes to MarketPulse. The app shows this file under Profile → What's new.
Each release adds a section at the top: `## [version] - YYYY-MM-DD`, with `### Added`, `### Changed` or `### Fixed` lists.
The version must match `versionName` in `app/build.gradle`; the build checks this.

## [3.2] - 2026-11-25
### Added
- App version and build number shown in Profile, under About.
- What's new screen listing every release, opened from Profile.
- A "What's new" note after the app updates, the first time you open it.
### Changed
- Release notes on GitHub now come from this changelog.

## [3.1] - 2026-11-24
### Added
- Score backtest on Radar: replays about two years of prices to show whether high breakout scores beat the index over 5, 10 and 20 days.
- Backup and restore in Profile → Data, through the Android file picker. Your API key is left out of backups.
- Offline mode: the last quotes, charts, news and calendar stay on the phone and show with an "Offline" bar.
- Chart-signal alerts: 20-day breakout, RSI crossing 70 or 30, golden and death cross, volume spike.
- Market-open digest: one notification after SGX, NSE or NASDAQ opens with the index move, your biggest movers and the day's results or dividends.
- The AI analyst can run the backtest.

## [3.0] - 2026-11-24
### Added
- Candlestick charts with volume bars and 20- and 50-day averages.
- Sector heatmap on Radar, and relative strength against the index in the breakout score.
- Portfolio: buys and sells, holdings, today's change, unrealised and realised P&L, allocation, totals in SGD, USD or INR.
- Results and dividends calendar for your stocks, with yield and P/E on stock pages.
- AI news sentiment: Claude rates each headline and gives a short reason.
- Home-screen widget with your first five watchlist stocks.
### Changed
- Every build is signed with one permanent key, so updates install over the previous version.

## [2.1] - 2026-11-24
### Added
- Swipe left or right to switch screens; swipe right to go back from a stock page.
- Slide transitions, a sliding tab indicator and pull to refresh.

## [2.0] - 2026-11-24
### Added
- Home dashboard with wallet cards, market mood, movers, breakout picks and recent alerts.
- Wishlist with buy targets, analysed-stocks history, price alerts and background notifications.
- Fingerprint lock, light/dark/system theme and a Profile page.
- Breakout radar for SGX, NASDAQ and NSE, news with tickers and tone, and the AI analyst.

## [1.0] - 2026-11-24
### Added
- First release: watchlist with live quotes, stock charts and news.
