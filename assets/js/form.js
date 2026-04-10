document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("contact-form");
  const status = document.getElementById("form-status");
  const languageInput = form?.querySelector('input[name="language"]');
  const submitButton = form?.querySelector('button[type="submit"]');

  if (!form || !status || !submitButton) {
    return;
  }

  const language = languageInput?.value === "en" ? "en" : "tr";
  const fallbackMessage =
    form.dataset.errorMessage ||
    (language === "tr"
      ? "Bir sorun oluştu. Lütfen aşağıdaki e-posta bağlantısını kullan."
      : "Something went wrong. Please use the email link below.");
  const sendingMessage =
    form.dataset.sendingMessage || (language === "tr" ? "Gönderiliyor..." : "Sending...");
  const defaultButtonLabel = submitButton.textContent || "";

  const resetStatus = () => {
    status.textContent = "";
    status.classList.remove("is-error", "is-success");
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    resetStatus();

    if (!form.checkValidity()) {
      const firstInvalidField = form.querySelector(":invalid");

      if (firstInvalidField instanceof HTMLElement) {
        firstInvalidField.focus();
      }

      if (firstInvalidField && typeof firstInvalidField.reportValidity === "function") {
        firstInvalidField.reportValidity();
      }

      return;
    }

    status.textContent = sendingMessage;
    submitButton.disabled = true;
    submitButton.setAttribute("aria-busy", "true");

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

      if (languageInput) {
        languageInput.value = language;
      }
    } catch (error) {
      console.error(error);
      status.textContent = fallbackMessage;
      status.classList.add("is-error");
    } finally {
      submitButton.disabled = false;
      submitButton.removeAttribute("aria-busy");
      submitButton.textContent = defaultButtonLabel;
    }
  });

  form.querySelectorAll("input, select, textarea").forEach((field) => {
    field.addEventListener("input", () => {
      if (!status.textContent) {
        return;
      }

      resetStatus();
    });
  });
});
