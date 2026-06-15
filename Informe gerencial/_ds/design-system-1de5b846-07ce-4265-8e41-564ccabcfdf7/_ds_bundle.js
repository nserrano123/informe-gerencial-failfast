/* @ds-bundle: {"format":3,"namespace":"DesignSystem_1de5b8","components":[],"sourceHashes":{"uploads/decks/sales-onboarding/deck-stage.js":"d8d952171670","uploads/ui_kits/marketing/Footer.jsx":"403f375c2317","uploads/ui_kits/marketing/Header.jsx":"791da2f66c1c","uploads/ui_kits/marketing/Hero.jsx":"549a68f4a377","uploads/ui_kits/marketing/Integrations.jsx":"a11c6d0f8c63","uploads/ui_kits/marketing/LogoWall.jsx":"cbbe9bf8fc3a","uploads/ui_kits/marketing/Products.jsx":"9bde889f3497","uploads/ui_kits/marketing/WhatsAppCTA.jsx":"3aee84ae1368"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.DesignSystem_1de5b8 = window.DesignSystem_1de5b8 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// uploads/decks/sales-onboarding/deck-stage.js
try { (() => {
/**
 * <deck-stage> — reusable web component for HTML decks.
 *
 * Handles:
 *  (a) speaker notes — reads <script type="application/json" id="speaker-notes">
 *      and posts {slideIndexChanged: N} to the parent window on nav.
 *  (b) keyboard navigation — ←/→, PgUp/PgDn, Space, Home/End, number keys.
 *  (c) press R to reset to slide 0 (with a tasteful keyboard hint).
 *  (d) bottom-center overlay showing slide count + hints, fades out on idle.
 *  (e) auto-scaling — inner canvas is a fixed design size (default 1920×1080)
 *      scaled with `transform: scale()` to fit the viewport, letterboxed.
 *      Set the `noscale` attribute to render at authored size (1:1) — the
 *      PPTX exporter sets this so its DOM capture sees unscaled geometry.
 *  (f) print — `@media print` lays every slide out as its own page at the
 *      design size, so the browser's Print → Save as PDF produces a clean
 *      one-page-per-slide PDF with no extra setup.
 *  (g) thumbnail rail — resizable left-hand column of per-slide thumbnails
 *      (static clones). Click to navigate; ↑/↓ with a thumbnail focused to
 *      step between slides; drag to reorder; right-click for
 *      Skip / Move up / Move down / Delete (opens a Cancel/Delete confirm
 *      dialog). Drag the rail's right edge to resize; width persists to
 *      localStorage. Skipped slides carry `data-deck-skip`, are dimmed in
 *      the rail, omitted from prev/next navigation, and hidden at print.
 *      The rail is suppressed in presenting mode, in the host's Preview
 *      mode (ViewerMode='none'), on `noscale`, and via the `no-rail`
 *      attribute. Rail mutations dispatch a `deckchange`
 *      CustomEvent on the element: detail = {action, from, to, slide}.
 *
 * Slides are HIDDEN, not unmounted. Non-active slides stay in the DOM with
 * `visibility: hidden` + `opacity: 0`, so their state (videos, iframes,
 * form inputs, React trees) is preserved across navigation.
 *
 * Lifecycle event — the component dispatches a `slidechange` CustomEvent on
 * itself whenever the active slide changes (including the initial mount).
 * The event bubbles and composes out of shadow DOM, so you can listen on
 * the <deck-stage> element or on document:
 *
 *   document.querySelector('deck-stage').addEventListener('slidechange', (e) => {
 *     e.detail.index         // new 0-based index
 *     e.detail.previousIndex // previous index, or -1 on init
 *     e.detail.total         // total slide count
 *     e.detail.slide         // the new active slide element
 *     e.detail.previousSlide // the prior slide element, or null on init
 *     e.detail.reason        // 'init' | 'keyboard' | 'click' | 'tap' | 'api'
 *   });
 *
 * Persistence: none at the deck level. The host app keeps the current slide
 * in its own URL (?slide=) and re-delivers it via location.hash on load, so a
 * bare load with no hash always starts at slide 1.
 *
 * Usage:
 *   <style>deck-stage:not(:defined){visibility:hidden}</style>
 *   <deck-stage width="1920" height="1080">
 *     <section data-label="Title">...</section>
 *     <section data-label="Agenda">...</section>
 *   </deck-stage>
 *   <script src="deck-stage.js"></script>
 *
 * The :not(:defined) rule prevents a flash of the first slide at its
 * authored styles before this script runs and attaches the shadow root.
 *
 * Slides are the direct element children of <deck-stage>. Each slide is
 * automatically tagged with:
 *   - data-screen-label="NN Label"   (1-indexed, for comment flow)
 *   - data-om-validate="no_overflowing_text,no_overlapping_text,slide_sized_text"
 */

