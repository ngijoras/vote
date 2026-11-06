/* ============================================================
   E-VOTE • ui.js
   Helper UI global — toast, modal, confirm/prompt, format,
   loading, skeleton, dsb.
   Tidak menimpa native confirm()/prompt() supaya views tetap
   kompatibel. Gunakan UI.confirm() / UI.prompt() untuk versi
   async berbasis modal (opsional).
   ============================================================ */
(function () {
  'use strict';

  /* ============================================================
   *  Basic Helpers
   * ============================================================ */
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function el(tag, props, children) {
    const node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        const v = props[k];
        if (v == null) return;
        if (k === 'class')          node.className = v;
        else if (k === 'html')      node.innerHTML = v;
        else if (k === 'text')      node.textContent = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k.indexOf('on') === 0 && typeof v === 'function') {
          node.addEventListener(k.slice(2).toLowerCase(), v);
        } else {
          node.setAttribute(k, v);
        }
      });
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (c == null || c === false) return;
        node.appendChild(typeof c === 'string' || typeof c === 'number'
          ? document.createTextNode(String(c)) : c);
      });
    }
    return node;
  }

  /* ============================================================
   *  Toast
   * ============================================================ */
  let toastWrap = null;
  const TOAST_ICONS = { success: '✓', error: '✕', warn: '!', info: 'i' };

  function ensureToastWrap() {
    if (toastWrap && document.body.contains(toastWrap)) return toastWrap;
    toastWrap = el('div', { class: 'toast-wrap' });
    document.body.appendChild(toastWrap);
    return toastWrap;
  }

  function toast(msg, type, duration) {
    type = type || 'info';
    if (!TOAST_ICONS[type]) type = 'info';
    duration = duration || 2800;
    const wrap = ensureToastWrap();
    const t = el('div', { class: 'toast toast-' + type });
    t.appendChild(el('span', { class: 'toast-icon', text: TOAST_ICONS[type] }));
    t.appendChild(el('span', { class: 'toast-msg', text: String(msg || '') }));
    wrap.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () {
      t.classList.remove('show');
      setTimeout(function () { t.remove(); }, 300);
    }, duration);
    return t;
  }

  /* ============================================================
   *  Modal
   * ============================================================ */
  let activeModal = null;

  function closeModal() {
    if (!activeModal) return;
    const m = activeModal;
    activeModal = null;
    m.classList.remove('show');
    setTimeout(function () { m.remove(); }, 260);
  }

  function modal(opts) {
    opts = opts || {};
    closeModal();

    const backdrop = el('div', { class: 'modal-backdrop' });
    const box = el('div', {
      class: 'modal' + (opts.size ? ' modal-' + opts.size : '')
    });

    if (opts.title) {
      const head = el('div', { class: 'modal-head' });
      head.appendChild(el('h3', { text: opts.title }));
      const x = el('button', {
        type: 'button', class: 'modal-close', html: '&times;',
        'aria-label': 'Tutup'
      });
      x.onclick = closeModal;
      head.appendChild(x);
      box.appendChild(head);
    }

    const body = el('div', { class: 'modal-body' });
    if (typeof opts.body === 'string')   body.innerHTML = opts.body;
    else if (opts.body instanceof Node)  body.appendChild(opts.body);
    box.appendChild(body);

    if (opts.actions && opts.actions.length) {
      const foot = el('div', { class: 'modal-foot' });
      opts.actions.forEach(function (a) {
        const cls = a.type === 'primary' ? 'btn-primary'
                  : a.type === 'danger'  ? 'btn-danger'
                  : 'btn-ghost';
        const btn = el('button', {
          type: 'button', class: cls, text: a.label || 'OK'
        });
        btn.onclick = function () {
          let r;
          if (a.onClick) r = a.onClick();
          if (r !== false) closeModal();
        };
        foot.appendChild(btn);
      });
      box.appendChild(foot);
    }

    backdrop.appendChild(box);
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) closeModal();
    });
    document.body.appendChild(backdrop);
    requestAnimationFrame(function () { backdrop.classList.add('show'); });

    // ESC
    function onKey(e) {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', onKey);
        closeModal();
      }
    }
    document.addEventListener('keydown', onKey);

    activeModal = backdrop;
    return { backdrop: backdrop, box: box, body: body, close: closeModal };
  }

  /* ============================================================
   *  Async Confirm & Prompt (opsional — tidak menimpa native)
   * ============================================================ */
  function confirmAsync(msg, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      let done = false;
      const iv = setInterval(function () {
        if (!activeModal || !document.body.contains(activeModal)) {
          finish(false);
        }
      }, 120);
      function finish(v) {
        if (done) return;
        done = true;
        clearInterval(iv);
        resolve(v);
      }
      modal({
        title: opts.title || 'Konfirmasi',
        size: 'sm',
        body: '<p>' + escapeHtml(msg) + '</p>',
        actions: [
          { label: opts.cancelLabel || 'Batal', type: 'ghost',
            onClick: function () { finish(false); } },
          { label: opts.okLabel || 'Ya, Lanjutkan',
            type: opts.danger ? 'danger' : 'primary',
            onClick: function () { finish(true); } }
        ]
      });
    });
  }

  function promptAsync(msg, defaultValue) {
    return new Promise(function (resolve) {
      let done = false;
      const iv = setInterval(function () {
        if (!activeModal || !document.body.contains(activeModal)) {
          finish(null);
        }
      }, 120);
      function finish(v) {
        if (done) return;
        done = true;
        clearInterval(iv);
        resolve(v);
      }
      const wrap = el('div');
      wrap.appendChild(el('p', { class: 'hint', text: msg }));
      const input = el('input', { class: 'input', type: 'text' });
      input.value = defaultValue || '';
      wrap.appendChild(input);

      modal({
        title: 'Input',
        body: wrap,
        actions: [
          { label: 'Batal', type: 'ghost',
            onClick: function () { finish(null); } },
          { label: 'Simpan', type: 'primary',
            onClick: function () { finish(input.value); } }
        ]
      });
      setTimeout(function () { input.focus(); input.select(); }, 80);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter')  { finish(input.value); closeModal(); }
        if (e.key === 'Escape') { finish(null);        closeModal(); }
      });
    });
  }

  /* ============================================================
   *  Loading & Skeleton
   * ============================================================ */
  function loading(container, show) {
    if (!container) return;
    if (show) {
      container.setAttribute('data-loading', '1');
      if (!container.querySelector(':scope > .ui-spinner-wrap')) {
        container.appendChild(el('div', {
          class: 'ui-spinner-wrap',
          html: '<div class="ui-spinner"></div>'
        }));
      }
    } else {
      container.removeAttribute('data-loading');
      const sp = container.querySelector(':scope > .ui-spinner-wrap');
      if (sp) sp.remove();
    }
  }

  function skeleton(lines) {
    lines = Math.max(1, lines || 3);
    let h = '<div class="skeleton">';
    for (let i = 0; i < lines; i++) h += '<div class="sk-line"></div>';
    return h + '</div>';
  }

  /* ============================================================
   *  Format helpers
   * ============================================================ */
  function pad2(n) { return String(n).padStart(2, '0'); }

  function toDate(d) {
    if (d instanceof Date) return isNaN(d.getTime()) ? null : d;
    if (!d) return null;
    const x = new Date(d);
    return isNaN(x.getTime()) ? null : x;
  }

  function formatDate(d) {
    const x = toDate(d); if (!x) return '-';
    return x.toLocaleDateString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  }

  function formatDateLong(d) {
    const x = toDate(d); if (!x) return '-';
    return x.toLocaleDateString('id-ID', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
    });
  }

  function formatTime(d) {
    const x = toDate(d); if (!x) return '-';
    return pad2(x.getHours()) + ':' + pad2(x.getMinutes()) + ':' + pad2(x.getSeconds());
  }

  function formatDateTime(d) {
    const x = toDate(d); if (!x) return '-';
    return formatDate(x) + ' • ' + formatTime(x);
  }

  function formatNumber(n) {
    const num = Number(n) || 0;
    return num.toLocaleString('id-ID');
  }

  function formatPercent(a, b) {
    const t = (Number(a) || 0) / (Number(b) || 1);
    return Math.round(t * 100) + '%';
  }

  /* ============================================================
   *  Misc helpers
   * ============================================================ */
  function debounce(fn, wait) {
    let t;
    return function () {
      const ctx = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait || 300);
    };
  }

  function throttle(fn, wait) {
    let last = 0, timer = null;
    return function () {
      const ctx = this, args = arguments;
      const now = Date.now();
      const remaining = wait - (now - last);
      if (remaining <= 0) {
        if (timer) { clearTimeout(timer); timer = null; }
        last = now;
        fn.apply(ctx, args);
      } else if (!timer) {
        timer = setTimeout(function () {
          last = Date.now();
          timer = null;
          fn.apply(ctx, args);
        }, remaining);
      }
    };
  }

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  async function copy(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        toast('Disalin ke clipboard', 'success');
        return true;
      }
      const ta = el('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      toast('Disalin ke clipboard', 'success');
      return true;
    } catch (_) {
      toast('Gagal menyalin', 'error');
      return false;
    }
  }

  /* ============================================================
   *  Public API
   * ============================================================ */
  window.UI = {
    /* DOM */
    el: el,
    escapeHtml: escapeHtml,

    /* Notifications */
    toast: toast,

    /* Modal */
    modal: modal,
    closeModal: closeModal,
    confirm: confirmAsync,   // UI.confirm(...) -> Promise<boolean>
    prompt:  promptAsync,    // UI.prompt(msg, default) -> Promise<string|null>

    /* Feedback */
    loading: loading,
    skeleton: skeleton,

    /* Format */
    formatDate: formatDate,
    formatDateLong: formatDateLong,
    formatTime: formatTime,
    formatDateTime: formatDateTime,
    formatNumber: formatNumber,
    formatPercent: formatPercent,

    /* Utils */
    debounce: debounce,
    throttle: throttle,
    sleep: sleep,
    copy: copy
  };
})();