/* ===========================================================================
   WYEA site behaviour: navigation, reveal-on-scroll, and the two forms.
   Progressive enhancement throughout: with this file blocked the nav is a
   plain list of links, every section is visible, and both forms still post.
   ========================================================================= */

(function () {
  "use strict";

  /* ------------------------------------------------------------- nav ---- */

  var nav = document.getElementById("nav");
  var toggle = document.getElementById("nav-toggle");

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
      document.body.style.overflow = open ? "hidden" : "";
    });
  }

  // Dropdown panels: click to open (works on touch), hover to preview on a
  // pointer, Escape to close. Only one panel is ever open.
  var triggers = [].slice.call(document.querySelectorAll("[data-mega]"));
  var hoverable = window.matchMedia("(hover: hover) and (min-width: 1041px)");

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
      open(trigger, trigger.getAttribute("aria-expanded") !== "true");
    });

    if (item) {
      item.addEventListener("mouseenter", function () {
        if (hoverable.matches) open(trigger, true);
      });
      item.addEventListener("mouseleave", function () {
        if (hoverable.matches) open(trigger, false);
      });
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeAll();
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

  var brief = document.getElementById("brief-form");

  if (brief && window.fetch) {
    var bButton = brief.querySelector("button[type=submit]");
    var bStatus = brief.querySelector(".brief-status");

    brief.addEventListener("submit", function (e) {
      e.preventDefault();
      bButton.disabled = true;
      bButton.textContent = "Subscribing…";
      bStatus.textContent = "";

      fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: brief.email.value,
          website: brief.website.value,
          source: brief.getAttribute("data-source") || "site"
        })
      }).then(function (res) {
        return res.json().then(function (data) {
          if (res.ok && data.ok) {
            brief.querySelector(".brief-row").hidden = true;
            var micro = brief.querySelector(".brief-micro");
            if (micro) micro.hidden = true;
            brief.querySelector(".brief-success").hidden = false;
          } else {
            bFail(data && data.error);
          }
        });
      }).catch(function () { bFail(); });
    });
  }

  function bFail(message) {
    var button = brief.querySelector("button[type=submit]");
    var status = brief.querySelector(".brief-status");
    button.disabled = false;
    button.textContent = "Subscribe";
    status.textContent = message ||
      "Something went wrong on our end. Please try again in a minute.";
  }
})();
