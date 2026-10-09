/* ===========================================================================
   WYEA site behaviour: navigation, reveal-on-scroll, the theme toggle on
   /design-system, and the contact form. Progressive enhancement throughout:
   with this file blocked the nav is a plain list of links, every section is
   visible, and the booking link still works.
   ========================================================================= */

(function () {
  "use strict";

  /* ------------------------------------------------------------- nav ---- */

  // MediaQueryList.addEventListener is missing before Safari 14; addListener
  // is its older name. Throwing here would stop every handler below.
  function onMediaChange(mql, fn) {
    if (mql.addEventListener) mql.addEventListener("change", fn);
    else if (mql.addListener) mql.addListener(fn);
  }

  var nav = document.getElementById("nav");
  var toggle = document.getElementById("nav-toggle");

  function setMenu(state) {
    if (!toggle || !nav) return;
    nav.classList.toggle("is-open", state);
    toggle.setAttribute("aria-expanded", String(state));
    document.body.style.overflow = state ? "hidden" : "";
  }

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      setMenu(!nav.classList.contains("is-open"));
    });
    // The mobile menu only exists below 1024px. If the window grows past
    // that with it open, close it so the page can scroll again.
    onMediaChange(window.matchMedia("(min-width: 1024px)"), function (e) {
      if (e.matches) setMenu(false);
    });
  }

  // Dropdown panels: click to open (works on touch), hover to preview on a
  // pointer, Escape to close. Only one panel is ever open.
  var triggers = [].slice.call(document.querySelectorAll("[data-mega]"));
  var hoverable = window.matchMedia("(hover: hover) and (min-width: 1024px)");

  function closeAll(except) {
    triggers.forEach(function (t) {
      if (t === except) return;
      t.setAttribute("aria-expanded", "false");
      var panel = document.getElementById(t.getAttribute("aria-controls"));
      if (panel) panel.hidden = true;
    });
  }

  function open(trigger, state) {
    var panel = document.getElementById(trigger.getAttribute("aria-controls"));
    if (!panel) return;
    if (state) closeAll(trigger);
    trigger.setAttribute("aria-expanded", String(state));
    panel.hidden = !state;
  }

  triggers.forEach(function (trigger) {
    var item = trigger.closest(".nav-item");

    trigger.addEventListener("click", function (e) {
      e.preventDefault();
      // With a pointer hovering, mouseenter has already opened the panel, so
      // a click keeps it open instead of toggling it shut.
      if (hoverable.matches && item && item.matches(":hover")) open(trigger, true);
      else open(trigger, trigger.getAttribute("aria-expanded") !== "true");
    });

    if (item) {
      // A short delay before closing forgives a pointer that cuts a corner
      // on its way from the button to a link in the panel.
      var closing;
      item.addEventListener("mouseenter", function () {
        if (!hoverable.matches) return;
        clearTimeout(closing);
        open(trigger, true);
      });
      item.addEventListener("mouseleave", function () {
        if (!hoverable.matches) return;
        closing = setTimeout(function () { open(trigger, false); }, 250);
      });
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    closeAll();
    if (nav && nav.classList.contains("is-open")) { setMenu(false); toggle.focus(); }
  });

  document.addEventListener("click", function (e) {
    if (!e.target.closest(".nav-item")) closeAll();
  });

  /* -------------------------------------------------------- explorer ---- */

  // A ruled list where one entry is open at a time, optionally paired with a
  // panel of figures that cross-fade to match. Markup carries the first entry
  // already open and every panel present, so with scripting off the section
  // still reads: all the names, the first description, and the first figure.
  [].slice.call(document.querySelectorAll("[data-explorer]")).forEach(function (root) {
    var items = [].slice.call(root.querySelectorAll(".explorer-item"));
    var panels = [].slice.call(root.querySelectorAll(".explorer-panel"));

    function show(index) {
      items.forEach(function (item, i) {
        var open = i === index;
        item.classList.toggle("is-open", open);
        var trigger = item.querySelector(".explorer-trigger");
        if (trigger) trigger.setAttribute("aria-expanded", String(open));
      });
      panels.forEach(function (panel, i) {
        panel.classList.toggle("is-shown", i === index);
      });
    }

    items.forEach(function (item, i) {
      var trigger = item.querySelector(".explorer-trigger");
      if (!trigger) return;
      trigger.addEventListener("click", function () {
        // Clicking the open entry leaves it open: the panel beside it must
        // always show something.
        show(i);
      });
    });

    show(Math.max(0, items.indexOf(root.querySelector(".explorer-item.is-open"))));
  });

  /* ---------------------------------------------------------- reveal ---- */

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var targets = [].slice.call(document.querySelectorAll(".reveal"));

  if (reduced || !("IntersectionObserver" in window)) {
    targets.forEach(function (el) { el.classList.add("is-in"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });

    targets.forEach(function (el) { io.observe(el); });
  }

  // Tells the inline head script that reveal is wired up, so it does not
  // remove .js and fall back to showing everything.
  window.wyeaReady = true;

  /* ----------------------------------------------------------- forms ---- */

  // One token per page load: the Worker treats a repeated token as the same
  // submission, so a double-click or a retry never files a duplicate lead.
  var token = (window.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : Date.now() + "-" + Math.random().toString(16).slice(2);

  var contact = document.getElementById("contact-form");

  // Set to the Cloudflare Turnstile widget sitekey to enable bot verification
  // (the Worker enforces it once TURNSTILE_SECRET is set).
  var TURNSTILE_SITEKEY = "";

  if (contact && TURNSTILE_SITEKEY) {
    var tsBox = contact.querySelector(".cf-turnstile");
    if (tsBox) {
      tsBox.setAttribute("data-sitekey", TURNSTILE_SITEKEY);
      tsBox.setAttribute("data-theme", "dark");
      tsBox.hidden = false;
      var ts = document.createElement("script");
      ts.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      ts.async = true;
      document.head.appendChild(ts);
    }
  }

  if (contact && window.fetch) {
    var cButton = contact.querySelector("button[type=submit]");
    var cStatus = contact.querySelector(".form-status");

    contact.addEventListener("submit", function (e) {
      e.preventDefault();
      cButton.disabled = true;
      cButton.textContent = "Sending…";
      cStatus.textContent = "";

      fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: token,
          name: contact.name.value,
          firm: contact.firm.value,
          email: contact.email.value,
          message: contact.message.value,
          website: contact.website.value,
          turnstile: window.turnstile ? turnstile.getResponse() : undefined
        })
      }).then(function (res) {
        return res.json().then(function (data) {
          if (res.ok && data.ok) {
            contact.hidden = true;
            var ok = document.getElementById("contact-success");
            if (ok) ok.hidden = false;
          } else {
            cFail(data && data.error);
          }
        });
      }).catch(function () { cFail(); });
    });
  }

  function cFail(message) {
    var button = contact.querySelector("button[type=submit]");
    var status = contact.querySelector(".form-status");
    button.disabled = false;
    button.textContent = "Send message";
    status.textContent = message ||
      "Something went wrong on our end. Please try again in a minute.";
    if (window.turnstile) turnstile.reset();
  }

  /* ------------------------------------------------------- demo funnel */

  // /demo: one step at a time, then the answers go to /api/contact as one
  // message and the calendar link is shown. Each step must be answered
  // before Next moves on.
  var demo = document.getElementById("demo-form");

  if (demo && window.fetch) {
    var steps = [].slice.call(demo.querySelectorAll(".funnel-step"));
    var label = demo.querySelector("[data-step-label]");
    var bar = demo.querySelector("[data-step-bar]");
    var back = demo.querySelector("[data-back]");
    var next = demo.querySelector("[data-next]");
    var submit = demo.querySelector("[data-submit]");
    var dStatus = demo.querySelector(".form-status");
    var at = 0;

    function showStep(i) {
      at = i;
      steps.forEach(function (s, n) { s.classList.toggle("is-current", n === i); });
      label.textContent = "Step " + (i + 1) + " of " + steps.length;
      bar.style.width = ((i + 1) / steps.length * 100) + "%";
      back.hidden = i === 0;
      next.hidden = i === steps.length - 1;
      submit.hidden = i !== steps.length - 1;
      dStatus.textContent = "";
      var first = steps[i].querySelector("input:not([type=hidden]), textarea");
      if (first && i > 0) first.focus();
    }

    function stepValid(i) {
      var fields = [].slice.call(steps[i].querySelectorAll("input, textarea")).filter(function (f) { return f.name !== "website"; });
      for (var n = 0; n < fields.length; n++) {
        if (!fields[n].checkValidity()) {
          dStatus.textContent = fields[n].type === "radio" ? "Pick one to continue." : "Please fill this in to continue.";
          if (fields[n].type !== "radio") fields[n].focus();
          return false;
        }
      }
      return true;
    }

    next.addEventListener("click", function () { if (stepValid(at)) showStep(at + 1); });
    back.addEventListener("click", function () { showStep(at - 1); });

    // Picking an answer on a choice step moves on by itself.
    demo.addEventListener("change", function (e) {
      if (e.target.type === "radio" && at < steps.length - 1) setTimeout(function () { showStep(at + 1); }, 180);
    });

    demo.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!stepValid(at)) return;
      var f = demo.elements;
      submit.disabled = true;
      submit.textContent = "Sending\u2026";
      fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: token,
          name: f.name.value,
          firm: f.company.value,
          email: f.email.value,
          message: "Demo request\nRole: " + f.role.value + "\nCompany size: " + f.size.value + "\n\nWhat they want to fix:\n" + f.problem.value,
          website: f.website.value
        })
      }).then(function (res) {
        return res.json().then(function (data) {
          if (res.ok && data.ok) {
            demo.hidden = true;
            document.getElementById("demo-done").hidden = false;
          } else {
            dFail(data && data.error);
          }
        });
      }).catch(function () { dFail(); });
    });

    function dFail(message) {
      submit.disabled = false;
      submit.textContent = "Continue to booking";
      dStatus.textContent = message || "Something went wrong on our end. Please try again in a minute.";
    }

    showStep(0);
  }

  /* ------------------------------------------------------- theme ---- */

  // Only /design-system carries a toggle. It sets data-theme on <html>,
  // which the token layer reads; with no attribute the system setting wins.
  [].slice.call(document.querySelectorAll("[data-theme-set]")).forEach(function (button) {
    button.addEventListener("click", function () {
      var theme = button.getAttribute("data-theme-set");
      if (theme === "system") document.documentElement.removeAttribute("data-theme");
      else document.documentElement.setAttribute("data-theme", theme);
      [].slice.call(document.querySelectorAll("[data-theme-set]")).forEach(function (b) {
        b.setAttribute("aria-pressed", String(b === button));
      });
      document.dispatchEvent(new CustomEvent("themechange"));
    });
  });
})();
