document.addEventListener("DOMContentLoaded", () => {
  document.documentElement.classList.add("is-ready");

  const navToggle = document.querySelector("[data-nav-toggle]");
  const nav = document.querySelector("[data-site-nav]");

  if (navToggle && nav) {
    const navToggleLabel = navToggle.querySelector("[data-nav-toggle-label]");
    const openLabel = navToggle.getAttribute("data-open-label") || "";
    const closeLabel = navToggle.getAttribute("data-close-label") || openLabel;

    const setNavState = (isOpen) => {
      navToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
      navToggle.setAttribute("aria-label", isOpen ? closeLabel : openLabel);
      if (navToggleLabel) {
        navToggleLabel.textContent = isOpen ? closeLabel : openLabel;
      }
      nav.classList.toggle("is-open", isOpen);
      document.body.classList.toggle("is-nav-open", isOpen);
    };

    navToggle.addEventListener("click", () => {
      const expanded = navToggle.getAttribute("aria-expanded") === "true";
      setNavState(!expanded);
    });

    document.addEventListener("click", (event) => {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (!nav.classList.contains("is-open")) {
        return;
      }

      if (nav.contains(target) || navToggle.contains(target)) {
        return;
      }

      setNavState(false);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        setNavState(false);
      }
    });

    nav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => setNavState(false));
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 768) {
        setNavState(false);
      }
    });
  }

  document.querySelectorAll("[data-faq-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = button.closest(".faq-item");
      const expanded = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", expanded ? "false" : "true");
      item?.classList.toggle("is-open", !expanded);
    });
  });

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14 }
    );

    document.querySelectorAll("[data-reveal]").forEach((element) => observer.observe(element));
  } else {
    document.querySelectorAll("[data-reveal]").forEach((element) => element.classList.add("is-visible"));
  }
});
