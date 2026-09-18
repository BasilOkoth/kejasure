# KejaScan — production-oriented MVP

**Real homes. Verified availability. No wasted trips.**

This package is designed for GitHub → Render deployment and includes the premium features requested:

- PostgreSQL persistence
- renter, landlord, caretaker, property-manager, agent and admin accounts
- secure password hashing and cookie-based JWT sessions
- real image/video uploads stored persistently in PostgreSQL for the MVP
- admin property verification workflow
- KejaScan verification score
- seven-day live-availability reconfirmation
- exact map pins with OpenStreetMap/Leaflet
- viewing appointments with private safety codes
- saved homes
- lister dashboard
- admin verification dashboard
- natural-language house search
- transparent move-in costs
- responsive premium interface

## Deploy

1. Extract the ZIP.
2. Upload the **contents** of the extracted folder to the root of a new GitHub repository.
3. In Render choose **New → Blueprint**.
4. Connect that repository.
5. Render reads `render.yaml` and creates:
   - the KejaScan Node web service
   - a PostgreSQL database
6. During the first Blueprint setup, Render will ask for:
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD`
7. Deploy.

Render automatically generates `JWT_SECRET`, and `DATABASE_URL` is wired to the Postgres database by the Blueprint.

## First use

1. Sign in with the admin email/password you supplied to Render.
2. Create a separate landlord/caretaker/manager account from the public site.
3. Submit a property.
4. Upload a current photo or video in that account's dashboard.
5. Sign back in as admin.
6. Verify the property and assign a KejaScan Score.
7. The property appears in public search.
8. Create a house-seeker account to save it or request a viewing.

## Media storage

For this MVP, uploaded images/videos are stored as PostgreSQL `BYTEA`. This makes the whole system persistent without requiring a second storage provider and works well for a limited pilot.

The server limits each upload to 20 MB. Before large-scale launch, move media to an object-storage service (S3-compatible storage, Cloudinary, etc.) and keep only URLs/metadata in Postgres.

## Production hardening before public launch

The system is a strong functional MVP, not the final legal/security architecture. Before collecting deposits or identity documents, add:
- email/phone verification
- password reset
- rate limiting / bot protection
- audit logs
- explicit data-retention/privacy flows
- ID/KYC provider integration
- moderation and abuse reporting
- backup policy
- object storage/CDN for media
- transactional email/SMS
- formal safety escalation workflow
- legal review before any escrow/deposit handling

No payment or escrow flow is enabled in this package.


## Short-stay hosts

KejaScan also supports short-stay and furnished-monthly inventory.

New listing modes:
- Long-term rental
- Airbnb-style short stay / holiday rental
- Furnished monthly stay

Short-stay listings can include:
- nightly, weekly and monthly rates
- cleaning fee
- security deposit
- minimum nights
- maximum guests
- check-in / check-out time
- furnished status
- self check-in
- kitchen
- workspace
- pool
- gym
- current photos/video
- map location
- live availability reconfirmation

A new `host` user role is available. The database migration is included in `sql/schema.sql` and runs automatically at the next Render deployment.


## What makes KejaScan different

KejaScan is positioned as a **property intelligence and decision-support platform**, not merely a verified-listings marketplace.

Its six-layer property scan evaluates:
1. Availability freshness
2. Evidence completeness
3. Cost clarity
4. Utilities information
5. Safety / identity / location signals
6. Decision readiness

Each public property has a `/api/listings/:id/scan` intelligence endpoint. The score is calculated from the evidence currently recorded for that property and highlights missing information instead of pretending the listing is complete.

Core promise: **Know the house before you go.**

KejaScan supports long-term rentals, short stays and furnished monthly stays while keeping its primary differentiation around decision intelligence, live availability freshness, evidence gaps and traceable viewings.


## Existing Render deployment note

The repository may still use the infrastructure names `kejasure` and `kejasure-db` in `render.yaml`. That is intentional for the existing Render deployment so the current PostgreSQL database remains connected. The public product branding is **KejaScan**. Rename the Render service/database only as a separate infrastructure migration after confirming the existing database connection.
