/* ==============================================
   DotScroll v1.0.0
   Scroll progress navigation with smooth scroll
   https://github.com/<your-username>/dotscroll
   License: MIT
   ============================================== */

(function () {
  'use strict';

  /* ── Capture script tag for auto-config ── */
  const _selfScript = document.currentScript;

  /* ── Default options ── */
  const DEFAULTS = {
    selector: '[data-dotscroll]',   // Sections to track
    smooth: true,                   // Enable smooth scrolling
    ease: 0.075,                    // Smooth scroll easing (0-1, lower = smoother)
    position: 'right',              // 'left' or 'right'
    offset: 24,                     // Distance from viewport edge (px)
    triggerOffset: 0.3,            // Viewport fraction that triggers section change (0-1)
    hideScrollbar: true,            // Hide native scrollbar when smooth scroll is on
    invert: false,                  // Use CSS mix-blend-mode for high contrast dots
    compact: false,                 // Hide the wrapper translucent background
    pushBody: false,                // Provide dynamic CSS variables for safe scroll area bounds
    onChange: null,                  // Callback: (index, sectionElement) => {}
  };

  /* ═══════════════════════════════════════════
     SMOOTH SCROLLER (Lenis-inspired)
     ═══════════════════════════════════════════ */
  class SmoothScroller {
    constructor(opts = {}) {
      this.current = window.scrollY;
      this.target = window.scrollY;
      this.ease = opts.ease || 0.075;
      this.animating = false;
      this.raf = null;
      this._enabled = true;
      this._bind();
      this._wake();
    }

    _bind() {
      this._onWheel = (e) => {
        if (!this._enabled) return;

        // Ignore if scrolling inside a scrollable container
        if (e.composedPath && e.composedPath().some(el => el.hasAttribute && el.hasAttribute('data-dotscroll-ignore'))) {
          return; 
        }

        e.preventDefault();
        this.target += e.deltaY;
        this._clamp();
        this._wake();
      };

      this._onTouchStart = (e) => {
        this._touchY = e.touches[0].clientY;
      };

      this._onTouchMove = (e) => {
        if (!this._enabled) return;
        const dy = this._touchY - e.touches[0].clientY;
        this._touchY = e.touches[0].clientY;
        this.target += dy * 1.5;
        this._clamp();
        this._wake();
      };

      this._onKeydown = (e) => {
        if (!this._enabled) return;
        const vh = window.innerHeight;
        const scrollKeys = {
          ArrowDown: 120, ArrowUp: -120,
          PageDown: vh, PageUp: -vh,
          Space: vh, Home: -Infinity, End: Infinity,
        };
        const delta = scrollKeys[e.code];
        if (delta !== undefined) {
          e.preventDefault();
          if (delta === -Infinity) this.target = 0;
          else if (delta === Infinity) this.target = document.documentElement.scrollHeight;
          else this.target += delta;
          this._clamp();
          this._wake();
        }
      };

      window.addEventListener('wheel', this._onWheel, { passive: false });
      window.addEventListener('touchstart', this._onTouchStart, { passive: true });
      window.addEventListener('touchmove', this._onTouchMove, { passive: true });
      window.addEventListener('keydown', this._onKeydown);
    }

    _clamp() {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      this.target = Math.max(0, Math.min(this.target, max));
    }

    scrollTo(y) {
      this.target = y;
      this._clamp();
      this._wake();
    }

    _wake() {
      if (this.animating) return;
      this.animating = true;
      this.raf = requestAnimationFrame(() => this._loop());
    }

    _loop() {
      // Sync if external scroll happened (anchor links, browser back, etc.)
      if (Math.abs(window.scrollY - this.current) > 2) {
        this.current = window.scrollY;
        this.target = window.scrollY;
      }

      const diff = this.target - this.current;

      if (Math.abs(diff) < 0.5) {
        this.current = this.target;
        window.scrollTo(0, this.current);
        this.animating = false;
        return;
      }

      this.current += diff * this.ease;
      window.scrollTo(0, this.current);

      this.raf = requestAnimationFrame(() => this._loop());
    }

    enable() { this._enabled = true; }
    disable() { this._enabled = false; }

    destroy() {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.animating = false;
      window.removeEventListener('wheel', this._onWheel);
      window.removeEventListener('touchstart', this._onTouchStart);
      window.removeEventListener('touchmove', this._onTouchMove);
      window.removeEventListener('keydown', this._onKeydown);
    }
  }

  /* ═══════════════════════════════════════════
     DOTSCROLL — Main class
     ═══════════════════════════════════════════ */
  class DotScroll {
    /**
     * Create a new DotScroll instance.
     * @param {Object} options — see DEFAULTS above
     */
    constructor(options = {}) {
      this.options = Object.assign({}, DEFAULTS, options);
      this.sections = Array.from(document.querySelectorAll(this.options.selector));

      if (!this.sections.length) {
        console.warn('[DotScroll] No sections found with selector:', this.options.selector);
        return;
      }

      this.activeIndex = 0;
      this.scroller = null;
      this._layoutCache = null;
      this._pendingTimeouts = new Set();
      this._resizeTimeout = null;

      // Assign internal indices
      this.sections.forEach((sec, i) => sec.setAttribute('data-dotscroll-index', i));

      // Build the DOM
      this._buildDOM();

      // Init smooth scroller
      if (this.options.smooth) {
        this.scroller = new SmoothScroller({ ease: this.options.ease });

        // Hide native scrollbar
        if (this.options.hideScrollbar) {
          document.documentElement.classList.add('dotscroll-hide-scrollbar');
        }
      }

      // Bind events first (this re-binds _onScroll)
      this._bindEvents();
      this._bindDotClicks();

      // Cache layout & run initial scroll
      this._cacheLayout();
      this._onScroll(); // Initial state
    }

    /* ── Build navigation DOM ── */
    _buildDOM() {
      const opts = this.options;

      // Wrapper
      this.wrapper = document.createElement('div');
      this.wrapper.className = 'dotscroll-wrapper';
      if (opts.position === 'left') {
        this.wrapper.style.left = opts.offset + 'px';
        this.wrapper.style.right = 'auto';
      } else {
        this.wrapper.style.right = opts.offset + 'px';
      }

      if (opts.invert) {
        this.wrapper.classList.add('ds-inverted');
      }

      if (opts.compact) {
        this.wrapper.classList.add('ds-compact');
      }

      // Top counter
      this.topCount = document.createElement('div');
      this.topCount.className = 'dotscroll-count';

      // Nav container
      this.nav = document.createElement('nav');
      this.nav.className = 'dotscroll-nav';
      this.nav.setAttribute('aria-label', 'Page sections');

      // Bottom counter
      this.bottomCount = document.createElement('div');
      this.bottomCount.className = 'dotscroll-count';

      // Dots
      this.dots = [];
      this.fills = [];

      this.sections.forEach((sec, i) => {
        const dot = document.createElement('button');
        dot.className = 'dotscroll-dot' + (i === 0 ? ' active' : '');
        dot.setAttribute('aria-label',
          sec.getAttribute('data-dotscroll-label') || 'Section ' + (i + 1)
        );

        const fill = document.createElement('div');
        fill.className = 'dotscroll-fill';
        dot.appendChild(fill);

        this.dots.push(dot);
        this.fills.push(fill);
        this.nav.appendChild(dot);
      });

      this.wrapper.appendChild(this.topCount);
      this.wrapper.appendChild(this.nav);
      this.wrapper.appendChild(this.bottomCount);

      document.body.appendChild(this.wrapper);

      if (opts.pushBody) {
        this.wrapper.classList.add('ds-track');
        // Stick strictly to the edge like a native scrollbar track
        if (opts.position === 'left') {
          this.wrapper.style.left = '0px';
          this.wrapper.style.right = 'auto';
        } else {
          this.wrapper.style.right = '0px';
          this.wrapper.style.left = 'auto';
        }

        // The reserved space is exactly the width of the track itself
        const width = this.wrapper.offsetWidth;
        const reservedSpace = width;
        
        // Expose a CSS Custom Property that developers can use safely in their layout
        if (opts.position === 'left') {
          document.documentElement.style.setProperty('--dotscroll-push-left', reservedSpace + 'px');
          document.documentElement.style.setProperty('--dotscroll-push-right', '0px');
        } else {
          document.documentElement.style.setProperty('--dotscroll-push-left', '0px');
          document.documentElement.style.setProperty('--dotscroll-push-right', reservedSpace + 'px');
        }
      } else {
        document.documentElement.style.setProperty('--dotscroll-push-left', '0px');
        document.documentElement.style.setProperty('--dotscroll-push-right', '0px');
      }
    }

    /* ── Dot click → scroll to section ── */
    _bindDotClicks() {
      this.dots.forEach((dot, i) => {
        dot.addEventListener('click', () => {
          this.scrollTo(i);
        });
      });
    }

    /* ── Main events ── */
    _bindEvents() {
      this._onScroll = this._onScroll.bind(this);
      this._onResize = this._onResize.bind(this);

      window.addEventListener('scroll', this._onScroll, { passive: true });
      window.addEventListener('resize', this._onResize, { passive: true });
    }

    /* ── Cache section positions (avoids reflow per scroll) ── */
    _cacheLayout() {
      const vh = window.innerHeight;
      const scrollY = window.scrollY;
      const tops = [];
      const heights = [];

      this.sections.forEach(sec => {
        const rect = sec.getBoundingClientRect();
        tops.push(rect.top + scrollY);
        heights.push(rect.height || vh);
      });

      // Compute dot height from real DOM
      let dotHeight = 18;
      if (this.dots.length >= 3) {
        const r1 = this.dots[1].getBoundingClientRect();
        const r2 = this.dots[2].getBoundingClientRect();
        dotHeight = Math.abs(r2.top - r1.top) || 18;
      }

      this._layoutCache = { tops, heights, vh, dotHeight };
    }

    _onResize() {
      if (this._resizeTimeout) clearTimeout(this._resizeTimeout);
      this._resizeTimeout = setTimeout(() => {
        // Hide counters BEFORE recalculating layout.
        // This prevents a feedback loop: visible counters take up space,
        // which shrinks the nav, which causes tiny overflow (+1), which
        // keeps counters visible — a chicken-and-egg problem on resize.
        if (this.topCount) {
          this.topCount.classList.remove('visible');
          this.topCount.dataset.val = '';
          this.topCount.innerHTML = '';
        }
        if (this.bottomCount) {
          this.bottomCount.classList.remove('visible');
          this.bottomCount.dataset.val = '';
          this.bottomCount.innerHTML = '';
        }

        // Reset nav scroll position so stale values don't persist
        if (this.nav) this.nav.scrollTop = 0;

        this._cacheLayout();
        this._onScroll();
      }, 150);
    }

    /* ── Binary search: find active section ── */
    _findActive(trigger, cache) {
      const { tops, heights } = cache;
      let lo = 0;
      let hi = tops.length - 1;
      let result = 0;

      while (lo <= hi) {
        const mid = (lo + hi) >>> 1;
        if (tops[mid] <= trigger) {
          result = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }

      // Check if we scrolled past this section entirely
      if (trigger >= tops[result] + heights[result] && result < tops.length - 1) {
        result++;
      }

      return result;
    }

    /* ── Scroll handler ── */
    _onScroll() {
      const cache = this._layoutCache;
      if (!cache || this.sections.length === 0) return;

      const scrollY = window.scrollY;
      const trigger = scrollY + cache.vh * this.options.triggerOffset;

      // Find active section via binary search
      const newIndex = this._findActive(trigger, cache);

      // Update fill progress on all dots.
      // Progress = full viewport traversal: 0 when section first enters
      // the viewport bottom, 1 when section fully exits the viewport top.
      // This creates a smooth gradient across nearby dots that accurately
      // reflects what the user sees on screen.
      const len = this.sections.length;
      const maxScrollY = document.documentElement.scrollHeight - cache.vh;
      for (let i = 0; i < len; i++) {
        if (!this.fills[i]) continue;

        const top = cache.tops[i];
        const height = cache.heights[i];

        const enter = Math.max(0, top - cache.vh);
        // Last section: use max scroll position so it reaches 100% at page bottom
        const exit = (i === len - 1) ? maxScrollY : top + height;
        let progress = (scrollY - enter) / (exit - enter);
        progress = Math.max(0, Math.min(1, progress));

        this.fills[i].style.transform = 'scaleY(' + progress + ')';
      }

      // Update active dot class
      if (newIndex !== this.activeIndex) {
        this.dots[this.activeIndex]?.classList.remove('active');
        this.dots[newIndex]?.classList.add('active');

        const oldIndex = this.activeIndex;
        this.activeIndex = newIndex;

        // Fire callback
        if (typeof this.options.onChange === 'function') {
          this.options.onChange(newIndex, this.sections[newIndex], oldIndex);
        }
      }

      // Scroll the nav container proportionally
      if (this.nav && this.nav.scrollHeight > this.nav.clientHeight) {
        const maxScrollY = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        const progressY = Math.max(0, Math.min(1, scrollY / maxScrollY));
        const maxNavScroll = this.nav.scrollHeight - this.nav.clientHeight;
        this.nav.scrollTop = maxNavScroll * progressY;

        this._updateCounters(cache.dotHeight);
      }
    }

    /* ── Odometer counter animation ── */
    _updateOdometer(element, newValue, isBottom) {
      const newText = '+' + newValue;
      const oldText = element.dataset.val ? '+' + element.dataset.val : '';

      if (newText === oldText) return;

      const oldNum = parseInt(element.dataset.val || '0');
      const newNum = parseInt(newValue);
      const scrollingDown = isBottom ? newNum < oldNum : newNum > oldNum;

      element.dataset.val = newValue;

      // Length change or first render — rebuild all columns
      if (!oldText || newText.length !== oldText.length) {
        element.innerHTML = '';
        for (let i = 0; i < newText.length; i++) {
          const charCol = document.createElement('span');
          charCol.className = 'dotscroll-odo-col';

          if (oldText && newText.length !== oldText.length) {
            const newSpan = document.createElement('span');
            newSpan.textContent = newText[i];
            newSpan.className = 'dotscroll-odo-char ' + (scrollingDown ? 'enter-up' : 'enter-down');
            charCol.appendChild(newSpan);
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                newSpan.className = 'dotscroll-odo-char new-val';
              });
            });
          } else {
            const span = document.createElement('span');
            span.textContent = newText[i];
            span.className = 'dotscroll-odo-char new-val';
            charCol.appendChild(span);
          }
          element.appendChild(charCol);
        }
        return;
      }

      // Same length — diff char by char
      const cols = element.querySelectorAll('.dotscroll-odo-col');
      for (let i = 0; i < newText.length; i++) {
        if (newText[i] !== oldText[i]) {
          const col = cols[i];

          const oldSpans = col.querySelectorAll('span');
          oldSpans.forEach(span => {
            span.className = 'dotscroll-odo-char ' + (scrollingDown ? 'exit-up' : 'exit-down');
            const tid = setTimeout(() => {
              span.remove();
              this._pendingTimeouts.delete(tid);
            }, 250);
            this._pendingTimeouts.add(tid);
          });

          const newSpan = document.createElement('span');
          newSpan.textContent = newText[i];
          newSpan.className = 'dotscroll-odo-char ' + (scrollingDown ? 'enter-up' : 'enter-down');
          col.appendChild(newSpan);

          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              newSpan.className = 'dotscroll-odo-char new-val';
            });
          });
        }
      }
    }

    _updateCounters(dotHeight) {
      if (!this.topCount || !this.bottomCount || !this.nav) return;

      const totalHeight = this.nav.scrollHeight;
      const clientHeight = this.nav.clientHeight;
      const scrollTop = this.nav.scrollTop;

      let above = Math.round(scrollTop / dotHeight);
      let below = Math.round((totalHeight - scrollTop - clientHeight) / dotHeight);

      above = Math.max(0, above);
      below = Math.max(0, below);

      if (above > 0) {
        this._updateOdometer(this.topCount, above, false);
        this.topCount.classList.add('visible');
      } else {
        this.topCount.classList.remove('visible');
        this.topCount.dataset.val = '';
        this.topCount.innerHTML = '';
      }

      if (below > 0) {
        this._updateOdometer(this.bottomCount, below, true);
        this.bottomCount.classList.add('visible');
      } else {
        this.bottomCount.classList.remove('visible');
        this.bottomCount.dataset.val = '';
        this.bottomCount.innerHTML = '';
      }
    }

    /* ═══════════════════════════════════════
       PUBLIC API
       ═══════════════════════════════════════ */

    /**
     * Scroll to a section by index.
     * @param {number} index — Section index (0-based)
     */
    scrollTo(index) {
      const cache = this._layoutCache;
      if (!cache || index < 0 || index >= this.sections.length) return;

      if (this.scroller) {
        this.scroller.scrollTo(cache.tops[index]);
      } else {
        window.scrollTo({ top: cache.tops[index], behavior: 'smooth' });
      }
    }

    /**
     * Get the current active section index.
     * @returns {number}
     */
    getActiveIndex() {
      return this.activeIndex;
    }

    /**
     * Get the current active section element.
     * @returns {HTMLElement}
     */
    getActiveSection() {
      return this.sections[this.activeIndex];
    }

    /**
     * Recalculate layout (call after dynamic content changes).
     */
    refresh() {
      this._cacheLayout();
      this._onScroll();
    }

    /**
     * Enable or disable smooth scrolling at runtime.
     * @param {boolean} enabled
     */
    setSmooth(enabled) {
      if (enabled && !this.scroller) {
        this.scroller = new SmoothScroller({ ease: this.options.ease });
        if (this.options.hideScrollbar) {
          document.documentElement.classList.add('dotscroll-hide-scrollbar');
        }
      } else if (!enabled && this.scroller) {
        this.scroller.destroy();
        this.scroller = null;
        document.documentElement.classList.remove('dotscroll-hide-scrollbar');
      }
    }

    /**
     * Destroy the DotScroll instance and clean up.
     */
    destroy() {
      window.removeEventListener('scroll', this._onScroll);
      window.removeEventListener('resize', this._onResize);

      if (this._resizeTimeout) clearTimeout(this._resizeTimeout);
      this._pendingTimeouts.forEach(clearTimeout);
      this._pendingTimeouts.clear();

      if (this.scroller) {
        this.scroller.destroy();
        this.scroller = null;
      }

      if (this.wrapper && this.wrapper.parentNode) {
        this.wrapper.parentNode.removeChild(this.wrapper);
      }

      document.documentElement.classList.remove('dotscroll-hide-scrollbar');
      
      if (this.options.pushBody) {
        document.documentElement.style.setProperty('--dotscroll-push-left', '0px');
        document.documentElement.style.setProperty('--dotscroll-push-right', '0px');
      }

      // Clean up data attributes
      this.sections.forEach(sec => sec.removeAttribute('data-dotscroll-index'));

      this.dots = [];
      this.fills = [];
      this.sections = [];
      this._layoutCache = null;
    }
  }

  /* ── Static registry ── */
  DotScroll._instances = [];

  /**
   * Initialize DotScroll (factory method).
   * @param {Object} options
   * @returns {DotScroll}
   */
  DotScroll.init = function (options) {
    const instance = new DotScroll(options);
    DotScroll._instances.push(instance);
    return instance;
  };

  /**
   * Destroy all DotScroll instances.
   */
  DotScroll.destroyAll = function () {
    DotScroll._instances.forEach(inst => inst.destroy());
    DotScroll._instances = [];
  };

  /**
   * Get the default options.
   * @returns {Object}
   */
  DotScroll.defaults = DEFAULTS;

  /* ── Expose globally ── */
  window.DotScroll = DotScroll;

  /* ── Auto-init ── */
  function _parseAttr(val) {
    if (val === 'true') return true;
    if (val === 'false') return false;
    if (val !== '' && !isNaN(val)) return parseFloat(val);
    return val;
  }

  document.addEventListener('DOMContentLoaded', function () {
    // Check if auto-init is disabled
    if (_selfScript && _selfScript.getAttribute('data-auto-init') === 'false') return;

    // Only auto-init if sections exist
    const sections = document.querySelectorAll('[data-dotscroll]');
    if (!sections.length) return;

    // Read config from script tag data attributes
    var opts = {};
    if (_selfScript) {
      var configKeys = ['smooth', 'ease', 'position', 'offset', 'triggerOffset', 'hideScrollbar'];
      configKeys.forEach(function (key) {
        var attr = _selfScript.getAttribute('data-' + key.toLowerCase());
        if (attr !== null) {
          opts[key] = _parseAttr(attr);
        }
      });
    }

    window.dotscroll = DotScroll.init(opts);
  });

})();
