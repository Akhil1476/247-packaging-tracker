let flavorCount = 0;

// ── Flavor card factory ────────────────────────────────────────────────────────

function createFlavorCard() {
  flavorCount++;
  const num  = flavorCount;
  const card = document.createElement('div');
  card.className = 'flavor-card';

  card.innerHTML = `
    <div class="flavor-header">
      <span class="flavor-label">Flavor ${num}</span>
      <button type="button" class="btn btn-sm btn-danger-outline" onclick="removeFlavor(this)">Remove</button>
    </div>
    <div class="flavor-grid">
      <div class="field">
        <label>Flavor Name <span class="req">*</span></label>
        <input type="text" name="flavor" placeholder="e.g. Strawberry" />
      </div>
      <div class="field">
        <label>Batch Number <span class="req">*</span></label>
        <input type="text" name="batchNumber" placeholder="e.g. BT-2024-001" />
      </div>
      <div class="field">
        <label>Pallets <span class="req">*</span></label>
        <input type="number" name="pallets" placeholder="0" min="0" />
      </div>
      <div class="field">
        <label>Cans <span class="req">*</span></label>
        <input type="number" name="cans" placeholder="0" min="0" />
      </div>
      <div class="field">
        <label>Cases <span class="req">*</span></label>
        <input type="number" name="cases" placeholder="0" min="0" />
      </div>
      <div class="field">
        <label>Can Specifications <span class="req">*</span></label>
        <input type="text" name="canSpec" placeholder="e.g. 12oz, 330ml" />
      </div>
    </div>
    <div class="field flavor-note-field">
      <label>Note <span class="optional">(optional)</span></label>
      <input type="text" name="note" placeholder="Any additional specifications…" />
    </div>
  `;

  // Clear invalid highlight as the user types
  card.querySelectorAll('input').forEach(input => {
    input.addEventListener('input', () => input.classList.remove('invalid'));
  });

  return card;
}

function removeFlavor(btn) {
  btn.closest('.flavor-card').remove();
  renumberFlavors();
}

function renumberFlavors() {
  document.querySelectorAll('.flavor-card .flavor-label').forEach((el, i) => {
    el.textContent = `Flavor ${i + 1}`;
  });
}

// ── Validation ─────────────────────────────────────────────────────────────────

function validateHeaderFields() {
  let valid = true;
  ['customerName', 'loadDate', 'preparedBy'].forEach(id => {
    const el = document.getElementById(id);
    const empty = !el.value.trim();
    el.classList.toggle('invalid', empty);
    if (empty) valid = false;
  });
  return valid;
}

function validateAndCollectFlavors() {
  const cards = document.querySelectorAll('.flavor-card');
  if (!cards.length) return { flavors: null, error: 'Add at least one flavor.' };

  const REQUIRED = ['flavor', 'batchNumber', 'pallets', 'cans', 'cases', 'canSpec'];
  let allValid = true;
  const flavors = [];

  cards.forEach(card => {
    let cardValid = true;
    const data = {};

    REQUIRED.forEach(name => {
      const el    = card.querySelector(`[name="${name}"]`);
      const empty = el.value.trim() === '';
      el.classList.toggle('invalid', empty);
      if (empty) { cardValid = false; allValid = false; }
      else data[name] = el.value.trim();
    });

    // Note is optional — collect but never validate
    data.note = card.querySelector('[name="note"]')?.value.trim() || '';

    if (cardValid) flavors.push(data);
  });

  return allValid ? { flavors } : { flavors: null };
}

// ── BOL upload ─────────────────────────────────────────────────────────────────

const bolInput = document.getElementById('bolFile');

document.getElementById('btn-bol-browse').addEventListener('click', () => bolInput.click());

document.getElementById('btn-bol-clear').addEventListener('click', () => {
  bolInput.value = '';
  updateBolFileLabel();
});

bolInput.addEventListener('change', updateBolFileLabel);

function updateBolFileLabel() {
  const file = bolInput.files[0];
  document.getElementById('bol-file-name').textContent = file ? file.name : 'No file selected';
  document.getElementById('btn-bol-clear').hidden = !file;
}

async function uploadBol(id) {
  const file = bolInput.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('bol', file);

  try {
    const res = await fetch(`/api/submissions/${id}/bol`, { method: 'POST', body: formData });
    if (!res.ok) throw new Error();
  } catch {
    showToast('Load saved, but the BOL upload failed.', 'error');
  }
}

// ── Form submit ────────────────────────────────────────────────────────────────

document.getElementById('load-form').addEventListener('submit', async e => {
  e.preventDefault();

  const headerValid           = validateHeaderFields();
  const { flavors, error }    = validateAndCollectFlavors();

  if (error) { showToast(error, 'error'); return; }
  if (!headerValid || !flavors) { showToast('Please fill in all required fields.', 'error'); return; }

  const btn = document.getElementById('btn-submit');
  btn.disabled    = true;
  btn.textContent = 'Saving…';

  try {
    const res = await fetch('/api/submit', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName:     document.getElementById('customerName').value.trim(),
        loadDate:         document.getElementById('loadDate').value,
        preparedBy:       document.getElementById('preparedBy').value.trim(),
        pickupLocation:   document.getElementById('pickupLocation').value.trim(),
        deliveryLocation: document.getElementById('deliveryLocation').value.trim(),
        flavors,
      }),
    });
    if (!res.ok) throw new Error();
    const { id } = await res.json();

    await uploadBol(id);

    e.target.reset();
    document.getElementById('flavors-container').innerHTML = '';
    flavorCount = 0;
    document.getElementById('flavors-container').appendChild(createFlavorCard());
    updateBolFileLabel();

    showSuccessModal(id);
  } catch {
    showToast('Failed to save. Please try again.', 'error');
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Save Load';
  }
});

// ── Success modal ──────────────────────────────────────────────────────────────

function closeModal() {
  document.getElementById('success-modal').classList.remove('visible');
}

function triggerDownload(url) {
  const a = document.createElement('a');
  a.href     = url;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function showSuccessModal(id) {
  // Auto-download the pick sheet PDF
  triggerDownload(`/api/pick-sheet/${id}/pdf`);

  const modal = document.getElementById('success-modal');
  modal.classList.add('visible');

  document.getElementById('btn-new-load').onclick    = closeModal;
  document.getElementById('btn-close-modal').onclick = closeModal;
}

// Close modal when clicking the dark overlay
document.getElementById('success-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});

// ── Toast ──────────────────────────────────────────────────────────────────────

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = `toast ${type} visible`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('visible'), 3500);
}

// ── Init ───────────────────────────────────────────────────────────────────────

document.getElementById('btn-add-flavor').addEventListener('click', () => {
  document.getElementById('flavors-container').appendChild(createFlavorCard());
});

document.getElementById('flavors-container').appendChild(createFlavorCard());

// Show today's date in the header
document.getElementById('header-date').textContent = new Date().toLocaleDateString('en-US', {
  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
});
