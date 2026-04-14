/* ==============================================
   DotScroll v1.0.0
   Scroll progress navigation with smooth scroll
   https://github.com/your-username/dotscroll
   License: MIT
   ============================================== */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    // CommonJS
    module.exports = factory();
  } else {
    // Browser global
    var result = factory();
    root.DotScroll = result;
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ── Capture script tag for auto-config ── */
  var _selfScript = typeof document !== 'undefined' ? document.currentScript : null;

  /* ── Default options ── */
  var DEFAULTS = {
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
  function SmoothScroller(opts) {
    opts = opts || {};
    this.current = window.scrollY;
    this.target = window.scrollY;
    this.ease = opts.ease || 0.075;
    this.animating = false;
    this.raf = null;
    this._enabled = true;
    this._bind();
    this._wake();
  }

  SmoothScroller.prototype._bind = function () {
    var self = this;

    this._onWheel = function (e) {
      if (!self._enabled) return;

      // Ignore if scrolling inside a scrollable container
      if (e.composedPath && e.composedPath().some(function (el) {
        return el.hasAttribute && el.hasAttribute('data-dotscroll-ignore');
      })) {
        return;
      }

      e.preventDefault();
      self.target += e.deltaY;
      self._clamp();
      self._wake();
    };

    this._onTouchStart = function (e) {
      self._touchY = e.touches[0].clientY;
    };

    this._onTouchMove = function (e) {
      if (!self._enabled) return;
      var dy = self._touchY - e.touches[0].clientY;
      self._touchY = e.touches[0].clientY;
      self.target += dy * 1.5;
      self._clamp();
      self._wake();
    };

    this._onKeydown = function (e) {
      if (!self._enabled) return;
      var vh = window.innerHeight;
      var scrollKeys = {
        ArrowDown: 120, ArrowUp: -120,
        PageDown: vh, PageUp: -vh,
        Space: vh, Home: -Infinity, End: Infinity,
      };
      var delta = scrollKeys[e.code];
      if (delta !== undefined) {
        e.preventDefault();
        if (delta === -Infinity) self.target = 0;
        else if (delta === Infinity) self.target = document.documentElement.scrollHeight;
        else self.target += delta;
        self._clamp();
        self._wake();
      }
    };

    window.addEventListener('wheel', this._onWheel, { passive: false });
    window.addEventListener('touchstart', this._onTouchStart, { passive: true });
    window.addEventListener('touchmove', this._onTouchMove, { passive: true });
    window.addEventListener('keydown', this._onKeydown);
  };

  SmoothScroller.prototype._clamp = function () {
    var max = document.documentElement.scrollHeight - window.innerHeight;
    this.target = Math.max(0, Math.min(this.target, max));
  };

  SmoothScroller.prototype.scrollTo = function (y) {
    this.target = y;
    this._clamp();
    this._wake();
  };

  SmoothScroller.prototype._wake = function () {
    if (this.animating) return;
    this.animating = true;
    var self = this;
    this.raf = requestAnimationFrame(function () { self._loop(); });
  };

  SmoothScroller.prototype._loop = function () {
    var self = this;

    // Sync if external scroll happened
    if (Math.abs(window.scrollY - this.current) > 2) {
      this.current = window.scrollY;
      this.target = window.scrollY;
    }

    var diff = this.target - this.current;

    if (Math.abs(diff) < 0.5) {
      this.current = this.target;
      window.scrollTo(0, this.current);
      this.animating = false;
      return;
    }

    this.current += diff * this.ease;
    window.scrollTo(0, this.current);

    this.raf = requestAnimationFrame(function () { self._loop(); });
  };

  SmoothScroller.prototype.enable = function () { this._enabled = true; };
  SmoothScroller.prototype.disable = function () { this._enabled = false; };

  SmoothScroller.prototype.destroy = function () {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.animating = false;
    window.removeEventListener('wheel', this._onWheel);
    window.removeEventListener('touchstart', this._onTouchStart);
    window.removeEventListener('touchmove', this._onTouchMove);
    window.removeEventListener('keydown', this._onKeydown);
  };

  /* ═══════════════════════════════════════════
     DOTSCROLL — Main class
     ═══════════════════════════════════════════ */
  function DotScroll(options) {
    options = options || {};
    this.options = _assign({}, DEFAULTS, options);
    this.sections = _toArray(document.querySelectorAll(this.options.selector));

    if (!this.sections.length) {
      console.warn('[DotScroll] No sections found with selector:', this.options.selector);
      return;
    }

    this.activeIndex = 0;
    this.scroller = null;
    this._layoutCache = null;
    this._pendingTimeouts = [];
    this._resizeTimeout = null;

    // Assign internal indices
    for (var i = 0; i < this.sections.length; i++) {
      this.sections[i].setAttribute('data-dotscroll-index', i);
    }

    // Build the DOM
    this._buildDOM();

    // Init smooth scroller
    if (this.options.smooth) {
      this.scroller = new SmoothScroller({ ease: this.options.ease });

      if (this.options.hideScrollbar) {
        document.documentElement.classList.add('dotscroll-hide-scrollbar');
      }
    }

    // Bind events
    this._bindEvents();
    this._bindDotClicks();

    // Cache layout & run initial scroll
    this._cacheLayout();
    this._onScroll();
  }

  /* ── Helpers ── */
  function _assign(target) {
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      if (src) {
        for (var key in src) {
          if (src.hasOwnProperty(key)) target[key] = src[key];
        }
      }
    }
    return target;
  }

  function _toArray(nodeList) {
    var arr = [];
    for (var i = 0; i < nodeList.length; i++) arr.push(nodeList[i]);
    return arr;
  }

  /* ── Build navigation DOM ── */
  DotScroll.prototype._buildDOM = function () {
    var opts = this.options;

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

    for (var i = 0; i < this.sections.length; i++) {
      var sec = this.sections[i];
      var dot = document.createElement('button');
      dot.className = 'dotscroll-dot' + (i === 0 ? ' active' : '');
      dot.setAttribute('aria-label',
        sec.getAttribute('data-dotscroll-label') || 'Section ' + (i + 1)
      );

      var fill = document.createElement('div');
      fill.className = 'dotscroll-fill';
      dot.appendChild(fill);

      this.dots.push(dot);
      this.fills.push(fill);
      this.nav.appendChild(dot);
    }

    this.wrapper.appendChild(this.topCount);
    this.wrapper.appendChild(this.nav);
    this.wrapper.appendChild(this.bottomCount);

    document.body.appendChild(this.wrapper);

    if (opts.pushBody) {
      this.wrapper.classList.add('ds-track');
      if (opts.position === 'left') {
        this.wrapper.style.left = '0px';
        this.wrapper.style.right = 'auto';
      } else {
        this.wrapper.style.right = '0px';
        this.wrapper.style.left = 'auto';
      }

      var width = this.wrapper.offsetWidth;
      var reservedSpace = width;

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
  };

  /* ── Dot click → scroll to section ── */
  DotScroll.prototype._bindDotClicks = function () {
    var self = this;
    for (var i = 0; i < this.dots.length; i++) {
      (function (index) {
        self.dots[index].addEventListener('click', function () {
          self.scrollTo(index);
        });
      })(i);
    }
  };

  /* ── Main events ── */
  DotScroll.prototype._bindEvents = function () {
    this._onScroll = this._onScroll.bind(this);
    this._onResize = this._onResize.bind(this);

    window.addEventListener('scroll', this._onScroll, { passive: true });
    window.addEventListener('resize', this._onResize, { passive: true });
  };

  /* ── Cache section positions ── */
  DotScroll.prototype._cacheLayout = function () {
    var vh = window.innerHeight;
    var scrollY = window.scrollY;
    var tops = [];
    var heights = [];

    for (var i = 0; i < this.sections.length; i++) {
      var rect = this.sections[i].getBoundingClientRect();
      tops.push(rect.top + scrollY);
      heights.push(rect.height || vh);
    }

    var dotHeight = 18;
    if (this.dots.length >= 3) {
      var r1 = this.dots[1].getBoundingClientRect();
      var r2 = this.dots[2].getBoundingClientRect();
      dotHeight = Math.abs(r2.top - r1.top) || 18;
    }

    this._layoutCache = { tops: tops, heights: heights, vh: vh, dotHeight: dotHeight };
  };

  DotScroll.prototype._onResize = function () {
    var self = this;
    if (this._resizeTimeout) clearTimeout(this._resizeTimeout);
    this._resizeTimeout = setTimeout(function () {
      if (self.topCount) {
        self.topCount.classList.remove('visible');
        self.topCount.dataset.val = '';
        self.topCount.innerHTML = '';
      }
      if (self.bottomCount) {
        self.bottomCount.classList.remove('visible');
        self.bottomCount.dataset.val = '';
        self.bottomCount.innerHTML = '';
      }

      if (self.nav) self.nav.scrollTop = 0;

      self._cacheLayout();
      self._onScroll();
    }, 150);
  };

  /* ── Binary search: find active section ── */
  DotScroll.prototype._findActive = function (trigger, cache) {
    var tops = cache.tops;
    var heights = cache.heights;
    var lo = 0;
    var hi = tops.length - 1;
    var result = 0;

    while (lo <= hi) {
      var mid = (lo + hi) >>> 1;
      if (tops[mid] <= trigger) {
        result = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    if (trigger >= tops[result] + heights[result] && result < tops.length - 1) {
      result++;
    }

    return result;
  };

  /* ── Scroll handler ── */
  DotScroll.prototype._onScroll = function () {
    var cache = this._layoutCache;
    if (!cache || this.sections.length === 0) return;

    var scrollY = window.scrollY;
    var trigger = scrollY + cache.vh * this.options.triggerOffset;

    var newIndex = this._findActive(trigger, cache);

    var len = this.sections.length;
    var maxScrollY = document.documentElement.scrollHeight - cache.vh;
    for (var i = 0; i < len; i++) {
      if (!this.fills[i]) continue;

      var top = cache.tops[i];
      var height = cache.heights[i];

      var enter = Math.max(0, top - cache.vh);
      var exit = (i === len - 1) ? maxScrollY : top + height;
      var progress = (scrollY - enter) / (exit - enter);
      progress = Math.max(0, Math.min(1, progress));

      this.fills[i].style.transform = 'scaleY(' + progress + ')';
    }

    if (newIndex !== this.activeIndex) {
      if (this.dots[this.activeIndex]) this.dots[this.activeIndex].classList.remove('active');
      if (this.dots[newIndex]) this.dots[newIndex].classList.add('active');

      var oldIndex = this.activeIndex;
      this.activeIndex = newIndex;

      if (typeof this.options.onChange === 'function') {
        this.options.onChange(newIndex, this.sections[newIndex], oldIndex);
      }
    }

    if (this.nav && this.nav.scrollHeight > this.nav.clientHeight) {
      var docMaxScrollY = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      var progressY = Math.max(0, Math.min(1, scrollY / docMaxScrollY));
      var maxNavScroll = this.nav.scrollHeight - this.nav.clientHeight;
      this.nav.scrollTop = maxNavScroll * progressY;

      this._updateCounters(cache.dotHeight);
    }
  };

  /* ── Odometer counter animation ── */
  DotScroll.prototype._updateOdometer = function (element, newValue, isBottom) {
    var self = this;
    var newText = '+' + newValue;
    var oldText = element.dataset.val ? '+' + element.dataset.val : '';

    if (newText === oldText) return;

    var oldNum = parseInt(element.dataset.val || '0');
    var newNum = parseInt(newValue);
    var scrollingDown = isBottom ? newNum < oldNum : newNum > oldNum;

    element.dataset.val = newValue;

    if (!oldText || newText.length !== oldText.length) {
      element.innerHTML = '';
      for (var i = 0; i < newText.length; i++) {
        var charCol = document.createElement('span');
        charCol.className = 'dotscroll-odo-col';

        if (oldText && newText.length !== oldText.length) {
          var newSpan = document.createElement('span');
          newSpan.textContent = newText[i];
          newSpan.className = 'dotscroll-odo-char ' + (scrollingDown ? 'enter-up' : 'enter-down');
          charCol.appendChild(newSpan);
          (function (span) {
            requestAnimationFrame(function () {
              requestAnimationFrame(function () {
                span.className = 'dotscroll-odo-char new-val';
              });
            });
          })(newSpan);
        } else {
          var span = document.createElement('span');
          span.textContent = newText[i];
          span.className = 'dotscroll-odo-char new-val';
          charCol.appendChild(span);
        }
        element.appendChild(charCol);
      }
      return;
    }

    var cols = element.querySelectorAll('.dotscroll-odo-col');
    for (var i = 0; i < newText.length; i++) {
      if (newText[i] !== oldText[i]) {
        var col = cols[i];

        var oldSpans = col.querySelectorAll('span');
        for (var j = 0; j < oldSpans.length; j++) {
          oldSpans[j].className = 'dotscroll-odo-char ' + (scrollingDown ? 'exit-up' : 'exit-down');
          (function (sp) {
            var tid = setTimeout(function () {
              sp.remove();
            }, 250);
            self._pendingTimeouts.push(tid);
          })(oldSpans[j]);
        }

        var newSpan = document.createElement('span');
        newSpan.textContent = newText[i];
        newSpan.className = 'dotscroll-odo-char ' + (scrollingDown ? 'enter-up' : 'enter-down');
        col.appendChild(newSpan);

        (function (span) {
          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              span.className = 'dotscroll-odo-char new-val';
            });
          });
        })(newSpan);
      }
    }
  };

  DotScroll.prototype._updateCounters = function (dotHeight) {
    if (!this.topCount || !this.bottomCount || !this.nav) return;

    var totalHeight = this.nav.scrollHeight;
    var clientHeight = this.nav.clientHeight;
    var scrollTop = this.nav.scrollTop;

    var above = Math.round(scrollTop / dotHeight);
    var below = Math.round((totalHeight - scrollTop - clientHeight) / dotHeight);

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
  };

  /* ═══════════════════════════════════════
     PUBLIC API
     ═══════════════════════════════════════ */

  /**
   * Scroll to a section by index.
   * @param {number} index — Section index (0-based)
   */
  DotScroll.prototype.scrollTo = function (index) {
    var cache = this._layoutCache;
    if (!cache || index < 0 || index >= this.sections.length) return;

    if (this.scroller) {
      this.scroller.scrollTo(cache.tops[index]);
    } else {
      window.scrollTo({ top: cache.tops[index], behavior: 'smooth' });
    }
  };

  /**
   * Get the current active section index.
   * @returns {number}
   */
  DotScroll.prototype.getActiveIndex = function () {
    return this.activeIndex;
  };

  /**
   * Get the current active section element.
   * @returns {HTMLElement}
   */
  DotScroll.prototype.getActiveSection = function () {
    return this.sections[this.activeIndex];
  };

  /**
   * Recalculate layout (call after dynamic content changes).
   */
  DotScroll.prototype.refresh = function () {
    this._cacheLayout();
    this._onScroll();
  };

  /**
   * Enable or disable smooth scrolling at runtime.
   * @param {boolean} enabled
   */
  DotScroll.prototype.setSmooth = function (enabled) {
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
  };

  /**
   * Destroy the DotScroll instance and clean up.
   */
  DotScroll.prototype.destroy = function () {
    window.removeEventListener('scroll', this._onScroll);
    window.removeEventListener('resize', this._onResize);

    if (this._resizeTimeout) clearTimeout(this._resizeTimeout);
    for (var i = 0; i < this._pendingTimeouts.length; i++) {
      clearTimeout(this._pendingTimeouts[i]);
    }
    this._pendingTimeouts = [];

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

    for (var i = 0; i < this.sections.length; i++) {
      this.sections[i].removeAttribute('data-dotscroll-index');
    }

    this.dots = [];
    this.fills = [];
    this.sections = [];
    this._layoutCache = null;
  };

  /* ── Static registry ── */
  DotScroll._instances = [];

  /**
   * Initialize DotScroll (factory method).
   * @param {Object} options
   * @returns {DotScroll}
   */
  DotScroll.init = function (options) {
    var instance = new DotScroll(options);
    DotScroll._instances.push(instance);
    return instance;
  };

  /**
   * Destroy all DotScroll instances.
   */
  DotScroll.destroyAll = function () {
    for (var i = 0; i < DotScroll._instances.length; i++) {
      DotScroll._instances[i].destroy();
    }
    DotScroll._instances = [];
  };

  /**
   * Get the default options.
   * @returns {Object}
   */
  DotScroll.defaults = DEFAULTS;

  /* ── Auto-init ── */
  function _parseAttr(val) {
    if (val === 'true') return true;
    if (val === 'false') return false;
    if (val !== '' && !isNaN(val)) return parseFloat(val);
    return val;
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function () {
      // Check if auto-init is disabled
      if (_selfScript && _selfScript.getAttribute('data-auto-init') === 'false') return;

      // Only auto-init if sections exist
      var sections = document.querySelectorAll('[data-dotscroll]');
      if (!sections.length) return;

      // Read config from script tag data attributes
      var opts = {};
      if (_selfScript) {
        var configKeys = ['smooth', 'ease', 'position', 'offset', 'triggerOffset', 'hideScrollbar'];
        for (var i = 0; i < configKeys.length; i++) {
          var key = configKeys[i];
          var attr = _selfScript.getAttribute('data-' + key.toLowerCase());
          if (attr !== null) {
            opts[key] = _parseAttr(attr);
          }
        }
      }

      window.dotscroll = DotScroll.init(opts);
    });
  }

  return DotScroll;

}));