(() => {
  const DESIGN_W_DEFAULT = 1920;
  const DESIGN_H_DEFAULT = 1080;
  const OVERLAY_HIDE_MS = 1800;
  const VALIDATE_ATTR = 'no_overflowing_text,no_overlapping_text,slide_sized_text';
  const pad2 = n => String(n).padStart(2, '0');

  // Label precedence: data-label → data-screen-label (number stripped) → first heading → "Slide".
  const getSlideLabel = el => {
    const explicit = el.getAttribute('data-label');
    if (explicit) return explicit;
    const existing = el.getAttribute('data-screen-label');
    if (existing) return existing.replace(/^\s*\d+\s*/, '').trim() || existing;
    const h = el.querySelector('h1, h2, h3, [data-title]');
    const t = h && (h.textContent || '').trim().slice(0, 40);
    if (t) return t;
    return 'Slide';
  };
  const stylesheet = `
    :host {
      position: fixed;
      inset: 0;
      display: block;
      background: #000;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif;
      overflow: hidden;
    }
    /* connectedCallback holds this until document.fonts.ready (capped 2s) so
     * the first visible paint has the deck's real typography + final rail
     * layout. opacity (not visibility) so the active slide can't un-hide
     * itself via the ::slotted([data-deck-active]) visibility:visible rule.
     * Only the stage/rail hide — the black :host background stays, so the
     * iframe doesn't flash the page's default white. */
    :host([data-fonts-pending]) .stage,
    :host([data-fonts-pending]) .rail { opacity: 0; pointer-events: none; }

    .stage {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .canvas {
      position: relative;
      transform-origin: center center;
      flex-shrink: 0;
      background: #fff;
      will-change: transform;
    }

    /* Slides live in light DOM (via <slot>) so authored CSS still applies.
       We absolutely position each slotted child to stack them. */
    ::slotted(*) {
      position: absolute !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      box-sizing: border-box !important;
      overflow: hidden;
      opacity: 0;
      pointer-events: none;
      visibility: hidden;
    }
    ::slotted([data-deck-active]) {
      opacity: 1;
      pointer-events: auto;
      visibility: visible;
    }

    /* Tap zones for mobile — back/forward thirds like Stories.
       Transparent, no visible UI, don't block the overlay. */
    .tapzones {
      position: fixed;
      inset: 0;
      display: flex;
      z-index: 2147482000;
      pointer-events: none;
    }
    .tapzone {
      flex: 1;
      pointer-events: auto;
      -webkit-tap-highlight-color: transparent;
    }
    /* Only activate tap zones on coarse pointers (touch devices). */
    @media (hover: hover) and (pointer: fine) {
      .tapzones { display: none; }
    }

    .overlay {
      position: fixed;
      left: 50%;
      bottom: 22px;
      transform: translate(-50%, 6px) scale(0.92);
      filter: blur(6px);
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px;
      background: #000;
      color: #fff;
      border-radius: 999px;
      font-size: 12px;
      font-feature-settings: "tnum" 1;
      letter-spacing: 0.01em;
      opacity: 0;
      pointer-events: none;
      transition: opacity 260ms ease, transform 260ms cubic-bezier(.2,.8,.2,1), filter 260ms ease;
      transform-origin: center bottom;
      z-index: 2147483000;
      user-select: none;
    }
    .overlay[data-visible] {
      opacity: 1;
      pointer-events: auto;
      transform: translate(-50%, 0) scale(1);
      filter: blur(0);
    }

    .btn {
      appearance: none;
      -webkit-appearance: none;
      background: transparent;
      border: 0;
      margin: 0;
      padding: 0;
      color: inherit;
      font: inherit;
      cursor: default;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 28px;
      min-width: 28px;
      border-radius: 999px;
      color: rgba(255,255,255,0.72);
      transition: background 140ms ease, color 140ms ease;
      -webkit-tap-highlight-color: transparent;
    }
    .btn:hover { background: rgba(255,255,255,0.12); color: #fff; }
    .btn:active { background: rgba(255,255,255,0.18); }
    .btn:focus { outline: none; }
    .btn:focus-visible { outline: none; }
    .btn::-moz-focus-inner { border: 0; }
    .btn svg { width: 14px; height: 14px; display: block; }
    .btn.reset {
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.02em;
      padding: 0 10px 0 12px;
      gap: 6px;
      color: rgba(255,255,255,0.72);
    }
    .btn.reset .kbd {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 16px;
      height: 16px;
      padding: 0 4px;
      font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
      font-size: 10px;
      line-height: 1;
      color: rgba(255,255,255,0.88);
      background: rgba(255,255,255,0.12);
      border-radius: 4px;
    }

    .count {
      font-variant-numeric: tabular-nums;
      color: #fff;
      font-weight: 500;
      padding: 0 8px;
      min-width: 42px;
      text-align: center;
      font-size: 12px;
    }
    .count .sep { color: rgba(255,255,255,0.45); margin: 0 3px; font-weight: 400; }
    .count .total { color: rgba(255,255,255,0.55); }

    .divider {
      width: 1px;
      height: 14px;
      background: rgba(255,255,255,0.18);
      margin: 0 2px;
    }

    /* ── Thumbnail rail ──────────────────────────────────────────────────
       Fixed column on the left; each thumbnail is a static deep-clone of
       the light-DOM slide scaled into a 16:9 (or design-aspect) frame. The
       stage re-fits around it (see _fit); hidden during present / noscale
       / print so capture geometry and fullscreen output are unchanged. */
    .rail {
      position: fixed;
      left: 0;
      top: 0;
      bottom: 0;
      width: var(--deck-rail-w, 188px);
      background: #141414;
      border-right: 1px solid rgba(255,255,255,0.08);
      overflow-y: auto;
      overflow-x: hidden;
      padding: 12px 10px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 12px;
      z-index: 2147482500;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.18) transparent;
    }
    .rail::-webkit-scrollbar { width: 8px; }
    .rail::-webkit-scrollbar-track { background: transparent; margin: 2px; }
    .rail::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.18);
      border-radius: 4px;
      border: 2px solid transparent;
      background-clip: content-box;
    }
    .rail::-webkit-scrollbar-thumb:hover {
      background: rgba(255,255,255,0.28);
      border: 2px solid transparent;
      background-clip: content-box;
    }
    :host([no-rail]) .rail,
    :host([noscale]) .rail { display: none; }
    .rail[data-presenting] { display: none; }
    /* User-driven show/hide (the TweaksPanel toggle) slides instead of
       popping. Transitions are gated on :host([data-rail-anim]) — set only
       for the 200ms around the toggle — so window-resize and rail-width
       drag (which also call _fit) don't lag behind the cursor. */
    .rail[data-user-hidden] { transform: translateX(-100%); }
    :host([data-rail-anim]) .rail { transition: transform 200ms cubic-bezier(.3,.7,.4,1); }
    :host([data-rail-anim]) .stage { transition: left 200ms cubic-bezier(.3,.7,.4,1); }
    :host([data-rail-anim]) .canvas { transition: transform 200ms cubic-bezier(.3,.7,.4,1); }
    /* transition shorthand replaces rather than merges — repeat the base
       .overlay opacity/transform/filter transitions so visibility changes
       during the 200ms toggle window still fade instead of popping. */
    :host([data-rail-anim]) .overlay {
      transition: margin-left 200ms cubic-bezier(.3,.7,.4,1),
                  opacity 260ms ease,
                  transform 260ms cubic-bezier(.2,.8,.2,1),
                  filter 260ms ease;
    }
    :host([data-rail-anim]) .tapzones { transition: left 200ms cubic-bezier(.3,.7,.4,1); }

    .thumb {
      position: relative;
      display: flex;
      align-items: flex-start;
      gap: 8px;
      cursor: pointer;
      user-select: none;
    }
    .thumb .num {
      width: 16px;
      flex-shrink: 0;
      font-size: 11px;
      font-weight: 500;
      text-align: right;
      color: rgba(255,255,255,0.55);
      padding-top: 2px;
      font-variant-numeric: tabular-nums;
    }
    .thumb .frame {
      position: relative;
      flex: 1;
      min-width: 0;
      aspect-ratio: var(--deck-aspect);
      background: #fff;
      border-radius: 4px;
      outline: 2px solid transparent;
      outline-offset: 0;
      overflow: hidden;
      transition: outline-color 120ms ease;
    }
    .thumb:hover .frame { outline-color: rgba(255,255,255,0.25); }
    .thumb { outline: none; }
    .thumb:focus-visible .frame { outline-color: rgba(255,255,255,0.5); }
    .thumb[data-current] .num { color: #fff; }
    .thumb[data-current] .frame { outline-color: #D97757; }
    .thumb[data-dragging] { opacity: 0.35; }
    .thumb::before {
      content: '';
      position: absolute;
      left: 24px;
      right: 0;
      height: 3px;
      border-radius: 2px;
      background: #D97757;
      opacity: 0;
      pointer-events: none;
    }
    .thumb[data-drop="before"]::before { top: -8px; opacity: 1; }
    .thumb[data-drop="after"]::before { bottom: -8px; opacity: 1; }
    .thumb[data-skip] .frame { opacity: 0.35; }
    .thumb[data-skip] .frame::after {
      content: 'Skipped';
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,0.45);
      color: #fff;
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 0.04em;
    }

    .ctxmenu {
      position: fixed;
      min-width: 150px;
      padding: 4px;
      background: #242424;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 7px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.45);
      z-index: 2147483100;
      display: none;
      font-size: 12px;
    }
    .ctxmenu[data-open] { display: block; }
    .ctxmenu button {
      display: block;
      width: 100%;
      appearance: none;
      border: 0;
      background: transparent;
      color: #e8e8e8;
      font: inherit;
      text-align: left;
      padding: 6px 10px;
      border-radius: 4px;
      cursor: pointer;
    }
    .ctxmenu button:hover:not(:disabled) { background: rgba(255,255,255,0.08); }
    .ctxmenu button:disabled { opacity: 0.35; cursor: default; }
    .ctxmenu hr {
      border: 0;
      border-top: 1px solid rgba(255,255,255,0.1);
      margin: 4px 2px;
    }

    .rail-resize {
      position: fixed;
      left: calc(var(--deck-rail-w, 188px) - 3px);
      top: 0;
      bottom: 0;
      width: 6px;
      cursor: col-resize;
      z-index: 2147482600;
      touch-action: none;
    }
    .rail-resize:hover,
    .rail-resize[data-dragging] { background: rgba(255,255,255,0.12); }
    :host([no-rail]) .rail-resize,
    :host([noscale]) .rail-resize,
    .rail[data-presenting] + .rail-resize,
    .rail[data-user-hidden] + .rail-resize { display: none; }

    /* Delete-confirm popup — matches the SPA's ConfirmDialog layout
       (title + message body, depressed footer with Cancel / Delete). */
    .confirm-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.45);
      z-index: 2147483200;
      display: none;
      align-items: center;
      justify-content: center;
    }
    .confirm-backdrop[data-open] { display: flex; }
    .confirm {
      width: 320px;
      max-width: calc(100vw - 32px);
      background: #2a2a2a;
      color: #e8e8e8;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 12px;
      box-shadow: 0 12px 32px rgba(0,0,0,0.5);
      overflow: hidden;
      font-family: inherit;
      animation: deck-confirm-in 0.18s ease;
    }
    @keyframes deck-confirm-in {
      from { opacity: 0; transform: scale(0.96); }
      to { opacity: 1; transform: scale(1); }
    }
    .confirm .body { padding: 20px 20px 16px; }
    .confirm .title { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
    .confirm .msg { font-size: 13px; line-height: 1.5; color: rgba(255,255,255,0.65); }
    .confirm .footer {
      padding: 14px 20px;
      background: #1f1f1f;
      border-top: 1px solid rgba(255,255,255,0.08);
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    .confirm button {
      appearance: none;
      font: inherit;
      font-size: 13px;
      font-weight: 500;
      padding: 8px 16px;
      border-radius: 8px;
      cursor: pointer;
    }
    .confirm .cancel {
      background: transparent;
      border: 0;
      color: rgba(255,255,255,0.8);
    }
    .confirm .cancel:hover { background: rgba(255,255,255,0.08); }
    .confirm .danger {
      background: #c96442;
      border: 1px solid rgba(0,0,0,0.15);
      color: #fff;
      box-shadow: 0 1px 3px rgba(166,50,68,0.3), 0 2px 6px rgba(166,50,68,0.18);
    }
    .confirm .danger:hover { background: #b5563a; }

    /* ── Print: one page per slide, no chrome ────────────────────────────
       The screen layout stacks every slide at inset:0 inside a scaled
       canvas; for print we want them in document flow at the authored
       design size so the browser paginates one slide per sheet. The
       @page size is set from the width/height attributes via the inline
       <style id="deck-stage-print-page"> that connectedCallback injects
       into <head> (the @page at-rule has no effect inside shadow DOM). */
    @media print {
      :host {
        position: static;
        inset: auto;
        background: none;
        overflow: visible;
        color: inherit;
      }
      .stage { position: static; display: block; }
      .canvas {
        transform: none !important;
        width: auto !important;
        height: auto !important;
        background: none;
        will-change: auto;
      }
      ::slotted(*) {
        position: relative !important;
        inset: auto !important;
        width: var(--deck-design-w) !important;
        height: var(--deck-design-h) !important;
        box-sizing: border-box !important;
        opacity: 1 !important;
        visibility: visible !important;
        pointer-events: auto;
        break-after: page;
        page-break-after: always;
        break-inside: avoid;
        overflow: hidden;
      }
      /* :last-child alone isn't enough once data-deck-skip hides the
         trailing slide(s) — the last *visible* slide still carries
         break-after:page and prints a blank sheet. _markLastVisible()
         maintains data-deck-last-visible on the last non-skipped slide. */
      ::slotted(*:last-child),
      ::slotted([data-deck-last-visible]) {
        break-after: auto;
        page-break-after: auto;
      }
      ::slotted([data-deck-skip]) { display: none !important; }
      .overlay, .tapzones, .rail, .rail-resize, .ctxmenu, .confirm-backdrop { display: none !important; }
    }
  `;
  class DeckStage extends HTMLElement {
    static get observedAttributes() {
      return ['width', 'height', 'noscale', 'no-rail'];
    }
    constructor() {
      super();
      this._root = this.attachShadow({
        mode: 'open'
      });
      this._index = 0;
      this._slides = [];
      this._notes = [];
      this._hideTimer = null;
      this._mouseIdleTimer = null;
      this._menuIndex = -1;
      this._onKey = this._onKey.bind(this);
      this._onResize = this._onResize.bind(this);
      this._onSlotChange = this._onSlotChange.bind(this);
      this._onMouseMove = this._onMouseMove.bind(this);
      this._onTapBack = this._onTapBack.bind(this);
      this._onTapForward = this._onTapForward.bind(this);
      this._onMessage = this._onMessage.bind(this);
      // Capture-phase close so a click anywhere dismisses the menu, but
      // ignore clicks that land inside the menu itself — otherwise the
      // capture handler runs before the menu's own (bubble) handler and
      // clears _menuIndex out from under it.
      this._onDocClick = e => {
        if (this._menu && e.composedPath && e.composedPath().includes(this._menu)) return;
        this._closeMenu();
      };
    }
    get designWidth() {
      return parseInt(this.getAttribute('width'), 10) || DESIGN_W_DEFAULT;
    }
    get designHeight() {
      return parseInt(this.getAttribute('height'), 10) || DESIGN_H_DEFAULT;
    }
    connectedCallback() {
      // Presenter-view popup loads deckUrl?_snthumb=...#N for its prev/cur/
      // next thumbnails — the rail has no business rendering inside those
      // (wrong scale, and it offsets the stage so the thumb shows a gutter).
      if (/[?&]_snthumb=/.test(location.search)) this.setAttribute('no-rail', '');
      this._render();
      this._loadNotes();
      this._syncPrintPageRule();
      window.addEventListener('keydown', this._onKey);
      window.addEventListener('resize', this._onResize);
      window.addEventListener('mousemove', this._onMouseMove, {
        passive: true
      });
      window.addEventListener('message', this._onMessage);
      window.addEventListener('click', this._onDocClick, true);
      // Initial collection + layout happens via slotchange, which fires on mount.
      this._enableRail();
      // Hold the stage hidden until webfonts are ready so the first visible
      // paint has the deck's real typography — the :not(:defined) guard in
      // the page HTML only covers custom-element upgrade, not font load.
      // Capped so a 404'd font URL can't blank the deck indefinitely.
      this.setAttribute('data-fonts-pending', '');
      const reveal = () => this.removeAttribute('data-fonts-pending');
      // rAF first: fonts.ready is a pre-resolved promise until layout has
      // resolved the slotted text's font-family and pushed a FontFace into
      // 'loading'. Reading it here in connectedCallback (parse-time) would
      // settle the race in a microtask before any font fetch starts.
      requestAnimationFrame(() => {
        Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise(r => setTimeout(r, 2000))]).then(reveal, reveal);
      });
    }
    _enableRail() {
      // Idempotent — older host builds still post __omelette_rail_enabled.
      // no-rail guard keeps the observers/stylesheet walk off the cheap path
      // for presenter-popup thumbnail iframes (up to 9 per view).
      if (this._railEnabled || this.hasAttribute('no-rail')) return;
      this._railEnabled = true;
      // Per-viewer preference — restored alongside rail width. Default on;
      // only a stored '0' (from the TweaksPanel toggle) hides it.
      this._railVisible = true;
      try {
        if (localStorage.getItem('deck-stage.railVisible') === '0') this._railVisible = false;
      } catch (e) {}
      // Live thumbnail updates: watch the light-DOM slides for content
      // edits and re-clone just the affected thumb(s), debounced. Ignore
      // the data-deck-* / data-screen-label / data-om-validate attributes
      // this component itself writes so nav and skip don't trigger
      // spurious refreshes.
      const OWN_ATTRS = /^data-(deck-|screen-label$|om-validate$)/;
      this._liveDirty = new Set();
      this._liveObserver = new MutationObserver(records => {
        for (const r of records) {
          if (r.type === 'attributes' && OWN_ATTRS.test(r.attributeName || '')) continue;
          let n = r.target;
          while (n && n.parentElement !== this) n = n.parentElement;
          if (n && this._slideSet && this._slideSet.has(n)) this._liveDirty.add(n);
        }
        if (this._liveDirty.size && !this._liveTimer) {
          this._liveTimer = setTimeout(() => {
            this._liveTimer = null;
            this._liveDirty.forEach(s => this._refreshThumb(s));
            this._liveDirty.clear();
          }, 200);
        }
      });
      this._liveObserver.observe(this, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true
      });
      // Lazy thumbnail materialization — clone the slide only when its
      // frame scrolls into (or near) the rail viewport. rootMargin gives
      // ~4 thumbs of pre-load so fast scrolling doesn't flash blanks.
      this._railObserver = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (e.isIntersecting && e.target.__deckThumb) {
            this._materialize(e.target.__deckThumb);
          }
        });
      }, {
        root: this._rail,
        rootMargin: '400px 0px'
      });
      // Tweaks typically change CSS vars / attrs OUTSIDE <deck-stage>
      // (on <html>, <body>, a wrapper div, or a <style> tag), which
      // _liveObserver can't see. Re-snapshot author CSS (constructable
      // sheet is shared by reference, so one replaceSync updates every
      // thumb shadow root) and re-sync each thumb host's attrs + custom
      // properties. In-slide DOM mutations are _liveObserver's job.
      // Debounced so slider drags don't thrash.
      this._onTweakChange = () => {
        clearTimeout(this._tweakTimer);
        this._tweakTimer = setTimeout(() => {
          this._snapshotAuthorCss();
          // One getComputedStyle for the whole batch — each
          // getPropertyValue read below reuses the same computed style
          // as long as nothing invalidates layout between thumbs.
          const cs = getComputedStyle(this);
          (this._thumbs || []).forEach(t => {
            if (t.host) this._syncThumbHostAttrs(t.host, cs);
          });
        }, 120);
      };
      window.addEventListener('tweakchange', this._onTweakChange);
      this._snapshotAuthorCss();
      // Build the rail now that it's enabled — slotchange already fired,
      // so _renderRail's early-return skipped the initial build.
      this._syncRailHidden();
      this._renderRail();
      this._fit();
    }

    /** Snapshot document stylesheets into a constructable sheet that each
     *  thumbnail's nested shadow root adopts — so author CSS styles the
     *  cloned slide content without touching this component's chrome.
     *  Cross-origin sheets throw on .cssRules — skip them. Re-callable:
     *  the existing constructable sheet is reused via replaceSync so every
     *  already-adopted shadow root picks up the fresh CSS without re-adopt. */
    _snapshotAuthorCss() {
      // :root in an adopted sheet inside a shadow root matches nothing
      // (only the document root qualifies), so author rules like
      // `:root[data-voice="modern"] .serif` never reach the clones.
      // Rewrite :root → :host and mirror <html>'s data-*/class/lang onto
      // each thumb host (see _syncThumbHostAttrs) so the same selectors
      // match inside the thumbnail's shadow tree.
      const authorCss = Array.from(document.styleSheets).map(sh => {
        try {
          return Array.from(sh.cssRules).map(r => r.cssText).join('\n');
        } catch (e) {
          return '';
        }
      }).join('\n')
      // The shadow host is featureless outside the functional :host(...)
      // form, so any compound on :root — [attr], .class, #id, :pseudo —
      // must become :host(<compound>) not :host<compound>. Same for the
      // html type selector (Tailwind class-strategy dark mode emits
      // html.dark; Pico uses html[data-theme]), which has nothing to
      // match inside the thumb's shadow tree.
      .replace(/:root((?:\[[^\]]*\]|[.#][-\w]+|:[-\w]+(?:\([^)]*\))?)+)/g, ':host($1)').replace(/:root\b/g, ':host').replace(/(^|[\s,>~+(}])html((?:\[[^\]]*\]|[.#][-\w]+|:[-\w]+(?:\([^)]*\))?)+)(?![-\w])/g, '$1:host($2)').replace(/(^|[\s,>~+(}])html(?![-\w])/g, '$1:host');
      // Every custom property the author references. _syncThumbHostAttrs
      // mirrors each one's *computed* value at <deck-stage> onto the
      // thumb host so the live value wins over the :host default above
      // regardless of which ancestor the tweak wrote to (<html>, <body>,
      // a wrapper div, or the deck-stage element itself all inherit
      // down to getComputedStyle(this)).
      this._authorVars = new Set(authorCss.match(/--[\w-]+/g) || []);
      try {
        if (!this._adoptedSheet) this._adoptedSheet = new CSSStyleSheet();
        this._adoptedSheet.replaceSync(authorCss);
      } catch (e) {
        this._adoptedSheet = null;
        this._authorCss = authorCss;
      }
    }
    _syncThumbHostAttrs(host, cs) {
      const de = document.documentElement;
      // setAttribute overwrites but can't delete — an attr removed from
      // <html> (toggleAttribute off, classList emptied) would linger on
      // the host and :host([data-*]) / :host(.foo) rules would keep
      // matching. Remove stale mirrored attrs first; iterate backward
      // because removeAttribute mutates the live NamedNodeMap.
      for (let i = host.attributes.length - 1; i >= 0; i--) {
        const n = host.attributes[i].name;
        if ((n.startsWith('data-') || n === 'class' || n === 'lang') && !de.hasAttribute(n)) {
          host.removeAttribute(n);
        }
      }
      for (const a of de.attributes) {
        if (a.name.startsWith('data-') || a.name === 'class' || a.name === 'lang') {
          host.setAttribute(a.name, a.value);
        }
      }
      // The :root→:host rewrite in _snapshotAuthorCss pins each custom
      // property to its stylesheet default on the thumb host, shadowing
      // the live value that would otherwise inherit. Tweaks can write the
      // live value on any ancestor — <html>, <body>, a wrapper div, the
      // deck-stage element — so read it as the *computed* value at
      // <deck-stage> (which sees the whole inheritance chain) rather than
      // trying to guess which element the author wrote to. Inline on the
      // host beats the :host{} rule. remove-stale covers vars dropped
      // from the stylesheet between snapshots.
      const vars = this._authorVars || new Set();
      for (let i = host.style.length - 1; i >= 0; i--) {
        const p = host.style[i];
        if (p.startsWith('--') && !vars.has(p)) host.style.removeProperty(p);
      }
      const live = cs || getComputedStyle(this);
      vars.forEach(p => {
        const v = live.getPropertyValue(p);
        if (v) host.style.setProperty(p, v.trim());else host.style.removeProperty(p);
      });
    }
    disconnectedCallback() {
      window.removeEventListener('keydown', this._onKey);
      window.removeEventListener('resize', this._onResize);
      window.removeEventListener('mousemove', this._onMouseMove);
      window.removeEventListener('message', this._onMessage);
      window.removeEventListener('click', this._onDocClick, true);
      if (this._hideTimer) clearTimeout(this._hideTimer);
      if (this._mouseIdleTimer) clearTimeout(this._mouseIdleTimer);
      if (this._liveTimer) clearTimeout(this._liveTimer);
      if (this._tweakTimer) clearTimeout(this._tweakTimer);
      if (this._railAnimTimer) clearTimeout(this._railAnimTimer);
      if (this._scaleRaf) cancelAnimationFrame(this._scaleRaf);
      if (this._liveObserver) this._liveObserver.disconnect();
      if (this._railObserver) this._railObserver.disconnect();
      if (this._onTweakChange) window.removeEventListener('tweakchange', this._onTweakChange);
    }
    attributeChangedCallback() {
      if (this._canvas) {
        this._canvas.style.width = this.designWidth + 'px';
        this._canvas.style.height = this.designHeight + 'px';
        this._canvas.style.setProperty('--deck-design-w', this.designWidth + 'px');
        this._canvas.style.setProperty('--deck-design-h', this.designHeight + 'px');
        if (this._rail) {
          this._rail.style.setProperty('--deck-aspect', this.designWidth + '/' + this.designHeight);
        }
        this._fit();
        this._scaleThumbs();
        this._syncPrintPageRule();
      }
    }
    _render() {
      const style = document.createElement('style');
      style.textContent = stylesheet;
      const stage = document.createElement('div');
      stage.className = 'stage';
      const canvas = document.createElement('div');
      canvas.className = 'canvas';
      canvas.style.width = this.designWidth + 'px';
      canvas.style.height = this.designHeight + 'px';
      canvas.style.setProperty('--deck-design-w', this.designWidth + 'px');
      canvas.style.setProperty('--deck-design-h', this.designHeight + 'px');
      const slot = document.createElement('slot');
      slot.addEventListener('slotchange', this._onSlotChange);
      canvas.appendChild(slot);
      stage.appendChild(canvas);

      // Tap zones (mobile): left third = back, right third = forward.
      const tapzones = document.createElement('div');
      tapzones.className = 'tapzones export-hidden';
      tapzones.setAttribute('aria-hidden', 'true');
      tapzones.setAttribute('data-noncommentable', '');
      const tzBack = document.createElement('div');
      tzBack.className = 'tapzone tapzone--back';
      const tzMid = document.createElement('div');
      tzMid.className = 'tapzone tapzone--mid';
      tzMid.style.pointerEvents = 'none';
      const tzFwd = document.createElement('div');
      tzFwd.className = 'tapzone tapzone--fwd';
      tzBack.addEventListener('click', this._onTapBack);
      tzFwd.addEventListener('click', this._onTapForward);
      tapzones.append(tzBack, tzMid, tzFwd);

      // Overlay: compact, solid black, with clickable controls.
      const overlay = document.createElement('div');
      overlay.className = 'overlay export-hidden';
      overlay.setAttribute('role', 'toolbar');
      overlay.setAttribute('aria-label', 'Deck controls');
      overlay.setAttribute('data-noncommentable', '');
      overlay.innerHTML = `
        <button class="btn prev" type="button" aria-label="Previous slide" title="Previous (←)">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3L5 8l5 5"/></svg>
        </button>
        <span class="count" aria-live="polite"><span class="current">1</span><span class="sep">/</span><span class="total">1</span></span>
        <button class="btn next" type="button" aria-label="Next slide" title="Next (→)">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3l5 5-5 5"/></svg>
        </button>
        <span class="divider"></span>
        <button class="btn reset" type="button" aria-label="Reset to first slide" title="Reset (R)">Reset<span class="kbd">R</span></button>
      `;
      overlay.querySelector('.prev').addEventListener('click', () => this._advance(-1, 'click'));
      overlay.querySelector('.next').addEventListener('click', () => this._advance(1, 'click'));
      overlay.querySelector('.reset').addEventListener('click', () => this._go(0, 'click'));

      // Thumbnail rail + context menu. Thumbnails are populated in
      // _renderRail() after _collectSlides().
      const rail = document.createElement('div');
      rail.className = 'rail export-hidden';
      rail.setAttribute('data-noncommentable', '');
      rail.style.setProperty('--deck-aspect', this.designWidth + '/' + this.designHeight);
      // Edge auto-scroll while dragging a thumb near the rail's top/bottom
      // so off-screen drop targets are reachable. Native dragover fires
      // continuously while the pointer is stationary, so a per-event nudge
      // (ramped by edge proximity) is enough — no rAF loop needed.
      rail.addEventListener('dragover', e => {
        if (this._dragFrom == null) return;
        const r = rail.getBoundingClientRect();
        const EDGE = 40;
        const dt = e.clientY - r.top;
        const db = r.bottom - e.clientY;
        if (dt < EDGE) rail.scrollTop -= Math.ceil((EDGE - dt) / 3);else if (db < EDGE) rail.scrollTop += Math.ceil((EDGE - db) / 3);
      });
      const menu = document.createElement('div');
      menu.className = 'ctxmenu export-hidden';
      menu.setAttribute('data-noncommentable', '');
      menu.innerHTML = `
        <button type="button" data-act="skip">Skip slide</button>
        <button type="button" data-act="up">Move up</button>
        <button type="button" data-act="down">Move down</button>
        <hr>
        <button type="button" data-act="delete">Delete slide</button>
      `;
      menu.addEventListener('click', e => {
        const act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
        if (!act) return;
        const i = this._menuIndex;
        this._closeMenu();
        if (act === 'skip') this._toggleSkip(i);else if (act === 'up') this._moveSlide(i, i - 1);else if (act === 'down') this._moveSlide(i, i + 1);else if (act === 'delete') this._openConfirm(i);
      });
      menu.addEventListener('contextmenu', e => e.preventDefault());

      // Rail resize handle — drag to set --deck-rail-w, persisted to
      // localStorage so the width survives reloads.
      const resize = document.createElement('div');
      resize.className = 'rail-resize export-hidden';
      resize.setAttribute('data-noncommentable', '');
      resize.addEventListener('pointerdown', e => {
        e.preventDefault();
        resize.setPointerCapture(e.pointerId);
        resize.setAttribute('data-dragging', '');
        const move = ev => this._setRailWidth(ev.clientX);
        const up = () => {
          resize.removeEventListener('pointermove', move);
          resize.removeEventListener('pointerup', up);
          resize.removeEventListener('pointercancel', up);
          resize.removeAttribute('data-dragging');
          try {
            localStorage.setItem('deck-stage.railWidth', String(this._railPx));
          } catch (err) {}
        };
        resize.addEventListener('pointermove', move);
        resize.addEventListener('pointerup', up);
        resize.addEventListener('pointercancel', up);
      });

      // Delete-confirm dialog — mirrors the SPA's ConfirmDialog layout.
      const confirm = document.createElement('div');
      confirm.className = 'confirm-backdrop export-hidden';
      confirm.setAttribute('data-noncommentable', '');
      confirm.innerHTML = `
        <div class="confirm" role="dialog" aria-modal="true">
          <div class="body">
            <div class="title">Delete slide?</div>
            <div class="msg">This slide will be removed from the deck.</div>
          </div>
          <div class="footer">
            <button type="button" class="cancel">Cancel</button>
            <button type="button" class="danger">Delete</button>
          </div>
        </div>
      `;
      confirm.addEventListener('click', e => {
        if (e.target === confirm) this._closeConfirm();
      });
      confirm.querySelector('.cancel').addEventListener('click', () => this._closeConfirm());
      confirm.querySelector('.danger').addEventListener('click', () => {
        const i = this._confirmIndex;
        this._closeConfirm();
        this._deleteSlide(i);
      });
      this._root.append(style, rail, resize, stage, tapzones, overlay, menu, confirm);
      this._canvas = canvas;
      this._slot = slot;
      this._overlay = overlay;
      this._tapzones = tapzones;
      this._rail = rail;
      this._resize = resize;
      this._menu = menu;
      this._confirm = confirm;
      this._countEl = overlay.querySelector('.current');
      this._totalEl = overlay.querySelector('.total');

      // Restore persisted rail width.
      let rw = 188;
      try {
        const s = localStorage.getItem('deck-stage.railWidth');
        if (s) rw = parseInt(s, 10) || rw;
      } catch (err) {}
      this._setRailWidth(rw);
      this._syncRailHidden();
    }
    _setRailWidth(px) {
      const w = Math.max(120, Math.min(360, Math.round(px)));
      this._railPx = w;
      this.style.setProperty('--deck-rail-w', w + 'px');
      this._fit();
      // _scaleThumbs forces a sync layout (frame.offsetWidth) then writes
      // N transforms. During a resize drag this runs per-pointermove;
      // coalesce to one per frame.
      if (!this._scaleRaf) {
        this._scaleRaf = requestAnimationFrame(() => {
          this._scaleRaf = null;
          this._scaleThumbs();
        });
      }
    }

    /** @page must live in the document stylesheet — it's a no-op inside
     *  shadow DOM. Inject/update a single <head> style tag so the print
     *  sheet matches the design size and Save-as-PDF yields one slide per
     *  page with no margins. */
    _syncPrintPageRule() {
      const id = 'deck-stage-print-page';
      let tag = document.getElementById(id);
      if (!tag) {
        tag = document.createElement('style');
        tag.id = id;
        document.head.appendChild(tag);
      }
      tag.textContent = '@page { size: ' + this.designWidth + 'px ' + this.designHeight + 'px; margin: 0; } ' + '@media print { html, body { margin: 0 !important; padding: 0 !important; background: none !important; overflow: visible !important; height: auto !important; } ' + '* { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }';
    }
    _onSlotChange() {
      // Rail mutations (delete/move) already reconcile synchronously and
      // emit slidechange with reason 'api'; skip the async slotchange that
      // would otherwise re-broadcast with reason 'init'.
      if (this._squelchSlotChange) {
        this._squelchSlotChange = false;
        return;
      }
      this._collectSlides();
      this._restoreIndex();
      this._applyIndex({
        showOverlay: false,
        broadcast: true,
        reason: 'init'
      });
      this._fit();
    }
    _collectSlides() {
      const assigned = this._slot.assignedElements({
        flatten: true
      });
      this._slides = assigned.filter(el => {
        // Skip template/style/script nodes even if someone slots them.
        const tag = el.tagName;
        return tag !== 'TEMPLATE' && tag !== 'SCRIPT' && tag !== 'STYLE';
      });
      this._slideSet = new Set(this._slides);
      this._slides.forEach((slide, i) => {
        const n = i + 1;
        slide.setAttribute('data-screen-label', `${pad2(n)} ${getSlideLabel(slide)}`);

        // Validation attribute for comment flow / auto-checks.
        if (!slide.hasAttribute('data-om-validate')) {
          slide.setAttribute('data-om-validate', VALIDATE_ATTR);
        }
        slide.setAttribute('data-deck-slide', String(i));
      });
      if (this._totalEl) this._totalEl.textContent = String(this._slides.length || 1);
      if (this._index >= this._slides.length) this._index = Math.max(0, this._slides.length - 1);
      this._markLastVisible();
      this._renderRail();
    }

    /** Tag the last non-skipped slide so print CSS can drop its
     *  break-after (see the @media print comment above — :last-child
     *  alone matches a hidden skipped slide). */
    _markLastVisible() {
      let last = null;
      this._slides.forEach(s => {
        s.removeAttribute('data-deck-last-visible');
        if (!s.hasAttribute('data-deck-skip')) last = s;
      });
      if (last) last.setAttribute('data-deck-last-visible', '');
    }
    _loadNotes() {
      const tag = document.getElementById('speaker-notes');
      if (!tag) {
        this._notes = [];
        return;
      }
      try {
        const parsed = JSON.parse(tag.textContent || '[]');
        if (Array.isArray(parsed)) this._notes = parsed;
      } catch (e) {
        console.warn('[deck-stage] Failed to parse #speaker-notes JSON:', e);
        this._notes = [];
      }
    }
    _restoreIndex() {
      // The host's ?slide= param is delivered as a #<int> hash (1-indexed) on
      // the iframe src. No hash → slide 1; the deck itself keeps no position
      // state across loads.
      const h = (location.hash || '').match(/^#(\d+)$/);
      if (h) {
        const n = parseInt(h[1], 10) - 1;
        if (n >= 0 && n < this._slides.length) this._index = n;
      }
    }
    _applyIndex({
      showOverlay = true,
      broadcast = true,
      reason = 'init'
    } = {}) {
      if (!this._slides.length) return;
      const prev = this._prevIndex == null ? -1 : this._prevIndex;
      const curr = this._index;
      // Keep the iframe's own hash in sync so an in-iframe location.reload()
      // (reload banner path in viewer-handle.ts) lands on the current slide,
      // not the stale deep-link hash from initial load.
      try {
        history.replaceState(null, '', '#' + (curr + 1));
      } catch (e) {}
      this._slides.forEach((s, i) => {
        if (i === curr) s.setAttribute('data-deck-active', '');else s.removeAttribute('data-deck-active');
      });
      if (this._countEl) this._countEl.textContent = String(curr + 1);
      // Follow-scroll on every navigation (init deep-link, keyboard, click,
      // tap, external goTo) — the only time we *don't* want the rail to
      // track current is after a rail-internal mutation, where _renderRail
      // has already restored the user's scroll position and yanking back to
      // current would undo it.
      this._syncRail(reason !== 'mutation');
      if (broadcast) {
        // (1) Legacy: host-window postMessage for speaker-notes renderers.
        try {
          window.postMessage({
            slideIndexChanged: curr,
            deckTotal: this._slides.length,
            deckSkipped: this._skippedIndices()
          }, '*');
        } catch (e) {}

        // (2) In-page CustomEvent on the <deck-stage> element itself.
        //     Bubbles and composes out of shadow DOM so slide code can listen:
        //       document.querySelector('deck-stage').addEventListener('slidechange', e => {
        //         e.detail.index, e.detail.previousIndex, e.detail.total, e.detail.slide, e.detail.reason
        //       });
        const detail = {
          index: curr,
          previousIndex: prev,
          total: this._slides.length,
          slide: this._slides[curr] || null,
          previousSlide: prev >= 0 ? this._slides[prev] || null : null,
          reason: reason // 'init' | 'keyboard' | 'click' | 'tap' | 'api'
        };
        this.dispatchEvent(new CustomEvent('slidechange', {
          detail,
          bubbles: true,
          composed: true
        }));
      }
      this._prevIndex = curr;
      if (showOverlay) this._flashOverlay();
    }
    _flashOverlay() {
      // Host posts __omelette_presenting while in fullscreen/tab presentation
      // mode — suppress the nav footer entirely (both hover and slide-change
      // flash) so the audience sees clean slides.
      if (!this._overlay || this._presenting) return;
      this._overlay.setAttribute('data-visible', '');
      if (this._hideTimer) clearTimeout(this._hideTimer);
      this._hideTimer = setTimeout(() => {
        this._overlay.removeAttribute('data-visible');
      }, OVERLAY_HIDE_MS);
    }
    _railWidth() {
      // State-based, no offsetWidth: the first _fit() can run before the
      // rail has had layout on some load paths, and a 0 there paints the
      // slide full-width for one frame before the post-slotchange _fit()
      // corrects it.
      if (!this._railEnabled || !this._railVisible || this.hasAttribute('no-rail') || this.hasAttribute('noscale') || this._presenting || this._previewMode) return 0;
      return this._railPx || 0;
    }
    _fit() {
      if (!this._canvas) return;
      const stage = this._canvas.parentElement;
      // PPTX export sets noscale so the DOM capture sees authored-size
      // geometry — the scaled canvas is in shadow DOM, so the exporter's
      // resetTransformSelector can't reach .canvas.style.transform directly.
      if (this.hasAttribute('noscale')) {
        this._canvas.style.transform = 'none';
        if (stage) stage.style.left = '0';
        if (this._overlay) this._overlay.style.marginLeft = '0';
        if (this._tapzones) this._tapzones.style.left = '0';
        return;
      }
      const rw = this._railWidth();
      if (stage) stage.style.left = rw + 'px';
      // Overlay is centred on the viewport via left:50% + translate(-50%);
      // marginLeft shifts the centre by rw/2 so it lands in the middle of
      // the [rw, innerWidth] stage region. Tapzones just inset from rw.
      if (this._overlay) this._overlay.style.marginLeft = rw / 2 + 'px';
      if (this._tapzones) this._tapzones.style.left = rw + 'px';
      const vw = window.innerWidth - rw;
      const vh = window.innerHeight;
      const s = Math.min(vw / this.designWidth, vh / this.designHeight);
      this._canvas.style.transform = `scale(${s})`;
    }
    _onResize() {
      this._fit();
    }
    _onMouseMove() {
      // Keep overlay visible while mouse moves; hide after idle.
      this._flashOverlay();
    }
    _onMessage(e) {
      const d = e.data;
      if (d && typeof d.__omelette_presenting === 'boolean') {
        this._presenting = d.__omelette_presenting;
        if (this._presenting && this._overlay) {
          this._overlay.removeAttribute('data-visible');
          if (this._hideTimer) clearTimeout(this._hideTimer);
        }
        this._syncRailHidden();
        this._closeMenu();
        this._closeConfirm();
        this._fit();
        this._scaleThumbs();
      }
      // Host's Preview segment (ViewerMode='none'): the rail's drag-reorder /
      // right-click skip-delete affordances are editing chrome, so hide it
      // while the user is just looking at the deck. Same hard-hide path as
      // presenting; independent of the user's _railVisible preference so
      // returning to Edit restores whatever they had.
      if (d && typeof d.__omelette_preview_mode === 'boolean') {
        if (d.__omelette_preview_mode === this._previewMode) return;
        this._previewMode = d.__omelette_preview_mode;
        this._syncRailHidden();
        this._closeMenu();
        this._closeConfirm();
        this._fit();
        this._scaleThumbs();
      }
      // Per-viewer show/hide, driven by the TweaksPanel's auto-injected
      // "Thumbnail rail" toggle (or any author script). Independent of
      // whether the Tweaks panel itself is open — closing the panel
      // doesn't change rail visibility. Persists alongside rail width.
      if (d && d.type === '__deck_rail_visible' && typeof d.on === 'boolean') {
        if (d.on === this._railVisible) return;
        this._railVisible = d.on;
        try {
          localStorage.setItem('deck-stage.railVisible', d.on ? '1' : '0');
        } catch (e) {}
        // Arm the transition, commit it, then flip state — otherwise the
        // browser coalesces both writes and nothing animates on show.
        this.setAttribute('data-rail-anim', '');
        void (this._rail && this._rail.offsetHeight);
        this._syncRailHidden();
        this._fit();
        this._scaleThumbs();
        clearTimeout(this._railAnimTimer);
        this._railAnimTimer = setTimeout(() => this.removeAttribute('data-rail-anim'), 220);
      }
      if (d && d.type === '__omelette_rail_enabled') this._enableRail();
    }
    _syncRailHidden() {
      if (!this._rail) return;
      // data-presenting is the hard hide (display:none) for flag-off,
      // presentation mode, and the host's Preview segment — instant, no
      // transition. data-user-hidden is the soft hide (translateX(-100%))
      // for the viewer's rail toggle, so show/hide slides under
      // :host([data-rail-anim]).
      const hard = !this._railEnabled || this._presenting || this._previewMode;
      if (hard) this._rail.setAttribute('data-presenting', '');else this._rail.removeAttribute('data-presenting');
      if (!this._railVisible) this._rail.setAttribute('data-user-hidden', '');else this._rail.removeAttribute('data-user-hidden');
      // translateX hide leaves thumbs (tabIndex=0) in the tab order —
      // inert keeps them unfocusable while the rail is off-screen.
      this._rail.inert = hard || !this._railVisible;
    }
    _onTapBack(e) {
      e.preventDefault();
      this._advance(-1, 'tap');
    }
    _onTapForward(e) {
      e.preventDefault();
      this._advance(1, 'tap');
    }
    _onKey(e) {
      // Ignore when the user is typing.
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      // Confirm dialog swallows nav keys while open; Escape cancels. Enter
      // is left to the focused button's native activation so Tab→Cancel
      // →Enter activates Cancel, not the window-level confirm path.
      if (this._confirm && this._confirm.hasAttribute('data-open')) {
        if (e.key === 'Escape') {
          this._closeConfirm();
          e.preventDefault();
        }
        return;
      }
      if (e.key === 'Escape' && this._menu && this._menu.hasAttribute('data-open')) {
        this._closeMenu();
        e.preventDefault();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key;
      let handled = true;
      if (key === 'ArrowRight' || key === 'PageDown' || key === ' ' || key === 'Spacebar') {
        this._advance(1, 'keyboard');
      } else if (key === 'ArrowLeft' || key === 'PageUp') {
        this._advance(-1, 'keyboard');
      } else if (key === 'Home') {
        this._go(0, 'keyboard');
      } else if (key === 'End') {
        this._go(this._slides.length - 1, 'keyboard');
      } else if (key === 'r' || key === 'R') {
        this._go(0, 'keyboard');
      } else if (/^[0-9]$/.test(key)) {
        // 1..9 jump to that slide; 0 jumps to 10.
        const n = key === '0' ? 9 : parseInt(key, 10) - 1;
        if (n < this._slides.length) this._go(n, 'keyboard');
      } else {
        handled = false;
      }
      if (handled) {
        e.preventDefault();
        this._flashOverlay();
      }
    }
    _go(i, reason = 'api') {
      if (!this._slides.length) return;
      const clamped = Math.max(0, Math.min(this._slides.length - 1, i));
      if (clamped === this._index) {
        this._flashOverlay();
        return;
      }
      this._index = clamped;
      this._applyIndex({
        showOverlay: true,
        broadcast: true,
        reason
      });
    }

    /** Step forward/back skipping any slide marked data-deck-skip. Falls
     *  back to _go's clamp-at-ends behaviour (flash overlay) when there's
     *  nothing further in that direction. */
    _advance(dir, reason) {
      if (!this._slides.length) return;
      let i = this._index + dir;
      while (i >= 0 && i < this._slides.length && this._slides[i].hasAttribute('data-deck-skip')) {
        i += dir;
      }
      if (i < 0 || i >= this._slides.length) {
        this._flashOverlay();
        return;
      }
      this._go(i, reason);
    }

    // ── Thumbnail rail ────────────────────────────────────────────────────
    //
    // Thumbs are keyed by slide element and reused across _renderRail()
    // calls, so a reorder/delete is an O(changed) DOM shuffle instead of an
    // O(N) teardown-and-re-clone. Each thumb starts as a lightweight shell
    // (num + empty frame); the clone is materialized lazily by an
    // IntersectionObserver when the frame scrolls into (or near) view, so
    // only visible-ish slides pay the clone + image-decode cost.

    _renderRail() {
      if (!this._rail || !this._railEnabled) {
        this._thumbs = [];
        return;
      }
      // FLIP: record each *materialized* thumb's top before the reconcile.
      // Off-screen (non-materialized) thumbs don't need the animation and
      // skipping their getBoundingClientRect saves a forced layout per
      // off-screen thumb on large decks.
      const prevTops = new Map();
      (this._thumbs || []).forEach(({
        thumb,
        slide,
        host
      }) => {
        if (host) prevTops.set(slide, thumb.getBoundingClientRect().top);
      });
      const st = this._rail.scrollTop;

      // Reconcile: reuse thumbs that already exist for a slide, create
      // shells for new slides, drop thumbs for removed slides.
      const bySlide = new Map();
      (this._thumbs || []).forEach(t => bySlide.set(t.slide, t));
      const next = [];
      this._slides.forEach(slide => {
        let t = bySlide.get(slide);
        if (t) bySlide.delete(slide);else t = this._makeThumb(slide);
        next.push(t);
      });
      // Orphans — slides removed since last render.
      bySlide.forEach(t => {
        if (this._railObserver) this._railObserver.unobserve(t.frame);
        t.thumb.remove();
      });
      // Put thumbs into document order to match _slides. insertBefore on
      // an already-correctly-placed node is a no-op, so this is cheap
      // when nothing moved.
      next.forEach((t, i) => {
        const want = t.thumb;
        const at = this._rail.children[i];
        if (at !== want) this._rail.insertBefore(want, at || null);
        t.i = i;
        t.num.textContent = String(i + 1);
        if (t.slide.hasAttribute('data-deck-skip')) t.thumb.setAttribute('data-skip', '');else t.thumb.removeAttribute('data-skip');
      });
      this._thumbs = next;
      this._rail.scrollTop = st;
      if (prevTops.size) {
        const moved = [];
        this._thumbs.forEach(({
          thumb,
          slide
        }) => {
          const old = prevTops.get(slide);
          if (old == null) return;
          const dy = old - thumb.getBoundingClientRect().top;
          if (Math.abs(dy) < 1) return;
          thumb.style.transition = 'none';
          thumb.style.transform = `translateY(${dy}px)`;
          moved.push(thumb);
        });
        if (moved.length) {
          // Commit the inverted positions before flipping the transition
          // on — otherwise the browser coalesces both style writes and
          // nothing animates.
          void this._rail.offsetHeight;
          moved.forEach(t => {
            t.style.transition = 'transform 180ms cubic-bezier(.2,.7,.3,1)';
            t.style.transform = '';
          });
          setTimeout(() => moved.forEach(t => {
            t.style.transition = '';
          }), 220);
        }
      }
      requestAnimationFrame(() => this._scaleThumbs());
      this._syncRail(false);
    }

    /** Create a lightweight thumb shell for one slide. The clone is
     *  materialized later by the IntersectionObserver. Event handlers
     *  look up the thumb's *current* index (via _thumbs.indexOf) so the
     *  same element can be reused across reorders. */
    _makeThumb(slide) {
      const thumb = document.createElement('div');
      thumb.className = 'thumb';
      thumb.tabIndex = 0;
      const num = document.createElement('div');
      num.className = 'num';
      const frame = document.createElement('div');
      frame.className = 'frame';
      thumb.append(num, frame);
      const entry = {
        thumb,
        num,
        frame,
        slide,
        clone: null,
        host: null,
        i: -1
      };
      // entry.i is refreshed on every _renderRail reconcile pass, so
      // handlers read the thumb's current position without an O(N) scan.
      const idx = () => entry.i;
      thumb.addEventListener('click', () => this._go(idx(), 'click'));
      // ↑/↓ step through the rail when a thumb has focus. _go clamps at the
      // ends and _applyIndex→_syncRail scrolls the new current thumb into
      // view; we move focus to it (preventScroll — _syncRail already
      // scrolled) so a held key walks the whole list. stopPropagation keeps
      // this out of the window-level _onKey nav handler.
      thumb.addEventListener('keydown', e => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        e.preventDefault();
        e.stopPropagation();
        this._go(idx() + (e.key === 'ArrowDown' ? 1 : -1), 'keyboard');
        const cur = this._thumbs && this._thumbs[this._index];
        if (cur) cur.thumb.focus({
          preventScroll: true
        });
      });
      thumb.addEventListener('contextmenu', e => {
        e.preventDefault();
        this._openMenu(idx(), e.clientX, e.clientY);
      });
      thumb.draggable = true;
      thumb.addEventListener('dragstart', e => {
        this._dragFrom = idx();
        thumb.setAttribute('data-dragging', '');
        e.dataTransfer.effectAllowed = 'move';
        try {
          e.dataTransfer.setData('text/plain', String(this._dragFrom));
        } catch (err) {}
      });
      thumb.addEventListener('dragend', () => {
        thumb.removeAttribute('data-dragging');
        this._clearDrop();
        this._dragFrom = null;
      });
      thumb.addEventListener('dragover', e => {
        if (this._dragFrom == null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const r = thumb.getBoundingClientRect();
        this._setDrop(idx(), e.clientY < r.top + r.height / 2 ? 'before' : 'after');
      });
      thumb.addEventListener('drop', e => {
        if (this._dragFrom == null) return;
        e.preventDefault();
        const i = idx();
        const r = thumb.getBoundingClientRect();
        let to = e.clientY >= r.top + r.height / 2 ? i + 1 : i;
        if (this._dragFrom < to) to--;
        const from = this._dragFrom;
        this._clearDrop();
        this._dragFrom = null;
        if (to !== from) this._moveSlide(from, to);
      });
      if (this._railObserver) this._railObserver.observe(frame);
      frame.__deckThumb = entry;
      return entry;
    }

    /** Lazily build the clone for a thumb that has scrolled into view. */
    _materialize(entry) {
      if (entry.host) return;
      const dw = this.designWidth,
        dh = this.designHeight;
      let clone = entry.slide.cloneNode(true);
      clone.removeAttribute('id');
      clone.removeAttribute('data-deck-active');
      clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
      // Neuter heavy media; replace <video> with its poster so the box
      // keeps a visual. <iframe>/<audio> become empty placeholders.
      clone.querySelectorAll('iframe, audio, object, embed').forEach(el => {
        el.removeAttribute('src');
        el.removeAttribute('srcdoc');
        el.removeAttribute('data');
        el.innerHTML = '';
      });
      clone.querySelectorAll('video').forEach(el => {
        if (!el.poster) {
          el.removeAttribute('src');
          el.innerHTML = '';
          return;
        }
        const img = document.createElement('img');
        img.src = el.poster;
        img.alt = '';
        img.style.cssText = el.style.cssText + ';object-fit:cover;width:100%;height:100%;';
        img.className = el.className;
        el.replaceWith(img);
      });
      // Images: defer decode and let the browser pick the smallest
      // srcset candidate for the ~140px thumb. Same-URL clones reuse the
      // slide's decoded bitmap (URL-keyed cache), so the remaining cost
      // is paint/composite — lazy+async keeps that off the main thread.
      clone.querySelectorAll('img').forEach(el => {
        el.loading = 'lazy';
        el.decoding = 'async';
        if (el.srcset) el.sizes = (this._railPx || 188) + 'px';
      });
      // Custom elements inside the slide would have their
      // connectedCallback fire when the clone is appended. Replace them
      // with inert boxes so a component-heavy deck doesn't run N copies
      // of each component's mount logic in the rail. Children are
      // preserved so layout-wrapper elements (<my-column><h2>…</h2>)
      // still show their authored content; the querySelectorAll NodeList
      // is static, so nested custom elements in the moved subtree are
      // still visited on later iterations.
      const neuter = el => {
        const box = document.createElement('div');
        box.style.cssText = (el.getAttribute('style') || '') + ';background:rgba(0,0,0,0.06);border:1px dashed rgba(0,0,0,0.15);';
        box.className = el.className;
        // Preserve theming/i18n hooks so [data-*] / :lang() / [dir]
        // descendant selectors still match the neutered root.
        for (const a of el.attributes) {
          const n = a.name;
          if (n.startsWith('data-') || n.startsWith('aria-') || n === 'lang' || n === 'dir' || n === 'role' || n === 'title') {
            box.setAttribute(n, a.value);
          }
        }
        while (el.firstChild) box.appendChild(el.firstChild);
        return box;
      };
      // querySelectorAll('*') returns descendants only — a custom-element
      // slide root (<my-slide>…</my-slide>) would slip through and upgrade
      // on append. Swap the root first.
      if (clone.tagName.includes('-')) clone = neuter(clone);
      clone.querySelectorAll('*').forEach(el => {
        if (el.tagName.includes('-')) el.replaceWith(neuter(el));
      });
      clone.style.cssText += ';position:absolute;top:0;left:0;transform-origin:0 0;' + 'pointer-events:none;width:' + dw + 'px;height:' + dh + 'px;' + 'box-sizing:border-box;overflow:hidden;visibility:visible;opacity:1;';
      const host = document.createElement('div');
      host.style.cssText = 'position:absolute;inset:0;';
      this._syncThumbHostAttrs(host);
      const sr = host.attachShadow({
        mode: 'open'
      });
      if (this._adoptedSheet) sr.adoptedStyleSheets = [this._adoptedSheet];else {
        const st = document.createElement('style');
        st.textContent = this._authorCss || '';
        sr.appendChild(st);
      }
      sr.appendChild(clone);
      entry.frame.appendChild(host);
      entry.host = host;
      entry.clone = clone;
      if (this._thumbScale) clone.style.transform = 'scale(' + this._thumbScale + ')';
      // Once materialized the IO callback is a no-op early-return —
      // unobserve so scroll doesn't keep firing it.
      if (this._railObserver) this._railObserver.unobserve(entry.frame);
    }

    /** Re-clone a single thumb (live-update path). No-op if the thumb
     *  hasn't been materialized yet — it'll pick up current content when
     *  it scrolls into view. */
    _refreshThumb(slide) {
      const entry = (this._thumbs || []).find(t => t.slide === slide);
      if (!entry || !entry.host) return;
      entry.host.remove();
      entry.host = entry.clone = null;
      this._materialize(entry);
    }
    _scaleThumbs() {
      if (!this._thumbs || !this._thumbs.length) return;
      // Every frame is the same width; if it reads 0 the rail is
      // display:none (noscale / no-rail / presenting / print) — leave the
      // clones as-is and re-run when the rail is revealed.
      const fw = this._thumbs[0].frame.offsetWidth;
      if (!fw) return;
      this._thumbScale = fw / this.designWidth;
      this._thumbs.forEach(({
        clone
      }) => {
        if (clone) clone.style.transform = 'scale(' + this._thumbScale + ')';
      });
    }
    _setDrop(i, where) {
      // dragover fires at pointer-event rate; touch only the previous
      // and new target rather than sweeping all N thumbs.
      const t = this._thumbs && this._thumbs[i];
      if (this._dropOn && this._dropOn !== t) {
        this._dropOn.thumb.removeAttribute('data-drop');
      }
      if (t) t.thumb.setAttribute('data-drop', where);
      this._dropOn = t || null;
    }
    _clearDrop() {
      if (this._dropOn) this._dropOn.thumb.removeAttribute('data-drop');
      this._dropOn = null;
    }
    _syncRail(follow) {
      if (!this._thumbs) return;
      this._thumbs.forEach(({
        thumb
      }, i) => {
        if (i === this._index) {
          thumb.setAttribute('data-current', '');
          if (follow && typeof thumb.scrollIntoView === 'function') {
            thumb.scrollIntoView({
              block: 'nearest'
            });
          }
        } else {
          thumb.removeAttribute('data-current');
        }
      });
    }
    _openMenu(i, x, y) {
      if (!this._menu) return;
      this._menuIndex = i;
      const slide = this._slides[i];
      const skip = slide && slide.hasAttribute('data-deck-skip');
      this._menu.querySelector('[data-act="skip"]').textContent = skip ? 'Unskip slide' : 'Skip slide';
      this._menu.querySelector('[data-act="up"]').disabled = i <= 0;
      this._menu.querySelector('[data-act="down"]').disabled = i >= this._slides.length - 1;
      this._menu.querySelector('[data-act="delete"]').disabled = this._slides.length <= 1;
      // Place, then clamp to viewport after it's measurable.
      this._menu.style.left = x + 'px';
      this._menu.style.top = y + 'px';
      this._menu.setAttribute('data-open', '');
      const r = this._menu.getBoundingClientRect();
      const nx = Math.min(x, window.innerWidth - r.width - 4);
      const ny = Math.min(y, window.innerHeight - r.height - 4);
      this._menu.style.left = Math.max(4, nx) + 'px';
      this._menu.style.top = Math.max(4, ny) + 'px';
    }
    _closeMenu() {
      if (this._menu) this._menu.removeAttribute('data-open');
      this._menuIndex = -1;
    }
    _openConfirm(i) {
      if (!this._confirm) return;
      this._confirmIndex = i;
      this._confirm.querySelector('.title').textContent = 'Delete slide ' + (i + 1) + '?';
      this._confirm.setAttribute('data-open', '');
      const btn = this._confirm.querySelector('.danger');
      if (btn && btn.focus) btn.focus();
    }
    _closeConfirm() {
      if (this._confirm) this._confirm.removeAttribute('data-open');
      this._confirmIndex = -1;
    }
    _emitDeckChange(detail) {
      this.dispatchEvent(new CustomEvent('deckchange', {
        detail,
        bubbles: true,
        composed: true
      }));
    }
    _deleteSlide(i) {
      const slide = this._slides[i];
      if (!slide || this._slides.length <= 1) return;
      const wasCurrent = i === this._index;
      if (i < this._index || wasCurrent && i === this._slides.length - 1) this._index--;
      this._squelchSlotChange = true;
      slide.remove();
      this._emitDeckChange({
        action: 'delete',
        from: i,
        slide
      });
      this._collectSlides();
      this._applyIndex({
        showOverlay: true,
        broadcast: true,
        reason: 'mutation'
      });
    }
    _toggleSkip(i) {
      const slide = this._slides[i];
      if (!slide) return;
      const on = !slide.hasAttribute('data-deck-skip');
      if (on) slide.setAttribute('data-deck-skip', '');else slide.removeAttribute('data-deck-skip');
      if (this._thumbs && this._thumbs[i]) {
        if (on) this._thumbs[i].thumb.setAttribute('data-skip', '');else this._thumbs[i].thumb.removeAttribute('data-skip');
      }
      this._markLastVisible();
      this._emitDeckChange({
        action: on ? 'skip' : 'unskip',
        from: i,
        slide
      });
      // Re-broadcast so the presenter popup's prev/next thumbnails re-pick
      // the nearest non-skipped slide without waiting for a nav event.
      try {
        window.postMessage({
          slideIndexChanged: this._index,
          deckTotal: this._slides.length,
          deckSkipped: this._skippedIndices()
        }, '*');
      } catch (e) {}
    }
    _skippedIndices() {
      const out = [];
      for (let i = 0; i < this._slides.length; i++) {
        if (this._slides[i].hasAttribute('data-deck-skip')) out.push(i);
      }
      return out;
    }
    _moveSlide(i, j) {
      if (j < 0 || j >= this._slides.length || j === i) return;
      const slide = this._slides[i];
      const ref = j < i ? this._slides[j] : this._slides[j].nextSibling;
      // Track the active slide across the reorder so the same content
      // stays on screen.
      const cur = this._index;
      if (cur === i) this._index = j;else if (i < cur && j >= cur) this._index = cur - 1;else if (i > cur && j <= cur) this._index = cur + 1;
      this._squelchSlotChange = true;
      this.insertBefore(slide, ref);
      this._emitDeckChange({
        action: 'move',
        from: i,
        to: j,
        slide
      });
      this._collectSlides();
      this._applyIndex({
        showOverlay: false,
        broadcast: true,
        reason: 'mutation'
      });
    }

    // Public API ------------------------------------------------------------

    /** Current slide index (0-based). */
    get index() {
      return this._index;
    }
    /** Total slide count. */
    get length() {
      return this._slides.length;
    }
    /** Programmatically navigate. */
    goTo(i) {
      this._go(i, 'api');
    }
    next() {
      this._advance(1, 'api');
    }
    prev() {
      this._advance(-1, 'api');
    }
    reset() {
      this._go(0, 'api');
    }
  }
  if (!customElements.get('deck-stage')) {
    customElements.define('deck-stage', DeckStage);
  }
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "uploads/decks/sales-onboarding/deck-stage.js", error: String((e && e.message) || e) }); }

// uploads/ui_kits/marketing/Footer.jsx
try { (() => {
/* Footer — mirrors Footer.tsx.
   Top: brand + tagline + country phone form (wraps on mobile)
   Mid: 3 link columns (Product, Company, Resources)
   Bottom: copyright + social icons */

const COUNTRIES = [{
  code: 'CO',
  dial: '+57',
  flag: '🇨🇴'
}, {
  code: 'MX',
  dial: '+52',
  flag: '🇲🇽'
}, {
  code: 'US',
  dial: '+1',
  flag: '🇺🇸'
}, {
  code: 'BR',
  dial: '+55',
  flag: '🇧🇷'
}, {
  code: 'AR',
  dial: '+54',
  flag: '🇦🇷'
}, {
  code: 'CL',
  dial: '+56',
  flag: '🇨🇱'
}, {
  code: 'PE',
  dial: '+51',
  flag: '🇵🇪'
}, {
  code: 'ES',
  dial: '+34',
  flag: '🇪🇸'
}];
const FOOTER_LINKS = [{
  title: 'Product',
  items: [{
    label: 'Modules',
    href: '#products'
  }, {
    label: 'Integrations',
    href: '#integrations'
  }, {
    label: 'Pricing',
    href: '#'
  }, {
    label: 'Changelog',
    href: '#'
  }]
}, {
  title: 'Company',
  items: [{
    label: 'About',
    href: '#'
  }, {
    label: 'Customers',
    href: '#'
  }, {
    label: 'Careers',
    href: '#'
  }, {
    label: 'Press',
    href: '#'
  }]
}, {
  title: 'Resources',
  items: [{
    label: 'Documentation',
    href: '#'
  }, {
    label: 'Help center',
    href: '#'
  }, {
    label: 'Status',
    href: '#'
  }, {
    label: 'Contact',
    href: '#'
  }]
}];
function PhoneCTA() {
  const [country, setCountry] = React.useState(COUNTRIES[0]);
  const [open, setOpen] = React.useState(false);
  const [phone, setPhone] = React.useState('');
  return /*#__PURE__*/React.createElement("form", {
    onSubmit: e => {
      e.preventDefault();
      alert(`Demo request for ${country.dial} ${phone}`);
    },
    style: {
      display: 'flex',
      alignItems: 'stretch',
      gap: 0,
      width: '100%',
      maxWidth: 440,
      background: 'var(--ff-bg)',
      border: '1px solid var(--ff-border)',
      borderRadius: 12,
      overflow: 'hidden',
      boxShadow: 'var(--ff-shadow-sm)',
      fontFamily: 'var(--ff-font-sans)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setOpen(o => !o),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '12px 14px',
      background: 'var(--ff-bg-subtle)',
      border: 0,
      cursor: 'pointer',
      fontSize: 14,
      fontWeight: 500,
      color: 'var(--ff-fg-strong)',
      borderRight: '1px solid var(--ff-border)',
      height: '100%',
      fontFamily: 'var(--ff-font-sans)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 16,
      lineHeight: 1
    }
  }, country.flag), /*#__PURE__*/React.createElement("span", {
    style: {
      fontVariantNumeric: 'tabular-nums'
    }
  }, country.dial), /*#__PURE__*/React.createElement("svg", {
    width: "10",
    height: "10",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.5",
    style: {
      transform: open ? 'rotate(180deg)' : 'rotate(0)',
      transition: 'transform 200ms'
    }
  }, /*#__PURE__*/React.createElement("polyline", {
    points: "6 9 12 15 18 9"
  }))), open && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 'calc(100% + 6px)',
      left: 0,
      zIndex: 10,
      background: 'var(--ff-bg)',
      border: '1px solid var(--ff-border)',
      borderRadius: 10,
      boxShadow: 'var(--ff-shadow-md)',
      minWidth: 180,
      maxHeight: 240,
      overflow: 'auto'
    }
  }, COUNTRIES.map(c => /*#__PURE__*/React.createElement("button", {
    key: c.code,
    type: "button",
    onClick: () => {
      setCountry(c);
      setOpen(false);
    },
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      width: '100%',
      padding: '10px 14px',
      background: 'transparent',
      border: 0,
      cursor: 'pointer',
      fontSize: 14,
      textAlign: 'left',
      color: 'var(--ff-fg-strong)',
      fontFamily: 'var(--ff-font-sans)'
    },
    onMouseEnter: e => e.currentTarget.style.background = 'var(--ff-bg-muted)',
    onMouseLeave: e => e.currentTarget.style.background = 'transparent'
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 16
    }
  }, c.flag), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }, c.code), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ff-fg-subtle)',
      fontVariantNumeric: 'tabular-nums'
    }
  }, c.dial))))), /*#__PURE__*/React.createElement("input", {
    type: "tel",
    required: true,
    value: phone,
    onChange: e => setPhone(e.target.value),
    placeholder: "Phone number",
    style: {
      flex: 1,
      minWidth: 0,
      border: 0,
      padding: '12px 14px',
      fontSize: 14,
      color: 'var(--ff-fg-strong)',
      background: 'transparent',
      outline: 'none',
      fontFamily: 'var(--ff-font-sans)'
    }
  }), /*#__PURE__*/React.createElement("button", {
    type: "submit",
    style: {
      padding: '0 20px',
      border: 0,
      cursor: 'pointer',
      color: '#fff',
      fontWeight: 600,
      background: 'var(--ff-gradient-primary)',
      fontSize: 14,
      fontFamily: 'var(--ff-font-sans)',
      whiteSpace: 'nowrap'
    },
    onMouseEnter: e => e.currentTarget.style.filter = 'brightness(1.05)',
    onMouseLeave: e => e.currentTarget.style.filter = 'brightness(1)'
  }, "Book a demo"));
}
function SocialIcon({
  kind
}) {
  const path = {
    x: /*#__PURE__*/React.createElement("path", {
      d: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
    }),
    linkedin: /*#__PURE__*/React.createElement("path", {
      d: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.063 2.063 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"
    }),
    youtube: /*#__PURE__*/React.createElement("path", {
      d: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"
    }),
    instagram: /*#__PURE__*/React.createElement("path", {
      d: "M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"
    })
  }[kind];
  return /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "currentColor",
    "aria-hidden": "true"
  }, path);
}
function Footer() {
  return /*#__PURE__*/React.createElement("footer", {
    style: {
      borderTop: '1px solid var(--ff-border)',
      background: 'var(--ff-bg)',
      padding: '72px 24px 32px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1280,
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "ff-foot-top",
    style: {
      display: 'grid',
      gridTemplateColumns: '1.2fr 1fr',
      gap: 48,
      alignItems: 'flex-start',
      paddingBottom: 48,
      borderBottom: '1px solid var(--ff-border)'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-horizontal-black.png",
    alt: "Fail Fast",
    style: {
      height: 24,
      width: 'auto',
      display: 'block'
    }
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '16px 0 0',
      maxWidth: 380,
      fontSize: 15,
      lineHeight: 1.55,
      color: 'var(--ff-fg-muted)',
      fontFamily: 'var(--ff-font-sans)'
    }
  }, "The AI-first ERP for operations teams. Plug into your stack, automate the boring, ship the next thing.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: 'var(--ff-fg-strong)',
      fontFamily: 'var(--ff-font-sans)'
    }
  }, "Talk to sales"), /*#__PURE__*/React.createElement(PhoneCTA, null))), /*#__PURE__*/React.createElement("div", {
    className: "ff-foot-cols",
    style: {
      display: 'grid',
      gridTemplateColumns: '2fr repeat(3, 1fr)',
      gap: 48,
      padding: '48px 0'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h4", {
    style: {
      margin: 0,
      fontSize: 13,
      fontWeight: 600,
      color: 'var(--ff-fg-strong)',
      fontFamily: 'var(--ff-font-sans)'
    }
  }, "Made in LATAM, for the world."), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '8px 0 0',
      fontSize: 13,
      color: 'var(--ff-fg-subtle)',
      fontFamily: 'var(--ff-font-sans)'
    }
  }, "Bogot\xE1 \xB7 Mexico City \xB7 Remote-first")), FOOTER_LINKS.map(col => /*#__PURE__*/React.createElement("div", {
    key: col.title
  }, /*#__PURE__*/React.createElement("h4", {
    style: {
      margin: 0,
      fontSize: 12,
      fontWeight: 600,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color: 'var(--ff-fg-subtle)',
      fontFamily: 'var(--ff-font-sans)'
    }
  }, col.title), /*#__PURE__*/React.createElement("ul", {
    style: {
      margin: '16px 0 0',
      padding: 0,
      listStyle: 'none',
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, col.items.map(it => /*#__PURE__*/React.createElement("li", {
    key: it.label
  }, /*#__PURE__*/React.createElement("a", {
    href: it.href,
    style: {
      fontSize: 14,
      color: 'var(--ff-fg-muted)',
      textDecoration: 'none',
      fontFamily: 'var(--ff-font-sans)'
    },
    onMouseEnter: e => e.target.style.color = 'var(--ff-fg-strong)',
    onMouseLeave: e => e.target.style.color = 'var(--ff-fg-muted)'
  }, it.label))))))), /*#__PURE__*/React.createElement("div", {
    className: "ff-foot-bot",
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 24,
      paddingTop: 24,
      borderTop: '1px solid var(--ff-border)',
      fontSize: 13,
      color: 'var(--ff-fg-subtle)',
      fontFamily: 'var(--ff-font-sans)'
    }
  }, /*#__PURE__*/React.createElement("span", null, "\xA9 ", new Date().getFullYear(), " Fail Fast. All rights reserved."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 18,
      color: 'var(--ff-fg-muted)'
    }
  }, ['x', 'linkedin', 'instagram', 'youtube'].map(k => /*#__PURE__*/React.createElement("a", {
    key: k,
    href: "#",
    "aria-label": k,
    style: {
      display: 'inline-flex',
      color: 'inherit',
      transition: 'color 160ms'
    },
    onMouseEnter: e => e.currentTarget.style.color = 'var(--ff-fg-strong)',
    onMouseLeave: e => e.currentTarget.style.color = 'var(--ff-fg-muted)'
  }, /*#__PURE__*/React.createElement(SocialIcon, {
    kind: k
  })))))), /*#__PURE__*/React.createElement("style", null, `
        @media (max-width: 880px) {
          .ff-foot-top { grid-template-columns: 1fr !important; }
          .ff-foot-cols { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 560px) {
          .ff-foot-cols { grid-template-columns: 1fr !important; }
          .ff-foot-bot { flex-direction: column !important; align-items: flex-start !important; }
        }
      `));
}
window.Footer = Footer;
})(); } catch (e) { __ds_ns.__errors.push({ path: "uploads/ui_kits/marketing/Footer.jsx", error: String((e && e.message) || e) }); }

