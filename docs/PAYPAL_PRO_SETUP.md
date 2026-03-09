# PayPal Pro Setup

This app supports a minimal PayPal checkout flow for upgrading users to Pro.

## What it does

- Settings includes a `Go Pro` entry (`/upgrade` page).
- User starts PayPal checkout from `/upgrade`.
- On successful capture, app stores Pro status in `user_subscriptions`.
- Premium feature gating is enforced in UI + API for Auto Plan.

## 1) Database setup

Run:

- `sql/user_subscriptions_schema.sql`

This creates `public.user_subscriptions` and RLS policies for users to read and upsert their own status.

## 2) Environment variables

Required:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

PAYPAL_CLIENT_ID=...
PAYPAL_SECRET=...
PAYPAL_MODE=sandbox
PAYPAL_PRO_PRICE=9.99
```

## 3) Sandbox vs production separation

Use separate PayPal credentials + mode per environment:

- Local/dev:
  - `PAYPAL_MODE=sandbox`
  - sandbox app credentials
- Production:
  - `PAYPAL_MODE=live`
  - live app credentials

Do not reuse sandbox credentials in production.

## 4) Upgrade flow

1. User opens Settings -> Billing -> `Go Pro`.
2. User is taken to `/upgrade` and clicks `Upgrade with PayPal`.
3. API `POST /api/paypal/create-order` creates PayPal order and returns approval URL.
4. User approves in PayPal and returns to `/upgrade?paypal=success&token=<orderId>`.
5. App calls `POST /api/paypal/capture-order` with auth token + order ID.
6. API captures order and upserts `user_subscriptions` to `tier=pro`, `status=active`.

Cancel/failure behavior:

- `?paypal=cancel` shows non-fatal canceled message.
- Capture failures display error message and keep user on free plan.

## 5) Premium gating

Current premium-gated feature:

- `Auto Plan`
  - gated in `src/app/page.tsx` UI
  - enforced in `src/app/api/auto-plan/route.ts` by subscription check

## 6) Test checklist

- Sandbox success flow upgrades user and sets Pro.
- Cancel returns to app with canceled message.
- Invalid capture / unauthorized token does not upgrade user.
- Free user cannot call Auto Plan API.
