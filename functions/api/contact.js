const ALLOWED_NOTIFICATION_TO = "bilgi@eaturkiye.org";
const DEFAULT_FORM_NAME = "contact";
const DEFAULT_SUBJECT_PREFIX = "[Website]";
const MAX_MESSAGE_LENGTH = 3000;
const MAX_ERROR_LENGTH = 180;
const RESEND_SEND_EMAIL_URL = "https://api.resend.com/emails";
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function sanitize(value) {
  return String(value || "").trim();
}

function sanitizeShort(value, maxLength = 200) {
  return sanitize(value).replace(/\s+/g, " ").slice(0, maxLength);
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hasConsent(value) {
  return ["1", "true", "yes", "on"].includes(sanitize(value).toLowerCase());
}

function localizedMessage(language, trMessage, enMessage) {
  return language === "en" ? enMessage : trMessage;
}

function allowedOrigin(request, env) {
  const origin = request.headers.get("origin");

  if (!origin) {
    return true;
  }

  try {
    const requestOrigin = new URL(request.url).origin;
    const submittedOrigin = new URL(origin).origin;
    const allowed = new Set([
      requestOrigin,
      "https://ea-turkiye.pages.dev",
      "https://eaturkiye.org",
      "https://www.eaturkiye.org"
    ]);

    for (const extraOrigin of sanitize(env.CONTACT_ALLOWED_ORIGINS).split(",")) {
      const normalized = sanitize(extraOrigin);
      if (normalized) {
        allowed.add(new URL(normalized).origin);
      }
    }

    return allowed.has(submittedOrigin);
  } catch {
    return false;
  }
}

async function verifyTurnstile(env, token) {
  if (!env.TURNSTILE_SECRET_KEY) {
    return { ok: true, skipped: true };
  }

  if (!token) {
    return { ok: false, reason: "missing-token" };
  }

  let response;
  let result;

  try {
    const body = new FormData();
    body.set("secret", env.TURNSTILE_SECRET_KEY);
    body.set("response", token);

    response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      body
    });
    result = await response.json();
  } catch {
    return { ok: false, reason: "verification-unavailable" };
  }

  if (!response.ok || !result?.success) {
    return { ok: false, reason: "verification-failed" };
  }

  return { ok: true };
}

