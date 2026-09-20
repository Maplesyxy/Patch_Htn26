# Changelog

## 2026-09-12

- **Fix double bookings.** A few accounts ended up with two identical reservations from
  one visit. The Book button stayed live while the request was in flight, so an impatient
  second click went through as a second booking. The button is now disabled from submit
  until the request settles, and the submit handler returns early if one is already running.
  Closing this out; no reports since.
- Tidy the slot list so evening times come in order.

## 2026-09-04

- Retry a booking once when the connection drops, so people on patchy mobile networks do not
  lose a booking to a single lost packet. Same idempotency key on the retry.

## 2026-08-28

- Log every write to `/api/sandbox/requests` with a correlation id and the idempotency key.

## 2026-08-21

- First cut: book a table, see your reservations, confirmation email on success.
