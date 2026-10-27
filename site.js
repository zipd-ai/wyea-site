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

  /* ---------------------------------------------------------- motion ---- */

  // Everything in this block is decoration on top of content that is already
  // in the page. Skipped entirely under prefers-reduced-motion.

  var header = document.querySelector(".site-header");
  function stuck() { if (header) header.classList.toggle("is-scrolled", window.scrollY > 24); }
  stuck();

  var fields = [].slice.call(document.querySelectorAll("[data-field]"));
  var words = [].slice.call(document.querySelectorAll("[data-words]"));
  var progress = [].slice.call(document.querySelectorAll("[data-progress]"));

  // Split the statement into words so each can light up as it is read.
  var lit = words.map(function (el) {
    var spans = el.textContent.trim().split(/\s+/).map(function (word) {
      var span = document.createElement("span");
      span.className = "w";
      span.textContent = word;
      return span;
    });
    el.textContent = "";
    spans.forEach(function (span, i) {
      if (i) el.appendChild(document.createTextNode(" "));
      el.appendChild(span);
    });
    return spans;
  });

  fields.forEach(function (field) {
    [].slice.call(field.querySelectorAll("[data-depth]")).forEach(function (el) {
      el.style.setProperty("--d", el.getAttribute("data-depth"));
    });
  });

  // Ticker: a real pause control (WCAG 2.2.2).
  var tick = document.querySelector(".ticker");
  var tickBtn = document.querySelector(".ticker-pause");
  if (tick && tickBtn) {
    tickBtn.addEventListener("click", function () {
      var on = tickBtn.getAttribute("aria-pressed") !== "true";
      tickBtn.setAttribute("aria-pressed", String(on));
      tickBtn.setAttribute("aria-label", on ? "Play scrolling list" : "Pause scrolling list");
      tick.classList.toggle("is-paused", on);
    });
  }

  // Off-screen light fields stop animating.
  if (!reduced && "IntersectionObserver" in window) {
    var pause = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        [].slice.call(e.target.querySelectorAll(".blob")).forEach(function (b) { b.style.animationPlayState = e.isIntersecting ? "running" : "paused"; });
      });
    });
    [].slice.call(document.querySelectorAll(".lights")).forEach(function (l) { pause.observe(l); });
  }

  var pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  var ticking = false;

  function frame() {
    ticking = false;
    var vh = window.innerHeight;

    pointer.x += (pointer.tx - pointer.x) * 0.08;
    pointer.y += (pointer.ty - pointer.y) * 0.08;

    fields.forEach(function (field) {
      var r = field.getBoundingClientRect();
      if (r.bottom < -100 || r.top > vh + 100) return;
      // -1 to 1 as the section crosses the viewport
      var sy = Math.max(-1, Math.min(1, (r.top + r.height / 2 - vh / 2) / vh));
      field.style.setProperty("--px", pointer.x.toFixed(3));
      field.style.setProperty("--py", pointer.y.toFixed(3));
      field.style.setProperty("--sy", sy.toFixed(3));
    });

    words.forEach(function (el, k) {
      var r = el.getBoundingClientRect();
      var p = (vh * 0.82 - r.top) / (r.height + vh * 0.25);
      var upto = Math.round(Math.max(0, Math.min(1, p)) * lit[k].length);
      lit[k].forEach(function (span, i) { span.classList.toggle("is-lit", i < upto); });
    });

    progress.forEach(function (el) {
      var r = el.getBoundingClientRect();
      var p = Math.max(0, Math.min(1, (vh * 0.85 - r.top) / (r.height + vh * 0.2)));
      el.style.setProperty("--p", p.toFixed(3));
      var items = [].slice.call(el.children);
      items.forEach(function (li, i) { li.classList.toggle("is-on", p >= (i + 0.35) / items.length); });
    });

    if (Math.abs(pointer.tx - pointer.x) > 0.002 || Math.abs(pointer.ty - pointer.y) > 0.002) request();
  }

  function request() {
    if (!ticking) { ticking = true; requestAnimationFrame(frame); }
  }

  if (!reduced) {
    window.addEventListener("scroll", function () { stuck(); request(); }, { passive: true });
    window.addEventListener("resize", request);
    if (window.matchMedia("(hover: hover)").matches) {
      window.addEventListener("pointermove", function (e) {
        pointer.tx = e.clientX / window.innerWidth * 2 - 1;
        pointer.ty = e.clientY / window.innerHeight * 2 - 1;
        request();
      }, { passive: true });
    }
    request();
  } else {
    window.addEventListener("scroll", stuck, { passive: true });
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

/* ------------------------------------------------------------------------
   Firm memory explorer (/explore). Builds a clickable map from the plain
   list of documents in the page, so the page reads the same with scripting
   off. Nodes move between two arrangements; the lines follow them.
   ------------------------------------------------------------------------ */
(function () {
  var root = document.querySelector("[data-memory]");
  if (!root) return;
  var SVG = "http://www.w3.org/2000/svg";
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var bar = root.querySelector(".mem-bar");
  var canvas = root.querySelector(".mem-canvas");
  var svg = root.querySelector(".mem-edges");
  var nodesBox = root.querySelector(".mem-nodes");
  var caption = root.querySelector(".mem-caption");
  var view = root.querySelector(".mem-view");
  var search = root.querySelector("[data-search]");
  var modeButtons = [].slice.call(root.querySelectorAll("[data-mode]"));
  var head = root.querySelector(".pw-head");
  var roleButtons = [].slice.call(root.querySelectorAll("[data-role]"));
  var steps = [].slice.call(root.querySelectorAll(".pw-steps li"));
  var status = root.querySelector(".pw-status");
  var idle = view.innerHTML;

  // The work each role does: which groups of documents sit in front of them.
  var ROLE_GROUPS = {
    underwriting: ["underwriting", "cover"],
    claims: ["claims", "cover"],
    programs: ["programs", "cover"]
  };
  var STEP_TEXT = ["Connected 14 files", "Read each passage", "Linked what amends or cites what", "Answered, with sources", "Waiting for your reviewer"];

  var captions = {
    files: "Files and folders: where each file sits and what it is called. Nothing says what it means.",
    meaning: "What it means: grouped by the work each document serves, linked by what amends or cites what."
  };

  // Drawn icons, one stroke weight, one per kind of document.
  var ICONS = {
    doc: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M9.5 12h5M9.5 15.5h5"/>',
    amend: '<path d="M7 3h7l4 4v14H7z"/><path d="M12 11v6M9 14h6"/>',
    claim: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16"/>',
    clause: '<path d="M10 7C7 7 6 9 6 11v6h5v-5H8c0-2 1-3 2-3zM19 7c-3 0-4 2-4 4v6h5v-5h-3c0-2 1-3 2-3z"/>',
    draft: '<path d="M4 20l1-4L16 5l3 3L8 19zM14 7l3 3"/>',
    list: '<path d="M5 6h14M5 12h14M5 18h9"/>',
    inbox: '<path d="M4 13l3-8h10l3 8v6H4zM4 13h5l1 2h4l1-2h5"/>',
    seal: '<path d="M7 3h7l4 4v14H7z"/><circle cx="12.5" cy="15" r="2.5"/>'
  };
  var ICON_FOR = { "Policy": "doc", "Endorsement": "amend", "Clause library": "clause", "Claim file": "claim", "Note": "list", "Scan": "scan", "Submission": "inbox", "Guideline": "list", "Draft": "draft", "Agreement": "seal", "Form": "seal", "Treaty": "seal" };

  // ---- data, read from the document list
  var nodes = {};
  var order = [];
  [].slice.call(root.querySelectorAll(".doc")).forEach(function (doc) {
    var id = doc.getAttribute("data-id");
    var f = doc.getAttribute("data-f").split(",").map(Number);
    var m = doc.getAttribute("data-m").split(",").map(Number);
    nodes[id] = {
      id: id, doc: doc,
      group: doc.getAttribute("data-group"),
      kind: doc.getAttribute("data-kind"),
      file: doc.getAttribute("data-file"),
      title: doc.querySelector("h3").textContent,
      text: doc.textContent.toLowerCase(),
      pos: { files: f, meaning: m },
      cur: f.slice(), from: f.slice(), neighbours: {}
    };
    order.push(id);
  });

  var pairs = {};
  var edges = [];
  function addEdge(a, b, folder) {
    var key = a < b ? a + "|" + b : b + "|" + a;
    if (pairs[key]) { if (!folder) pairs[key].folder = false; return; }
    pairs[key] = { a: a, b: b, folder: !!folder };
    edges.push(pairs[key]);
  }
  order.forEach(function (id) {
    [].slice.call(nodes[id].doc.querySelectorAll("[data-link]")).forEach(function (a) {
      var other = a.getAttribute("data-link");
      if (!nodes[other]) return;
      addEdge(id, other, false);
      nodes[id].neighbours[other] = true;
      nodes[other].neighbours[id] = true;
    });
  });
  var lastInGroup = {};
  order.forEach(function (id) {
    var g = nodes[id].group;
    if (lastInGroup[g]) addEdge(lastInGroup[g], id, true);
    lastInGroup[g] = id;
  });

  // ---- build the map
  edges.forEach(function (e) {
    var line = document.createElementNS(SVG, "line");
    line.setAttribute("class", "mem-edge" + (e.folder ? " is-folder" : ""));
    svg.appendChild(line);
    e.el = line;
  });

  order.forEach(function (id) {
    var n = nodes[id];
    var b = document.createElement("button");
    b.type = "button";
    b.className = "mem-node";
    b.setAttribute("aria-pressed", "false");
    b.innerHTML = '<span class="mem-node-icon" aria-hidden="true"><svg viewBox="0 0 24 24">' + (ICONS[ICON_FOR[n.kind]] || ICONS.doc) + '</svg></span><span class="mem-node-text"><span class="mem-node-title"></span><span class="mem-node-sub"></span></span>';
    b.addEventListener("click", function () { selectDoc(id, true); });
    nodesBox.appendChild(b);
    n.el = b;
  });

  var state = { mode: "files", doc: null, q: null, query: "", touched: false, role: "all" };
  var raf = 0;

  function place() {
    order.forEach(function (id) {
      var n = nodes[id];
      n.el.style.setProperty("--x", n.cur[0].toFixed(2));
      n.el.style.setProperty("--y", n.cur[1].toFixed(2));
    });
    edges.forEach(function (e) {
      e.el.setAttribute("x1", nodes[e.a].cur[0].toFixed(2));
      e.el.setAttribute("y1", nodes[e.a].cur[1].toFixed(2));
      e.el.setAttribute("x2", nodes[e.b].cur[0].toFixed(2));
      e.el.setAttribute("y2", nodes[e.b].cur[1].toFixed(2));
    });
  }

  function setMode(mode, animate) {
    state.mode = mode;
    canvas.classList.toggle("is-files", mode === "files");
    canvas.classList.toggle("is-meaning", mode === "meaning");
    modeButtons.forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-mode") === mode)); });
    caption.textContent = captions[mode];
    order.forEach(function (id) {
      var n = nodes[id];
      n.el.querySelector(".mem-node-title").textContent = mode === "files" ? n.file : n.title;
      n.el.querySelector(".mem-node-sub").textContent = mode === "files" ? "" : n.kind;
      n.el.setAttribute("aria-label", n.title + ", " + n.kind);
      n.from = n.cur.slice();
    });
    cancelAnimationFrame(raf);
    if (!animate || reduced) {
      order.forEach(function (id) { nodes[id].cur = nodes[id].pos[mode].slice(); });
      place();
      return;
    }
    var start = null, span = 900;
    (function step(t) {
      if (start === null) start = t;
      var p = Math.min(1, (t - start) / span);
      var e = 1 - Math.pow(1 - p, 4);
      order.forEach(function (id) {
        var n = nodes[id], to = n.pos[mode];
        n.cur = [n.from[0] + (to[0] - n.from[0]) * e, n.from[1] + (to[1] - n.from[1]) * e];
      });
      place();
      if (p < 1) raf = requestAnimationFrame(step);
    })(performance.now());
  }

  // ---- focus: which documents are lit
  function paint() {
    var lit = null, hot = null, source = {};
    var q = state.query.trim().toLowerCase();
    if (q) {
      lit = {};
      order.forEach(function (id) { if (nodes[id].text.indexOf(q) !== -1 || nodes[id].file.toLowerCase().indexOf(q) !== -1) lit[id] = true; });
      hot = {};
    } else if (state.q) {
      lit = {}; hot = {};
      state.q.nodes.forEach(function (id) { lit[id] = true; hot[id] = true; source[id] = true; });
    } else if (state.doc) {
      lit = {}; hot = {};
      lit[state.doc] = true; hot[state.doc] = true;
      Object.keys(nodes[state.doc].neighbours).forEach(function (id) { lit[id] = true; });
    }
    var off = {};
    if (!lit && state.role !== "all") {
      order.forEach(function (id) { if (ROLE_GROUPS[state.role].indexOf(nodes[id].group) === -1) off[id] = true; });
    }
    order.forEach(function (id) {
      var el = nodes[id].el;
      el.classList.toggle("is-dim", (!!lit && !lit[id]) || !!off[id]);
      el.classList.toggle("is-source", !!source[id]);
      el.classList.toggle("is-near", !!lit && !!lit[id] && !source[id] && state.doc !== id && !q);
      el.setAttribute("aria-pressed", String(state.doc === id));
    });
    edges.forEach(function (e) {
      var on = !!(hot && (state.q ? (hot[e.a] && hot[e.b]) : (e.a === state.doc || e.b === state.doc)));
      e.el.classList.toggle("is-hot", on && !q);
      e.el.classList.toggle("is-dim", (!!lit && !on) || !!off[e.a] || !!off[e.b]);
    });
  }

  function wireLinks() {
    [].slice.call(view.querySelectorAll("[data-link]")).forEach(function (a) {
      a.addEventListener("click", function (ev) {
        ev.preventDefault();
        selectDoc(a.getAttribute("data-link"), true);
      });
    });
  }

  function showIdle() {
    state.doc = null; state.q = null;
    view.innerHTML = idle;
    wireQuestions();
    runSteps(0);
    paint();
  }

  function backButton(label) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "mem-back";
    b.textContent = label;
    b.addEventListener("click", function () {
      showIdle();
      var first = view.querySelector(".q-btn");
      if (first) first.focus();
    });
    return b;
  }

  function reveal() {
    if (window.matchMedia("(max-width: 1023px)").matches) view.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }

  function selectDoc(id, scroll) {
    state.touched = true;
    if (state.mode !== "meaning") setMode("meaning", true);
    state.doc = id; state.q = null;
    view.innerHTML = "";
    view.appendChild(backButton("Back to questions"));
    var body = document.createElement("div");
    body.className = "doc mem-doc";
    body.innerHTML = nodes[id].doc.innerHTML;
    view.appendChild(body);
    wireLinks();
    paint();
    if (scroll) reveal();
  }

  function askQuestion(li, quiet) {
    state.touched = true;
    if (state.mode !== "meaning") setMode("meaning", true);
    state.doc = null;
    state.q = { key: li.getAttribute("data-q"), nodes: li.getAttribute("data-nodes").split(" ") };
    view.innerHTML = "";
    view.appendChild(backButton("All questions"));
    var asked = document.createElement("p");
    asked.className = "mem-asked";
    asked.textContent = li.querySelector(".q-btn").textContent;
    view.appendChild(asked);
    var ans = document.createElement("div");
    ans.className = "mem-answer";
    ans.innerHTML = li.querySelector(".q-answer").innerHTML;
    view.appendChild(ans);
    var sign = ans.querySelector("[data-signoff]");
    if (sign) sign.addEventListener("click", function () {
      sign.hidden = true;
      ans.querySelector(".a-signed").hidden = false;
      status.textContent = "Signed off by your reviewer";
    });
    wireLinks();
    paint();
    runSteps(5);
    if (!quiet) reveal();
  }

  // The steps a question goes through, lit one after another. Step 0 is the
  // resting state: the files are connected and nothing has been asked.
  var stepTimer = 0;
  function runSteps(upTo) {
    clearTimeout(stepTimer);
    function light(n) {
      steps.forEach(function (li, i) {
        li.classList.toggle("is-done", i < n);
        li.classList.toggle("is-now", i === n - 1 && n > 1);
      });
      status.textContent = n > 0 ? STEP_TEXT[n - 1] : "";
    }
    if (upTo <= 1 || reduced) { light(upTo <= 1 ? 1 : upTo); return; }
    var n = 1;
    light(1);
    (function next() {
      stepTimer = setTimeout(function () { n += 1; light(n); if (n < upTo) next(); }, 320);
    })();
  }

  function applyRole() {
    [].slice.call(view.querySelectorAll(".q")).forEach(function (li) {
      var roles = (li.getAttribute("data-roles") || "all").split(" ");
      li.hidden = roles.indexOf(state.role) === -1;
    });
  }

  function setRole(role) {
    state.touched = true; state.role = role; state.query = ""; search.value = "";
    roleButtons.forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-role") === role)); });
    showIdle();
    if (state.mode !== "meaning") setMode("meaning", true);
    var first = view.querySelector(".q:not([hidden])");
    if (role !== "all" && first) askQuestion(first, true);
  }

  function wireQuestions() {
    applyRole();
    [].slice.call(view.querySelectorAll(".q")).forEach(function (li) {
      li.querySelector(".q-btn").addEventListener("click", function () { askQuestion(li); });
    });
  }

  // ---- controls
  modeButtons.forEach(function (b) {
    b.addEventListener("click", function () { state.touched = true; setMode(b.getAttribute("data-mode"), true); });
  });
  roleButtons.forEach(function (b) {
    b.addEventListener("click", function () { setRole(b.getAttribute("data-role")); });
  });
  search.addEventListener("input", function () { state.query = search.value; paint(); });
  root.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && (state.doc || state.q || state.query)) {
      search.value = ""; state.query = "";
      showIdle();
    }
  });

  // ---- go live
  root.classList.add("is-live");
  bar.hidden = false;
  head.hidden = false;
  canvas.hidden = false;
  runSteps(0);
  setMode("files", false);
  wireQuestions();
  paint();

  // The one authored moment: once the map is in view, the files sort
  // themselves into the work they serve.
  if ("IntersectionObserver" in window) {
    var seen = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      seen.disconnect();
      setTimeout(function () { if (!state.touched && state.mode === "files") setMode("meaning", true); }, 1100);
    }, { threshold: 0.6 });
    seen.observe(canvas);
  }
})();