async function storeSubmission(db, payload) {
  const result = await db
    .prepare(
      `insert into contact_submissions (
        form_name,
        first_name,
        last_name,
        email,
        organization,
        city,
        interest,
        message,
        language,
        referer,
        consent,
        notification_status
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      payload.form_name,
      payload.first_name,
      payload.last_name,
      payload.email,
      payload.organization,
      payload.city,
      payload.interest,
      payload.message,
      payload.language,
      payload.referer,
      payload.consent ? 1 : 0,
      "pending"
    )
    .run();

  const id = result?.meta?.last_row_id;

  if (!id) {
    throw new Error("D1 insert did not return last_row_id");
  }

  const row = await db
    .prepare(
      `select
        id,
        created_at,
        form_name,
        first_name,
        last_name,
        email,
        organization,
        city,
        interest,
        message,
        language,
        referer,
        consent,
        notification_status
      from contact_submissions
      where id = ?`
    )
    .bind(id)
    .first();

  if (!row) {
    throw new Error("D1 insert row could not be read back");
  }

  return row;
}

async function updateNotificationStatus(db, id, result) {
  await db
    .prepare(
      `update contact_submissions
      set
        notification_status = ?,
        notification_sent_at = ?,
        notification_error = ?,
        notification_message_id = ?
      where id = ?`
    )
    .bind(
      result.status,
      result.status === "sent" ? new Date().toISOString() : null,
      result.error || "",
      result.messageId || "",
      id
    )
    .run();
}

function buildSubmitterName(submission) {
  return [submission.first_name, submission.last_name].map(sanitize).filter(Boolean).join(" ");
}

function formatTimestamp(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return sanitize(value) || "(not provided)";
  }

  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}

function pushField(lines, label, value, fallback = "(not provided)") {
  lines.push(`${label}: ${sanitize(value) || fallback}`);
}

function buildNotificationText(submission) {
  const name = buildSubmitterName(submission) || "(not provided)";
  const lines = [
    "EA Turkiye website contact form",
    "==============================",
    "",
    "A new message was submitted through the website contact form.",
    "",
    "SUMMARY",
    "-------"
  ];

  pushField(lines, "Name", name);
  pushField(lines, "Email", submission.email);
  pushField(lines, "Interest", submission.interest);
  pushField(lines, "Submitted", formatTimestamp(submission.created_at));

  lines.push(
    "",
    "DETAILS",
    "-------"
  );

  pushField(lines, "Organization", submission.organization);
  pushField(lines, "City", submission.city);
  pushField(lines, "Language", submission.language);
  pushField(lines, "Form", submission.form_name);

  lines.push("", "MESSAGE", "-------", submission.message || "(empty)", "", "RECORD", "------");

  pushField(lines, "Submission ID", submission.id);
  pushField(lines, "Created at", submission.created_at);

  if (submission.referer) {
    pushField(lines, "Source", submission.referer);
  }

  return lines.join("\n");
}

function extractResendError(response, body) {
  const pieces = [
    response?.status ? `HTTP ${response.status}` : "",
    body?.name ? body.name : "",
    body?.message ? body.message : "",
    body?.statusCode ? String(body.statusCode) : ""
  ].filter(Boolean);

  return sanitizeShort(pieces.join(" "), MAX_ERROR_LENGTH) || "Resend notification failed";
}

function safeTagValue(value) {
  return sanitize(value)
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 256) || "contact";
}

async function sendContactNotification(env, submission) {
  const to = sanitize(env.CONTACT_NOTIFICATION_TO);

  if (!to) {
    return { status: "skipped", error: "Email notification recipient is not configured" };
  }

  if (to.toLowerCase() !== ALLOWED_NOTIFICATION_TO) {
    return { status: "failed", error: "Email notification recipient is not allowed" };
  }

  if (!env.RESEND_API_KEY || !env.CONTACT_NOTIFICATION_FROM) {
    return { status: "skipped", error: "Resend notification configuration is incomplete" };
  }

  const name = buildSubmitterName(submission) || "unknown visitor";
  const subjectPrefix = sanitize(env.CONTACT_NOTIFICATION_SUBJECT_PREFIX) || DEFAULT_SUBJECT_PREFIX;
  const body = {
    from: sanitize(env.CONTACT_NOTIFICATION_FROM),
    to: [to],
    subject: `${subjectPrefix} New contact form submission from ${name}`,
    text: buildNotificationText(submission),
    tags: [{ name: "form", value: safeTagValue(submission.form_name) }]
  };

  if (env.CONTACT_NOTIFICATION_REPLY_TO_ENABLED !== "false" && validEmail(submission.email)) {
    body.reply_to = submission.email;
  }

  let response;
  let result;

  try {
    response = await fetch(RESEND_SEND_EMAIL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "User-Agent": "ea-turkiye-website/1.0"
      },
      body: JSON.stringify(body)
    });
    result = await response.json().catch(() => null);
  } catch (error) {
    return {
      status: "failed",
      error: sanitizeShort(`Resend notification request failed ${error?.message || ""}`, MAX_ERROR_LENGTH)
    };
  }

  if (!response.ok) {
    return { status: "failed", error: extractResendError(response, result) };
  }

  if (!result?.id) {
    return { status: "failed", error: "Resend response missing message id" };
  }

  return {
    status: "sent",
    messageId: sanitizeShort(result.id, MAX_ERROR_LENGTH)
  };
}

async function sendAndRecordNotification(env, submission) {
  const result = await sendContactNotification(env, submission);
  await updateNotificationStatus(env.CONTACT_DB, submission.id, result);
}

function scheduleNotification(context, env, submission) {
  const task = sendAndRecordNotification(env, submission).catch((error) => {
    console.error("Contact notification status update failed", sanitizeShort(error?.message || error));
  });

  if (typeof context.waitUntil === "function") {
    context.waitUntil(task);
    return;
  }

  return task;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let raw;
  try {
    const formData = await request.formData();
    raw = Object.fromEntries(formData.entries());
  } catch {
    return json({ ok: false, message: "Invalid form payload." }, 400);
  }

  const payload = {
    form_name: DEFAULT_FORM_NAME,
    first_name: sanitize(raw.first_name),
    last_name: sanitize(raw.last_name),
    email: sanitize(raw.email),
    organization: sanitize(raw.organization),
    city: sanitize(raw.city),
    interest: sanitize(raw.interest),
    message: sanitize(raw.message),
    language: sanitize(raw.language || "tr") === "en" ? "en" : "tr",
    company: sanitize(raw.company),
    consent: hasConsent(raw.consent),
    turnstileToken: sanitize(raw["cf-turnstile-response"]),
    referer: sanitizeShort(request.headers.get("referer") || "", 500)
  };

  const message = (trMessage, enMessage) => localizedMessage(payload.language, trMessage, enMessage);

  if (payload.company) {
    return json({ ok: true, message: "Ignored." }, 200);
  }

  if (!allowedOrigin(request, env)) {
    return json({ ok: false, message: message("Geçersiz istek kaynağı.", "Invalid request origin.") }, 403);
  }

  if (!payload.first_name || !payload.email || !payload.interest) {
    return json(
      {
        ok: false,
        message: message(
          "Lütfen ad, e-posta ve ilgi alanı alanlarını doldurun.",
          "Please fill in first name, email, and interest."
        )
      },
      400
    );
  }

  if (!validEmail(payload.email)) {
    return json(
      {
        ok: false,
        message: message("Lütfen geçerli bir e-posta adresi girin.", "Please enter a valid email address.")
      },
      400
    );
  }

  if (!payload.consent) {
    return json(
      {
        ok: false,
        message: message(
          "Lütfen iletişim bilgilerinizi saklamamıza ve size yanıt vermemize izin verin.",
          "Please give consent for us to store your contact details and reply."
        )
      },
      400
    );
  }

  const turnstile = await verifyTurnstile(env, payload.turnstileToken);
  if (!turnstile.ok) {
    return json(
      {
        ok: false,
        message: message("Lütfen doğrulamayı tamamlayın.", "Please complete the verification.")
      },
      400
    );
  }

  if (payload.message.length > MAX_MESSAGE_LENGTH) {
    return json(
      {
        ok: false,
        message: message("Mesaj çok uzun.", "Message is too long.")
      },
      400
    );
  }

  if (!env.CONTACT_DB) {
    return json({ ok: false, message: "Server is missing contact storage configuration." }, 500);
  }

  let submission;
  try {
    submission = await storeSubmission(env.CONTACT_DB, payload);
  } catch (error) {
    console.error("D1 contact submission failed", sanitizeShort(error?.message || error));
    return json(
      {
        ok: false,
        message: message(
          "Mesaj şu anda gönderilemedi. Lütfen e-posta bağlantısını kullan.",
          "The message could not be sent right now. Please use the email link instead."
        )
      },
      500
    );
  }

  await scheduleNotification(context, env, submission);

  return json(
    {
      ok: true,
      message: message("Mesajınız alındı. Teşekkürler!", "Your message has been received. Thank you!")
    },
    200
  );
}
