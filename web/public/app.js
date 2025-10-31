const chat = document.getElementById('chat');
const form = document.getElementById('form');
const input = document.getElementById('input');
// Identity modal elements
const identityBtn = document.getElementById('identityBtn');
const identityBadge = document.getElementById('identityBadge');
const identityModal = document.getElementById('identityModal');
const modalAccountId = document.getElementById('modalAccountId');
const modalPrivateKey = document.getElementById('modalPrivateKey');
const identityCancel = document.getElementById('identityCancel');
const identitySave = document.getElementById('identitySave');
const identityClear = document.getElementById('identityClear');

const identity = { accountId: undefined, privateKey: undefined };

function addMsg(role, text) {
  const div = document.createElement('div');
  div.className = `msg ${role === 'user' ? 'user' : 'assistant'}`;
  div.textContent = text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function addThinkingBubble() {
  const wrap = document.createElement('div');
  wrap.className = 'msg assistant';
  const loader = document.createElement('div');
  loader.className = 'loader show';
  loader.setAttribute('aria-live', 'polite');
  loader.setAttribute('aria-busy', 'true');
  loader.innerHTML = `
    <div class="orb"></div>
    <div class="orb"></div>
    <div class="orb"></div>
    <span style="color:var(--muted); font-size:12px; margin-left:6px;">Thinking securely…</span>
  `;
  wrap.appendChild(loader);
  chat.appendChild(wrap);
  chat.scrollTop = chat.scrollHeight;
  return wrap;
}

async function send(message) {
  addMsg('user', message);
  const btn = document.getElementById('send');
  btn.disabled = true;
  const thinkingEl = addThinkingBubble();
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        accountId: identity.accountId,
        privateKey: identity.privateKey
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    addMsg('assistant', data.content);
  } catch (e) {
    addMsg('assistant', `Error: ${e.message}`);
  } finally {
    btn.disabled = false;
    if (thinkingEl && thinkingEl.parentNode) thinkingEl.parentNode.removeChild(thinkingEl);
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  send(text);
});

// Identity modal logic
function openIdentity() {
  modalAccountId.value = identity.accountId || '';
  modalPrivateKey.value = identity.privateKey || '';
  identityModal.classList.add('open');
}
function closeIdentity() {
  identityModal.classList.remove('open');
}
function refreshBadge() {
  const set = !!(identity.accountId && identity.privateKey);
  identityBadge.style.display = set ? 'inline-block' : 'none';
}

identityBtn.addEventListener('click', () => openIdentity());
identityCancel.addEventListener('click', () => closeIdentity());
identitySave.addEventListener('click', () => {
  identity.accountId = modalAccountId.value.trim() || undefined;
  identity.privateKey = modalPrivateKey.value.trim() || undefined;
  refreshBadge();
  closeIdentity();
});
identityClear.addEventListener('click', () => {
  identity.accountId = undefined;
  identity.privateKey = undefined;
  modalAccountId.value = '';
  modalPrivateKey.value = '';
  refreshBadge();
  closeIdentity();
});

identityModal.addEventListener('click', (e) => {
  if (e.target === identityModal) closeIdentity();
});

refreshBadge();


