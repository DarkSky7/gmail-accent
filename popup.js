/* Gmail Accent popup */
'use strict';

const DEFAULTS = {
  enabled: true, color: '#7BC8CE', threshold: 190,
  tintDim: false, tintIcons: true, version: 2
};

const PRESETS = [
  ['#7BC8CE', 'muted cyan'],
  ['#D9A441', 'amber'],
  ['#8FD3A8', 'mint'],
  ['#D98FA8', 'rose'],
  ['#A99BE0', 'lavender'],
  ['#D8C9A3', 'sand']
];

const el = id => document.getElementById(id);
let settings = Object.assign({}, DEFAULTS);

function paintSwatches() {
  const box = el('presets');
  box.textContent = '';
  for (const [hex, name] of PRESETS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = name;
    b.dataset.hex = hex;
    b.style.background = hex;
    if (hex.toLowerCase() === settings.color.toLowerCase()) b.classList.add('on');
    b.addEventListener('click', () => setColor(hex));
    box.appendChild(b);
  }
}

function renderSettings() {
  el('enabled').checked = !!settings.enabled;
  el('color').value = settings.color;
  el('hex').value = settings.color.toUpperCase();
  el('threshold').value = settings.threshold;
  el('thresholdOut').textContent = settings.threshold;
  el('tintDim').checked = !!settings.tintDim;
  el('tintIcons').checked = !!settings.tintIcons;
  paintSwatches();
}

function save() {
  chrome.storage.sync.set(settings);
  pushToTab();
}

function pushToTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    const tab = tabs && tabs[0];
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { type: 'gm-accent:apply', settings }, res => {
      if (chrome.runtime.lastError || !res) {
        el('status').textContent = 'not a Gmail tab';
        return;
      }
      showStatus(res.hits, res.iconHits);
    });
  });
}

function showStatus(hits, iconHits) {
  if (hits === undefined) {
    el('status').textContent = '-';
    return;
  }
  const parts = [hits.toLocaleString() + (hits === 1 ? ' text' : ' text')];
  if (typeof iconHits === 'number' && iconHits > 0) parts.push(iconHits + ' icons');
  el('status').textContent = parts.join(' + ') + ' tinted';
}

function askStatus() {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    const tab = tabs && tabs[0];
    if (!tab) {
      el('status').textContent = 'no active tab';
      return;
    }
    chrome.tabs.sendMessage(tab.id, { type: 'gm-accent:status' }, res => {
      if (chrome.runtime.lastError || !res) {
        el('status').textContent = 'not a Gmail tab';
        return;
      }
      settings = Object.assign({}, settings, res.settings);
      renderSettings();
      showStatus(res.hits, res.iconHits);
    });
  });
}

const HEX = /^#[0-9a-fA-F]{6}$/;

function setColor(hex) {
  if (!HEX.test(hex)) return;
  settings.color = hex;
  el('color').value = hex;
  el('hex').value = hex.toUpperCase();
  paintSwatches();
  save();
}

el('enabled').addEventListener('change', e => {
  settings.enabled = e.target.checked;
  save();
});

el('color').addEventListener('input', e => setColor(e.target.value));

el('hex').addEventListener('change', e => {
  let v = e.target.value.trim();
  if (!v.startsWith('#')) v = '#' + v;
  if (HEX.test(v)) setColor(v);
  else e.target.value = settings.color.toUpperCase();
});

el('threshold').addEventListener('input', e => {
  settings.threshold = parseInt(e.target.value, 10);
  el('thresholdOut').textContent = settings.threshold;
  save();
});

el('tintDim').addEventListener('change', e => {
  settings.tintDim = e.target.checked;
  save();
});

el('tintIcons').addEventListener('change', e => {
  settings.tintIcons = e.target.checked;
  save();
});

el('reset').addEventListener('click', () => {
  settings = Object.assign({}, DEFAULTS);
  renderSettings();
  save();
});

chrome.storage.sync.get(DEFAULTS, stored => {
  settings = Object.assign({}, DEFAULTS, stored);
  if (!stored || stored.version !== DEFAULTS.version) {
    // v1 shipped threshold 200, which skipped Gmail's 196-ish near-whites
    settings.threshold = DEFAULTS.threshold;
    settings.tintIcons = DEFAULTS.tintIcons;
    settings.version = DEFAULTS.version;
    chrome.storage.sync.set(settings);
  }
  renderSettings();
  askStatus();
});