/* What happens to a document: five steps as tabs. With scripting off every
   step is simply shown one after another. */
(function () {
  [].slice.call(document.querySelectorAll("[data-flow]")).forEach(function (flow) {
    var panels = [].slice.call(flow.querySelectorAll(".flow-panel"));
    var list = document.createElement("div");
    list.className = "flow-tabs";
    list.setAttribute("role", "tablist");
    var tabs = panels.map(function (panel, i) {
      var tab = document.createElement("button");
      tab.type = "button";
      tab.className = "flow-tab";
      tab.id = "flow-tab-" + i;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-controls", "flow-panel-" + i);
      tab.textContent = panel.getAttribute("data-title");
      panel.id = "flow-panel-" + i;
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", tab.id);
      list.appendChild(tab);
      tab.addEventListener("click", function () { show(i, false); });
      tab.addEventListener("keydown", function (ev) {
        var to = ev.key === "ArrowRight" ? i + 1 : ev.key === "ArrowLeft" ? i - 1 : ev.key === "Home" ? 0 : ev.key === "End" ? panels.length - 1 : -1;
        if (to < 0) return;
        ev.preventDefault();
        show((to + panels.length) % panels.length, true);
      });
      return tab;
    });
    function show(n, focus) {
      panels.forEach(function (panel, i) { panel.hidden = i !== n; });
      tabs.forEach(function (tab, i) {
        tab.classList.toggle("is-past", i < n);
        tab.setAttribute("aria-selected", String(i === n));
        tab.tabIndex = i === n ? 0 : -1;
      });
      list.scrollLeft = Math.max(0, tabs[n].offsetLeft - list.clientWidth / 2 + tabs[n].offsetWidth / 2);
      if (focus) tabs[n].focus();
    }
    flow.insertBefore(list, flow.firstChild);
    flow.classList.add("is-flow");
    show(0, false);
  });
})();

/* A "Book a demo" pill that follows the visitor once they have scrolled past
   the first screen. It steps aside on /demo and at the footer. */
(function () {
  var pill = document.querySelector("[data-pill]");
  if (!pill || /^\/demo(\/|$)/.test(location.pathname)) return;
  var footer = document.querySelector(".site-footer");
  var past = false, atFooter = false;
  function sync() {
    var show = past && !atFooter;
    if (show) pill.hidden = false;
    pill.classList.toggle("is-shown", show);
  }
  window.addEventListener("scroll", function () {
    var now = window.scrollY > window.innerHeight * 0.8;
    if (now !== past) { past = now; sync(); }
  }, { passive: true });
  if (footer && "IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      atFooter = entries[0].isIntersecting;
      sync();
    }).observe(footer);
  }
})();
