let allSubmissions = [];

// ── Helpers ────────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return new Date(+y, +m - 1, +day).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ── Data ───────────────────────────────────────────────────────────────────────

async function loadData() {
  try {
    const res = await fetch('/api/submissions');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    allSubmissions = await res.json();
    updateStats();
    render(getFiltered());
  } catch (err) {
    console.error('Failed to load submissions:', err);
    showToast('Failed to load submissions.', 'error');
  }
}

function updateStats() {
  const today      = new Date().toDateString();
  const todayCount = allSubmissions.filter(s =>
    new Date(s.submittedAt).toDateString() === today
  ).length;
  const flavorLines = allSubmissions.reduce(
    (sum, s) => sum + (s.flavors?.length ?? 0), 0
  );
  document.getElementById('stat-total').textContent   = allSubmissions.length;
  document.getElementById('stat-today').textContent   = todayCount;
  document.getElementById('stat-flavors').textContent = flavorLines;
}

// ── Render ─────────────────────────────────────────────────────────────────────

function render(list) {
  const container = document.getElementById('submissions-list');

  if (!list.length) {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <rect x="3" y="3" width="18" height="18" rx="3"/>
          <path d="M8 10h8M8 14h5"/>
        </svg>
        <p>No submissions yet</p>
        <small>Saved loads from the client form will appear here.</small>
      </div>`;
    return;
  }

  container.innerHTML = list.map(buildCard).join('');
}

function buildCard(s) {
  const flavorCount = s.flavors?.length ?? 0;

  const flavorTable = flavorCount > 0 ? `
    <div class="flavors-table">
      <div class="table-heading">Flavor Details</div>
      <div class="flavor-row flavor-row-head">
        <span>Flavor</span>
        <span>Batch #</span>
        <span>Pallets</span>
        <span>Cans</span>
        <span>Cases</span>
        <span>Can Spec</span>
      </div>
      ${s.flavors.map(f => `
      <div class="flavor-row flavor-row-data${f.note ? ' has-note' : ''}">
        <span data-label="Flavor">${esc(f.flavor)}</span>
        <span data-label="Batch #">${esc(f.batchNumber)}</span>
        <span data-label="Pallets">${esc(f.pallets)}</span>
        <span data-label="Cans">${esc(f.cans)}</span>
        <span data-label="Cases">${esc(f.cases)}</span>
        <span data-label="Can Spec">${esc(f.canSpec)}</span>
      </div>
      ${f.note ? `<div class="flavor-note-row"><span class="note-label">Note</span>${esc(f.note)}</div>` : ''}`).join('')}
    </div>` : '';

  return `
    <div class="submission-card">
      <div class="card-header">
        <div>
          <h2>${esc(s.customerName)}</h2>
          <span class="card-meta">Submitted ${fmtDateTime(s.submittedAt)}</span>
        </div>
        <div class="card-actions">
          <span class="badge">${flavorCount} flavor${flavorCount !== 1 ? 's' : ''}</span>
          <a href="/api/pick-sheet/${esc(s.id)}/pdf"
             class="btn btn-sm btn-outline-white"
             download>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download PDF
          </a>
          <button class="btn btn-sm btn-danger-outline"
                  onclick="deleteSubmission('${esc(s.id)}')">Delete</button>
        </div>
      </div>

      <div class="card-info">
        <div class="info-item">
          <div class="info-label">Load Date</div>
          <div class="info-value">${fmtDate(s.loadDate)}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Prepared By</div>
          <div class="info-value">${esc(s.preparedBy)}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Reference</div>
          <div class="info-value ref">#${esc(s.id)}</div>
        </div>
        ${s.pickupLocation ? `
        <div class="info-item">
          <div class="info-label">Pickup Location</div>
          <div class="info-value">${esc(s.pickupLocation)}</div>
        </div>` : ''}
        ${s.deliveryLocation ? `
        <div class="info-item">
          <div class="info-label">Delivery Location</div>
          <div class="info-value">${esc(s.deliveryLocation)}</div>
        </div>` : ''}
      </div>

      ${flavorTable}
    </div>`;
}

// ── Delete ─────────────────────────────────────────────────────────────────────

async function deleteSubmission(id) {
  if (!confirm('Delete this submission?')) return;
  try {
    const res = await fetch(`/api/submissions/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error();
    allSubmissions = allSubmissions.filter(s => s.id !== id);
    updateStats();
    render(getFiltered());
    showToast('Submission deleted.');
  } catch {
    showToast('Failed to delete.', 'error');
  }
}

// ── Search ─────────────────────────────────────────────────────────────────────

function getFiltered() {
  const q = document.getElementById('search').value.toLowerCase().trim();
  if (!q) return allSubmissions;
  return allSubmissions.filter(s =>
    s.customerName?.toLowerCase().includes(q) ||
    s.preparedBy?.toLowerCase().includes(q) ||
    s.flavors?.some(f =>
      f.flavor?.toLowerCase().includes(q) ||
      f.batchNumber?.toLowerCase().includes(q)
    )
  );
}

// ── Toast ──────────────────────────────────────────────────────────────────────

function showToast(msg, type = 'success') {
  const t   = document.getElementById('toast');
  t.textContent = msg;
  t.className   = `toast ${type} visible`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('visible'), 3500);
}

// ── Init ───────────────────────────────────────────────────────────────────────

document.getElementById('search').addEventListener('input', () => render(getFiltered()));

loadData();
setInterval(loadData, 30_000);
