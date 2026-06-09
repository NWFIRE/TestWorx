# TradeWorx Crawl Blocked

The authenticated Playwright crawl was not run because required environment variables are missing.

Missing variables:
- TRADEWORX_BASE_URL
- TRADEWORX_ADMIN_EMAIL
- TRADEWORX_ADMIN_PASSWORD
- TRADEWORX_TECH_EMAIL
- TRADEWORX_TECH_PASSWORD

No credentials were hardcoded. Set the required variables and run:

```powershell
npm run crawl:app
```