// uploads/ui_kits/marketing/Header.jsx
try { (() => {
/* Header — sticky glass pill, mirrors Header.tsx in the repo.
   - Logo (lockup) + nav (Product, Integrations, Blog)
   - Right side: Language pill (placeholder), Login (ghost), Book a demo (pale blue)
   The "Book a demo" button uses --ff-demo-bg/-fg per repo. */
function Header({
  onLogin,
  onBookDemo,
  lang = 'EN',
  onLang
}) {
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener('scroll', onScroll, {
      passive: true
    });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const pillStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 9999,
    border: `1px solid ${scrolled ? 'rgba(0,0,0,0.12)' : 'var(--ff-border)'}`,
    background: 'rgba(255,255,255,0.92)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    padding: '8px 16px 8px 20px',
    boxShadow: scrolled ? '0 8px 24px -10px rgba(15,15,15,0.16), 0 0 0 1px rgba(15,15,15,0.04)' : 'var(--ff-shadow-sm)',
    transition: 'box-shadow 240ms ease, border-color 240ms ease'
  };
  const navLink = {
    color: 'var(--ff-fg-muted)',
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 500,
    padding: '6px 4px',
    transition: 'color 160ms ease'
  };
  return /*#__PURE__*/React.createElement("header", {
    style: {
      position: 'sticky',
      top: 16,
      zIndex: 50,
      width: '100%'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1280,
      margin: '0 auto',
      padding: '0 24px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: pillStyle
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 24
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      display: 'flex',
      alignItems: 'center',
      flexShrink: 0
    },
    "aria-label": "Fail Fast"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-horizontal-black.png",
    alt: "Fail Fast",
    style: {
      height: 22,
      width: 'auto',
      display: 'block'
    }
  })), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 24
    },
    className: "ff-nav"
  }, /*#__PURE__*/React.createElement("a", {
    href: "#products",
    style: navLink,
    onMouseEnter: e => e.target.style.color = 'var(--ff-fg-strong)',
    onMouseLeave: e => e.target.style.color = 'var(--ff-fg-muted)'
  }, "Product"), /*#__PURE__*/React.createElement("a", {
    href: "#integrations",
    style: navLink,
    onMouseEnter: e => e.target.style.color = 'var(--ff-fg-strong)',
    onMouseLeave: e => e.target.style.color = 'var(--ff-fg-muted)'
  }, "Integrations"), /*#__PURE__*/React.createElement("a", {
    href: "#blog",
    style: navLink,
    onMouseEnter: e => e.target.style.color = 'var(--ff-fg-strong)',
    onMouseLeave: e => e.target.style.color = 'var(--ff-fg-muted)'
  }, "Blog"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onLang,
    "aria-label": "Language",
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '6px 10px',
      border: '1px solid var(--ff-border)',
      borderRadius: 9999,
      background: 'transparent',
      cursor: 'pointer',
      fontSize: 12,
      fontWeight: 600,
      color: 'var(--ff-fg-muted)',
      fontFamily: 'var(--ff-font-sans)'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "10"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"
  })), lang), /*#__PURE__*/React.createElement("button", {
    onClick: onLogin,
    style: {
      padding: '7px 14px',
      background: 'transparent',
      border: 0,
      color: 'var(--ff-fg-muted)',
      fontSize: 14,
      fontWeight: 500,
      borderRadius: 8,
      cursor: 'pointer',
      fontFamily: 'var(--ff-font-sans)'
    },
    onMouseEnter: e => {
      e.target.style.background = 'var(--ff-bg-muted)';
      e.target.style.color = 'var(--ff-fg-strong)';
    },
    onMouseLeave: e => {
      e.target.style.background = 'transparent';
      e.target.style.color = 'var(--ff-fg-muted)';
    }
  }, "Login"), /*#__PURE__*/React.createElement("button", {
    onClick: onBookDemo,
    style: {
      padding: '8px 18px',
      borderRadius: 8,
      border: 0,
      cursor: 'pointer',
      background: 'var(--ff-demo-bg)',
      color: 'var(--ff-demo-fg)',
      fontWeight: 600,
      fontSize: 14,
      fontFamily: 'var(--ff-font-sans)',
      transition: 'background 160ms ease'
    },
    onMouseEnter: e => e.target.style.background = 'var(--ff-demo-bg-hover)',
    onMouseLeave: e => e.target.style.background = 'var(--ff-demo-bg)'
  }, "Book a demo")))));
}
window.Header = Header;
})(); } catch (e) { __ds_ns.__errors.push({ path: "uploads/ui_kits/marketing/Header.jsx", error: String((e && e.message) || e) }); }

