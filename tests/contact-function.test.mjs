import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const ALLOWED_NOTIFICATION_TO = "bilgi@eaturkiye.org";
const TURNSTILE_SECRET = "1x0000000000000000000000000000000AA";
const RESEND_FROM = "EA Turkiye Website <contact-form@forms.eaturkiye.org>";

async function loadContactModule() {
  const source = await readFile(new URL("../functions/api/contact.js", import.meta.url), "utf8");
  const dir = await mkdtemp(join(tmpdir(), "ea-contact-function-"));
  const modulePath = join(dir, "contact.mjs");
  await writeFile(modulePath, source);
  return import(modulePath);
}

function makeFormRequest(fields, options = {}) {
  const body = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    body.set(key, value);
  }

  return new Request(options.url || "https://example.com/api/contact", {
    method: "POST",
    body,
    headers: options.headers
  });
}

function makeValidFields(overrides = {}) {
  return {
    first_name: "  Ada ",
    last_name: " Lovelace ",
    email: " ada@example.com ",
    organization: " Analytical Engines ",
    city: " Istanbul ",
    interest: "Intro program",
    message: "Hello from the contact form",
    language: "en",
    consent: "on",
    "cf-turnstile-response": "XXXX.DUMMY.TOKEN.XXXX",
    ...overrides
  };
}

function makeD1Stub(options = {}) {
  const calls = [];
  const rows = [];
  let nextId = 1;

  const db = {
    prepare(sql) {
      const statement = {
        values: [],
        bind(...values) {
          statement.values = values;
          calls.push({ type: "bind", sql, values });
          return statement;
        },
        async run() {
          calls.push({ type: "run", sql, values: statement.values });

          if (/insert into contact_submissions/i.test(sql)) {
            if (options.failInsert) {
              throw new Error("insert failed");
            }

            const id = nextId++;
            const createdAt = "2026-06-17T15:00:00.000Z";
            rows.push({
              id,
              created_at: createdAt,
              form_name: statement.values[0],
              first_name: statement.values[1],
              last_name: statement.values[2],
              email: statement.values[3],
              organization: statement.values[4],
              city: statement.values[5],
              interest: statement.values[6],
              message: statement.values[7],
              language: statement.values[8],
              referer: statement.values[9],
              consent: statement.values[10],
              notification_status: statement.values[11],
              notification_sent_at: null,
              notification_error: "",
              notification_message_id: ""
            });

            return { success: true, meta: { last_row_id: id } };
          }

          if (/update contact_submissions/i.test(sql)) {
            const [status, sentAt, error, messageId, id] = statement.values;
            const row = rows.find((entry) => entry.id === id);
            if (row) {
              row.notification_status = status;
              row.notification_sent_at = sentAt;
              row.notification_error = error;
              row.notification_message_id = messageId;
            }
            return { success: true, meta: { changes: row ? 1 : 0 } };
          }

          return { success: true, meta: {} };
        },
        async first() {
          calls.push({ type: "first", sql, values: statement.values });

          if (/from contact_submissions/i.test(sql)) {
            return rows.find((entry) => entry.id === statement.values[0]) || null;
          }

          return null;
        }
      };

      calls.push({ type: "prepare", sql });
      return statement;
    }
  };

  return { calls, rows, db };
}

function makeBaseEnv(d1, overrides = {}) {
  return {
    CONTACT_DB: d1.db,
    TURNSTILE_SECRET_KEY: TURNSTILE_SECRET,
    RESEND_API_KEY: "test-resend-token",
    CONTACT_NOTIFICATION_TO: ALLOWED_NOTIFICATION_TO,
    CONTACT_NOTIFICATION_FROM: RESEND_FROM,
    ...overrides
  };
}

async function callContact(onRequestPost, { fields = makeValidFields(), env, headers, url } = {}) {
  const waitUntilPromises = [];
  const response = await onRequestPost({
    request: makeFormRequest(fields, { headers, url }),
    env,
    waitUntil(promise) {
      waitUntilPromises.push(promise);
    }
  });

  await Promise.all(waitUntilPromises);
  const data = await response.json();

  return { response, data };
}

