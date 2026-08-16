# anfustay
Anfu Stay Collection Rental Guide

## Booking calendar administration

The authenticated calendar at `/sh/admin/` manages both Shanghai and Hong Kong. Use the location switcher to block or unblock dates, set nightly price overrides, and review confirmed bookings. Shanghai prices are stored in CNY; Hong Kong prices are stored in USD.

Required Vercel environment variables are listed in `.env.example`. The PostgreSQL tables and indexes are created automatically on the first calendar or booking request.