// uploads/ui_kits/marketing/Hero.jsx
try { (() => {
/* Hero — mirrors Hero.tsx.
   - Title line 1, then a cycling gradient word, optional title-end line 3
   - Subtitle, then a primary gradient CTA + outlined "Book a demo" with corner brackets
*/
const HERO_WORDS = ['AI First', 'Agent native', 'API first', 'Auto-piloted'];
const CYCLE_MS = 2200;
function CornerOutlineButton({
  children,
  onClick
}) {
  const [hover, setHover] = React.useState(false);
  const cornerBase = {
    position: 'absolute',
    width: 16,
    height: 16,
    pointerEvents: 'none',
    borderColor: 'var(--ff-border)',
    transition: 'all 500ms cubic-bezier(0.22,1,0.36,1)'
  };
  const grow = hover ? '50%' : 16;
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      position: 'relative',
      padding: '18px 32px',
      borderRadius: 10,
      border: '2px solid transparent',
      background: 'transparent',
      cursor: 'pointer',
      fontSize: 18,
      fontWeight: 600,
      color: hover ? 'var(--ff-fg-strong)' : 'var(--ff-fg-muted)',
      fontFamily: 'var(--ff-font-sans)',
      transition: 'color 240ms ease, background 240ms ease',
      backgroundColor: hover ? 'var(--ff-bg-muted)' : 'transparent'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      ...cornerBase,
      top: 0,
      left: 0,
      borderTop: '2px solid',
      borderLeft: '2px solid',
      borderTopLeftRadius: 2,
      height: grow,
      width: grow
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      ...cornerBase,
      top: 0,
      right: 0,
      borderTop: '2px solid',
      borderRight: '2px solid',
      borderTopRightRadius: 2,
      height: grow,
      width: grow
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      ...cornerBase,
      bottom: 0,
      left: 0,
      borderBottom: '2px solid',
      borderLeft: '2px solid',
      borderBottomLeftRadius: 2,
      height: grow,
      width: grow
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      ...cornerBase,
      bottom: 0,
      right: 0,
      borderBottom: '2px solid',
      borderRight: '2px solid',
      borderBottomRightRadius: 2,
      height: grow,
      width: grow
    }
  }), children);
}
function HeroLogos() {
  const logos = [{
    name: 'Alival',
    src: '../../assets/client-alival.png'
  }, {
    name: 'Cine Colombia',
    src: '../../assets/client-cinecolombia.png'
  }, {
    name: 'Emermedica',
    src: '../../assets/client-emermedica.png'
  }, {
    name: 'Telas Real',
    src: '../../assets/client-telasreal.png'
  }, {
    name: 'Okendo',
    src: '../../assets/client-okendo.png'
  }, {
    name: 'SAT',
    src: '../../assets/client-sat.png'
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 48,
      flexWrap: 'wrap',
      marginTop: 48,
      opacity: 0.85
    }
  }, logos.map(l => /*#__PURE__*/React.createElement("img", {
    key: l.name,
    src: l.src,
    alt: l.name,
    style: {
      height: 32,
      width: 'auto',
      objectFit: 'contain',
      filter: 'grayscale(100%)',
      opacity: 0.7,
      transition: 'filter 240ms, opacity 240ms'
    },
    onMouseEnter: e => {
      e.target.style.filter = 'grayscale(0%)';
      e.target.style.opacity = 1;
    },
    onMouseLeave: e => {
      e.target.style.filter = 'grayscale(100%)';
      e.target.style.opacity = 0.7;
    }
  })));
}
function Hero({
  onTry,
  onBookDemo
}) {
  const [wordIdx, setWordIdx] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setWordIdx(i => (i + 1) % HERO_WORDS.length), CYCLE_MS);
    return () => clearInterval(id);
  }, []);
  const widest = HERO_WORDS.reduce((a, b) => b.length > a.length ? b : a, '');
  const word = HERO_WORDS[wordIdx];
  return /*#__PURE__*/React.createElement("section", {
    style: {
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px 24px 64px',
      textAlign: 'center',
      fontFamily: 'var(--ff-font-sans)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 960,
      width: '100%'
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontSize: 'clamp(40px, 6vw, 76px)',
      fontWeight: 700,
      lineHeight: 1.08,
      letterSpacing: '-0.02em',
      color: 'var(--ff-fg-strong)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      marginBottom: 8
    }
  }, "Build operations that are"), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'relative',
      display: 'inline-block',
      overflow: 'hidden',
      lineHeight: 1.1,
      height: '1.1em',
      verticalAlign: 'top'
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      visibility: 'hidden',
      display: 'block',
      whiteSpace: 'nowrap'
    }
  }, widest), /*#__PURE__*/React.createElement("span", {
    key: word,
    style: {
      position: 'absolute',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      whiteSpace: 'nowrap',
      backgroundImage: 'var(--ff-gradient-hero-text)',
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      color: 'transparent',
      animation: 'ff-word-up 500ms cubic-bezier(0.22,1,0.36,1)'
    }
  }, word))), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '24px auto 0',
      maxWidth: 600,
      fontSize: 'clamp(16px, 1.4vw, 20px)',
      lineHeight: 1.5,
      color: 'var(--ff-fg-muted)'
    }
  }, "ERPs have always required long, expensive consulting projects. That's why we built one you can customize with AI."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      flexWrap: 'wrap',
      marginTop: 36,
      marginBottom: 24
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onTry,
    style: {
      padding: '18px 32px',
      border: 0,
      borderRadius: 10,
      color: '#fff',
      fontSize: 18,
      fontWeight: 600,
      cursor: 'pointer',
      backgroundImage: 'var(--ff-gradient-primary-strong)',
      boxShadow: '0 10px 25px -5px rgba(67,97,255,0.4)',
      fontFamily: 'var(--ff-font-sans)',
      transition: 'filter 200ms ease'
    },
    onMouseEnter: e => e.currentTarget.style.filter = 'brightness(1.1)',
    onMouseLeave: e => e.currentTarget.style.filter = 'brightness(1)'
  }, "Try it Now"), /*#__PURE__*/React.createElement(CornerOutlineButton, {
    onClick: onBookDemo
  }, "Book a demo")), /*#__PURE__*/React.createElement(HeroLogos, null)), /*#__PURE__*/React.createElement("style", null, `
        @keyframes ff-word-up {
          0% { transform: translateY(100%); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
      `));
}
window.Hero = Hero;
})(); } catch (e) { __ds_ns.__errors.push({ path: "uploads/ui_kits/marketing/Hero.jsx", error: String((e && e.message) || e) }); }

