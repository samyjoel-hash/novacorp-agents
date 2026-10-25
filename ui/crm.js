const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const url = u => /^https?:\/\//i.test(u || '') ? u : (u ? 'https://' + u : '');
const day = d => d ? esc(String(d).slice(0, 10)) : '—';
const STAGES = [['new', 'New', '#85827a'], ['enriched', 'Enriched', '#3d6a99'], ['draft', 'Email ready', '#D97757'], ['sent', 'Sent', '#9a7425'], ['replied', 'Replied', '#3f7a3d'], ['rejected', 'Rejected', '#b9b6ac']];
const LABEL = Object.fromEntries(STAGES.map(([k, l]) => [k, l]));
const AV = ['#D97757', '#6A9BCC', '#788C5D', '#8A7FB3', '#C9A063', '#BD5D3A'];
const initials = n => (n || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
const avColor = n => AV[[...(n || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length];
let rows = [], stage = 'all', view = 'contacts', current = null;

// the stage of a prospect: where the outreach stands, else where the enrichment stands
const stageOf = r => r.email_status === 'replied' || r.replied_at ? 'replied' : r.email_status === 'sent' ? 'sent'
  : r.email_status === 'pending' ? 'draft' : r.status === 'rejected' || r.company_status === 'rejected' ? 'rejected'
  : r.company_status === 'enriched' ? 'enriched' : 'new';

$('#chips').innerHTML = [['all', 'All'], ...STAGES].map(([k, l]) => `<button class="chip${k === stage ? ' on' : ''}" data-k="${k}">${l}</button>`).join(' ');
$('#chips').onclick = e => { const b = e.target.closest('button'); if (!b) return; stage = b.dataset.k;
  document.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === b)); draw(); };
$('#search').oninput = draw;

document.querySelectorAll('.nav[data-v]').forEach(a => a.onclick = () => {
  view = a.dataset.v;
  document.querySelectorAll('.nav[data-v]').forEach(x => x.classList.toggle('on', x === a));
  $('#vContacts').hidden = view !== 'contacts'; $('#vPipeline').hidden = view !== 'pipeline'; $('#vSettings').hidden = view !== 'settings';
  $('#kpis').hidden = view === 'settings';
  $('#title').textContent = { contacts: 'Contacts', pipeline: 'Pipeline', settings: 'Settings' }[view];
  $('#subtitle').textContent = { contacts: 'Every prospect found by the agents', pipeline: 'Where each prospect stands, from scraped to replied',
    settings: 'Integrations: the accounts the agents work with' }[view];
  if (view === 'settings') loadSettings(); else draw();
});

function draw() {
  const n = s => rows.filter(r => stageOf(r) === s).length;
  $('#nContacts').textContent = rows.length;
  $('#kpis').innerHTML = [['Prospects', rows.length], ['Companies', new Set(rows.map(r => r.company_id)).size], ['Emails ready', n('draft')], ['Emails sent', n('sent') + n('replied')], ['Replied', n('replied')]]
    .map(([k, v]) => `<div class="kpi"><span>${k}</span><b>${v}</b></div>`).join('');
  if (view === 'pipeline') {
    $('#vPipeline').innerHTML = STAGES.map(([k, l, c]) => { const list = rows.filter(r => stageOf(r) === k);
      return `<div class="col"><h4><span><i style="background:${c}"></i>${l}</span><span class="sub">${list.length}</span></h4>${list.map(r =>
        `<div class="tile" data-id="${r.id}"><b>${esc(r.name)}</b>${esc(r.company)}<br><small class="sub">${esc(r.role || '')}${r.sent_at ? ' · sent ' + day(r.sent_at) : ' · scraped ' + day(r.scraped_at)}</small></div>`).join('')}</div>`; }).join('');
    return;
  }
  const q = $('#search').value.trim().toLowerCase();
  const list = rows.filter(r => (stage === 'all' || stageOf(r) === stage) &&
    (!q || [r.name, r.role, r.company, r.city, r.email].some(v => (v || '').toLowerCase().includes(q))));
  $('#rows').innerHTML = list.map(r => `<tr data-id="${r.id}" class="${current === r.id ? 'sel' : ''}">
    <td><div class="who"><span class="av" style="background:${avColor(r.name)}">${esc(initials(r.name))}</span><div><span class="name">${esc(r.name)}</span><br><small>${esc(r.role || '—')}</small></div></div></td>
    <td>${esc(r.company)}<br><small>${esc(r.city || '')}</small></td>
    <td>${r.email ? esc(r.email) : '<small>—</small>'}</td>
    <td class="num">${day(r.scraped_at)}</td>
    <td><span class="st ${stageOf(r)}">${LABEL[stageOf(r)]}</span></td>
    <td class="num">${day(r.sent_at)}</td>
    <td class="num">${r.followups || 0}</td></tr>`).join('');
  $('#empty').hidden = rows.length > 0;
}
$('#rows').onclick = e => { const tr = e.target.closest('tr'); if (tr) open(+tr.dataset.id); };
$('#vPipeline').onclick = e => { const t = e.target.closest('.tile'); if (t) open(+t.dataset.id); };

async function load() {
  try { rows = await (await fetch('/api/crm', { cache: 'no-store' })).json(); draw(); } catch {}
  try {
    const s = await (await fetch('/api/stats', { cache: 'no-store' })).json();
    $('#agents').innerHTML = `<span class="dot${s.busy ? ' on' : ''}"></span>${s.busy ? 'The agents are working' : 'Agents idle'}`;
  } catch { $('#agents').innerHTML = '<span class="dot"></span>Server unreachable'; }
}
load(); setInterval(load, 5000);

const links = o => { const e = Object.entries(o || {}); return e.length ? `<div class="links">${e.map(([k, v]) => `<a href="${esc(url(v))}" target="_blank" rel="noopener">${esc(k)}</a>`).join('')}</div>` : '—'; };
const addDays = (d, n) => { const t = new Date(String(d).replace(' ', 'T')); t.setDate(t.getDate() + n); return t.toISOString().slice(0, 10); };

async function open(id) {
  current = id; draw();
  const d = await (await fetch('/api/crm/contact?id=' + id, { cache: 'no-store' })).json();
  if (d.error) return;
  const c = d.contact, co = d.company;
  $('#dAv').textContent = initials(c.name); $('#dAv').style.background = avColor(c.name);
  $('#dName').textContent = c.name;
  $('#dRole').innerHTML = `${esc(c.role || 'Role unknown')} · <b>${esc(co.name)}</b>${co.city ? ' · ' + esc(co.city) : ''}`;
  const pLinks = { ...(c.linkedin ? { linkedin: c.linkedin } : {}), ...c.links };
  const coLinks = { ...(co.domain ? { website: co.domain } : {}), ...co.links };
  const mails = d.drafts.map(m => {
    const lastTouch = [m.sent_at, ...m.followups.map(f => f.sent_at)].filter(Boolean).sort().pop();
    const next = m.status === 'sent' && lastTouch && m.followups.length < d.followup_max && !m.followups.some(f => f.status === 'pending')
      ? `<div class="sub">Next follow-up prepared automatically on <b>${addDays(lastTouch, d.followup_days)}</b> if there is no reply.</div>` : '';
    return `<div class="mail"><b>${esc(m.subject || '(no subject)')}</b> <span class="st ${esc(m.status)}">${esc(m.status)}</span>
      <div class="sub">Written ${day(m.created_at)} · Sent ${day(m.sent_at)} · Replied ${day(m.replied_at)}</div>${next}
      <details><summary class="sub">Read the email</summary><pre>${esc(m.content)}</pre></details>
      <div class="acts">${m.status === 'pending' ? `<button data-d="${m.id}" data-s="sent">✓ I sent it</button>` : ''}${m.status === 'sent' ? `<button data-d="${m.id}" data-s="replied">↩ They replied</button>` : ''}</div>
      ${m.followups.map(f => `<div class="mail" style="margin:10px 0 0;background:var(--ivory)"><b>Follow-up ${f.number}</b> <span class="st ${esc(f.status)}">${esc(f.status)}</span>
        <div class="sub">Prepared ${day(f.created_at)} · Sent ${day(f.sent_at)}</div>
        <details><summary class="sub">Read the follow-up</summary><pre>${esc(f.content)}</pre></details>
        ${f.status === 'pending' ? `<div class="acts"><button data-f="${f.id}">✓ I sent it</button></div>` : ''}</div>`).join('')}</div>`;
  }).join('') || '<div class="sub">No email written yet.</div>';
  $('#dBody').innerHTML = `
    <section><h3>Contact</h3><dl>
      <dt>Email</dt><dd>${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '—'}${c.email_source ? `<br><small class="sub">source: ${esc(c.email_source)}</small>` : ''}</dd>
      <dt>Phone</dt><dd>${esc(c.phone || co.phone || '—')}</dd>
      <dt>Networks</dt><dd>${links(pLinks)}</dd>
      <dt>Scraped on</dt><dd>${day(c.added_at)} <small class="sub">· source: ${esc(c.source || '—')}</small></dd>
    </dl></section>
    <section><h3>Company</h3><dl>
      <dt>Name</dt><dd><b>${esc(co.name)}</b></dd>
      <dt>Links</dt><dd>${links(coLinks)}</dd>
      <dt>Category</dt><dd>${esc(co.category || '—')}</dd>
      <dt>Google rating</dt><dd>${co.rating ? `${esc(co.rating)} ★ (${esc(co.reviews || 0)} reviews)` : '—'}</dd>
      <dt>Registration no.</dt><dd>${esc(co.registry_id || '—')}</dd>
      <dt>Employees</dt><dd>${esc(co.headcount || '—')}</dd>
      <dt>Address</dt><dd>${esc(co.address || co.city || '—')}${co.country ? ' · ' + esc(co.country) : ''}</dd>
      <dt>Founded</dt><dd>${day(co.created_on)}</dd>
    </dl></section>
    <section><h3>Company debrief</h3><div class="brief">${esc(co.debrief || 'Not written yet: the Data Enrichment agent adds it.')}</div></section>
    <section><h3>Data enrichment</h3><dl>
      <dt>Status</dt><dd><span class="st ${esc(co.status)}">${esc(co.status)}</span></dd>
      <dt>Scraped on</dt><dd>${day(co.added_at)}</dd>
      <dt>Enriched on</dt><dd>${day(co.enriched_at)}</dd>
      <dt>Hook</dt><dd>${esc(co.hook || '—')}</dd>
      <dt>Notes</dt><dd>${esc(co.notes || '—')}</dd>
    </dl></section>
    <section><h3>Emails &amp; follow-ups</h3>${mails}</section>
    ${d.colleagues.length ? `<section><h3>Other people at ${esc(co.name)}</h3>${d.colleagues.map(p => `<span class="person" data-c="${p.id}">${esc(p.name)} <small class="sub">${esc(p.role || '')}${p.email ? ' · ' + esc(p.email) : ''}</small></span>`).join('')}</section>` : ''}
    <section><h3>Agent activity on this company</h3>${d.history.length ? `<ul class="timeline">${d.history.reverse().map(l => `<li>${esc(l).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</li>`).join('')}</ul>` : '<div class="sub">Nothing logged yet.</div>'}</section>`;
  $('#drawer').classList.add('open'); $('#drawer').setAttribute('aria-hidden', 'false');
}
async function mark(body) { await fetch('/api/mark', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); await load(); open(current); }
$('#dBody').onclick = e => {
  const t = e.target.closest('button,[data-c]'); if (!t) return;
  if (t.dataset.c) open(+t.dataset.c);
  else if (t.dataset.d) mark({ draft_id: +t.dataset.d, state: t.dataset.s });
  else if (t.dataset.f) mark({ followup_id: +t.dataset.f });
};
// ---- settings: each user connects their own Anthropic, Apify and ScrapingBee accounts
const post = (u, body) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
function drawSettings(st) {
  $('#claudeMode').innerHTML = st.claude_mode === 'api_key'
    ? '<br>The agents run on <b>your Anthropic API key</b>.'
    : '<br>No Anthropic key saved: the agents run on the Claude account logged in on this server.';
  $('#keys').innerHTML = st.keys.map(k => `<div class="key" data-k="${k.name}">
    <div class="head"><b>${esc(k.label.split(':')[0])}</b><span class="st ${k.set ? 'replied' : ''}">${k.set ? 'Connected' : 'Not connected'}</span>
      <span class="sub">${esc(k.label.split(':').slice(1).join(':').trim())}</span></div>
    <div class="sub" style="margin-top:4px">${k.set ? `Saved key: <code>${esc(k.masked)}</code> · ` : ''}<a href="${esc(k.help)}" target="_blank" rel="noopener">Get a key</a> · <code>${k.name}</code></div>
    <div class="row"><input type="password" autocomplete="off" spellcheck="false" placeholder="${k.set ? 'Paste a new key to replace it' : 'Paste your key'}">
      <button class="primary" data-a="save">Save</button><button data-a="test"${k.set ? '' : ' disabled'}>Test</button>${k.set ? '<button data-a="remove">Remove</button>' : ''}</div>
    <div class="msg"></div></div>`).join('');
}
async function loadSettings() { try { drawSettings(await (await fetch('/api/settings', { cache: 'no-store' })).json()); } catch {} }
$('#keys').onclick = async e => {
  const b = e.target.closest('button'); if (!b) return;
  const card = b.closest('.key'), name = card.dataset.k, input = card.querySelector('input'), msg = () => card.querySelector('.msg');
  const say = (t, ok) => { const m = msg(); m.textContent = t; m.className = 'msg ' + (ok ? 'ok' : 'bad'); };
  if (b.dataset.a === 'test') { say('Testing…', true); const r = await post('/api/settings/test', { name }); return say(r.detail, r.ok); }
  if (b.dataset.a === 'save' && !input.value.trim()) return say('Paste a key first.', false);
  const value = b.dataset.a === 'remove' ? '' : input.value.trim();
  input.value = '';
  const r = await post('/api/settings', { name, value });
  if (r.error) return say(r.error, false);
  drawSettings(r);
  const card2 = document.querySelector(`.key[data-k="${name}"]`);
  if (value) { card2.querySelector('.msg').textContent = 'Saved. Testing…'; card2.querySelector('.msg').className = 'msg ok';
    const t = await post('/api/settings/test', { name }); card2.querySelector('.msg').textContent = t.detail; card2.querySelector('.msg').className = 'msg ' + (t.ok ? 'ok' : 'bad'); }
};

const close = () => { current = null; $('#drawer').classList.remove('open'); $('#drawer').setAttribute('aria-hidden', 'true'); draw(); };
$('#dClose').onclick = close;
addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
