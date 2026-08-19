# anfustay
Anfu Stay Collection Rental Guide

## Booking calendar administration

The authenticated calendar at `/admin/` manages both Shanghai and Hong Kong. Use the location switcher to block or unblock dates, set nightly price overrides, and review confirmed bookings. The selected city is bookmarkable with `?location=sh` or `?location=hk`. Shanghai prices are stored in CNY; Hong Kong prices are stored in USD. The former `/sh/admin/` address redirects to the canonical dashboard.

Required Vercel environment variables are listed in `.env.example`. The PostgreSQL tables and indexes are created automatically on the first calendar or booking request.
