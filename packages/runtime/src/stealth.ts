/**
 * stealth.ts
 *
 * Comprehensive browser fingerprint spoofing.
 * Injected as an initScript into every BrowserContext so it runs before
 * any page JavaScript — including bot-detection scripts.
 *
 * Covers the major fingerprinting vectors:
 *   1. navigator.webdriver flag
 *   2. Chrome runtime object (missing on headless Chrome)
 *   3. navigator.plugins (empty on headless)
 *   4. navigator.languages
 *   5. Permissions API (reports "prompt" not "denied")
 *   6. WebGL vendor/renderer (reports a real GPU string)
 *   7. Canvas 2D noise (breaks perceptual hash fingerprinting)
 *   8. AudioContext noise (breaks AudioContext fingerprinting)
 *   9. CDP/Playwright-specific global cleanup
 *  10. Consistent screen/window dimensions
 */

/** A realistic recent Chrome UA for macOS — update periodically */
export const CHROME_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/131.0.0.0 Safari/537.36";

/**
 * The init script string — injected via context.addInitScript().
 * Must be self-contained (no imports, no closures from outer scope).
 */
export const STEALTH_SCRIPT = /* javascript */ `
(function () {
  'use strict';

  // ── 1. navigator.webdriver ──────────────────────────────────────────────────
  Object.defineProperty(navigator, 'webdriver', {
    get: () => undefined,
    configurable: true,
  });

  // ── 2. Chrome runtime ───────────────────────────────────────────────────────
  if (!window.chrome) {
    const now = Date.now();
    window.chrome = {
      app: {
        isInstalled: false,
        InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
        RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
      },
      runtime: {
        PlatformOs: { MAC: 'mac', WIN: 'win', ANDROID: 'android', CROS: 'cros', LINUX: 'linux', OPENBSD: 'openbsd' },
        PlatformArch: { ARM: 'arm', X86_32: 'x86-32', X86_64: 'x86-64' },
        PlatformNaclArch: { ARM: 'arm', X86_32: 'x86-32', X86_64: 'x86-64' },
        RequestUpdateCheckStatus: { THROTTLED: 'throttled', NO_UPDATE: 'no_update', UPDATE_AVAILABLE: 'update_available' },
        OnInstalledReason: { INSTALL: 'install', UPDATE: 'update', CHROME_UPDATE: 'chrome_update', SHARED_MODULE_UPDATE: 'shared_module_update' },
        OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' },
        connect: function () {},
        sendMessage: function () {},
      },
      loadTimes: function () {
        return {
          commitLoadTime: now / 1000 - 0.5,
          connectionInfo: 'h2',
          finishDocumentLoadTime: now / 1000,
          finishLoadTime: now / 1000 + 0.1,
          firstPaintAfterLoadTime: 0,
          firstPaintTime: now / 1000 - 0.1,
          navigationType: 'Other',
          npnNegotiatedProtocol: 'h2',
          requestTime: now / 1000 - 0.8,
          startLoadTime: now / 1000 - 0.5,
          wasAlternateProtocolAvailable: false,
          wasFetchedViaSpdy: true,
          wasNpnNegotiated: true,
        };
      },
      csi: function () {
        return { onloadT: now, pageT: 3400 + Math.random() * 200, startE: now - 3500, tran: 15 };
      },
    };
  }

  // ── 3. navigator.plugins ────────────────────────────────────────────────────
  // Headless Chrome has 0 plugins; real Chrome has at least 3.
  const pluginData = [
    { name: 'Chrome PDF Plugin',  filename: 'internal-pdf-viewer',                   description: 'Portable Document Format',  mimeTypes: [{ type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: 'Portable Document Format' }] },
    { name: 'Chrome PDF Viewer',  filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai',      description: '',                          mimeTypes: [{ type: 'application/pdf',                  suffixes: 'pdf', description: '' }] },
    { name: 'Native Client',      filename: 'internal-nacl-plugin',                  description: '',                          mimeTypes: [{ type: 'application/x-nacl',               suffixes: '',    description: 'Native Client Executable' }, { type: 'application/x-pnacl', suffixes: '', description: 'Portable Native Client Executable' }] },
  ];

  const makePlugin = (data) => {
    const mimeTypes = data.mimeTypes.map((mt) => Object.create(MimeType.prototype, {
      type: { value: mt.type }, suffixes: { value: mt.suffixes }, description: { value: mt.description }, enabledPlugin: { value: null },
    }));
    const plugin = Object.create(Plugin.prototype, {
      name: { value: data.name }, filename: { value: data.filename }, description: { value: data.description }, length: { value: mimeTypes.length },
    });
    mimeTypes.forEach((mt, i) => { plugin[i] = mt; mt.enabledPlugin = plugin; });
    return plugin;
  };

  try {
    const plugins = pluginData.map(makePlugin);
    const pluginArray = Object.create(PluginArray.prototype, {
      length: { value: plugins.length },
      ...Object.fromEntries(plugins.map((p, i) => [i, { value: p, enumerable: true }])),
    });
    plugins.forEach(p => { pluginArray[p.name] = p; });
    pluginArray.item = (i) => plugins[i] || null;
    pluginArray.namedItem = (name) => plugins.find(p => p.name === name) || null;
    pluginArray.refresh = () => {};
    Object.defineProperty(navigator, 'plugins', { get: () => pluginArray, configurable: true });
    Object.defineProperty(navigator, 'mimeTypes', { get: () => ({ length: 4, item: () => null, namedItem: () => null }), configurable: true });
  } catch (_) { /* PluginArray not available in this context */ }

  // ── 4. navigator.languages ──────────────────────────────────────────────────
  Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'], configurable: true });
  Object.defineProperty(navigator, 'language',  { get: () => 'en-US', configurable: true });

  // ── 5. Permissions API ──────────────────────────────────────────────────────
  if (navigator.permissions && navigator.permissions.query) {
    const _origQuery = navigator.permissions.query.bind(navigator.permissions);
    Object.defineProperty(navigator.permissions, 'query', {
      value: (params) => {
        if (params && params.name === 'notifications') {
          return Promise.resolve(Object.create(PermissionStatus.prototype, {
            state: { value: 'prompt' }, onchange: { value: null },
          }));
        }
        return _origQuery(params);
      },
      configurable: true,
    });
  }

  // ── 6. WebGL vendor / renderer ──────────────────────────────────────────────
  // UNMASKED_VENDOR_WEBGL = 37445, UNMASKED_RENDERER_WEBGL = 37446
  const _getParam = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function (param) {
    if (param === 37445) return 'Intel Inc.';
    if (param === 37446) return 'Intel Iris Pro OpenGL Engine';
    return _getParam.call(this, param);
  };
  try {
    const _getParam2 = WebGL2RenderingContext.prototype.getParameter;
    WebGL2RenderingContext.prototype.getParameter = function (param) {
      if (param === 37445) return 'Intel Inc.';
      if (param === 37446) return 'Intel Iris Pro OpenGL Engine';
      return _getParam2.call(this, param);
    };
  } catch (_) {}

  // ── 7. Canvas 2D noise ──────────────────────────────────────────────────────
  // Add imperceptible pixel noise so the canvas hash differs from headless baseline.
  // Uses a seeded pseudo-random so noise is stable per-session but unique per origin.
  const _seed = (window.location.hostname.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 256);
  const _noise = () => ((_seed * 9301 + 49297) % 233280) / 233280 * 2 - 1;

  const _origToDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function (...args) {
    const ctx = this.getContext('2d');
    if (ctx && this.width > 0 && this.height > 0) {
      try {
        const imgData = ctx.getImageData(0, 0, 1, 1);
        imgData.data[0] = Math.max(0, Math.min(255, imgData.data[0] + _noise()));
        ctx.putImageData(imgData, 0, 0);
      } catch (_) {}
    }
    return _origToDataURL.apply(this, args);
  };

  const _origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
  CanvasRenderingContext2D.prototype.getImageData = function (x, y, w, h) {
    const data = _origGetImageData.call(this, x, y, w, h);
    // Add sub-pixel noise on every 100th byte
    for (let i = 0; i < data.data.length; i += 100) {
      data.data[i] = Math.max(0, Math.min(255, data.data[i] + (_noise() > 0 ? 1 : -1)));
    }
    return data;
  };

  // ── 8. AudioContext noise ───────────────────────────────────────────────────
  try {
    const _origGetChannelData = AudioBuffer.prototype.getChannelData;
    AudioBuffer.prototype.getChannelData = function (...args) {
      const data = _origGetChannelData.apply(this, args);
      for (let i = 0; i < data.length; i += 500) {
        data[i] = data[i] + _noise() * 0.0000001;
      }
      return data;
    };
  } catch (_) {}

  // ── 9. Remove CDP / Playwright globals ──────────────────────────────────────
  const cdpGlobals = ['__playwright', '__pw_manual', '__PW_inspect_api', '__selenium_unwrapped', 'callSelenium', '_selenium', 'webdriverCallback', 'webdriverPrematureRequest'];
  cdpGlobals.forEach(k => { try { delete window[k]; } catch (_) {} });

  // ── 10. Screen / window dimensions ─────────────────────────────────────────
  // Headless Chrome leaves outerWidth/outerHeight at 0.
  if (window.outerWidth === 0) {
    Object.defineProperty(window, 'outerWidth',  { get: () => window.innerWidth,       configurable: true });
    Object.defineProperty(window, 'outerHeight', { get: () => window.innerHeight + 89, configurable: true });
  }

  // ── 11. iframe contentWindow propagation ───────────────────────────────────
  // Bot detectors sometimes spawn iframes to check consistency.
  const _origDescriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
  if (_origDescriptor) {
    Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
      get() {
        const win = _origDescriptor.get.call(this);
        if (win && win.navigator && !win.navigator.__stealthPatched) {
          try {
            Object.defineProperty(win.navigator, 'webdriver', { get: () => undefined, configurable: true });
            win.navigator.__stealthPatched = true;
          } catch (_) {}
        }
        return win;
      },
      configurable: true,
    });
  }
})();
`;
