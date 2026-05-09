const TYPES = ['switch','lightbulb','fan','garage','lock','thermostat',
  'temperature','humidity','motion','contact','smoke','co','leak','lightsensor','battery'];

let allDevices = [];

async function load() {
  try {
    const res = await homebridge.request('/devices');
    allDevices = res.devices || [];
    renderTable();
    document.getElementById('statusBar').innerHTML =
      'Showing <span>' + allDevices.filter(d => d.enabled).length + '</span> enabled of <span>' + allDevices.length + '</span> devices';
  } catch(e) {
    showMsg('Error loading devices: ' + e.message, 'err');
  }
}

function renderTable() {
  const q    = document.getElementById('search').value.toLowerCase();
  const enOn = document.getElementById('showEn').checked;
  const disOn= document.getElementById('showDis').checked;
  const tbody = document.getElementById('tbody');
  tbody.innerHTML = '';

  const filtered = allDevices.filter(d => {
    if (d.enabled && !enOn)  return false;
    if (!d.enabled && !disOn) return false;
    if (q) {
      const hay = (d.name + ' ' + d.voiceCommand + ' ' + d.location + ' ' + d.location2 + ' ' + d.type).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  for (const d of filtered) {
    const tr = document.createElement('tr');
    if (d.enabled) tr.className = 'enabled';
    tr.dataset.ref = d.ref;
    tr.innerHTML =
      '<td><input class="cb" type="checkbox"' + (d.enabled ? ' checked' : '') + ' onchange="toggle(' + d.ref + ',this)"></td>' +
      '<td><strong>' + esc(d.name) + '</strong></td>' +
      '<td>' + (d.voiceCommand ? '<span class="vc">' + esc(d.voiceCommand) + '</span>' : '<span style="color:#444">—</span>') + '</td>' +
      '<td><span class="loc">' + esc([d.location2, d.location].filter(Boolean).join(' / ')) + '</span></td>' +
      '<td><span class="val">' + esc(d.valueString || String(d.value)) + '</span></td>' +
      '<td><span style="color:#999;font-size:0.78rem">' + esc(d.deviceType || '—') + '</span></td>' +
      '<td><select onchange="changeType(' + d.ref + ',this.value)">' +
        TYPES.map(t => '<option value="' + t + '"' + (d.type === t ? ' selected' : '') + '>' + t + (t === d.autoType ? ' ★' : '') + '</option>').join('') +
      '</select></td>';
    tbody.appendChild(tr);
  }
}

function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function toggle(ref, cb) {
  const d = allDevices.find(x => x.ref === ref);
  if (d) { d.enabled = cb.checked; cb.closest('tr').className = d.enabled ? 'enabled' : ''; }
}

function changeType(ref, type) {
  const d = allDevices.find(x => x.ref === ref);
  if (d) d.type = type;
}

function toggleAll(cb) {
  document.querySelectorAll('#tbody tr').forEach(tr => {
    const ref = parseInt(tr.dataset.ref);
    const box = tr.querySelector('input[type=checkbox]');
    if (box) { box.checked = cb.checked; toggle(ref, box); }
  });
}

function filterTable() { renderTable(); }

function populateVoiceCommands() {
  let count = 0;
  for (const d of allDevices) {
    if (d.voiceCommand && !d.enabled) {
      d.enabled = true;
      count++;
    }
  }
  renderTable();
  showMsg('Enabled ' + count + ' device(s) with voice commands — click Save to apply', 'ok');
}

async function saveAll() {
  try {
    // Only send ref/type/enabled — not the full device objects
    const payload = allDevices.map(d => ({ ref: d.ref, type: d.type, enabled: d.enabled }));
    const res = await homebridge.request('/save', { devices: payload });
    if (res.ok) showMsg('Saved — ' + res.count + ' device(s) enabled in HomeKit', 'ok');
    else showMsg('Save failed: ' + (res.error || 'unknown error'), 'err');
  } catch(e) { showMsg('Error: ' + e.message, 'err'); }
}

async function refresh() {
  showMsg('Refreshing...', '');
  await load();
}

function showMsg(text, cls) {
  const el = document.getElementById('msg');
  el.textContent = text; el.className = cls;
  setTimeout(() => { el.textContent = ''; el.className = ''; }, 5000);
}


homebridge.getPluginConfig().then(configs => {
  const cfg = configs[0] || {};
  const port = cfg.uiPort || 8583;
  document.getElementById('devLink').href = 'http://' + window.location.hostname + ':' + port;
});

load();
