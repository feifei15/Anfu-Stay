# anfustay
Anfu Stay Collection Rental Guide

## Hong Kong PriceLabs pricing

The authenticated Hong Kong admin calendar can import the latest PriceLabs Customer API rates into the site's date-specific USD pricing table. Configure these server-only Vercel environment variables for Production (and Preview if needed), then redeploy:

- `PRICELABS_API_KEY`: PriceLabs Account Settings → API Details
- `PRICELABS_HK_LISTING_ID`: the Hong Kong apartment's PriceLabs listing ID
- `PRICELABS_HK_PMS`: the exact PMS name shown for that listing in PriceLabs, such as `airbnb`

Open `/admin/?location=hk` and select **Sync PriceLabs prices**. The sync covers the seven months displayed by the admin calendar. Existing manually entered date prices are preserved; clearing a manual price allows the next sync to populate that date from PriceLabs.

## Booking calendar administration

The authenticated calendar at `/admin/` manages Shanghai, Hong Kong, and Las Vegas. Use the location switcher to block or unblock dates, set nightly price overrides, and review confirmed bookings. The selected city is bookmarkable with `?location=sh`, `?location=hk`, or `?location=lv`. Shanghai prices are stored in CNY; Hong Kong and Las Vegas prices are stored in USD. The former `/sh/admin/` address redirects to the canonical dashboard.

Required Vercel environment variables are listed in `.env.example`. The PostgreSQL tables and indexes are created automatically on the first calendar or booking request.
