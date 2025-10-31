const chat = document.getElementById('chat');
const form = document.getElementById('form');
const input = document.getElementById('input');
const accountIdEl = document.getElementById('accountId');
const privateKeyEl = document.getElementById('privateKey');

function addMsg(role, text) {
  const div = document.createElement('div');
  div.className = `msg ${role === 'user' ? 'user' : 'assistant'}`;
  div.textContent = text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

async function send(message) {
  addMsg('user', message);
  const btn = document.getElementById('send');
  btn.disabled = true;
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        accountId: accountIdEl.value.trim() || undefined,
        privateKey: privateKeyEl.value.trim() || undefined
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    addMsg('assistant', data.content);
  } catch (e) {
    addMsg('assistant', `Error: ${e.message}`);
  } finally {
    btn.disabled = false;
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  send(text);
});


