/* Planner V1 — telas e interações. As regras ficam em core.js. */
(() => {
  'use strict';
  const C = window.PlannerCore;
  const { ymd, fromYmd, addDays, firstOfMonth, addMonthsFirst, isPendencia, isAtrasadaMes, adiamentos, nivel, postpone, shade, textOn, buildIcs, stamp } = C;

  const KEY = 'planner_v1';
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const MES_ABR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  const DIAS_INI = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  /* ---------- Dados ---------- */
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const o = JSON.parse(raw);
        if (o && Array.isArray(o.cats) && Array.isArray(o.tasks)) {
          o.cfg = o.cfg || {};
          if (!o.cfg.hora) o.cfg.hora = '09:00';
          return o;
        }
      }
    } catch (e) { /* começa do zero */ }
    return C.seedState();
  }
  let S = load();
  const ui = { tab: 'hoje', mes: null, dia: null, sheet: null, lastCat: null };

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); }
    catch (e) { toast('Não foi possível salvar neste aparelho.'); }
    try {
      const n = S.tasks.filter((t) => isPendencia(t, ymd(new Date()))).length;
      if (n && navigator.setAppBadge) navigator.setAppBadge(n).catch(() => {});
      else if (navigator.clearAppBadge) navigator.clearAppBadge().catch(() => {});
    } catch (e) { /* selo é opcional */ }
  }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const cat = (id) => S.cats.find((c) => c.id === id);
  const rootOf = (c) => (c && c.parent ? cat(c.parent) || c : c);
  const catColor = (id) => (cat(id) ? cat(id).cor : '#8A93A3');
  const catName = (id) => {
    const c = cat(id);
    if (!c) return 'Sem categoria';
    const p = c.parent && cat(c.parent);
    return p ? `${p.nome} › ${c.nome}` : c.nome;
  };
  const catIcon = (id) => {
    const c = cat(id);
    if (!c) return '•';
    return c.icone || (rootOf(c) && rootOf(c).icone) || '•';
  };
  const dataCurta = (s) => { const d = fromYmd(s); return `${d.getDate()} ${MES_ABR[d.getMonth()]}`; };
  const byOrder = (a, b) => (a.feito - b.feito) || ((a.criada || 0) - (b.criada || 0));

  /* ---------- Componentes ---------- */
  function empty(titulo, texto) { return `<div class="empty"><b>${esc(titulo)}</b>${esc(texto)}</div>`; }

  function taskRow(t, today, o = {}) {
    const n = nivel(t, today), a = adiamentos(t, today);
    const alerta = n === 2 ? `<span class="al u">🔥 Urgente · adiada ${a}×</span>`
      : n === 1 ? `<span class="al a">⚠️ Atenção · adiada 1×</span>` : '';
    const data = o.date ? `<span>${esc(dataCurta(t.data))}</span>` : '';
    const acoes = o.act ? `<div class="pact"><button class="mini" data-action="postpone-open" data-id="${t.id}">↷ Reagendar</button></div>` : '';
    return `<div class="task lvl${n} ${t.feito ? 'done' : ''}" style="--c:${catColor(t.cat)}" data-action="open-task" data-id="${t.id}">
      <button class="chk" data-action="toggle" data-id="${t.id}" aria-label="${t.feito ? 'Reabrir' : 'Concluir'} tarefa"></button>
      <div class="tb"><div class="tt">${esc(t.titulo)}</div>
        <div class="tm"><span class="tag">${esc(catIcon(t.cat))} ${esc(catName(t.cat))}</span>${data}${alerta}</div>${acoes}</div></div>`;
  }

  /* ---------- Telas ---------- */
  function viewHoje(today) {
    const d = fromYmd(today);
    const hoje = S.tasks.filter((t) => t.data === today).sort(byOrder);
    const feitas = hoje.filter((t) => t.feito).length;
    const pend = S.tasks.filter((t) => isPendencia(t, today));
    const atras = S.tasks.filter((t) => isAtrasadaMes(t, today)).sort((a, b) => (a.data < b.data ? -1 : 1));
    let h = `<header class="hdr"><div class="hsub">${DIAS[d.getDay()]}</div><h1>${d.getDate()} de ${MESES[d.getMonth()]}</h1>`;
    if (hoje.length) h += `<div class="prog"><div class="bar"><i style="width:${Math.round((feitas / hoje.length) * 100)}%"></i></div><span>${feitas} de ${hoje.length} feitas</span></div>`;
    h += '</header>';
    if (pend.length) {
      const urg = pend.filter((t) => nivel(t, today) >= 2).length;
      h += `<button class="banner ${urg ? 'urg' : ''}" data-action="tab" data-tab="pend"><span class="bi">${urg ? '🔥' : '⚠️'}</span>
        <span><b>${pend.length} ${pend.length > 1 ? 'pendências' : 'pendência'} de meses anteriores</b>
        <small>${urg ? `${urg} ${urg > 1 ? 'urgentes' : 'urgente'} · toque para resolver` : 'Toque para resolver'}</small></span></button>`;
    }
    if (atras.length) h += `<h2 class="sec">Atrasadas neste mês</h2>` + atras.map((t) => taskRow(t, today, { date: true })).join('');
    h += `<h2 class="sec">Hoje</h2>`;
    h += hoje.length ? hoje.map((t) => taskRow(t, today)).join('') : empty('Nada marcado para hoje.', 'Toque no + para adicionar uma tarefa.');
    return h;
  }

  function viewMes(today) {
    if (!ui.mes) ui.mes = today.slice(0, 7);
    const [y, m] = ui.mes.split('-').map(Number);
    const nd = new Date(y, m, 0).getDate();
    const off = new Date(y, m - 1, 1).getDay();
    const tasks = S.tasks.filter((t) => t.data.startsWith(ui.mes));
    const feitas = tasks.filter((t) => t.feito).length;
    if (!ui.dia || !ui.dia.startsWith(ui.mes)) ui.dia = today.startsWith(ui.mes) ? today : ui.mes + '-01';

    const porCat = {};
    tasks.forEach((t) => {
      const r = rootOf(cat(t.cat));
      const k = r ? r.id : '_';
      porCat[k] = porCat[k] || { t: 0, d: 0 };
      porCat[k].t++; if (t.feito) porCat[k].d++;
    });
    const chips = Object.keys(porCat).filter((k) => cat(k)).map((k) => {
      const c = cat(k);
      return `<span class="chip" style="--c:${c.cor}">${esc(c.icone || '')} ${porCat[k].d}/${porCat[k].t}</span>`;
    }).join('');

    let h = `<div class="mhead"><h1>${cap(MESES[m - 1])} ${y}</h1><div class="mnav">
      <button data-action="mes-hoje" class="hoje" aria-label="Ir para hoje">Hoje</button>
      <button data-action="mes-prev" aria-label="Mês anterior">‹</button><button data-action="mes-next" aria-label="Próximo mês">›</button></div></div>`;
    h += `<div class="mstat">${tasks.length ? `${feitas} de ${tasks.length} tarefas concluídas (${Math.round((feitas / tasks.length) * 100)}%)` : 'Nenhuma tarefa neste mês'}</div>`;
    if (chips) h += `<div class="chips">${chips}</div>`;
    h += '<div class="grid">' + DIAS_INI.map((d) => `<div class="dow">${d}</div>`).join('');
    for (let i = 0; i < off; i++) h += '<div class="day blank"></div>';
    for (let d = 1; d <= nd; d++) {
      const iso = `${ui.mes}-${C.pad(d)}`;
      const dts = tasks.filter((t) => t.data === iso).sort(byOrder);
      const dots = dts.slice(0, 4).map((t) => `<i class="${t.feito ? 'f' : ''}" style="background:${catColor(t.cat)}"></i>`).join('') + (dts.length > 4 ? `<em>+${dts.length - 4}</em>` : '');
      h += `<button class="day ${iso === today ? 'today' : ''} ${iso === ui.dia ? 'sel' : ''}" data-action="pick-day" data-d="${iso}"><span class="dn">${d}</span><span class="dots">${dots}</span></button>`;
    }
    h += '</div>';
    const sel = fromYmd(ui.dia);
    const lista = S.tasks.filter((t) => t.data === ui.dia).sort(byOrder);
    h += `<h2 class="sec">${DIAS[sel.getDay()]}, ${sel.getDate()} de ${MESES[sel.getMonth()]}</h2>`;
    h += lista.length ? lista.map((t) => taskRow(t, today)).join('') : empty('Sem tarefas neste dia.', 'Toque no + para adicionar.');
    return h;
  }

  function viewPend(today) {
    const lista = S.tasks.filter((t) => isPendencia(t, today))
      .sort((a, b) => (nivel(b, today) - nivel(a, today)) || (a.data < b.data ? -1 : 1));
    let h = `<header class="hdr"><div class="hsub">De meses anteriores</div><h1>Pendências</h1></header>`;
    if (!lista.length) return h + empty('Tudo em dia.', 'O que ficar sem fazer ao virar o mês aparece aqui, em destaque.');
    h += `<p class="lead">As mais adiadas vêm primeiro. Conclua, reagende ou toque para editar.</p>`;
    return h + lista.map((t) => taskRow(t, today, { date: true, act: true })).join('');
  }

  function viewCats() {
    const count = (ids) => S.tasks.filter((t) => !t.feito && ids.includes(t.cat)).length;
    const roots = S.cats.filter((c) => !c.parent);
    const ordered = roots.filter((c) => c.ativa).concat(roots.filter((c) => !c.ativa));
    let h = `<header class="hdr"><div class="hsub">Cores que separam cada assunto</div><h1>Categorias</h1></header>`;
    ordered.forEach((c) => {
      const subs = S.cats.filter((s) => s.parent === c.id);
      const n = count([c.id, ...subs.map((s) => s.id)]);
      h += `<button class="crow ${c.ativa ? '' : 'off'}" style="--c:${c.cor}" data-action="cat-edit" data-id="${c.id}">
        <span class="ci">${esc(c.icone || '•')}</span><span class="cn">${esc(c.nome)}</span><span class="cc">${n ? n + ' em aberto' : ''}</span></button>`;
      subs.forEach((s) => {
        h += `<button class="csub ${s.ativa ? '' : 'off'}" style="--c:${s.cor}" data-action="cat-edit" data-id="${s.id}">
          <span class="ci">${esc(s.icone || c.icone || '•')}</span><span class="cn">${esc(s.nome)}</span><span class="cc">${count([s.id]) ? count([s.id]) + ' em aberto' : ''}</span></button>`;
      });
      h += `<button class="addsub" data-action="cat-sub" data-id="${c.id}">+ Subcategoria</button>`;
    });
    return h + `<button class="bigbtn" data-action="cat-new">+ Nova categoria</button>`;
  }

  function viewCfg() {
    return `<header class="hdr"><div class="hsub">Planner · versão 1</div><h1>Ajustes</h1></header>
    <section class="card"><h3>Lembretes no Calendário</h3>
      <p>O iPhone não permite que um app instalado pela web avise sozinho quando está fechado. Por isso os lembretes usam o app Calendário, que toca o alarme de verdade.</p>
      <label class="f" for="cfg-hora">Horário dos lembretes</label>
      <input id="cfg-hora" type="time" value="${esc(S.cfg.hora)}">
      <div class="row"><button class="btn primary" data-action="ics-daily">🔔 Lembrete diário de pendências</button></div>
      <p>Para uma tarefa específica, abra a tarefa e toque em Lembrete.</p></section>
    <section class="card"><h3>Backup</h3>
      <p>Seus dados ficam só neste aparelho. Exporte um backup de vez em quando e guarde em Arquivos ou iCloud.</p>
      <div class="row"><button class="btn" data-action="export">Exportar backup</button>
      <label class="btn" for="imp">Importar backup</label></div>
      <input id="imp" type="file" accept="application/json,.json" hidden></section>
    <section class="card"><h3>Resumo</h3><p>${S.tasks.length} tarefas · ${S.cats.filter((c) => !c.parent).length} categorias · ${S.cats.filter((c) => c.parent).length} subcategorias</p></section>`;
  }

  /* ---------- Painéis ---------- */
  function sheetTask(s, today) {
    const d = s.draft, t = s.id ? S.tasks.find((x) => x.id === s.id) : null;
    const sel = rootOf(cat(d.cat));
    const roots = S.cats.filter((c) => !c.parent && (c.ativa || (sel && sel.id === c.id)));
    const subs = sel ? S.cats.filter((c) => c.parent === sel.id && (c.ativa || c.id === d.cat)) : [];
    const pill = (c, par) => `<button type="button" class="pill ${d.cat === c.id ? 'on' : par ? 'par' : ''}" style="--c:${c.cor};--on:${textOn(c.cor)}" data-action="pick-cat" data-id="${c.id}">${esc(c.icone || '')} ${esc(c.nome)}</button>`;
    return `<h2>${t ? 'Editar tarefa' : 'Nova tarefa'}</h2>
      <label class="f" for="f-titulo">O que precisa ser feito?</label>
      <input id="f-titulo" type="text" value="${esc(d.titulo)}" placeholder="Ex.: Marcar consulta" autocomplete="off" ${t ? '' : 'autofocus'}>
      <label class="f">Categoria</label>
      <div class="pills">${roots.map((c) => pill(c, sel && sel.id === c.id && d.cat !== c.id)).join('')}</div>
      ${subs.length ? `<label class="f">Subcategoria de ${esc(sel.nome)}</label><div class="pills">${subs.map((c) => pill(c, false)).join('')}</div>` : ''}
      <label class="f" for="f-data">Data</label>
      <input id="f-data" type="date" value="${esc(d.data)}">
      ${t && !t.feito ? '<p class="hint">Mudar para uma data futura conta como adiamento.</p>' : ''}
      <label class="f" for="f-nota">Observações (opcional)</label>
      <textarea id="f-nota">${esc(d.nota)}</textarea>
      <div class="row"><button class="btn primary" data-action="save-task">Salvar</button>
        ${t ? `<button class="btn" data-action="toggle-close" data-id="${t.id}">${t.feito ? 'Reabrir' : 'Concluir'}</button>` : ''}</div>
      ${t ? `<div class="row"><button class="btn" data-action="postpone-open" data-id="${t.id}">↷ Reagendar</button>
        <button class="btn" data-action="ics-task" data-id="${t.id}">🔔 Lembrete</button>
        <button class="btn danger" data-action="delete-task" data-id="${t.id}">Excluir</button></div>` : ''}`;
  }

  function sheetPost(s, today) {
    const t = S.tasks.find((x) => x.id === s.id);
    if (!t) return '';
    const opcoes = [['Hoje', today], ['Amanhã', addDays(today, 1)], ['Em 1 semana', addDays(today, 7)], ['Dia 1 do mês que vem', addMonthsFirst(today, 1)]]
      .filter(([, dt]) => dt !== t.data);
    return `<h2>Reagendar</h2><p class="hint">${esc(t.titulo)} · cada reagendamento conta como adiamento.</p>
      <div class="row" style="flex-direction:column">${opcoes.map(([r, dt]) => `<button class="btn" data-action="post-do" data-id="${t.id}" data-d="${dt}">${r} <span class="hint" style="margin:0 0 0 8px">${esc(dataCurta(dt))}</span></button>`).join('')}</div>
      <label class="f" for="post-data">Outra data</label>
      <input id="post-data" type="date" value="${esc(addDays(today, 1))}">
      <div class="row"><button class="btn primary" data-action="post-date" data-id="${t.id}">Reagendar para esta data</button></div>`;
  }

  function sheetCat(s) {
    const d = s.draft, pai = d.parent ? cat(d.parent) : null;
    return `<h2>${s.id ? (pai ? 'Editar subcategoria' : 'Editar categoria') : (pai ? 'Nova subcategoria' : 'Nova categoria')}</h2>
      ${pai ? `<p class="hint">Dentro de ${esc(pai.nome)}</p>` : ''}
      <label class="f" for="c-nome">Nome</label><input id="c-nome" type="text" value="${esc(d.nome)}" autocomplete="off">
      <label class="f" for="c-icone">Ícone (um emoji)</label><input id="c-icone" type="text" value="${esc(d.icone)}" maxlength="8" placeholder="🙂">
      <label class="f" for="c-cor">Cor</label><input id="c-cor" type="color" value="${esc(d.cor)}">
      <label class="chkline"><input id="c-ativa" type="checkbox" ${d.ativa ? 'checked' : ''}> Ativa (aparece ao criar tarefas)</label>
      <div class="row"><button class="btn primary" data-action="save-cat">Salvar</button>
        ${s.id ? '<button class="btn danger" data-action="del-cat">Excluir</button>' : ''}</div>`;
  }

  function renderSheet(today) {
    const el = document.getElementById('sheet'), s = ui.sheet;
    if (!s) { el.innerHTML = ''; el.hidden = true; return; }
    const body = { task: sheetTask, post: sheetPost, cat: sheetCat }[s.type](s, today);
    el.innerHTML = `<div class="backdrop" data-action="close-sheet"><div class="sheet ${s.fresh ? 'enter' : ''}" role="dialog" aria-modal="true">${body}</div></div>`;
    s.fresh = false;
    s.rendered = true;
    el.hidden = false;
  }

  function syncDraft() {
    const s = ui.sheet; if (!s || !s.rendered) return; // só lê campos de um painel já desenhado
    const g = (id) => document.getElementById(id);
    if (s.type === 'task' && g('f-titulo')) { s.draft.titulo = g('f-titulo').value; s.draft.data = g('f-data').value; s.draft.nota = g('f-nota').value; }
    if (s.type === 'cat' && g('c-nome')) { s.draft.nome = g('c-nome').value; s.draft.icone = g('c-icone').value; s.draft.cor = g('c-cor').value; s.draft.ativa = g('c-ativa').checked; }
  }

  function render() {
    syncDraft();
    const today = ymd(new Date());
    document.getElementById('view').innerHTML = { hoje: viewHoje, mes: viewMes, pend: viewPend, cats: viewCats, cfg: viewCfg }[ui.tab](today);
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === ui.tab));
    const n = S.tasks.filter((t) => isPendencia(t, today)).length;
    const bd = document.getElementById('pendBadge'); bd.textContent = n; bd.hidden = !n;
    document.getElementById('fab').hidden = !['hoje', 'mes', 'pend'].includes(ui.tab);
    renderSheet(today);
  }

  let toastTimer;
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
  }

  /* ---------- Arquivos: calendário e backup ---------- */
  async function entregar(nome, mime, texto) {
    const blob = new Blob([texto], { type: mime });
    try {
      const file = new File([blob], nome, { type: mime });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: nome }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 8000);
  }
  const agoraUtc = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  function quando(dataMin, today) {
    const [hh, mm] = S.cfg.hora.split(':').map(Number);
    const agora = new Date();
    let data = dataMin < today ? today : dataMin;
    if (data === today && (agora.getHours() > hh || (agora.getHours() === hh && agora.getMinutes() >= mm))) data = addDays(today, 1);
    return { data, hh, mm };
  }
  function lembreteTarefa(t, today) {
    const q = quando(t.data, today);
    const ics = buildIcs([{ uid: `${t.id}@planner`, start: stamp(q.data, q.hh, q.mm), end: stamp(q.data, q.hh, q.mm + 30), summary: t.titulo, desc: catName(t.cat) + (t.nota ? '\n' + t.nota : '') }], agoraUtc());
    entregar('lembrete-tarefa.ics', 'text/calendar', ics);
    toast(`Lembrete para ${dataCurta(q.data)} às ${S.cfg.hora}`);
  }
  function lembreteDiario(today) {
    const q = quando(today, today);
    const ics = buildIcs([{ uid: 'pendencias-diario@planner', start: stamp(q.data, q.hh, q.mm), end: stamp(q.data, q.hh, q.mm + 15), summary: 'Revisar pendências do Planner', desc: 'Abra o Planner e veja o que ficou pendente.', rrule: 'FREQ=DAILY' }], agoraUtc());
    entregar('lembrete-diario-planner.ics', 'text/calendar', ics);
  }

  /* ---------- Ações ---------- */
  function abrirNovaTarefa(today) {
    const ativas = S.cats.filter((c) => !c.parent && c.ativa);
    const cat0 = (ui.lastCat && cat(ui.lastCat) && cat(ui.lastCat).ativa) ? ui.lastCat : (ativas[0] && ativas[0].id) || '';
    const data = ui.tab === 'mes' && ui.dia ? ui.dia : today;
    ui.sheet = { type: 'task', id: null, fresh: true, draft: { titulo: '', cat: cat0, data, nota: '' } };
  }

  function salvarTarefa(today) {
    syncDraft();
    const d = ui.sheet.draft;
    if (!d.titulo.trim()) { toast('Digite o que precisa ser feito.'); return; }
    if (!d.cat) { toast('Escolha uma categoria.'); return; }
    if (!d.data) { toast('Escolha uma data.'); return; }
    if (ui.sheet.id) {
      const t = S.tasks.find((x) => x.id === ui.sheet.id);
      t.titulo = d.titulo.trim(); t.cat = d.cat; t.nota = d.nota.trim();
      if (!t.feito && d.data > t.data) postpone(t, d.data, today); else t.data = d.data;
    } else {
      S.tasks.push({ id: uid(), titulo: d.titulo.trim(), cat: d.cat, data: d.data, nota: d.nota.trim(), feito: false, feitoEm: null, adiamentos: 0, origem: d.data, criada: Date.now() });
    }
    ui.lastCat = d.cat;
    if (ui.tab === 'mes') { ui.mes = d.data.slice(0, 7); ui.dia = d.data; }
    ui.sheet = null; save(); toast('Tarefa salva'); render();
  }

  function alternar(t) { t.feito = !t.feito; t.feitoEm = t.feito ? Date.now() : null; save(); toast(t.feito ? 'Concluída ✓' : 'Reaberta'); }

  function salvarCat() {
    syncDraft();
    const d = ui.sheet.draft;
    if (!d.nome.trim()) { toast('Digite um nome.'); return; }
    if (ui.sheet.id) {
      const c = cat(ui.sheet.id);
      Object.assign(c, { nome: d.nome.trim(), icone: d.icone.trim(), cor: d.cor, ativa: d.ativa });
    } else {
      S.cats.push({ id: uid(), nome: d.nome.trim(), icone: d.icone.trim(), cor: d.cor, parent: d.parent || null, ativa: d.ativa });
    }
    ui.sheet = null; save(); toast('Categoria salva'); render();
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action, id = el.dataset.id, today = ymd(new Date());
    if (a === 'close-sheet' && e.target !== el) return;
    const tarefa = id ? S.tasks.find((t) => t.id === id) : null;

    switch (a) {
      case 'tab': ui.tab = el.dataset.tab; window.scrollTo(0, 0); render(); break;
      case 'toggle': if (tarefa) { alternar(tarefa); render(); } break;
      case 'toggle-close': if (tarefa) { alternar(tarefa); ui.sheet = null; render(); } break;
      case 'open-task': if (tarefa) { ui.sheet = { type: 'task', id, fresh: true, draft: { titulo: tarefa.titulo, cat: tarefa.cat, data: tarefa.data, nota: tarefa.nota || '' } }; render(); } break;
      case 'new-task': abrirNovaTarefa(today); render(); break;
      case 'pick-cat': syncDraft(); ui.sheet.draft.cat = id; render(); break;
      case 'save-task': salvarTarefa(today); break;
      case 'delete-task': if (tarefa && confirm('Excluir esta tarefa?')) { S.tasks = S.tasks.filter((t) => t.id !== id); ui.sheet = null; save(); toast('Tarefa excluída'); render(); } break;
      case 'close-sheet': syncDraft(); ui.sheet = null; render(); break;
      case 'postpone-open': if (tarefa) { ui.sheet = { type: 'post', id, fresh: true }; render(); } break;
      case 'post-do': if (tarefa) { postpone(tarefa, el.dataset.d, today); ui.sheet = null; save(); toast(`Reagendada para ${dataCurta(el.dataset.d)}`); render(); } break;
      case 'post-date': {
        const v = document.getElementById('post-data').value;
        if (!v) { toast('Escolha uma data.'); break; }
        if (tarefa) { postpone(tarefa, v, today); ui.sheet = null; save(); toast(`Reagendada para ${dataCurta(v)}`); render(); }
        break;
      }
      case 'pick-day': ui.dia = el.dataset.d; render(); break;
      case 'mes-prev': ui.mes = addMonthsFirst(ui.mes + '-01', -1).slice(0, 7); ui.dia = null; render(); break;
      case 'mes-next': ui.mes = addMonthsFirst(ui.mes + '-01', 1).slice(0, 7); ui.dia = null; render(); break;
      case 'mes-hoje': ui.mes = today.slice(0, 7); ui.dia = today; render(); break;
      case 'cat-edit': { const c = cat(id); if (c) { ui.sheet = { type: 'cat', id, fresh: true, draft: { nome: c.nome, icone: c.icone || '', cor: c.cor, ativa: c.ativa, parent: c.parent } }; render(); } break; }
      case 'cat-new': ui.sheet = { type: 'cat', id: null, fresh: true, draft: { nome: '', icone: '', cor: '#4F6D7A', ativa: true, parent: null } }; render(); break;
      case 'cat-sub': { const p = cat(id); const n = S.cats.filter((c) => c.parent === id).length; ui.sheet = { type: 'cat', id: null, fresh: true, draft: { nome: '', icone: '', cor: shade(p.cor, n), ativa: true, parent: id } }; render(); break; }
      case 'save-cat': salvarCat(); break;
      case 'del-cat': {
        const c = cat(ui.sheet.id), subs = S.cats.filter((x) => x.parent === c.id).length, usadas = S.tasks.filter((t) => t.cat === c.id).length;
        if (subs) { toast('Exclua ou mova as subcategorias primeiro.'); break; }
        if (usadas) { toast(`Há ${usadas} tarefa(s) aqui. Desative a categoria em vez de excluir.`); break; }
        if (confirm(`Excluir "${c.nome}"?`)) { S.cats = S.cats.filter((x) => x.id !== c.id); ui.sheet = null; save(); render(); }
        break;
      }
      case 'ics-task': if (tarefa) lembreteTarefa(tarefa, today); break;
      case 'ics-daily': lembreteDiario(today); break;
      case 'export': entregar(`planner-backup-${today}.json`, 'application/json', JSON.stringify(S, null, 2)); break;
      default: break;
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target.id === 'cfg-hora' && e.target.value) { S.cfg.hora = e.target.value; save(); toast(`Lembretes às ${S.cfg.hora}`); }
    if (e.target.id === 'imp' && e.target.files && e.target.files[0]) {
      const r = new FileReader();
      r.onload = () => {
        try {
          const o = JSON.parse(r.result);
          if (!o || !Array.isArray(o.cats) || !Array.isArray(o.tasks)) throw new Error('formato');
          if (!confirm(`Substituir os dados atuais por este backup (${o.tasks.length} tarefas)?`)) return;
          o.cfg = o.cfg || { hora: '09:00' };
          S = o; save(); toast('Backup importado'); render();
        } catch (err) { toast('Arquivo inválido. Use um backup exportado pelo Planner.'); }
      };
      r.readAsText(e.target.files[0]);
      e.target.value = '';
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'f-titulo') { e.preventDefault(); salvarTarefa(ymd(new Date())); }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));

  render();
})();