// uploads/ui_kits/marketing/Integrations.jsx
try { (() => {
/* Integrations — flat node-canvas style: 4-col grid of integration tiles
   on a soft-grid background with curved SVG connectors between selected pairs.
   Static recreation of the live ReactFlow canvas in the repo. */

const INTEGRATIONS = [{
  id: 'dian',
  name: 'DIAN Colombia',
  icon: '../../assets/int-dian.png'
}, {
  id: 'banco',
  name: 'Bancolombia',
  icon: '../../assets/int-bancolombia.png'
}, {
  id: 'whatsapp',
  name: 'WhatsApp',
  icon: '../../assets/int-whatsapp.webp'
}, {
  id: 'shopify',
  name: 'Shopify',
  icon: '../../assets/int-shopify.png'
}, {
  id: 'rappi',
  name: 'Rappi',
  icon: '../../assets/int-rappi.png'
}, {
  id: 'excel',
  name: 'Excel',
  icon: '../../assets/int-excel.png'
}, {
  id: 'sheets',
  name: 'Google Sheets',
  icon: '../../assets/int-google-sheets.png'
}, {
  id: 'teams',
  name: 'Microsoft Teams',
  icon: '../../assets/int-teams.png'
}, {
  id: 'notion',
  name: 'Notion',
  icon: '../../assets/int-notion.png'
}, {
  id: 'n8n',
  name: 'N8N',
  icon: '../../assets/int-n8n.png'
}, {
  id: 'chatgpt',
  name: 'ChatGPT',
  icon: '../../assets/int-chatgpt.png'
}, {
  id: 'truora',
  name: 'Truora',
  icon: '../../assets/int-truora.jpeg'
}];

/* (col, row) coords — 4x3 grid */
const POS = {
  dian: [0, 0],
  banco: [1, 0],
  whatsapp: [2, 0],
  shopify: [3, 0],
  rappi: [0, 1],
  excel: [1, 1],
  sheets: [2, 1],
  teams: [3, 1],
  notion: [0, 2],
  n8n: [1, 2],
  chatgpt: [2, 2],
  truora: [3, 2]
};
const EDGES = [['dian', 'excel'], ['whatsapp', 'sheets'], ['excel', 'n8n'], ['teams', 'truora'], ['shopify', 'sheets'], ['notion', 'chatgpt']];
const CARD_W = 168;
const CARD_H = 140;
const COL_GAP = 220;
const ROW_GAP = 190;
function IntegrationsCanvas() {
  const innerW = 3 * COL_GAP + CARD_W;
  const innerH = 2 * ROW_GAP + CARD_H;
  const [hovered, setHovered] = React.useState(null);
  const cx = col => col * COL_GAP + CARD_W / 2;
  const cy = row => row * ROW_GAP + CARD_H / 2;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: '100%',
      height: 560,
      overflow: 'hidden',
      borderRadius: 24,
      border: '1px solid var(--ff-border)',
      background: 'var(--ff-bg-subtle)',
      backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.06) 1px, transparent 1px)',
      backgroundSize: '24px 24px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: innerW,
      height: innerH
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: innerW,
    height: innerH,
    style: {
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      overflow: 'visible'
    }
  }, EDGES.map(([a, b], i) => {
    const [c1, r1] = POS[a];
    const [c2, r2] = POS[b];
    const x1 = cx(c1),
      y1 = cy(r1) + CARD_H / 2;
    const x2 = cx(c2),
      y2 = cy(r2) - CARD_H / 2;
    const my = (y1 + y2) / 2;
    const path = `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`;
    return /*#__PURE__*/React.createElement("path", {
      key: i,
      d: path,
      stroke: "var(--ff-border)",
      strokeWidth: "2",
      fill: "none"
    });
  })), INTEGRATIONS.map(int => {
    const [col, row] = POS[int.id];
    const dim = hovered && hovered !== int.id ? 0.6 : 1;
    return /*#__PURE__*/React.createElement("div", {
      key: int.id,
      onMouseEnter: () => setHovered(int.id),
      onMouseLeave: () => setHovered(null),
      style: {
        position: 'absolute',
        left: col * COL_GAP,
        top: row * ROW_GAP,
        width: CARD_W,
        height: CARD_H,
        borderRadius: 16,
        background: 'var(--ff-bg)',
        border: `1px solid ${hovered === int.id ? 'var(--ff-fg-faint)' : 'var(--ff-border)'}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 20,
        textAlign: 'center',
        boxShadow: hovered === int.id ? 'var(--ff-shadow-md)' : 'var(--ff-shadow-sm)',
        opacity: dim,
        transition: 'opacity 200ms, box-shadow 200ms, border-color 200ms',
        cursor: 'default'
      }
    }, /*#__PURE__*/React.createElement("img", {
      src: int.icon,
      alt: int.name,
      width: 56,
      height: 56,
      style: {
        width: 56,
        height: 56,
        objectFit: 'contain'
      },
      draggable: false
    }), /*#__PURE__*/React.createElement("h3", {
      style: {
        margin: 0,
        fontSize: 14,
        fontWeight: 500,
        letterSpacing: '-0.01em',
        color: 'var(--ff-fg-strong)',
        fontFamily: 'var(--ff-font-sans)'
      }
    }, int.name), /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'absolute',
        top: -5,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 10,
        height: 10,
        borderRadius: 5,
        background: 'var(--ff-bg)',
        border: '1px solid var(--ff-border)'
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'absolute',
        bottom: -5,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 10,
        height: 10,
        borderRadius: 5,
        background: 'var(--ff-bg)',
        border: '1px solid var(--ff-border)'
      }
    }));
  })));
}
function Integrations() {
  return /*#__PURE__*/React.createElement("section", {
    id: "integrations",
    style: {
      padding: '64px 24px 96px',
      background: 'rgba(250,250,250,0.5)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1280,
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement("header", {
    style: {
      maxWidth: 720,
      margin: '0 auto 40px',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      padding: '6px 14px',
      borderRadius: 9999,
      border: '1px solid var(--ff-border)',
      background: 'var(--ff-bg)',
      fontSize: 11,
      fontWeight: 500,
      letterSpacing: '0.18em',
      textTransform: 'uppercase',
      color: 'var(--ff-fg-subtle)',
      boxShadow: 'var(--ff-shadow-sm)',
      fontFamily: 'var(--ff-font-sans)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'relative',
      display: 'inline-flex',
      width: 6,
      height: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 3,
      background: 'var(--ff-primary)',
      opacity: 0.6,
      animation: 'ff-ping 1.6s cubic-bezier(0,0,0.2,1) infinite'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'relative',
      width: 6,
      height: 6,
      borderRadius: 3,
      background: 'var(--ff-primary)'
    }
  })), "Integrations"), /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: '24px 0 0',
      fontSize: 'clamp(36px, 5vw, 60px)',
      fontWeight: 600,
      lineHeight: 1.05,
      letterSpacing: '-0.03em',
      color: 'var(--ff-fg-strong)',
      fontFamily: 'var(--ff-font-sans)'
    }
  }, "Plug into the tools your team already uses."), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '20px auto 0',
      maxWidth: 560,
      fontSize: 18,
      lineHeight: 1.6,
      color: 'var(--ff-fg-subtle)',
      fontFamily: 'var(--ff-font-sans)'
    }
  }, "Connect banks, government APIs, productivity suites and AI agents \u2014 visually, no code."), /*#__PURE__*/React.createElement("div", {
    style: {
      margin: '32px auto 0',
      height: 1,
      width: 96,
      background: 'linear-gradient(to right, transparent, var(--ff-border), transparent)'
    }
  })), /*#__PURE__*/React.createElement(IntegrationsCanvas, null)), /*#__PURE__*/React.createElement("style", null, `
        @keyframes ff-ping {
          75%, 100% { transform: scale(2.5); opacity: 0; }
        }
      `));
}
window.Integrations = Integrations;
})(); } catch (e) { __ds_ns.__errors.push({ path: "uploads/ui_kits/marketing/Integrations.jsx", error: String((e && e.message) || e) }); }

// uploads/ui_kits/marketing/LogoWall.jsx
try { (() => {
/* LogoWall — standalone client logo grid section. Use anywhere. */

const LOGO_WALL_DATA = [{
  name: 'Alival',
  src: '../../assets/client-alival.png'
}, {
  name: 'Cine Colombia',
  src: '../../assets/client-cinecolombia.png'
}, {
  name: 'Emermedica',
  src: '../../assets/client-emermedica.png'
}, {
  name: 'Telas Real',
  src: '../../assets/client-telasreal.png'
}, {
  name: 'Okendo',
  src: '../../assets/client-okendo.png'
}, {
  name: 'SAT',
  src: '../../assets/client-sat.png'
}];
function LogoWall({
  title = 'Trusted by teams across LATAM'
}) {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      padding: '64px 24px',
      background: 'var(--ff-bg-subtle)',
      borderTop: '1px solid var(--ff-border)',
      borderBottom: '1px solid var(--ff-border)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1280,
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      textAlign: 'center',
      margin: '0 0 32px',
      fontSize: 12,
      fontWeight: 600,
      letterSpacing: '0.18em',
      textTransform: 'uppercase',
      color: 'var(--ff-fg-subtle)',
      fontFamily: 'var(--ff-font-sans)'
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gap: 24,
      alignItems: 'center',
      justifyItems: 'center',
      gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))'
    }
  }, LOGO_WALL_DATA.map(l => /*#__PURE__*/React.createElement("img", {
    key: l.name,
    src: l.src,
    alt: l.name,
    style: {
      height: 36,
      maxWidth: 160,
      width: 'auto',
      objectFit: 'contain',
      filter: 'grayscale(100%)',
      opacity: 0.65,
      transition: 'filter 240ms, opacity 240ms'
    },
    onMouseEnter: e => {
      e.target.style.filter = 'grayscale(0%)';
      e.target.style.opacity = 1;
    },
    onMouseLeave: e => {
      e.target.style.filter = 'grayscale(100%)';
      e.target.style.opacity = 0.65;
    }
  })))));
}
window.LogoWall = LogoWall;
})(); } catch (e) { __ds_ns.__errors.push({ path: "uploads/ui_kits/marketing/LogoWall.jsx", error: String((e && e.message) || e) }); }

// uploads/ui_kits/marketing/Products.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Products — bento 12-col with watermark icons, stacked rows, bar stacks.
   Mirrors Products.tsx structure. Uses inline SVG icons (no external lib). */

const PROD_LIGHT = {
  card: 'var(--ff-bg)',
  cardHover: 'var(--ff-bg-muted)',
  innerBorder: 'var(--ff-border)',
  innerBg: 'var(--ff-bg-subtle)',
  title: 'var(--ff-fg-strong)',
  body: 'var(--ff-fg-muted)',
  muted: 'var(--ff-fg-subtle)',
  faint: 'var(--ff-border)',
  accent: 'var(--ff-primary)',
  accentSoft: 'rgba(67,97,255,0.12)'
};

/* Tiny inline icon set — strokes only, currentColor */
const Icn = (path, size = 18) => props => /*#__PURE__*/React.createElement("svg", {
  width: props.size || size,
  height: props.size || size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: props.strokeWidth || 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  style: props.style
}, path);
const I = {
  Calculator: Icn(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
    x: "4",
    y: "2",
    width: "16",
    height: "20",
    rx: "2"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "8",
    y1: "6",
    x2: "16",
    y2: "6"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "16",
    y1: "14",
    x2: "16",
    y2: "18"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M16 10h.01M12 10h.01M8 10h.01M12 14h.01M8 14h.01M12 18h.01M8 18h.01"
  }))),
  Landmark: Icn(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("line", {
    x1: "3",
    y1: "22",
    x2: "21",
    y2: "22"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "6",
    y1: "18",
    x2: "6",
    y2: "11"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "10",
    y1: "18",
    x2: "10",
    y2: "11"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "14",
    y1: "18",
    x2: "14",
    y2: "11"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "18",
    y1: "18",
    x2: "18",
    y2: "11"
  }), /*#__PURE__*/React.createElement("polygon", {
    points: "12 2 20 7 4 7"
  }))),
  ShoppingCart: Icn(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "9",
    cy: "21",
    r: "1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "20",
    cy: "21",
    r: "1"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"
  }))),
  Package: Icn(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M16.5 9.4 7.55 4.24"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m3.27 6.96 8.73 5.05 8.73-5.05"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "12",
    y1: "22.08",
    x2: "12",
    y2: "12"
  }))),
  Wrench: Icn(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
  }))),
  FileText: Icn(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
  }), /*#__PURE__*/React.createElement("polyline", {
    points: "14 2 14 8 20 8"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "16",
    y1: "13",
    x2: "8",
    y2: "13"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "16",
    y1: "17",
    x2: "8",
    y2: "17"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "10",
    y1: "9",
    x2: "8",
    y2: "9"
  }))),
  HandCoins: Icn(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M11 15h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 17"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m7 21 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m2 16 6 6"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "16",
    cy: "9",
    r: "2.9"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "6",
    cy: "5",
    r: "3"
  }))),
  Users: Icn(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "9",
    cy: "7",
    r: "4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M23 21v-2a4 4 0 0 0-3-3.87"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M16 3.13a4 4 0 0 1 0 7.75"
  }))),
  Building2: Icn(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M6 12H4a2 2 0 0 0-2 2v8h4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M18 9h2a2 2 0 0 1 2 2v11h-4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M10 6h4M10 10h4M10 14h4M10 18h4"
  }))),
  Play: Icn(/*#__PURE__*/React.createElement("polygon", {
    points: "5 3 19 12 5 21 5 3"
  })),
  Check: Icn(/*#__PURE__*/React.createElement("polyline", {
    points: "20 6 9 17 4 12"
  }))
};

/* Watermark icon stack — concentric rounded squares behind a big icon */
function Watermark({
  Icon
}) {
  return /*#__PURE__*/React.createElement("div", {
    "aria-hidden": "true",
    style: {
      position: 'absolute',
      right: -24,
      bottom: -24,
      width: 320,
      height: 320,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      pointerEvents: 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 220,
      height: 220,
      borderRadius: 40,
      position: 'relative',
      border: `1px solid ${PROD_LIGHT.faint}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: -16,
      borderRadius: 48,
      border: `1px solid ${PROD_LIGHT.innerBorder}`
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: -34,
      borderRadius: 56,
      border: `1px solid ${PROD_LIGHT.innerBorder}`,
      opacity: 0.6
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: -54,
      borderRadius: 64,
      border: `1px solid ${PROD_LIGHT.innerBorder}`,
      opacity: 0.3
    }
  }), /*#__PURE__*/React.createElement(Icon, {
    size: 108,
    strokeWidth: 1.2,
    style: {
      color: PROD_LIGHT.body
    }
  })));
}
function MiniRow({
  left,
  right,
  accent
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 12px',
      borderRadius: 8,
      gap: 12,
      background: PROD_LIGHT.innerBg,
      border: `1px solid ${PROD_LIGHT.innerBorder}`,
      fontSize: 12,
      fontFamily: 'var(--ff-font-mono)',
      color: PROD_LIGHT.body
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: PROD_LIGHT.muted,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, left), /*#__PURE__*/React.createElement("span", {
    style: {
      color: accent ? PROD_LIGHT.accent : PROD_LIGHT.title,
      whiteSpace: 'nowrap',
      fontVariantNumeric: 'tabular-nums'
    }
  }, right));
}
function StackedRows({
  rows
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 24,
      right: 24,
      bottom: 24,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      maskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)',
      WebkitMaskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)'
    }
  }, rows.map((r, i) => /*#__PURE__*/React.createElement(MiniRow, _extends({
    key: i
  }, r))));
}
function BarStack({
  items
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 24,
      right: 24,
      bottom: 24,
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, items.map(it => /*#__PURE__*/React.createElement("div", {
    key: it.label,
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 5
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: 11
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: PROD_LIGHT.muted,
      fontFamily: 'var(--ff-font-mono)'
    }
  }, it.label), /*#__PURE__*/React.createElement("span", {
    style: {
      color: PROD_LIGHT.title,
      fontVariantNumeric: 'tabular-nums'
    }
  }, it.pct, "%")), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 4,
      borderRadius: 2,
      background: 'rgba(0,0,0,0.06)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: `${it.pct}%`,
      height: '100%',
      borderRadius: 2,
      background: it.accent ? PROD_LIGHT.accent : 'rgba(0,0,0,0.45)'
    }
  })))));
}
function Checklist({
  items
}) {
  return /*#__PURE__*/React.createElement("ul", {
    style: {
      listStyle: 'none',
      margin: 0,
      padding: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, items.map(t => /*#__PURE__*/React.createElement("li", {
    key: t,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      fontSize: 13,
      color: PROD_LIGHT.title
    }
  }, /*#__PURE__*/React.createElement(I.Check, {
    size: 14,
    strokeWidth: 2,
    style: {
      color: PROD_LIGHT.body,
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("span", null, t))));
}
function ModuleIllustration({
  id,
  Icon
}) {
  switch (id) {
    case 'accounting':
      return /*#__PURE__*/React.createElement(Watermark, {
        Icon: I.Calculator
      });
    case 'inventory':
      return /*#__PURE__*/React.createElement(Watermark, {
        Icon: I.Package
      });
    case 'sales':
      return /*#__PURE__*/React.createElement(Watermark, {
        Icon: I.ShoppingCart
      });
    case 'treasury':
      return /*#__PURE__*/React.createElement(StackedRows, {
        rows: [{
          left: 'Bancolombia · 1234',
          right: '$ 45,230,000',
          accent: true
        }, {
          left: 'BBVA · 5678',
          right: '$ 12,800,450'
        }, {
          left: 'Davivienda · 9012',
          right: '$ 3,104,200'
        }, {
          left: 'Scotia · 3456',
          right: '$ 980,000'
        }, {
          left: 'Citi · 7890',
          right: '$ 520,000'
        }]
      });
    case 'payable':
      return /*#__PURE__*/React.createElement(StackedRows, {
        rows: [{
          left: 'FV-4231 · Acme SAS',
          right: '$ 1,240,000',
          accent: true
        }, {
          left: 'FV-4232 · Globex',
          right: '$ 2,450,800'
        }, {
          left: 'FV-4233 · Initech',
          right: '$ 680,000'
        }, {
          left: 'FV-4234 · Umbrella',
          right: '$ 3,120,000'
        }, {
          left: 'FV-4235 · Stark',
          right: '$ 940,500'
        }]
      });
    case 'purchase':
      return /*#__PURE__*/React.createElement(StackedRows, {
        rows: [{
          left: 'PO-0012 · Approved',
          right: '$ 8,400,000',
          accent: true
        }, {
          left: 'PO-0013 · Pending',
          right: '$ 2,100,000'
        }, {
          left: 'PO-0014 · Draft',
          right: '$ 560,000'
        }, {
          left: 'PO-0015 · Approved',
          right: '$ 11,200,000'
        }, {
          left: 'PO-0016 · Pending',
          right: '$ 780,000'
        }]
      });
    case 'assets':
      return /*#__PURE__*/React.createElement(BarStack, {
        items: [{
          label: 'Vehicle A123',
          pct: 62,
          accent: true
        }, {
          label: 'Server rack 04',
          pct: 41
        }, {
          label: 'Office bldg',
          pct: 18
        }, {
          label: 'CNC machine',
          pct: 78
        }]
      });
    case 'billing':
      return /*#__PURE__*/React.createElement("div", {
        style: {
          position: 'absolute',
          left: 24,
          right: 24,
          bottom: 24,
          padding: 16,
          borderRadius: 10,
          background: PROD_LIGHT.innerBg,
          border: `1px solid ${PROD_LIGHT.innerBorder}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          fontFamily: 'var(--ff-font-mono)',
          fontSize: 11
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          color: PROD_LIGHT.muted
        }
      }, /*#__PURE__*/React.createElement("span", null, "FE-2026-0042"), /*#__PURE__*/React.createElement("span", {
        style: {
          color: PROD_LIGHT.accent
        }
      }, "DIAN \u2713")), /*#__PURE__*/React.createElement("div", {
        style: {
          borderTop: `1px dashed ${PROD_LIGHT.innerBorder}`
        }
      }), /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          color: PROD_LIGHT.body
        }
      }, /*#__PURE__*/React.createElement("span", null, "Subtotal"), /*#__PURE__*/React.createElement("span", {
        style: {
          fontVariantNumeric: 'tabular-nums'
        }
      }, "$ 4,200,000")), /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          color: PROD_LIGHT.body
        }
      }, /*#__PURE__*/React.createElement("span", null, "IVA 19%"), /*#__PURE__*/React.createElement("span", {
        style: {
          fontVariantNumeric: 'tabular-nums'
        }
      }, "$ 798,000")), /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          color: PROD_LIGHT.title,
          fontWeight: 600,
          paddingTop: 6,
          borderTop: `1px solid ${PROD_LIGHT.innerBorder}`
        }
      }, /*#__PURE__*/React.createElement("span", null, "Total"), /*#__PURE__*/React.createElement("span", {
        style: {
          fontVariantNumeric: 'tabular-nums'
        }
      }, "$ 4,998,000")));
    case 'receivable':
      return /*#__PURE__*/React.createElement(BarStack, {
        items: [{
          label: '0–30 days',
          pct: 48,
          accent: true
        }, {
          label: '31–60 days',
          pct: 27
        }, {
          label: '61–90 days',
          pct: 15
        }, {
          label: '90+ days',
          pct: 10
        }]
      });
    default:
      return /*#__PURE__*/React.createElement("div", {
        "aria-hidden": "true",
        style: {
          position: 'absolute',
          right: -20,
          bottom: -20,
          width: 220,
          height: 220,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }
      }, /*#__PURE__*/React.createElement(Icon, {
        size: 96,
        strokeWidth: 1.25,
        style: {
          color: PROD_LIGHT.faint
        }
      }));
  }
}

/* Cards — colSpan 6 are flagships (watermark + checklist), 3 are narrow */
const PRODUCTS_DATA = [
// Row 1: 6 / 3 / 3
{
  id: 'accounting',
  title: 'Accounting',
  Icon: I.Calculator,
  colSpan: 6,
  description: 'General ledger and chart of accounts that close the month for you.',
  highlight: ['General ledger', 'chart of accounts'],
  features: ['Multi-entity consolidation', 'Auto-reconciliation', 'IFRS & local GAAP']
}, {
  id: 'treasury',
  title: 'Treasury',
  Icon: I.Landmark,
  colSpan: 3,
  description: 'Cash flow visibility across every bank account, in real time.',
  highlight: ['Cash flow']
}, {
  id: 'payable',
  title: 'Accounts Payable',
  Icon: I.FileText,
  colSpan: 3,
  description: 'Vendor management with three-way match and payment runs.',
  highlight: ['Vendor management']
},
// Row 2: 3 / 6 / 3
{
  id: 'purchase',
  title: 'Purchasing',
  Icon: I.ShoppingCart,
  colSpan: 3,
  description: 'Purchase orders from request to receipt — one workflow.',
  highlight: ['Purchase orders']
}, {
  id: 'inventory',
  title: 'Inventory',
  Icon: I.Package,
  colSpan: 6,
  description: 'Stock control across warehouses with serialized lot tracking.',
  highlight: ['Stock control'],
  features: ['Multi-warehouse', 'Lot & serial tracking', 'Real-time levels']
}, {
  id: 'assets',
  title: 'Fixed Assets',
  Icon: I.Wrench,
  colSpan: 3,
  description: 'Asset tracking, depreciation and maintenance schedules.',
  highlight: ['Asset tracking']
},
// Row 3: 3 / 3 / 6
{
  id: 'billing',
  title: 'Billing',
  Icon: I.FileText,
  colSpan: 3,
  description: 'Electronic invoicing certified for DIAN and beyond.',
  highlight: ['Electronic invoicing']
}, {
  id: 'receivable',
  title: 'Accounts Receivable',
  Icon: I.HandCoins,
  colSpan: 3,
  description: 'Payment collection with automated dunning and aging buckets.',
  highlight: ['Payment collection']
}, {
  id: 'sales',
  title: 'Sales',
  Icon: I.ShoppingCart,
  colSpan: 6,
  description: 'Sales pipeline, quotes and orders that flow straight into the ledger.',
  highlight: ['Sales'],
  features: ['Pipeline & forecast', 'Quote-to-cash', 'Order fulfillment']
}];
function highlight(text, terms) {
  if (!terms || !terms.length) return text;
  const re = new RegExp(`(${terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'i');
  return text.split(re).map((p, i) => re.test(p) ? /*#__PURE__*/React.createElement("strong", {
    key: i,
    style: {
      color: PROD_LIGHT.title,
      fontWeight: 500
    }
  }, p) : /*#__PURE__*/React.createElement("span", {
    key: i
  }, p));
}
function ProductCard({
  card,
  hovered,
  onHover,
  onLeave,
  onClick
}) {
  const isWide = card.colSpan === 6;
  const isClickable = !!onClick;
  const shell = {
    position: 'relative',
    borderRadius: 16,
    padding: 1,
    height: 400,
    background: hovered ? PROD_LIGHT.accentSoft : PROD_LIGHT.innerBorder,
    boxShadow: hovered ? 'var(--ff-shadow-md)' : 'var(--ff-shadow-sm)',
    transform: hovered ? 'translateY(-3px)' : 'translateY(0)',
    transition: 'transform 220ms ease, box-shadow 220ms ease, background 220ms ease',
    gridColumn: isWide ? 'span 6' : 'span 3'
  };
  const inner = {
    position: 'relative',
    width: '100%',
    height: '100%',
    borderRadius: 15,
    overflow: 'hidden',
    fontFamily: 'var(--ff-font-sans)',
    backgroundColor: hovered ? PROD_LIGHT.cardHover : PROD_LIGHT.card,
    cursor: isClickable ? 'pointer' : 'default'
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "ff-prod-card",
    style: shell,
    onMouseEnter: onHover,
    onMouseLeave: onLeave
  }, /*#__PURE__*/React.createElement("article", {
    style: inner,
    onClick: onClick,
    role: isClickable ? 'button' : undefined,
    tabIndex: isClickable ? 0 : undefined
  }, /*#__PURE__*/React.createElement(ModuleIllustration, {
    id: card.id,
    Icon: card.Icon
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 2,
      padding: 24,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      maxWidth: isWide ? 260 : '100%'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(card.Icon, {
    size: 18,
    strokeWidth: 1.75,
    style: {
      color: PROD_LIGHT.title
    }
  }), /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: 16,
      fontWeight: 500,
      color: PROD_LIGHT.title,
      letterSpacing: '-0.01em'
    }
  }, card.title)), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 14,
      lineHeight: 1.55,
      color: PROD_LIGHT.body
    }
  }, highlight(card.description, card.highlight)), isWide && card.features?.length ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement(Checklist, {
    items: card.features.slice(0, 3)
  })) : null), isClickable ? /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      position: 'absolute',
      top: 16,
      right: 16,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 28,
      height: 28,
      borderRadius: 9999,
      background: PROD_LIGHT.accentSoft,
      color: PROD_LIGHT.accent,
      zIndex: 3
    }
  }, /*#__PURE__*/React.createElement(I.Play, {
    size: 12
  })) : null));
}
function Products({
  onCardClick
}) {
  const [hoveredId, setHoveredId] = React.useState(null);
  return /*#__PURE__*/React.createElement("section", {
    id: "products",
    style: {
      position: 'relative',
      padding: '40px 24px 24px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1280,
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(12, 1fr)',
      gap: 16
    }
  }, PRODUCTS_DATA.map(c => /*#__PURE__*/React.createElement(ProductCard, {
    key: c.id,
    card: c,
    hovered: hoveredId === c.id,
    onHover: () => setHoveredId(c.id),
    onLeave: () => setHoveredId(id => id === c.id ? null : id),
    onClick: onCardClick ? () => onCardClick(c) : undefined
  }))), /*#__PURE__*/React.createElement("p", {
    style: {
      marginTop: 40,
      fontSize: 22,
      fontWeight: 500,
      letterSpacing: '-0.01em',
      color: PROD_LIGHT.body,
      fontFamily: 'var(--ff-font-sans)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: PROD_LIGHT.title,
      fontWeight: 600
    }
  }, "Use one module or all."), ' ', "Fully integrated Backoffice.")), /*#__PURE__*/React.createElement("style", null, `
        @media (max-width: 900px) {
          #products .ff-prod-card { grid-column: span 12 !important; height: auto !important; min-height: 320px; }
        }
      `));
}
window.Products = Products;
})(); } catch (e) { __ds_ns.__errors.push({ path: "uploads/ui_kits/marketing/Products.jsx", error: String((e && e.message) || e) }); }

