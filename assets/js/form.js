document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("contact-form");
  const status = document.getElementById("form-status");
  const languageInput = form?.querySelector('input[name="language"]');

  if (!form || !status) return;

  const language = languageInput?.value === "en" ? "en" : "tr";
  const fallbackMessage =
    language === "tr"
      ? "Bir sorun oluştu. Lütfen aşağıdaki e-posta bağlantısını kullan."
      : "Something went wrong. Please use the email link below.";
  const sendingMessage = language === "tr" ? "Gönderiliyor..." : "Sending...";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    status.textContent = sendingMessage;
    status.classList.remove("is-error", "is-success");

    try {
      const response = await fetch(form.action, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" }
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        status.textContent = data.message || fallbackMessage;
        status.classList.add("is-error");
        return;
      }

      status.textContent = data.message;
      status.classList.add("is-success");
      form.reset();
      if (languageInput) languageInput.value = language;
    } catch (error) {
      console.error(error);
      status.textContent = fallbackMessage;
      status.classList.add("is-error");
    }
  });
});
