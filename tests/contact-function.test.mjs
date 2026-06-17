import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

async function loadContactModule() {
  const source = await readFile(new URL("../functions/api/contact.js", import.meta.url), "utf8");
  const dir = await mkdtemp(join(tmpdir(), "ea-contact-function-"));
  const modulePath = join(dir, "contact.mjs");
  await writeFile(modulePath, source);
  return import(modulePath);
}

function makeFormRequest(fields) {
  const body = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    body.set(key, value);
  }

  return new Request("https://example.com/api/contact", {
    method: "POST",
    body
  });
}

function makeD1Stub() {
  const calls = [];
  const statement = {
    bind(...values) {
      calls.push({ type: "bind", values });
      return statement;
    },
    async run() {
      calls.push({ type: "run" });
      return { success: true };
    }
  };

  return {
    calls,
    db: {
      prepare(sql) {
        calls.push({ type: "prepare", sql });
        return statement;
      }
    }
  };
}

test("stores a valid contact submission in D1", async () => {
  const { onRequestPost } = await loadContactModule();
  const d1 = makeD1Stub();

  const response = await onRequestPost({
    request: makeFormRequest({
      first_name: "  Ada ",
      last_name: " Lovelace ",
      email: " ada@example.com ",
      city: " Istanbul ",
      interest: "Intro program",
      message: "Hello",
      language: "en"
    }),
    env: { CONTACT_DB: d1.db }
  });
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.message, "Your message has been received. Thank you!");
  assert.match(d1.calls.find((call) => call.type === "prepare")?.sql || "", /insert into contact_submissions/i);
  assert.deepEqual(d1.calls.find((call) => call.type === "bind")?.values, [
    "Ada",
    "Lovelace",
    "ada@example.com",
    "Istanbul",
    "Intro program",
    "Hello",
    "en"
  ]);
  assert.equal(d1.calls.some((call) => call.type === "run"), true);
});

test("does not store honeypot submissions", async () => {
  const { onRequestPost } = await loadContactModule();
  const d1 = makeD1Stub();

  const response = await onRequestPost({
    request: makeFormRequest({
      first_name: "Ada",
      email: "ada@example.com",
      interest: "Intro program",
      company: "bot"
    }),
    env: { CONTACT_DB: d1.db }
  });
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.ok, true);
  assert.equal(d1.calls.length, 0);
});
