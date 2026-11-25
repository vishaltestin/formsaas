export const dynamic = "force-static"

/**
 * Digital Fueled embed loader. Usage examples:
 *
 *  Inline widget:   <div data-formstudio-inline="my-form"></div>
 *  Popup trigger:   <button data-formstudio-popup="my-form">Open</button>
 *  Drawer trigger:  <button data-formstudio-drawer="my-form">Feedback</button>
 *  Timed popup:     <script src=".../api/embed.js" data-popup="my-form" data-delay="5" async></script>
 *  Feedback tab:    <script src=".../api/embed.js" data-tab="my-form" data-tab-label="Feedback" async></script>
 *  Launcher button: <script src=".../api/embed.js" data-launcher="my-form" data-launcher-text="Contact us" async></script>
 *
 *  JS API: window.FormStudio.open("my-form", { type: "popup" | "drawer" }), window.FormStudio.close()
 */
const LOADER = String.raw`(function () {
  if (window.FormStudio && window.FormStudio.__loaded) { window.FormStudio.init(); return; }
  var script = document.currentScript || (function () { var s = document.querySelectorAll('script[src*="/api/embed.js"]'); return s[s.length - 1]; })();
  var BASE = (function () { try { return new URL(script.src).origin; } catch (e) { return window.location.origin; } })();
  var frames = [];
  var overlay = null;

  function css(el, styles) { for (var k in styles) el.style[k] = styles[k]; return el; }
  function src(slug, type) {
    var q = new URLSearchParams(window.location.search);
    var p = new URLSearchParams();
    p.set('src', type);
    ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','ref'].forEach(function (k) { if (q.get(k)) p.set(k, q.get(k)); });
    p.set('parent_referrer', document.referrer || window.location.href);
    return BASE + '/embed/' + encodeURIComponent(slug) + '?' + p.toString();
  }
  function makeFrame(slug, type, minHeight) {
    var f = document.createElement('iframe');
    f.src = src(slug, type);
    f.title = 'Form';
    f.setAttribute('allow', 'clipboard-write');
    f.setAttribute('loading', 'lazy');
    css(f, { width: '100%', border: '0', display: 'block', minHeight: (minHeight || 200) + 'px', height: (minHeight || 400) + 'px', background: 'transparent', colorScheme: 'normal' });
    frames.push(f);
    return f;
  }

  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || d.type !== 'FORM_RESIZE' || typeof d.height !== 'number') return;
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].contentWindow === e.source) {
        var fixed = frames[i].getAttribute('data-fs-fixed');
        if (!fixed) frames[i].style.height = Math.max(120, d.height) + 'px';
      }
    }
  });

  function mountInline(el) {
    if (el.__fsMounted) return; el.__fsMounted = true;
    el.innerHTML = '';
    el.appendChild(makeFrame(el.getAttribute('data-formstudio-inline'), 'script', 300));
  }

  function close() {
    if (!overlay) return;
    var o = overlay; overlay = null;
    var panel = o.firstChild;
    o.style.opacity = '0';
    if (panel && panel.getAttribute('data-kind') === 'drawer') panel.style.transform = 'translateX(100%)';
    else if (panel) panel.style.transform = 'translateY(12px) scale(.98)';
    setTimeout(function () { if (o.parentNode) o.parentNode.removeChild(o); document.documentElement.style.overflow = ''; }, 200);
  }

  function open(slug, opts) {
    opts = opts || {};
    var type = opts.type === 'drawer' ? 'drawer' : 'popup';
    close();
    var o = document.createElement('div');
    css(o, { position: 'fixed', inset: '0', zIndex: '2147483000', background: 'rgba(10,10,12,.48)', opacity: '0', transition: 'opacity .2s ease', display: 'flex', alignItems: type === 'drawer' ? 'stretch' : 'center', justifyContent: type === 'drawer' ? 'flex-end' : 'center', padding: type === 'drawer' ? '0' : '16px' });
    var panel = document.createElement('div');
    panel.setAttribute('data-kind', type);
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    if (type === 'drawer') css(panel, { width: '100%', maxWidth: (opts.width || 520) + 'px', height: '100%', background: '#fff', transform: 'translateX(100%)', transition: 'transform .25s ease', overflow: 'auto', position: 'relative', boxShadow: '-1px 0 0 rgba(0,0,0,.08)' });
    else css(panel, { width: '100%', maxWidth: (opts.width || 680) + 'px', maxHeight: '88vh', background: '#fff', borderRadius: '14px', overflow: 'auto', transform: 'translateY(12px) scale(.98)', transition: 'transform .2s ease', position: 'relative' });
    var btn = document.createElement('button');
    btn.type = 'button'; btn.setAttribute('aria-label', 'Close'); btn.innerHTML = '&#x2715;';
    css(btn, { position: 'sticky', top: '10px', float: 'right', marginRight: '10px', zIndex: '2', width: '30px', height: '30px', borderRadius: '999px', border: '1px solid rgba(0,0,0,.12)', background: '#fff', cursor: 'pointer', fontSize: '13px', lineHeight: '1', color: '#111' });
    btn.onclick = close;
    var frame = makeFrame(slug, type, type === 'drawer' ? 600 : 420);
    if (type === 'drawer') { frame.setAttribute('data-fs-fixed', '1'); frame.style.height = '100%'; frame.style.minHeight = '100%'; }
    frame.removeAttribute('loading');
    panel.appendChild(btn); panel.appendChild(frame); o.appendChild(panel);
    o.addEventListener('click', function (e) { if (e.target === o) close(); });
    document.body.appendChild(o);
    document.documentElement.style.overflow = 'hidden';
    overlay = o;
    requestAnimationFrame(function () { o.style.opacity = '1'; panel.style.transform = 'none'; });
  }

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-formstudio-popup],[data-formstudio-drawer]') : null;
    if (!t) return;
    e.preventDefault();
    if (t.hasAttribute('data-formstudio-drawer')) open(t.getAttribute('data-formstudio-drawer'), { type: 'drawer' });
    else open(t.getAttribute('data-formstudio-popup'), { type: 'popup' });
  });

  function floating(label, color, textColor, position, onClick, vertical) {
    var b = document.createElement('button');
    b.type = 'button'; b.textContent = label;
    var base = { position: 'fixed', zIndex: '2147482000', background: color || '#18181b', color: textColor || '#fff', border: '0', cursor: 'pointer', font: '600 14px/1 system-ui, -apple-system, Segoe UI, sans-serif', boxShadow: '0 1px 2px rgba(0,0,0,.2)' };
    if (vertical) css(b, Object.assign(base, { right: '0', top: '50%', transform: 'translateY(-50%) rotate(-90deg)', transformOrigin: 'right bottom', padding: '10px 16px', borderRadius: '8px 8px 0 0' }));
    else css(b, Object.assign(base, position === 'left' ? { left: '20px' } : { right: '20px' }, { bottom: '20px', padding: '12px 18px', borderRadius: '999px' }));
    b.onclick = onClick;
    document.body.appendChild(b);
    return b;
  }

  function init() {
    var nodes = document.querySelectorAll('[data-formstudio-inline]');
    for (var i = 0; i < nodes.length; i++) mountInline(nodes[i]);
    if (!script || script.__fsInit) return;
    script.__fsInit = true;
    var d = script.dataset || {};
    if (d.popup) {
      var delay = Number(d.delay || 0);
      if (delay >= 0 && d.trigger !== 'click') setTimeout(function () { open(d.popup, { type: 'popup' }); }, delay * 1000);
    }
    if (d.tab) floating(d.tabLabel || 'Feedback', d.tabColor, d.tabTextColor, 'right', function () { open(d.tab, { type: 'drawer' }); }, true);
    if (d.launcher) floating(d.launcherText || 'Open form', d.launcherColor, d.launcherTextColor, d.launcherPosition, function () { open(d.launcher, { type: d.launcherType === 'drawer' ? 'drawer' : 'popup' }); }, false);
  }

  window.FormStudio = { __loaded: true, open: open, close: close, init: init, mount: mountInline };
  window.DigitalFueled = window.FormStudio;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();`

export function GET() {
  return new Response(LOADER, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=3600",
      "Access-Control-Allow-Origin": "*",
    },
  })
}
