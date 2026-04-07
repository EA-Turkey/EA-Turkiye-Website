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

function escapeHtml(value) {
  return sanitize(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

  if (!env.RESEND_API_KEY || !env.CONTACT_TO_EMAIL || !env.CONTACT_FROM_EMAIL) {
    return json({ ok: false, message: "Server is missing email configuration." }, 500);
  }

  const subject = `[EA Türkiye] ${payload.interest} — ${payload.first_name} ${payload.last_name}`.trim();
  const html = `
    <h1>New EA Türkiye contact form submission</h1>
    <p><strong>First name:</strong> ${escapeHtml(payload.first_name)}</p>
    <p><strong>Last name:</strong> ${escapeHtml(payload.last_name)}</p>
    <p><strong>Email:</strong> ${escapeHtml(payload.email)}</p>
    <p><strong>City:</strong> ${escapeHtml(payload.city)}</p>
    <p><strong>Interest:</strong> ${escapeHtml(payload.interest)}</p>
    <p><strong>Language:</strong> ${escapeHtml(payload.language)}</p>
    <hr>
    <p><strong>Message:</strong></p>
    <p>${escapeHtml(payload.message).replaceAll("\n", "<br>")}</p>
  `;
  const text = `
New EA Türkiye contact form submission

First name: ${payload.first_name}
Last name: ${payload.last_name}
Email: ${payload.email}
City: ${payload.city}
Interest: ${payload.interest}
Language: ${payload.language}

Message:
${payload.message}
  `.trim();

  let resendResponse;
  try {
    resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: env.CONTACT_FROM_EMAIL,
        to: [env.CONTACT_TO_EMAIL],
        subject,
        html,
        text
      })
    });
  } catch (error) {
    console.error("Resend request failed", error);
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

  if (!resendResponse.ok) {
    const errorText = await resendResponse.text();
    console.error("Resend error:", errorText);
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