// uploads/ui_kits/marketing/WhatsAppCTA.jsx
try { (() => {
/* WhatsAppSection + CtaSection — mirrors HomeContent.tsx in the repo. */

const WA_GREEN = '#25D366';
function WhatsAppSection() {
  const bullets = ['Trigger purchase orders from a chat thread', 'Send delivery & invoice notifications automatically', 'Run collections without leaving the conversation'];
  return /*#__PURE__*/React.createElement("section", {
    id: "whatsapp",
    style: {
      padding: '80px 24px',
      background: 'var(--ff-bg)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1040,
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      borderRadius: 20,
      border: '1px solid var(--ff-border)',
      background: 'var(--ff-bg)',
      boxShadow: 'var(--ff-shadow-sm)',
      overflow: 'hidden',
      backgroundImage: 'radial-gradient(1200px 300px at 0% 0%, rgba(37,211,102,0.10), transparent 60%)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "ff-wa-grid",
    style: {
      display: 'grid',
      gap: 40,
      alignItems: 'center',
      padding: 48,
      gridTemplateColumns: 'auto 1fr'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 96,
      height: 96,
      borderRadius: 24,
      background: `${WA_GREEN}1A`,
      border: `1px solid ${WA_GREEN}55`
    },
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "56",
    height: "56",
    viewBox: "0 0 32 32",
    fill: WA_GREEN
  }, /*#__PURE__*/React.createElement("path", {
    d: "M16.003 3C8.82 3 3 8.82 3 16.003c0 2.294.601 4.53 1.742 6.5L3 29l6.66-1.735A12.94 12.94 0 0 0 16.003 29C23.186 29 29 23.186 29 16.003 29 8.82 23.186 3 16.003 3Zm0 23.57a10.54 10.54 0 0 1-5.373-1.47l-.385-.228-3.953 1.03 1.05-3.853-.25-.397a10.55 10.55 0 0 1-1.618-5.646c0-5.83 4.745-10.573 10.578-10.573 5.833 0 10.57 4.743 10.57 10.573 0 5.832-4.737 10.564-10.619 10.564Zm5.803-7.913c-.317-.159-1.877-.924-2.168-1.03-.291-.105-.503-.158-.715.159-.211.317-.819 1.03-1.004 1.243-.185.212-.37.238-.687.08-.317-.16-1.338-.494-2.548-1.573-.941-.84-1.577-1.876-1.761-2.194-.186-.317-.02-.488.14-.647.144-.143.318-.37.476-.556.159-.186.212-.317.317-.53.105-.211.053-.397-.026-.556-.08-.159-.715-1.722-.98-2.36-.258-.618-.52-.534-.715-.543-.185-.008-.397-.01-.609-.01a1.17 1.17 0 0 0-.846.397c-.291.317-1.11 1.083-1.11 2.64 0 1.558 1.138 3.063 1.296 3.274.159.212 2.24 3.42 5.428 4.796.759.328 1.35.523 1.812.67.76.241 1.453.208 2.002.127.611-.091 1.877-.766 2.14-1.505.264-.74.264-1.374.185-1.506-.08-.132-.291-.212-.608-.37Z"
  }))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      padding: '4px 12px',
      borderRadius: 9999,
      fontSize: 12,
      fontWeight: 500,
      marginBottom: 16,
      background: `${WA_GREEN}1A`,
      color: WA_GREEN,
      border: `1px solid ${WA_GREEN}55`,
      fontFamily: 'var(--ff-font-sans)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: 3,
      background: WA_GREEN
    }
  }), "Chat-native"), /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontWeight: 700,
      lineHeight: 1.1,
      letterSpacing: '-0.02em',
      fontSize: 'clamp(28px, 4vw, 44px)',
      color: 'var(--ff-fg-strong)',
      fontFamily: 'var(--ff-font-sans)'
    }
  }, "Run your operation from WhatsApp."), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '16px 0 0',
      fontSize: 18,
      lineHeight: 1.6,
      color: 'var(--ff-fg-muted)',
      fontFamily: 'var(--ff-font-sans)'
    }
  }, "Your team already lives there. Now your purchase orders, approvals, notifications and collections live there too."), /*#__PURE__*/React.createElement("ul", {
    style: {
      margin: '24px 0 0',
      padding: 0,
      listStyle: 'none',
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, bullets.map(b => /*#__PURE__*/React.createElement("li", {
    key: b,
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      fontSize: 15,
      color: 'var(--ff-fg)',
      fontFamily: 'var(--ff-font-sans)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: 7,
      width: 8,
      height: 8,
      borderRadius: 4,
      background: WA_GREEN,
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("span", null, b)))))))), /*#__PURE__*/React.createElement("style", null, `
        @media (max-width: 720px) {
          .ff-wa-grid { grid-template-columns: 1fr !important; padding: 32px !important; text-align: center; }
          .ff-wa-grid > div:first-child { margin: 0 auto; }
        }
      `));
}
window.WhatsAppSection = WhatsAppSection;

