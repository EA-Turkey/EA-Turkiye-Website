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

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function storeSubmission(db, payload) {
  await db
    .prepare(
      `insert into contact_submissions (
        first_name,
        last_name,
        email,
        city,
        interest,
        message,
        language
      ) values (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      payload.first_name,
      payload.last_name,
      payload.email,
      payload.city,
      payload.interest,
      payload.message,
      payload.language
    )
    .run();
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
    first_name: sanitize(raw.first_name),
    last_name: sanitize(raw.last_name),
    email: sanitize(raw.email),
    city: sanitize(raw.city),
    interest: sanitize(raw.interest),
    message: sanitize(raw.message),
    language: sanitize(raw.language || "tr"),
    company: sanitize(raw.company)
  };

  const localizedMessage = (trMessage, enMessage) =>
    payload.language === "en" ? enMessage : trMessage;

  if (payload.company) {
    return json({ ok: true, message: "Ignored." }, 200);
  }

  if (!payload.first_name || !payload.email || !payload.interest) {
    return json(
      {
        ok: false,
        message: localizedMessage(
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
        message: localizedMessage(
          "Lütfen geçerli bir e-posta adresi girin.",
          "Please enter a valid email address."
        )
      },
      400
    );
  }

  if (payload.message.length > 3000) {
    return json(
      {
        ok: false,
        message: localizedMessage("Mesaj çok uzun.", "Message is too long.")
      },
      400
    );
  }

  if (!env.CONTACT_DB) {
    return json({ ok: false, message: "Server is missing contact storage configuration." }, 500);
  }

  try {
    await storeSubmission(env.CONTACT_DB, payload);
  } catch (error) {
    console.error("D1 contact submission failed", error);
    return json(
      {
        ok: false,
        message: localizedMessage(
          "Mesaj şu anda gönderilemedi. Lütfen e-posta bağlantısını kullan.",
          "The message could not be sent right now. Please use the email link instead."
        )
      },
      500
    );
  }

  return json(
    {
      ok: true,
      message: localizedMessage("Mesajınız alındı. Teşekkürler!", "Your message has been received. Thank you!")
    },
    200
  );
}
