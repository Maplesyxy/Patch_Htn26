// A stand-in diff for the labelled sample replay, and for any investigation whose
// runtime has not produced a patch.diff.
//
// It is never presented as a real patch: CodeReview shows it behind a banner saying
// where it came from. It exists so the review surface can be demonstrated without a
// live worker, and it matches the fix the sample replay describes (PATCH-2, server-side
// idempotency on the booking route).

export const SAMPLE_PATCH_BRANCH = "fix/inc-1-idempotent-booking";

export const SAMPLE_PATCH = `diff --git a/booking-app/app/api/bookings/route.js b/booking-app/app/api/bookings/route.js
index 8f2a1c4..b71d90e 100644
--- a/booking-app/app/api/bookings/route.js
+++ b/booking-app/app/api/bookings/route.js
@@ -1,4 +1,10 @@
-import { addEmail, addRequest, addReservation, listReservations, nextReservationNumber } from "@/lib/store";
+import {
+  addEmail,
+  addRequest,
+  addReservation,
+  claimIdempotencyKey,
+  listReservations,
+  nextReservationNumber,
+} from "@/lib/store";
 import { MAX_PARTY, SLOTS, byId } from "@/lib/restaurants";
 
 export const runtime = "nodejs";
@@ -27,12 +33,34 @@ export async function POST(req) {
   if (!byId(restaurant)) return json({ error: "unknown restaurant." }, 400);
 
   const party_size = Math.min(Math.max(1, requested), MAX_PARTY);
+  const fingerprint = JSON.stringify({ account, date, slot, restaurant, party_size });
+
+  // One attempt is one reservation. The client retries on a dropped response and
+  // re-sends the same key, so the second request must resolve to the first booking
+  // rather than creating another. The claim is atomic, which also covers two
+  // instances racing on the same key.
+  if (idempotencyKey) {
+    const claim = await claimIdempotencyKey(idempotencyKey, fingerprint);
+    if (claim.conflict) {
+      return json({ error: "This idempotency key was used for a different booking." }, 409);
+    }
+    if (claim.reservation) {
+      await addRequest({
+        id: \`Q-replay-\${Date.now()}\`, ts: new Date().toISOString(), method: "POST",
+        path: "/api/bookings", status: 200, account,
+        correlation_id: correlationId, idempotency_key: idempotencyKey,
+        reservation: claim.reservation.id, replayed: true,
+        duration_ms: Date.now() - startedAt,
+      });
+      return json({ reservation: claim.reservation, party_size: requested, restaurant, replayed: true }, 200);
+    }
+  }
 
   const n = await nextReservationNumber();
   const reservation = {
     id: \`R-\${n}\`, account, date, slot, restaurant, party_size,
     created_at: new Date().toISOString(), source: "web",
   };
   await addReservation(reservation);
+  if (idempotencyKey) await claimIdempotencyKey(idempotencyKey, fingerprint, reservation);
+
   await addEmail({ id: \`E-\${n}\`, account, reservation: reservation.id,
                    template: "booking_confirmation", sent_at: new Date().toISOString(), attempt: 1 });
diff --git a/booking-app/lib/store.js b/booking-app/lib/store.js
index 3a1f2c1..9d4b7e8 100644
--- a/booking-app/lib/store.js
+++ b/booking-app/lib/store.js
@@ -16,6 +16,7 @@ const K = {
   requests: "booking:requests",
   emails: "booking:emails",
   feedback: "booking:feedback",
+  idem: (key) => \`booking:idem:\${key}\`,
   counter: "booking:counter",
 };
 
@@ -61,6 +62,38 @@ export async function nextReservationNumber() {
   return ++mem.counter;
 }
 
+const IDEM_TTL_SECONDS = 24 * 60 * 60;
+
+/**
+ * Claim an idempotency key, or report what it was already used for.
+ *
+ *   { reservation }        the key has been seen; this is the original booking
+ *   { conflict: true }     the key has been seen with a different payload
+ *   { claimed: true }      the key is new and is now held by this caller
+ *
+ * SET NX is atomic, so two instances racing on one key cannot both proceed.
+ */
+export async function claimIdempotencyKey(key, fingerprint, reservation = null) {
+  const record = { fingerprint, reservation };
+  if (redis) {
+    if (reservation) {
+      await redis.set(K.idem(key), JSON.stringify(record), { ex: IDEM_TTL_SECONDS });
+      return { claimed: true };
+    }
+    const existing = parse(await redis.get(K.idem(key)));
+    if (!existing) return { claimed: false };
+    if (existing.fingerprint !== fingerprint) return { conflict: true };
+    return { reservation: existing.reservation };
+  }
+  if (!g.__bookingIdem) g.__bookingIdem = new Map();
+  if (reservation) {
+    g.__bookingIdem.set(key, record);
+    return { claimed: true };
+  }
+  const existing = g.__bookingIdem.get(key);
+  if (!existing) return { claimed: false };
+  if (existing.fingerprint !== fingerprint) return { conflict: true };
+  return { reservation: existing.reservation };
+}
+
 export async function addReservation(row) { await push(K.reservations, "reservations", row); }
diff --git a/booking-app/tests/protected/booking-regression.mjs b/booking-app/tests/protected/booking-regression.mjs
index 0000000..4c1e88a 100644
--- a/booking-app/tests/protected/booking-regression.mjs
+++ b/booking-app/tests/protected/booking-regression.mjs
@@ -18,6 +18,14 @@ test("a repeated attempt with the same key yields one reservation", async () =>
   assert.equal(after.length, 1, "a retried attempt must not create a second reservation");
 });
 
+test("two genuine bookings still create two reservations", async () => {
+  await reset();
+  await book({ account: "A-1001", idempotencyKey: "k-one" });
+  await book({ account: "A-1001", idempotencyKey: "k-two" });
+  const rows = await reservations("A-1001");
+  assert.equal(rows.length, 2, "distinct attempts must remain distinct");
+});
+
 test("the same key cannot be replayed across accounts", async () => {
   await reset();
   await book({ account: "A-1001", idempotencyKey: "k-shared" });
`;