async function withMockedFetch(handler, callback) {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, init });
    return handler(url, init, calls);
  };

  try {
    return await callback(calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function notificationRequest(calls) {
  return calls.find((call) => call.url === "https://api.resend.com/emails");
}

function turnstileRequest(calls) {
  return calls.find((call) => call.url.includes("/turnstile/v0/siteverify"));
}

test("stores a valid contact submission in D1 and marks notification skipped without email config", async () => {
  const { onRequestPost } = await loadContactModule();
  const d1 = makeD1Stub();

  await withMockedFetch(
    async () => Response.json({ success: true }),
    async (fetchCalls) => {
      const { response, data } = await callContact(onRequestPost, {
        env: makeBaseEnv(d1, { RESEND_API_KEY: "", CONTACT_NOTIFICATION_TO: "" })
      });

      assert.equal(response.status, 200);
      assert.equal(data.ok, true);
      assert.equal(data.message, "Your message has been received. Thank you!");
      assert.equal(d1.rows.length, 1);
      assert.equal(d1.rows[0].form_name, "contact");
      assert.equal(d1.rows[0].first_name, "Ada");
      assert.equal(d1.rows[0].organization, "Analytical Engines");
      assert.equal(d1.rows[0].consent, 1);
      assert.equal(d1.rows[0].notification_status, "skipped");
      assert.equal(Boolean(turnstileRequest(fetchCalls)), true);
      assert.equal(Boolean(notificationRequest(fetchCalls)), false);
    }
  );
});

test("rejects missing required fields", async () => {
  const { onRequestPost } = await loadContactModule();
  const d1 = makeD1Stub();

  const { response, data } = await callContact(onRequestPost, {
    fields: makeValidFields({ first_name: "" }),
    env: makeBaseEnv(d1, { TURNSTILE_SECRET_KEY: "" })
  });

  assert.equal(response.status, 400);
  assert.equal(data.ok, false);
  assert.equal(d1.rows.length, 0);
});

test("rejects invalid email addresses", async () => {
  const { onRequestPost } = await loadContactModule();
  const d1 = makeD1Stub();

  const { response, data } = await callContact(onRequestPost, {
    fields: makeValidFields({ email: "not-an-email" }),
    env: makeBaseEnv(d1, { TURNSTILE_SECRET_KEY: "" })
  });

  assert.equal(response.status, 400);
  assert.equal(data.ok, false);
  assert.match(data.message, /valid email address/i);
  assert.equal(d1.rows.length, 0);
});

test("rejects missing consent", async () => {
  const { onRequestPost } = await loadContactModule();
  const d1 = makeD1Stub();

  const { response, data } = await callContact(onRequestPost, {
    fields: makeValidFields({ consent: "" }),
    env: makeBaseEnv(d1, { TURNSTILE_SECRET_KEY: "" })
  });

  assert.equal(response.status, 400);
  assert.equal(data.ok, false);
  assert.match(data.message, /consent|permission/i);
  assert.equal(d1.rows.length, 0);
});

test("rejects missing Turnstile token when Turnstile secret is configured", async () => {
  const { onRequestPost } = await loadContactModule();
  const d1 = makeD1Stub();

  const { response, data } = await callContact(onRequestPost, {
    fields: makeValidFields({ "cf-turnstile-response": "" }),
    env: makeBaseEnv(d1)
  });

  assert.equal(response.status, 400);
  assert.equal(data.ok, false);
  assert.equal(d1.rows.length, 0);
});

test("rejects invalid Turnstile validation", async () => {
  const { onRequestPost } = await loadContactModule();
  const d1 = makeD1Stub();

  await withMockedFetch(
    async () => Response.json({ success: false, "error-codes": ["invalid-input-response"] }),
    async (fetchCalls) => {
      const { response, data } = await callContact(onRequestPost, {
        env: makeBaseEnv(d1)
      });

      assert.equal(response.status, 400);
      assert.equal(data.ok, false);
      assert.equal(Boolean(turnstileRequest(fetchCalls)), true);
      assert.equal(d1.rows.length, 0);
    }
  );
});

test("does not store honeypot submissions", async () => {
  const { onRequestPost } = await loadContactModule();
  const d1 = makeD1Stub();

  const { response, data } = await callContact(onRequestPost, {
    fields: makeValidFields({ company: "bot" }),
    env: makeBaseEnv(d1)
  });

  assert.equal(response.status, 200);
  assert.equal(data.ok, true);
  assert.equal(d1.rows.length, 0);
});

test("rejects disallowed origins when Origin is present", async () => {
  const { onRequestPost } = await loadContactModule();
  const d1 = makeD1Stub();

  const { response, data } = await callContact(onRequestPost, {
    env: makeBaseEnv(d1, { TURNSTILE_SECRET_KEY: "" }),
    headers: { Origin: "https://evil.example" },
    url: "https://ea-turkiye.pages.dev/api/contact"
  });

  assert.equal(response.status, 403);
  assert.equal(data.ok, false);
  assert.equal(d1.rows.length, 0);
});

test("returns failure when D1 insert fails", async () => {
  const { onRequestPost } = await loadContactModule();
  const d1 = makeD1Stub({ failInsert: true });

  await withMockedFetch(
    async () => Response.json({ success: true }),
    async () => {
      const { response, data } = await callContact(onRequestPost, {
        env: makeBaseEnv(d1)
      });

      assert.equal(response.status, 500);
      assert.equal(data.ok, false);
    }
  );
});

test("returns success and records failed notification when Resend sending fails", async () => {
  const { onRequestPost } = await loadContactModule();
  const d1 = makeD1Stub();

  await withMockedFetch(
    async (url) => {
      if (url.includes("/turnstile/v0/siteverify")) {
        return Response.json({ success: true });
      }

      return Response.json(
        { name: "validation_error", message: "The `from` domain is not verified", statusCode: 403 },
        { status: 403 }
      );
    },
    async () => {
      const { response, data } = await callContact(onRequestPost, {
        env: makeBaseEnv(d1)
      });

      assert.equal(response.status, 200);
      assert.equal(data.ok, true);
      assert.equal(d1.rows[0].notification_status, "failed");
      assert.match(d1.rows[0].notification_error, /403|validation_error|not verified/i);
    }
  );
});

test("sends notification through Resend to the fixed recipient and records sent status", async () => {
  const { onRequestPost } = await loadContactModule();
  const d1 = makeD1Stub();

  await withMockedFetch(
    async (url) => {
      if (url.includes("/turnstile/v0/siteverify")) {
        return Response.json({ success: true });
      }

      return Response.json({ id: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" });
    },
    async (fetchCalls) => {
      const { response, data } = await callContact(onRequestPost, {
        env: makeBaseEnv(d1),
        headers: { Referer: "https://example.com/en/contact/" }
      });

      const request = notificationRequest(fetchCalls);
      const body = JSON.parse(request.init.body);

      assert.equal(response.status, 200);
      assert.equal(data.ok, true);
      assert.equal(request.init.method, "POST");
      assert.equal(request.init.headers.Authorization, "Bearer test-resend-token");
      assert.equal(request.init.headers["Content-Type"], "application/json");
      assert.equal(request.init.headers["User-Agent"], "ea-turkiye-website/1.0");
      assert.deepEqual(body.to, [ALLOWED_NOTIFICATION_TO]);
      assert.equal(body.from, RESEND_FROM);
      assert.equal(body.reply_to, "ada@example.com");
      assert.match(body.subject, /^\[Website\] New contact form submission from Ada/);
      assert.match(body.text, /Submission ID: 1/);
      assert.match(body.text, /Organization: Analytical Engines/);
      assert.match(body.text, /Referer: https:\/\/example.com\/en\/contact\//);
      assert.equal(body.text.includes("XXXX.DUMMY.TOKEN"), false);
      assert.deepEqual(body.tags, [{ name: "form", value: "contact" }]);
      assert.equal(d1.rows[0].notification_status, "sent");
      assert.equal(d1.rows[0].notification_message_id, "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794");
      assert.equal(Boolean(d1.rows[0].notification_sent_at), true);
    }
  );
});

test("records failed notification when Resend returns success without a message id", async () => {
  const { onRequestPost } = await loadContactModule();
  const d1 = makeD1Stub();

  await withMockedFetch(
    async (url) => {
      if (url.includes("/turnstile/v0/siteverify")) {
        return Response.json({ success: true });
      }

      return Response.json({});
    },
    async () => {
      const { response, data } = await callContact(onRequestPost, {
        env: makeBaseEnv(d1)
      });

      assert.equal(response.status, 200);
      assert.equal(data.ok, true);
      assert.equal(d1.rows[0].notification_status, "failed");
      assert.match(d1.rows[0].notification_error, /missing message id/i);
      assert.equal(d1.rows[0].notification_message_id, "");
    }
  );
});

test("does not send when notification recipient is not the fixed verified address", async () => {
  const { onRequestPost } = await loadContactModule();
  const d1 = makeD1Stub();

  await withMockedFetch(
    async () => Response.json({ success: true }),
    async (fetchCalls) => {
      const { response, data } = await callContact(onRequestPost, {
        env: makeBaseEnv(d1, { CONTACT_NOTIFICATION_TO: "ada@example.com" })
      });

      assert.equal(response.status, 200);
      assert.equal(data.ok, true);
      assert.equal(Boolean(notificationRequest(fetchCalls)), false);
      assert.equal(d1.rows[0].notification_status, "failed");
      assert.match(d1.rows[0].notification_error, /not allowed/i);
    }
  );
});

test("does not log full submission content when email sending fails", async () => {
  const { onRequestPost } = await loadContactModule();
  const d1 = makeD1Stub();
  const originalError = console.error;
  const logs = [];

  console.error = (...args) => {
    logs.push(args.map(String).join(" "));
  };

  try {
    await withMockedFetch(
      async (url) => {
        if (url.includes("/turnstile/v0/siteverify")) {
          return Response.json({ success: true });
        }

        return Response.json(
          { success: false, errors: [{ code: 10002, message: "email.sending.error.internal_server" }] },
          { status: 500 }
        );
      },
      async () => {
        await callContact(onRequestPost, {
          fields: makeValidFields({ message: "Sensitive message body" }),
          env: makeBaseEnv(d1)
        });
      }
    );
  } finally {
    console.error = originalError;
  }

  assert.equal(logs.some((entry) => entry.includes("Sensitive message body")), false);
});
