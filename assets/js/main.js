document.addEventListener("DOMContentLoaded", () => {
  document.documentElement.classList.add("is-ready");

  const focusableSelector = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");

  const bodyChildren = Array.from(document.body.children).filter(
    (element) => element instanceof HTMLElement && element.tagName !== "SCRIPT"
  );

  const setInertState = (exceptions, isInert) => {
    const allowed = new Set(exceptions.filter(Boolean));

    bodyChildren.forEach((element) => {
      if (allowed.has(element)) {
        return;
      }

      element.inert = isInert;
    });
  };

  const navToggle = document.querySelector("[data-nav-toggle]");
  const nav = document.querySelector("[data-site-nav]");
  const header = document.querySelector(".site-header");
  const navCloseButtons = document.querySelectorAll("[data-nav-close]");
  let activeNavTrigger = null;

  if (navToggle && nav && header) {
    const navToggleLabel = navToggle.querySelector("[data-nav-toggle-label]");
    const openLabel = navToggle.getAttribute("data-open-label") || "";
    const closeLabel = navToggle.getAttribute("data-close-label") || openLabel;

    const getNavFocusableElements = () =>
      Array.from(nav.querySelectorAll(focusableSelector)).filter((element) => !element.hasAttribute("hidden"));

    const setNavState = (isOpen) => {
      navToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
      navToggle.setAttribute("aria-label", isOpen ? closeLabel : openLabel);

      if (navToggleLabel) {
        navToggleLabel.textContent = isOpen ? closeLabel : openLabel;
      }

      nav.classList.toggle("is-open", isOpen);
      document.body.classList.toggle("is-nav-open", isOpen);
      setInertState([header], isOpen);

      if (isOpen) {
        window.requestAnimationFrame(() => {
          const firstFocusable = getNavFocusableElements()[0];
          firstFocusable?.focus();
        });
        return;
      }

      if (activeNavTrigger && typeof activeNavTrigger.focus === "function") {
        activeNavTrigger.focus();
      }

      activeNavTrigger = null;
    };

    navToggle.addEventListener("click", () => {
      const expanded = navToggle.getAttribute("aria-expanded") === "true";
      activeNavTrigger = navToggle;
      setNavState(!expanded);
    });

    navCloseButtons.forEach((button) => {
      button.addEventListener("click", () => {
        if (!nav.classList.contains("is-open")) {
          return;
        }

        setNavState(false);
      });
    });

    document.addEventListener("click", (event) => {
      const target = event.target;

      if (!(target instanceof Node) || !nav.classList.contains("is-open")) {
        return;
      }

      if (nav.contains(target) || navToggle.contains(target)) {
        return;
      }

      setNavState(false);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && nav.classList.contains("is-open")) {
        setNavState(false);
      }
    });

    nav.addEventListener("keydown", (event) => {
      if (event.key !== "Tab" || !nav.classList.contains("is-open")) {
        return;
      }

      const focusableElements = getNavFocusableElements();

      if (!focusableElements.length) {
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
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
