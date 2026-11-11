/* FIFA League — plain JavaScript, no frameworks.
 * Data lives in Supabase (shared + live) and is also cached on the phone
 * so the app opens and works offline. Changes made offline are queued and
 * sent when the connection comes back.
 */
(function () {
  'use strict';

  const CFG = window.LEAGUE_CONFIG || {};
  const STORE_KEY = 'fifa-league-state-v1';
  const OUTBOX_KEY = 'fifa-league-outbox-v1';

  // ---------- Defaults (used before the database has loaded / local mode) ----------
  const DEFAULT_PLAYERS = [
    { id: 'p1', name: 'Zayn', team: 'United' },
    { id: 'p2', name: 'Adil', team: 'Spurs' },
    { id: 'p3', name: 'Anant', team: 'Chelsea' }
  ];
  function defaultMatches() {
    const pairs = [['p1', 'p2'], ['p2', 'p3'], ['p3', 'p1'], ['p2', 'p1'], ['p3', 'p2'], ['p1', 'p3']];
    const base = Date.UTC(2026, 0, 1);
    return pairs.map(([home, away], i) => ({
      id: 'seed-' + (i + 1), home, away, home_goals: null, away_goals: null,
      created_at: new Date(base + i * 60000).toISOString()
    }));
  }

  // ---------- State ----------
  let state = load(STORE_KEY) || { players: DEFAULT_PLAYERS, matches: defaultMatches() };
  let outbox = load(OUTBOX_KEY) || [];
  let sb = null;
  let flushing = false;
  const timers = new Map(); // pending debounced saves, keyed by row id

  function load(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }
  function persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
      localStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox));
    } catch (e) { /* storage full or blocked: app still works this session */ }
  }

  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() :
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    }));

  const $ = sel => document.querySelector(sel);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const playerById = id => state.players.find(p => p.id === id) || { id, name: '?', team: '' };
  const isPlayed = m => Number.isInteger(m.home_goals) && Number.isInteger(m.away_goals);
  const sortMatches = () => state.matches.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const sortPlayers = () => state.players.sort((a, b) => a.id.localeCompare(b.id));

  // ---------- League table ----------
  function computeTable() {
    const rows = new Map(state.players.map(p => [p.id, { p, played: 0, gf: 0, ga: 0, pts: 0 }]));
    for (const m of state.matches) {
      if (!isPlayed(m)) continue;
      const h = rows.get(m.home), a = rows.get(m.away);
      if (!h || !a) continue;
      h.played++; a.played++;
      h.gf += m.home_goals; h.ga += m.away_goals;
      a.gf += m.away_goals; a.ga += m.home_goals;
      if (m.home_goals > m.away_goals) h.pts += 3;
      else if (m.home_goals < m.away_goals) a.pts += 3;
      else { h.pts++; a.pts++; }
    }
    const list = [...rows.values()].map(r => ({ ...r, gd: r.gf - r.ga }));
    // Points, then goal difference, then goals scored (not shown).
    list.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.p.name.localeCompare(y.p.name));
    // Players level on all three share a position.
    list.forEach((r, i) => {
      const prev = list[i - 1];
      r.pos = prev && prev.pts === r.pts && prev.gd === r.gd && prev.gf === r.gf ? prev.pos : i + 1;
    });
    return list;
  }

  function renderTable() {
    const list = computeTable();
    const anyPlayed = list.some(r => r.played > 0);
    $('#tableBody').innerHTML = list.map(r => {
      const leader = anyPlayed && r.pos === 1;
      const gd = r.gd > 0 ? '+' + r.gd : String(r.gd);
      return `<tr class="${leader ? 'leader' : ''}">
        <td class="c-pos">${r.pos}</td>
        <td class="c-player"><span class="pl-name">${esc(r.p.name)}${leader ? '<span class="crown" aria-label="leader">👑</span>' : ''}</span><span class="pl-team">${esc(r.p.team)}</span></td>
        <td class="c-num">${r.played}</td>
        <td class="c-num">${gd}</td>
        <td class="c-num c-pts">${r.pts}</td>
      </tr>`;
    }).join('');
  }

  // ---------- Results list ----------
  let resultsSig = '';
  function renderResults() {
    sortMatches();
    const box = $('#results');
    const sig = JSON.stringify(state.matches.map(m => [m.id, m.home, m.away])) +
      JSON.stringify(state.players.map(p => [p.id, p.name, p.team]));
    const focused = document.activeElement;
    const typingHere = focused && box.contains(focused);

    if (sig !== resultsSig || !typingHere) {
      // Rebuild the list, but keep the cursor in the same box if someone is typing.
      const keep = typingHere && focused.dataset ? { id: focused.closest('.match')?.dataset.id, side: focused.dataset.side } : null;
      resultsSig = sig;
      if (!state.matches.length) {
        box.innerHTML = '<p class="empty">No matches yet. Tap “+ Add match”.</p>';
        return;
      }
      box.innerHTML = state.matches.map(m => {
        const h = playerById(m.home), a = playerById(m.away);
        return `<div class="match ${isPlayed(m) ? 'played' : ''}" data-id="${esc(m.id)}">
          <div class="side home"><span class="pl-name">${esc(h.name)}</span><span class="pl-team">${esc(h.team)}</span></div>
          <input class="score" data-side="home" type="number" inputmode="numeric" pattern="[0-9]*" min="0" max="99"
            aria-label="${esc(h.name)} goals" value="${m.home_goals ?? ''}">
          <span class="dash">–</span>
          <input class="score" data-side="away" type="number" inputmode="numeric" pattern="[0-9]*" min="0" max="99"
            aria-label="${esc(a.name)} goals" value="${m.away_goals ?? ''}">
          <div class="side away"><span class="pl-name">${esc(a.name)}</span><span class="pl-team">${esc(a.team)}</span></div>
          <button class="more" type="button" aria-label="Edit or delete match">⋯</button>
        </div>`;
      }).join('');
      if (keep && keep.id) {
        const el = box.querySelector(`.match[data-id="${CSS.escape(keep.id)}"] .score[data-side="${keep.side}"]`);
        if (el) el.focus();
      }
    } else {
      // Same matches, someone is typing: only update the other boxes.
      for (const m of state.matches) {
        const row = box.querySelector(`.match[data-id="${CSS.escape(m.id)}"]`);
        if (!row) continue;
        row.classList.toggle('played', isPlayed(m));
        for (const side of ['home', 'away']) {
          const input = row.querySelector(`.score[data-side="${side}"]`);
          const v = m[side + '_goals'] ?? '';
          if (input !== focused && input.value !== String(v)) input.value = v;
        }
      }
    }
  }

  // ---------- Players ----------
  function renderPlayers() {
    sortPlayers();
    const box = $('#players');
    const focused = document.activeElement;
    if (focused && box.contains(focused) && box.children.length === state.players.length) {
      for (const p of state.players) {
        for (const f of ['name', 'team']) {
          const input = box.querySelector(`[data-pid="${CSS.escape(p.id)}"][data-field="${f}"]`);
          if (input && input !== focused && input.value !== p[f]) input.value = p[f];
        }
      }
      return;
    }
    box.innerHTML = state.players.map(p => `<div class="player-row">
      <input class="field" data-pid="${esc(p.id)}" data-field="name" value="${esc(p.name)}" placeholder="Name" aria-label="Player name" maxlength="20" autocomplete="off">
      <input class="field" data-pid="${esc(p.id)}" data-field="team" value="${esc(p.team)}" placeholder="Team" aria-label="Team" maxlength="20" autocomplete="off">
    </div>`).join('');
  }

  function renderAll() {
    renderTable();
    renderResults();
    renderPlayers();
  }

  // ---------- Editing ----------
  function parseGoals(v) {
    if (v === '' || v == null) return null;
    const n = parseInt(v, 10);
    if (Number.isNaN(n)) return null;
    return Math.max(0, Math.min(99, n));
  }

  $('#results').addEventListener('input', e => {
    const input = e.target.closest('.score');
    if (!input) return;
    const id = input.closest('.match').dataset.id;
    const m = state.matches.find(x => x.id === id);
    if (!m) return;
    m[input.dataset.side + '_goals'] = parseGoals(input.value);
    input.closest('.match').classList.toggle('played', isPlayed(m));
    persist();
    renderTable();               // instant table update
    saveLater({ t: 'm', row: m }); // send to database shortly after typing stops
  });

  $('#players').addEventListener('input', e => {
    const input = e.target.closest('[data-pid]');
    if (!input) return;
    const p = state.players.find(x => x.id === input.dataset.pid);
    if (!p) return;
    p[input.dataset.field] = input.value;
    persist();
    renderTable();
    renderResults();
    saveLater({ t: 'p', row: p });
  });

  // ---------- Add / edit / delete match dialog ----------
  const dlg = $('#matchDialog');
  let editingId = null;

  function openDialog(match) {
    editingId = match ? match.id : null;
    $('#matchDialogTitle').textContent = match ? 'Edit match' : 'Add match';
    const opts = state.players.map(p => `<option value="${esc(p.id)}">${esc(p.name)} (${esc(p.team)})</option>`).join('');
    $('#mdHome').innerHTML = opts;
    $('#mdAway').innerHTML = opts;
    $('#mdHome').value = match ? match.home : state.players[0]?.id;
    $('#mdAway').value = match ? match.away : state.players[1]?.id;
    $('#mdDelete').hidden = !match;
    $('#mdError').hidden = true;
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }
  function closeDialog() { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); }

  $('#addMatch').addEventListener('click', () => openDialog(null));
  $('#results').addEventListener('click', e => {
    const btn = e.target.closest('.more');
    if (!btn) return;
    const m = state.matches.find(x => x.id === btn.closest('.match').dataset.id);
    if (m) openDialog(m);
  });
  $('#mdCancel').addEventListener('click', closeDialog);

  $('#matchForm').addEventListener('submit', e => {
    e.preventDefault();
    const home = $('#mdHome').value, away = $('#mdAway').value;
    if (!home || !away || home === away) { $('#mdError').hidden = false; return; }
    let m;
    if (editingId) {
      m = state.matches.find(x => x.id === editingId);
      if (!m) return closeDialog();
      m.home = home; m.away = away;
    } else {
      m = { id: uuid(), home, away, home_goals: null, away_goals: null, created_at: new Date().toISOString() };
      state.matches.push(m);
    }
    persist();
    renderAll();
    queue({ t: 'm', row: m });
    closeDialog();
  });

  $('#mdDelete').addEventListener('click', () => {
    if (!editingId) return;
    if (!confirm('Delete this match?')) return;
    const id = editingId;
    state.matches = state.matches.filter(x => x.id !== id);
    clearTimeout(timers.get(id)); timers.delete(id);
    persist();
    renderAll();
    queue({ t: 'd', id });
    closeDialog();
  });

  // ---------- Saving (debounce → outbox → Supabase) ----------
  function saveLater(op) {
    const id = op.row.id;
    clearTimeout(timers.get(id));
    timers.set(id, setTimeout(() => { timers.delete(id); queue(op); }, 400));
  }

  function queue(op) {
    if (!sb && !configured()) return; // local-only mode: localStorage is enough
    const key = op.t === 'p' ? 'p:' + op.row.id : 'm:' + (op.id || op.row.id);
    // Only the latest change to a row matters.
    outbox = outbox.filter(o => (o.t === 'p' ? 'p:' + o.row.id : 'm:' + (o.id || o.row.id)) !== key);
    outbox.push(op.row ? { t: op.t, row: { ...op.row } } : op);
    persist();
    flush();
  }

  async function flush() {
    if (!sb || flushing) return;
    flushing = true;
    try {
      while (outbox.length) {
        const op = outbox[0];
        let res;
        if (op.t === 'm') res = await sb.from('matches').upsert(op.row);
        else if (op.t === 'd') res = await sb.from('matches').delete().eq('id', op.id);
        else if (op.t === 'p') res = await sb.from('players').upsert(op.row);
        if (res && res.error) throw res.error;
        outbox.shift();
        persist();
      }
    } catch (err) {
      console.warn('Save failed, will retry when back online:', err);
      setStatus('offline');
    } finally {
      flushing = false;
    }
  }

  // Ids with changes not yet saved — remote updates for these are ignored
  // so the database never overwrites what you are in the middle of typing.
  function pendingIds() {
    const s = new Set(timers.keys());
    outbox.forEach(o => s.add(o.id || o.row.id));
    return s;
  }

  // ---------- Live sync ----------
  function configured() { return !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY); }

  function setStatus(kind) {
    const el = $('#status');
    el.className = 'status ' + kind;
    el.textContent = { live: 'Live', offline: 'Offline', local: 'This phone only', connecting: 'Connecting…' }[kind] || kind;
    el.title = {
      live: 'Connected — scores are shared live',
      offline: 'No connection — changes are saved on this phone and will sync later',
      local: 'Supabase is not set up yet (see README) — scores are not shared',
      connecting: 'Connecting to the database'
    }[kind] || '';
  }

  async function pull() {
    if (!sb) return;
    const [p, m] = await Promise.all([
      sb.from('players').select('id,name,team'),
      sb.from('matches').select('id,home,away,home_goals,away_goals,created_at')
    ]);
    if (p.error || m.error) throw (p.error || m.error);
    const pending = pendingIds();
    const keepLocal = id => pending.has(id);
    // Server is the truth, except for rows we still have unsaved changes for.
    const players = p.data.map(r => keepLocal(r.id) ? (state.players.find(x => x.id === r.id) || r) : r);
    let matches = m.data.map(r => keepLocal(r.id) ? (state.matches.find(x => x.id === r.id) || r) : r);
    // Add locally created matches that haven't reached the server yet, drop locally deleted ones.
    for (const lm of state.matches) if (keepLocal(lm.id) && !matches.some(x => x.id === lm.id)) matches.push(lm);
    const deleted = new Set(outbox.filter(o => o.t === 'd').map(o => o.id));
    matches = matches.filter(x => !deleted.has(x.id));
    state.players = players.length ? players : state.players;
    state.matches = matches;
    persist();
    renderAll();
  }

  function applyChange(table, payload) {
    const list = table === 'players' ? state.players : state.matches;
    if (payload.eventType === 'DELETE') {
      const id = payload.old && payload.old.id;
      if (!id) return;
      const i = list.findIndex(x => x.id === id);
      if (i >= 0) list.splice(i, 1);
    } else {
      const row = payload.new;
      if (!row || pendingIds().has(row.id)) return;
      const i = list.findIndex(x => x.id === row.id);
      if (i >= 0) list[i] = { ...list[i], ...row }; else list.push(row);
    }
    persist();
    renderAll();
  }

  async function startSync() {
    if (!configured()) { setStatus('local'); return; }
    if (!window.supabase) {
      // Library didn't load (first open while offline). Try again when online.
      setStatus('offline');
      window.addEventListener('online', () => location.reload(), { once: true });
      return;
    }
    setStatus('connecting');
    sb = window.supabase.createClient(CFG.SUPABASE_URL.trim(), CFG.SUPABASE_ANON_KEY.trim(), {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const resync = async () => {
      try { await flush(); await pull(); if (navigator.onLine) setStatus('live'); }
      catch (err) { console.warn(err); setStatus('offline'); }
    };

    sb.channel('league')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, p => applyChange('matches', p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, p => applyChange('players', p))
      .subscribe(status => {
        if (status === 'SUBSCRIBED') resync();
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setStatus('offline');
      });

    await resync();
    window.addEventListener('online', resync);
    window.addEventListener('offline', () => setStatus('offline'));
    // Phones pause background tabs; catch up when the app comes back to the front.
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') resync(); });
  }

  // ---------- Go ----------
  renderAll();
  startSync();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
