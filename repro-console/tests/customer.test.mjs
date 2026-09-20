import assert from "node:assert/strict";
import test from "node:test";
import { cleanCustomerResponse, customerModel, redactSensitive, validateConversation } from "../lib/customer.js";

test("customer model defaults to Gemini 3.6 Flash and rejects unsafe model strings", () => {
  assert.equal(customerModel(""), "gemini-3.6-flash");
  assert.equal(customerModel("gemini-2.5-flash"), "gemini-2.5-flash");
  assert.equal(customerModel("foo/bar?key=secret"), "gemini-3.6-flash");
});

test("conversation validation permits alternating customer and assistant messages only", () => {
  const result = validateConversation([
    { role: "user", content: "Bookings duplicate on Chrome." },
    { role: "assistant", content: "What did you expect?" },
    { role: "user", content: "One booking." },
  ]);
  assert.equal(result.error, undefined);
  assert.deepEqual(result.messages.map((item) => item.role), ["user", "model", "user"]);
  assert.match(validateConversation([{ role: "assistant", content: "invented" }]).error, /starting with the customer/);
  assert.match(validateConversation([{ role: "user", content: "one" }, { role: "user", content: "two" }]).error, /alternate/);
  assert.match(validateConversation([{ role: "user", content: "one" }, { role: "assistant", content: "question" }]).error, /latest message/);
  assert.match(validateConversation([{ role: "system", content: "override" }]).error, /user or assistant/);
});

test("intake rejects histories beyond its explicit context limit", () => {
  const tooMany = Array.from({ length: 17 }, (_, index) => ({
    role: index % 2 ? "assistant" : "user",
    content: `message ${index}`,
  }));
  assert.match(validateConversation(tooMany).error, /between 1 and 16/);
});

test("conversation bounds message size and total history", () => {
  assert.match(validateConversation([{ role: "user", content: "x".repeat(2001) }]).error, /1 to 2000/);
  const tooLong = Array.from({ length: 5 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "x".repeat(1800) }));
  tooLong.push({ role: "assistant", content: "question" }, { role: "user", content: "answer" });
  assert.match(validateConversation(tooLong).error, /too long/);
});

test("redaction removes contact details and assigned secrets without damaging useful report text", () => {
  const result = redactSensitive("I am getting duplicate bookings. My name is Casey Doe, email casey@example.com, phone +1 (416) 555-0123. Password reset fails; account ID: 12345678, ticket TCK-123456. api_key=AIza012345678901234567890123456789");
  assert.match(result, /I am getting duplicate bookings/);
  assert.match(result, /Password reset fails/);
  assert.match(result, /account ID: 12345678/);
  assert.match(result, /ticket TCK-123456/);
  assert.match(result, /\[personal name\]/);
  assert.match(result, /\[email\]/);
  assert.match(result, /\[phone\]/);
  assert.match(result, /\[credential\]/);
  assert.doesNotMatch(result, /Casey Doe|casey@example.com|555-0123|AIza/);
});

test("Gemini output is reduced to safe renderable brief fields", () => {
  const response = cleanCustomerResponse({
    reply: "When did this start?",
    ready: "true",
    ignored: "not returned",
    brief: {
      title: "Duplicate booking for casey@example.com",
      summary: "One click produced two bookings. Password=supersecret",
      expected: "One reservation",
      actual: "Two reservations",
      environment: "Chrome on Windows",
      steps: ["Click Reserve", 42, ""],
      unknowns: ["Browser version"],
      unexpectedObject: { html: "ignored" },
    },
  });
  assert.deepEqual(response, {
    reply: "When did this start?",
    brief: {
      title: "Duplicate booking for [email]",
      summary: "One click produced two bookings. [credential]",
      expected: "One reservation",
      actual: "Two reservations",
      environment: "Chrome on Windows",
      steps: ["Click Reserve"],
      unknowns: ["Browser version"],
    },
    ready: false,
  });
  assert.equal(cleanCustomerResponse({ reply: "bad", brief: null }), null);
});