/* CTA — gradient pill button on a soft section background */
function CTA({
  onGetStarted
}) {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      padding: '80px 24px',
      background: 'linear-gradient(to bottom, var(--ff-bg-page), var(--ff-bg-subtle))'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 720,
      margin: '0 auto',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontWeight: 700,
      lineHeight: 1.1,
      letterSpacing: '-0.02em',
      fontSize: 'clamp(32px, 5vw, 56px)',
      color: 'var(--ff-fg-strong)',
      fontFamily: 'var(--ff-font-sans)'
    }
  }, "Ready to make your operation AI First?"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '16px 0 0',
      color: 'var(--ff-fg-muted)',
      fontSize: 18,
      fontFamily: 'var(--ff-font-sans)'
    }
  }, "Free to start. No credit card. Live in a day, not a quarter."), /*#__PURE__*/React.createElement("button", {
    onClick: onGetStarted,
    style: {
      marginTop: 32,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      padding: '16px 32px',
      fontSize: 16,
      fontWeight: 600,
      color: '#fff',
      borderRadius: 10,
      border: 0,
      cursor: 'pointer',
      background: 'var(--ff-gradient-primary)',
      boxShadow: 'var(--ff-shadow-glow)',
      fontFamily: 'var(--ff-font-sans)'
    },
    onMouseEnter: e => e.currentTarget.style.filter = 'brightness(1.05)',
    onMouseLeave: e => e.currentTarget.style.filter = 'brightness(1)'
  }, "Get Started Free ", /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true"
  }, "\u2192"))));
}
window.CTA = CTA;
})(); } catch (e) { __ds_ns.__errors.push({ path: "uploads/ui_kits/marketing/WhatsAppCTA.jsx", error: String((e && e.message) || e) }); }

})();
