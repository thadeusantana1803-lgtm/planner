/* Planner V3 — telas e interações. As regras ficam em core.js. */
(() => {
  'use strict';
  const C = window.PlannerCore;
  const { ymd, fromYmd, addDays, addMonthsFirst, startOfWeek, isPendencia, isAtrasadaMes, adiamentos, nivel, postpone, shade, textOn, lift, buildIcs, stamp } = C;

  const KEY = 'planner_v1';
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const MES_ABR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  const DIAS_ABR = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const DIAS_INI = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  // Telas que ficam dentro da aba "Mais"
  const TAB_DE = { cats: 'mais', cfg: 'mais', viagens: 'mais', viagem: 'mais' };

  /* ---------- Dados ---------- */
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const o = JSON.parse(raw);
        if (o && Array.isArray(o.cats) && Array.isArray(o.tasks)) return C.normalizar(o);
      }
    } catch (e) { /* começa do zero */ }
    return C.seedState();
  }
  let S = load();
  const ui = { tab: 'hoje', mes: null, dia: null, sem: null, sheet: null, lastCat: null, viagem: null };

  /* ---------- Aparência: modo (automático/claro/escuro) e paleta ---------- */
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const isDark = () => {
    const t = S.cfg.tema || 'auto';
    return t === 'escuro' || (t === 'auto' && !!(mq && mq.matches));
  };
  // No escuro, as cores das categorias mais escuras ganham brilho para continuarem visíveis.
  const vc = (hex) => (isDark() ? lift(hex) : hex);
  const paletaAtual = () => C.PALETAS[S.cfg.paleta] || C.PALETAS[C.PALETA_PADRAO];
  function aplicarTema() {
    const dark = isDark(), modo = dark ? 'escuro' : 'claro', p = paletaAtual()[modo];
    const set = (k, v) => document.documentElement.style.setProperty(k, v);
    set('--bg', p.bg); set('--surface', p.surface); set('--raise', p.raise);
    set('--ink', p.ink); set('--ink2', p.ink2); set('--line', p.line);
    set('--tile', dark ? `linear-gradient(180deg, ${p.raise}, ${p.surface})` : p.surface);
    set('--on-ink', textOn(p.ink));
    set('--warn-bg', dark ? '#3A2E10' : '#FFF4DB'); set('--warn-ink', dark ? '#FFD479' : '#5C4200'); set('--warn-t', dark ? '#FFB340' : '#9A6700');
    set('--urg-bg', dark ? '#3F1715' : '#FFE3E0'); set('--urg-ink', dark ? '#FFB4AD' : '#7A1410'); set('--urg-t', dark ? '#FF6961' : '#C62828');
    set('--scrim', dark ? 'rgba(0,0,0,.6)' : 'rgba(10,16,30,.45)'); set('--shadow', dark ? 'rgba(0,0,0,.4)' : 'rgba(20,33,61,.05)');
    set('color-scheme', dark ? 'dark' : 'light');
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', p.bg);
  }

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
  const catColor = (id) => vc(cat(id) ? cat(id).cor : '#8A93A3');
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
  const hk = (t) => t.hora || '99:99';
  const byOrder = (a, b) => (a.feito - b.feito) || (hk(a) < hk(b) ? -1 : hk(a) > hk(b) ? 1 : 0) || ((a.criada || 0) - (b.criada || 0));
  const byHora = (a, b) => (hk(a) < hk(b) ? -1 : hk(a) > hk(b) ? 1 : 0) || ((a.criada || 0) - (b.criada || 0));

  /* ---------- Rotinas: ocorrências calculadas na hora ---------- */
  const rot = (id) => S.rotinas.find((r) => r.id === id);
  const occTask = (r, date) => ({
    id: `r:${r.id}:${date}`, rotina: true, rid: r.id, titulo: r.titulo, cat: r.cat, data: date,
    hora: r.hora || '', dur: r.dur || 0, nota: r.nota || '', feito: !!(r.feitas && r.feitas[date]),
    adiamentos: 0, criada: r.criada || 0,
  });
  const parseOcc = (id) => { const m = /^r:(.+):(\d{4}-\d{2}-\d{2})$/.exec(id || ''); return m ? { rid: m[1], date: m[2] } : null; };
  // Tarefas avulsas + ocorrências de rotina no intervalo (datas inclusivas)
  function entre(a, b) {
    const out = S.tasks.filter((t) => t.data >= a && t.data <= b);
    S.rotinas.forEach((r) => C.ocorrencias(r, a, b).forEach((d) => out.push(occTask(r, d))));
    return out;
  }
  const doDia = (d) => entre(d, d);
  const descRotina = (r) => {
    let s = r.tipo === 'dia' ? 'Repete todo dia'
      : r.tipo === 'sem' ? 'Repete: ' + (r.dias || []).slice().sort().map((i) => DIAS_ABR[i].toLowerCase()).join(', ')
        : `Repete todo dia ${r.diaMes} do mês`;
    if (r.fim) s += ` · até ${dataCurta(r.fim)}`;
    return s;
  };

  /* ---------- Componentes ---------- */
  function empty(titulo, texto) { return `<div class="empty"><b>${esc(titulo)}</b>${esc(texto)}</div>`; }
  const back = (tab, rotulo) => `<button class="back" data-action="tab" data-tab="${tab}">‹ ${esc(rotulo)}</button>`;
  const horaTxt = (t) => `${t.hora}${t.dur ? '–' + C.somaMin(t.hora, t.dur) : ''}`;

  function taskRow(t, today, o = {}) {
    const n = nivel(t, today), a = adiamentos(t, today);
    const alerta = n === 2 ? `<span class="al u">🔥 Urgente · adiada ${a}×</span>`
      : n === 1 ? `<span class="al a">⚠️ Atenção · adiada 1×</span>` : '';
    const data = o.date ? `<span>${esc(dataCurta(t.data))}</span>` : '';
    const hora = t.hora && !o.nohora ? `<span>🕐 ${esc(horaTxt(t))}</span>` : '';
    const rep = t.rotina ? '<span>↻ Rotina</span>' : '';
    let et = '';
    if (t.etapas && t.etapas.length) {
      const f = t.etapas.filter((e) => e.f).length;
      et = `<div class="tsub"><div class="bar"><i style="width:${Math.round((f / t.etapas.length) * 100)}%"></i></div><span>${f}/${t.etapas.length} etapas</span></div>`;
    }
    const acoes = o.act ? `<div class="pact"><button class="mini" data-action="postpone-open" data-id="${esc(t.id)}">↷ Reagendar</button></div>` : '';
    const estilo = `--c:${catColor(t.cat)}` + (o.minh ? `;min-height:${o.minh}px` : '');
    return `<div class="task lvl${n} ${t.feito ? 'done' : ''}" style="${estilo}" data-action="open-task" data-id="${esc(t.id)}">
      <button class="chk" data-action="toggle" data-id="${esc(t.id)}" aria-label="${t.feito ? 'Reabrir' : 'Concluir'} tarefa"></button>
      <div class="tb"><div class="tt">${esc(t.titulo)}</div>
        <div class="tm"><span class="tag">${esc(catIcon(t.cat))} ${esc(catName(t.cat))}</span>${hora}${rep}${data}${alerta}</div>${et}${acoes}</div></div>`;
  }

  function pendBanner(today) {
    const pend = S.tasks.filter((t) => isPendencia(t, today));
    if (!pend.length) return '';
    const urg = pend.filter((t) => nivel(t, today) >= 2).length;
    return `<button class="banner ${urg ? 'urg' : ''}" data-action="tab" data-tab="pend"><span class="bi">${urg ? '🔥' : '⚠️'}</span>
      <span><b>${pend.length} ${pend.length > 1 ? 'pendências' : 'pendência'} de meses anteriores</b>
      <small>${urg ? `${urg} ${urg > 1 ? 'urgentes' : 'urgente'} · toque para resolver` : 'Toque para resolver'}</small></span></button>`;
  }

  /* ---------- Telas ---------- */
  function viewHoje(today) {
    const d = fromYmd(today);
    const hoje = doDia(today).sort(byOrder);
    const feitas = hoje.filter((t) => t.feito).length;
    const atras = S.tasks.filter((t) => isAtrasadaMes(t, today)).sort((a, b) => (a.data < b.data ? -1 : 1));
    let h = `<header class="hdr"><div class="hsub">${DIAS[d.getDay()]}</div><h1>${d.getDate()} de ${MESES[d.getMonth()]}</h1>`;
    if (hoje.length) h += `<div class="prog"><div class="bar"><i style="width:${Math.round((feitas / hoje.length) * 100)}%"></i></div><span>${feitas} de ${hoje.length} feitas</span></div>`;
    h += '</header>';
    h += pendBanner(today);
    if (atras.length) h += `<h2 class="sec">Atrasadas neste mês</h2>` + atras.map((t) => taskRow(t, today, { date: true })).join('');
    h += `<h2 class="sec">Hoje</h2>`;
    h += hoje.length ? hoje.map((t) => taskRow(t, today)).join('') : empty('Nada marcado para hoje.', 'Toque no + para adicionar uma tarefa.');
    return h;
  }

  // Agenda: hoje e os dois dias seguintes, em ordem de horário.
  function agendaRow(t, today) {
    const fim = t.dur ? C.somaMin(t.hora, t.dur) : '';
    const alt = Math.round(Math.min(130, 48 + (t.dur || 30) * 0.45)); // quanto mais longo o compromisso, mais alto o cartão
    return `<div class="agrow"><div class="agt"><b>${esc(t.hora)}</b><span>${esc(fim)}</span></div>${taskRow(t, today, { minh: alt, nohora: true })}</div>`;
  }

  function viewAgenda(today) {
    const agora = new Date();
    const agoraHM = `${C.pad(agora.getHours())}:${C.pad(agora.getMinutes())}`;
    const linhaAgora = `<div class="agora"><i></i><span>Agora · ${agoraHM}</span></div>`;
    let h = `<header class="hdr"><div class="hsub">Hoje e os próximos dois dias</div><h1>Agenda</h1></header>` + pendBanner(today);
    for (let i = 0; i < 3; i++) {
      const iso = addDays(today, i), d = fromYmd(iso);
      const nome = i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : DIAS[d.getDay()];
      const lista = doDia(iso);
      const dia = lista.filter((t) => !t.hora).sort(byOrder);
      const horas = lista.filter((t) => t.hora).sort(byHora);
      h += `<h2 class="agh"><b>${nome}</b><span>${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}</span></h2>`;
      if (!lista.length) { h += '<p class="agv">Nada marcado.</p>'; continue; }
      if (dia.length) h += `<div class="agall"><small>O dia todo</small>${dia.map((t) => taskRow(t, today)).join('')}</div>`;
      let marcou = false;
      horas.forEach((t) => {
        if (i === 0 && !marcou && t.hora > agoraHM) { h += linhaAgora; marcou = true; }
        h += agendaRow(t, today);
      });
      if (i === 0 && horas.length && !marcou) h += linhaAgora;
    }
    return h;
  }

  // Cor do nome de cada dia nos balões (Dom → Sáb), no estilo do widget do iOS.
  const DIA_COR = ['#FF453A', '#0A84FF', '#5E5CE6', '#BF5AF2', '#32ADE6', '#30D158', '#FF9F0A'];

  function viewSemana(today) {
    if (!ui.sem) ui.sem = startOfWeek(today);
    const ini = ui.sem, fim = addDays(ini, 6), di = fromYmd(ini), df = fromYmd(fim);
    const titulo = di.getMonth() === df.getMonth()
      ? `${di.getDate()} a ${df.getDate()} de ${MES_ABR[df.getMonth()]}`
      : `${di.getDate()} ${MES_ABR[di.getMonth()]} a ${df.getDate()} ${MES_ABR[df.getMonth()]}`;
    const tasks = entre(ini, fim);
    const feitas = tasks.filter((t) => t.feito).length;
    let h = `<div class="mhead"><h1>${titulo}</h1><div class="mnav">
      <button data-action="sem-hoje" class="hoje" aria-label="Ir para esta semana">Hoje</button>
      <button data-action="sem-prev" aria-label="Semana anterior">‹</button><button data-action="sem-next" aria-label="Próxima semana">›</button></div></div>`;
    h += `<div class="mstat">${tasks.length ? `${feitas} de ${tasks.length} tarefas concluídas na semana` : 'Nenhuma tarefa nesta semana'}</div>`;
    h += pendBanner(today);
    h += '<div class="wk">';
    for (let i = 0; i < 7; i++) {
      const iso = addDays(ini, i), d = fromYmd(iso);
      const dts = tasks.filter((t) => t.data === iso).sort(byOrder);
      const abertas = dts.filter((t) => !t.feito).length;
      const lim = dts.length > 4 ? 3 : dts.length; // cabem 4 linhas: 3 tarefas + "+N mais"
      const itens = dts.slice(0, lim).map((t) => {
        const n = nivel(t, today);
        return `<div class="wi ${t.feito ? 'f' : ''}" style="--c:${catColor(t.cat)}"><i></i><span>${t.hora ? esc(t.hora) + ' ' : ''}${n === 2 ? '🔥 ' : n === 1 ? '⚠️ ' : ''}${esc(t.titulo)}</span></div>`;
      }).join('');
      const mais = dts.length > lim ? `<div class="wi mais">+${dts.length - lim} mais</div>` : '';
      h += `<button class="wt ${i === 6 ? 'wide' : ''} ${iso === today ? 'hoje' : ''}" style="--dc:${vc(DIA_COR[i])}" data-action="open-day" data-d="${iso}">
        <div class="wh"><span class="wn">${DIAS[i]}</span><span class="wc">${abertas}</span></div>
        <div class="wd">${iso === today ? 'Hoje · ' : ''}${d.getDate()} ${MES_ABR[d.getMonth()]}</div>
        <div class="wl">${dts.length ? itens + mais : '<div class="wz">Nenhuma tarefa</div>'}</div></button>`;
    }
    return h + '</div>';
  }

  function viewMes(today) {
    if (!ui.mes) ui.mes = today.slice(0, 7);
    const [y, m] = ui.mes.split('-').map(Number);
    const nd = new Date(y, m, 0).getDate();
    const off = new Date(y, m - 1, 1).getDay();
    const tasks = entre(`${ui.mes}-01`, `${ui.mes}-${C.pad(nd)}`);
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
      return `<span class="chip" style="--c:${vc(c.cor)}">${esc(c.icone || '')} ${porCat[k].d}/${porCat[k].t}</span>`;
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
    const lista = tasks.filter((t) => t.data === ui.dia).sort(byOrder);
    h += `<h2 class="sec">${DIAS[sel.getDay()]}, ${sel.getDate()} de ${MESES[sel.getMonth()]}</h2>`;
    h += lista.length ? lista.map((t) => taskRow(t, today)).join('') : empty('Sem tarefas neste dia.', 'Toque no + para adicionar.');
    return h;
  }

  function viewPend(today) {
    const lista = S.tasks.filter((t) => isPendencia(t, today))
      .sort((a, b) => (nivel(b, today) - nivel(a, today)) || (a.data < b.data ? -1 : 1));
    let h = `<header class="hdr"><div class="hsub">De meses anteriores</div><h1>Pendências</h1></header>`;
    if (!lista.length) return h + empty('Tudo em dia.', 'O que ficar sem fazer ao virar o mês aparece aqui, em destaque. Rotinas não geram pendência.');
    h += `<p class="lead">As mais adiadas vêm primeiro. Conclua, reagende ou toque para editar.</p>`;
    return h + lista.map((t) => taskRow(t, today, { date: true, act: true })).join('');
  }

  function viewMais() {
    const subs = S.cats.filter((c) => c.parent).length;
    const linha = (tab, ico, nome, sub) => `<button class="mrow" data-action="tab" data-tab="${tab}"><span class="mi">${ico}</span><span class="mt"><b>${nome}</b><small>${sub}</small></span><span class="mc">›</span></button>`;
    return `<header class="hdr"><div class="hsub">Planner</div><h1>Mais</h1></header>
      ${linha('cats', '🎨', 'Categorias', `${S.cats.filter((c) => !c.parent).length} categorias e ${subs} subcategorias`)}
      ${linha('viagens', '✈️', 'Viagens', S.viagens.length ? `${S.viagens.length} ${S.viagens.length > 1 ? 'viagens' : 'viagem'}` : 'Checklist do que levar')}
      ${linha('cfg', '⚙️', 'Ajustes', 'Aparência, lembretes e backup')}`;
  }

  function viewCats() {
    const count = (ids) => S.tasks.filter((t) => !t.feito && ids.includes(t.cat)).length;
    const roots = S.cats.filter((c) => !c.parent);
    const ordered = roots.filter((c) => c.ativa).concat(roots.filter((c) => !c.ativa));
    let h = back('mais', 'Mais') + `<header class="hdr"><div class="hsub">Cores que separam cada assunto</div><h1>Categorias</h1></header>`;
    ordered.forEach((c) => {
      const subs = S.cats.filter((s) => s.parent === c.id);
      const n = count([c.id, ...subs.map((s) => s.id)]);
      h += `<button class="crow ${c.ativa ? '' : 'off'}" style="--c:${vc(c.cor)}" data-action="cat-edit" data-id="${c.id}">
        <span class="ci">${esc(c.icone || '•')}</span><span class="cn">${esc(c.nome)}</span><span class="cc">${n ? n + ' em aberto' : ''}</span></button>`;
      subs.forEach((s) => {
        h += `<button class="csub ${s.ativa ? '' : 'off'}" style="--c:${vc(s.cor)}" data-action="cat-edit" data-id="${s.id}">
          <span class="ci">${esc(s.icone || c.icone || '•')}</span><span class="cn">${esc(s.nome)}</span><span class="cc">${count([s.id]) ? count([s.id]) + ' em aberto' : ''}</span></button>`;
      });
      h += `<button class="addsub" data-action="cat-sub" data-id="${c.id}">+ Subcategoria</button>`;
    });
    return h + `<button class="bigbtn" data-action="cat-new">+ Nova categoria</button>`;
  }

  /* ---------- Viagens ---------- */
  const viagem = (id) => S.viagens.find((v) => v.id === id);
  function quandoViagem(data, today) {
    const n = Math.round((fromYmd(data) - fromYmd(today)) / 86400000);
    if (n > 1) return `em ${n} dias`;
    if (n === 1) return 'amanhã';
    if (n === 0) return 'hoje';
    return `foi em ${dataCurta(data)}`;
  }

  function viewViagens(today) {
    let h = back('mais', 'Mais') + `<header class="hdr"><div class="hsub">Nada fica de fora</div><h1>Viagens</h1></header>`;
    if (!S.viagens.length) h += empty('Nenhuma viagem ainda.', 'Crie uma e receba a lista pronta, separada em obrigatórios, importantes e recomendados.');
    S.viagens.slice().sort((a, b) => (a.data || '9999') < (b.data || '9999') ? -1 : (a.data || '9999') > (b.data || '9999') ? 1 : (a.criada || 0) - (b.criada || 0)).forEach((v) => {
      const tot = v.itens.length, ok = v.itens.filter((i) => i.f).length;
      const falta = v.itens.filter((i) => i.n === 'o' && !i.f).length;
      h += `<button class="vcard" data-action="viagem-open" data-id="${v.id}">
        <span class="vt"><b>${esc(v.nome)}</b><span>${v.tipo === 'internacional' ? '✈️ Internacional' : '🚗 Nacional'}${v.data ? ' · ' + esc(quandoViagem(v.data, today)) : ''}</span></span>
        <span class="prog"><span class="bar"><i style="width:${tot ? Math.round((ok / tot) * 100) : 0}%"></i></span><span>${ok}/${tot}</span></span>
        ${falta ? `<span class="al u vf">🔴 ${falta} ${falta > 1 ? 'obrigatórios faltando' : 'obrigatório faltando'}</span>` : ''}</button>`;
    });
    return h + `<button class="bigbtn" data-action="viagem-new">+ Nova viagem</button>`;
  }

  function viewViagem(today) {
    const v = viagem(ui.viagem);
    if (!v) { ui.tab = 'viagens'; return viewViagens(today); }
    const tot = v.itens.length, ok = v.itens.filter((i) => i.f).length;
    let h = back('viagens', 'Viagens') + `<header class="hdr"><div class="hsub">${v.tipo === 'internacional' ? '✈️ Internacional' : '🚗 Nacional'}${v.data ? ' · ' + esc(quandoViagem(v.data, today)) : ''}</div><h1>${esc(v.nome)}</h1>
      <div class="prog"><div class="bar"><i style="width:${tot ? Math.round((ok / tot) * 100) : 0}%"></i></div><span>${ok} de ${tot} prontos</span></div></header>`;
    C.NIVEIS_VIAGEM.forEach((n) => {
      const its = v.itens.filter((i) => i.n === n.id);
      const feitos = its.filter((i) => i.f).length;
      const cor = vc(n.cor);
      h += `<h2 class="vsec" style="--c:${cor}"><span>${n.emoji} ${n.nome}</span><em>${feitos}/${its.length}</em></h2>`;
      its.forEach((i) => {
        h += `<div class="vi ${i.f ? 'done' : ''}" style="--c:${cor}"><button class="chk" data-action="v-toggle" data-id="${i.id}" aria-label="${i.f ? 'Desmarcar' : 'Marcar'} item"></button>
          <span class="vx">${esc(i.t)}${i.meu ? ' <small>meu</small>' : ''}</span><button class="x" data-action="v-del" data-id="${i.id}" aria-label="Remover item">×</button></div>`;
      });
      h += `<div class="vadd"><input id="vnew-${n.id}" type="text" placeholder="Adicionar item" autocomplete="off" enterkeyhint="done"><button class="btn" data-action="v-add" data-n="${n.id}" aria-label="Adicionar">+</button></div>`;
    });
    return h + `<div class="row vend"><button class="btn" data-action="viagem-edit" data-id="${v.id}">Editar viagem</button><button class="btn danger" data-action="viagem-del" data-id="${v.id}">Excluir viagem</button></div>`;
  }

  function viewCfg() {
    const modo = S.cfg.tema || 'auto', ativa = S.cfg.paleta && C.PALETAS[S.cfg.paleta] ? S.cfg.paleta : C.PALETA_PADRAO;
    const mv = isDark() ? 'escuro' : 'claro';
    const modos = [['auto', 'Automático'], ['claro', 'Claro'], ['escuro', 'Escuro']]
      .map(([v, r]) => `<button class="${modo === v ? 'on' : ''}" data-action="tema" data-v="${v}">${r}</button>`).join('');
    const paletas = Object.entries(C.PALETAS).map(([k, p]) => {
      const c = p[mv];
      return `<button class="pal ${ativa === k ? 'on' : ''}" style="--pb:${c.bg};--ps:${c.surface};--pi:${c.ink};--p2:${c.ink2}" data-action="paleta" data-v="${k}" aria-label="Paleta ${esc(p.nome)}">
        <span class="pv"><i></i></span>${esc(p.nome)}</button>`;
    }).join('');
    return back('mais', 'Mais') + `<header class="hdr"><div class="hsub">Planner · versão 3</div><h1>Ajustes</h1></header>
    <section class="card"><h3>Aparência</h3>
      <p>Automático acompanha o modo claro ou escuro do iPhone.</p>
      <div class="seg">${modos}</div>
      <p style="margin-top:14px">Paleta do app. As cores de cada categoria continuam as que você definiu.</p>
      <div class="pals">${paletas}</div></section>
    <section class="card"><h3>Lembretes no Calendário</h3>
      <p>O iPhone não permite que um app instalado pela web avise sozinho quando está fechado. Por isso os lembretes usam o app Calendário, que toca o alarme de verdade.</p>
      <label class="f" for="cfg-hora">Horário dos lembretes de tarefas sem horário</label>
      <input id="cfg-hora" type="time" value="${esc(S.cfg.hora)}">
      <div class="row"><button class="btn primary" data-action="ics-daily">🔔 Lembrete diário de pendências</button></div>
      <p>Tarefas com horário avisam 10 minutos antes dele. Para criar o lembrete, abra a tarefa ou a rotina e toque em Lembrete.</p></section>
    <section class="card"><h3>Backup</h3>
      <p>Seus dados ficam só neste aparelho. Exporte um backup de vez em quando e guarde em Arquivos ou iCloud.</p>
      <div class="row"><button class="btn" data-action="export">Exportar backup</button>
      <label class="btn" for="imp">Importar backup</label></div>
      <input id="imp" type="file" accept="application/json,.json" hidden></section>
    <section class="card"><h3>Resumo</h3><p>${S.tasks.length} tarefas · ${S.rotinas.length} rotinas · ${S.viagens.length} viagens · ${S.cats.filter((c) => !c.parent).length} categorias · ${S.cats.filter((c) => c.parent).length} subcategorias</p></section>`;
  }

  /* ---------- Painéis ---------- */
  const novoDraft = (o) => Object.assign({ titulo: '', cat: '', data: '', hora: '', dur: 60, nota: '', etapas: [], rep: { tipo: 'nao', dias: [], fim: '' }, subst: null }, o);

  function sheetTask(s, today) {
    const d = s.draft, t = s.id ? S.tasks.find((x) => x.id === s.id) : null, modoRot = !!s.rot;
    const sel = rootOf(cat(d.cat));
    const roots = S.cats.filter((c) => !c.parent && (c.ativa || (sel && sel.id === c.id)));
    const subs = sel ? S.cats.filter((c) => c.parent === sel.id && (c.ativa || c.id === d.cat)) : [];
    const pill = (c, par) => `<button type="button" class="pill ${d.cat === c.id ? 'on' : par ? 'par' : ''}" style="--c:${vc(c.cor)};--on:${textOn(vc(c.cor))}" data-action="pick-cat" data-id="${c.id}">${esc(c.icone || '')} ${esc(c.nome)}</button>`;
    const rep = d.rep, podeRepetir = !t;
    const tipos = [['nao', 'Não repete'], ['dia', 'Todo dia'], ['sem', 'Semanal'], ['mes', 'Mensal']].filter(([v]) => !(modoRot && v === 'nao'));
    const diaDoMes = d.data ? Number(d.data.slice(8)) : Number(today.slice(8));
    const etapas = t ? (t.etapas || []) : d.etapas;
    const mostraEtapas = !modoRot && rep.tipo === 'nao';
    const durs = C.DURACOES.map(([v, r]) => `<option value="${v}" ${Number(d.dur) === v ? 'selected' : ''}>${r}</option>`).join('');
    const titulo = modoRot ? 'Editar rotina' : t ? 'Editar tarefa' : 'Nova tarefa';
    return `<h2>${titulo}</h2>
      <label class="f" for="f-titulo">O que precisa ser feito?</label>
      <input id="f-titulo" type="text" value="${esc(d.titulo)}" placeholder="Ex.: Levar o filho ao basquete" autocomplete="off" ${t || modoRot ? '' : 'autofocus'}>
      <label class="f">Categoria</label>
      <div class="pills">${roots.map((c) => pill(c, sel && sel.id === c.id && d.cat !== c.id)).join('')}</div>
      ${subs.length ? `<label class="f">Subcategoria de ${esc(sel.nome)}</label><div class="pills">${subs.map((c) => pill(c, false)).join('')}</div>` : ''}
      <label class="f" for="f-data">${rep.tipo === 'nao' ? 'Data' : 'Começa em'}</label>
      <input id="f-data" type="date" value="${esc(d.data)}">
      ${t && !t.feito ? '<p class="hint">Mudar para uma data futura conta como adiamento.</p>' : ''}
      <div class="two">
        <div><label class="f" for="f-hora">Horário (opcional)</label><input id="f-hora" type="time" value="${esc(d.hora)}"></div>
        <div><label class="f" for="f-dur">Duração</label><select id="f-dur">${durs}</select></div>
      </div>
      ${podeRepetir ? `<label class="f">Repetir</label>
        <div class="seg ${tipos.length === 4 ? 'c4' : 'c3'}">${tipos.map(([v, r]) => `<button type="button" class="${rep.tipo === v ? 'on' : ''}" data-action="rep-tipo" data-v="${v}">${r}</button>`).join('')}</div>
        ${rep.tipo === 'sem' ? `<div class="dsem">${DIAS_ABR.map((r, i) => `<button type="button" class="${rep.dias.includes(i) ? 'on' : ''}" data-action="rep-dia" data-v="${i}">${r}</button>`).join('')}</div>` : ''}
        ${rep.tipo === 'mes' ? `<p class="hint">Repete todo dia ${diaDoMes} do mês. Em meses mais curtos, vale o último dia.</p>` : ''}
        ${rep.tipo !== 'nao' ? `<p class="hint">Rotinas não viram pendência se ficarem sem fazer.</p>
          <label class="f" for="f-fim">Termina em (opcional)</label><input id="f-fim" type="date" value="${esc(rep.fim)}">` : ''}` : ''}
      ${mostraEtapas ? `<label class="f">Etapas (opcional)</label>
        ${etapas.length ? `<div class="etapas">${etapas.map((e) => `<div class="et ${e.f ? 'ok' : ''}"><button type="button" class="chk" data-action="et-toggle" data-eid="${e.id}" aria-label="${e.f ? 'Desmarcar' : 'Marcar'} etapa"></button><span>${esc(e.t)}</span><button type="button" class="x" data-action="et-del" data-eid="${e.id}" aria-label="Remover etapa">×</button></div>`).join('')}</div>` : ''}
        <div class="etadd"><input id="f-etapa" type="text" placeholder="Adicionar etapa" autocomplete="off" enterkeyhint="done"><button type="button" class="btn" data-action="et-add" aria-label="Adicionar etapa">+</button></div>` : ''}
      <label class="f" for="f-nota">Observações (opcional)</label>
      <textarea id="f-nota">${esc(d.nota)}</textarea>
      <div class="row"><button class="btn primary" data-action="save-task">Salvar</button>
        ${t ? `<button class="btn" data-action="toggle-close" data-id="${t.id}">${t.feito ? 'Reabrir' : 'Concluir'}</button>` : ''}</div>
      ${t ? `<div class="row"><button class="btn" data-action="postpone-open" data-id="${t.id}">↷ Reagendar</button>
        <button class="btn" data-action="ics-task" data-id="${t.id}">🔔 Lembrete</button>
        <button class="btn danger" data-action="delete-task" data-id="${t.id}">Excluir</button></div>` : ''}
      ${modoRot ? `<div class="row"><button class="btn danger" data-action="rot-del" data-rid="${s.rot}">Excluir rotina</button></div>` : ''}`;
  }

  function sheetOcc(s) {
    const o = parseOcc(s.id), r = o && rot(o.rid);
    if (!r) return '';
    const t = occTask(r, o.date), d = fromYmd(o.date);
    return `<h2>${esc(r.titulo)}</h2>
      <p class="hint">${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}${r.hora ? ' · ' + esc(horaTxt(r)) : ''} · ${esc(catIcon(r.cat))} ${esc(catName(r.cat))}</p>
      <p class="hint">↻ ${esc(descRotina(r))}</p>
      ${r.nota ? `<p class="hint">${esc(r.nota)}</p>` : ''}
      <div class="row"><button class="btn primary" data-action="toggle-close" data-id="${esc(t.id)}">${t.feito ? 'Reabrir' : 'Concluir'}</button></div>
      <div class="row"><button class="btn" data-action="occ-alter" data-id="${esc(t.id)}">Alterar só este dia</button><button class="btn" data-action="occ-skip" data-id="${esc(t.id)}">Pular este dia</button></div>
      <div class="row"><button class="btn" data-action="rot-edit" data-id="${esc(t.id)}">Editar rotina</button><button class="btn" data-action="ics-rot" data-id="${esc(t.id)}">🔔 Lembrete</button></div>
      <div class="row"><button class="btn" data-action="rot-end" data-id="${esc(t.id)}">Encerrar daqui em diante</button><button class="btn danger" data-action="rot-del" data-rid="${r.id}">Excluir rotina</button></div>`;
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

  function sheetDia(s, today) {
    const d = fromYmd(s.d);
    const lista = doDia(s.d).sort(byOrder);
    return `<h2>${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}</h2>
      ${lista.length ? lista.map((t) => taskRow(t, today)).join('') : empty('Sem tarefas neste dia.', 'Adicione a primeira abaixo.')}
      <div class="row"><button class="btn primary" data-action="new-task-day" data-d="${s.d}">+ Adicionar tarefa neste dia</button></div>`;
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

  function sheetViag(s) {
    const d = s.draft;
    return `<h2>${s.id ? 'Editar viagem' : 'Nova viagem'}</h2>
      <label class="f" for="v-nome">Para onde?</label>
      <input id="v-nome" type="text" value="${esc(d.nome)}" placeholder="Ex.: Florianópolis em dezembro" autocomplete="off" ${s.id ? '' : 'autofocus'}>
      ${s.id ? '' : `<label class="f">Tipo</label>
        <div class="seg c2"><button type="button" class="${d.tipo === 'nacional' ? 'on' : ''}" data-action="viag-tipo" data-v="nacional">🚗 Nacional</button>
        <button type="button" class="${d.tipo === 'internacional' ? 'on' : ''}" data-action="viag-tipo" data-v="internacional">✈️ Internacional</button></div>
        <p class="hint">A lista já vem pronta. Depois você remove o que não precisa e acrescenta os seus itens.</p>`}
      <label class="f" for="v-data">Data de ida (opcional)</label>
      <input id="v-data" type="date" value="${esc(d.data)}">
      <div class="row"><button class="btn primary" data-action="save-viag">Salvar</button></div>`;
  }

  function renderSheet(today) {
    const el = document.getElementById('sheet'), s = ui.sheet;
    if (!s) { el.innerHTML = ''; el.hidden = true; return; }
    const body = { task: sheetTask, post: sheetPost, cat: sheetCat, dia: sheetDia, occ: sheetOcc, viag: sheetViag }[s.type](s, today);
    el.innerHTML = `<div class="backdrop" data-action="close-sheet"><div class="sheet ${s.fresh ? 'enter' : ''}" role="dialog" aria-modal="true">${body}</div></div>`;
    s.fresh = false;
    s.rendered = true;
    el.hidden = false;
  }

  function syncDraft() {
    const s = ui.sheet; if (!s || !s.rendered) return; // só lê campos de um painel já desenhado
    const g = (id) => document.getElementById(id);
    if (s.type === 'task' && g('f-titulo')) {
      s.draft.titulo = g('f-titulo').value; s.draft.data = g('f-data').value; s.draft.nota = g('f-nota').value;
      if (g('f-hora')) s.draft.hora = g('f-hora').value;
      if (g('f-dur')) s.draft.dur = Number(g('f-dur').value) || 0;
      if (g('f-fim')) s.draft.rep.fim = g('f-fim').value;
    }
    if (s.type === 'cat' && g('c-nome')) { s.draft.nome = g('c-nome').value; s.draft.icone = g('c-icone').value; s.draft.cor = g('c-cor').value; s.draft.ativa = g('c-ativa').checked; }
    if (s.type === 'viag' && g('v-nome')) { s.draft.nome = g('v-nome').value; s.draft.data = g('v-data').value; }
  }

  function render() {
    syncDraft();
    aplicarTema();
    const today = ymd(new Date());
    const telas = { hoje: viewHoje, agenda: viewAgenda, sem: viewSemana, mes: viewMes, pend: viewPend, mais: viewMais, cats: viewCats, viagens: viewViagens, viagem: viewViagem, cfg: viewCfg };
    document.getElementById('view').innerHTML = telas[ui.tab](today);
    const ativa = TAB_DE[ui.tab] || ui.tab;
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === ativa));
    const n = S.tasks.filter((t) => isPendencia(t, today)).length;
    const bd = document.getElementById('pendBadge'); bd.textContent = n; bd.hidden = !n;
    document.getElementById('fab').hidden = !['hoje', 'agenda', 'sem', 'mes', 'pend'].includes(ui.tab);
    renderSheet(today);
  }

  let toastTimer;
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }
  const foco = (id) => { const el = document.getElementById(id); if (el && el.focus) el.focus(); };

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
  const hm = (s) => s.split(':').map(Number);
  function quando(dataMin, today) {
    const [hh, mm] = hm(S.cfg.hora);
    const agora = new Date();
    let data = dataMin < today ? today : dataMin;
    if (data === today && (agora.getHours() > hh || (agora.getHours() === hh && agora.getMinutes() >= mm))) data = addDays(today, 1);
    return { data, hh, mm };
  }
  function lembreteTarefa(t, today) {
    if (t.hora) { // usa o horário da própria tarefa, com aviso 10 min antes
      const [hh, mm] = hm(t.hora);
      const inicio = fromYmd(t.data); inicio.setHours(hh, mm, 0, 0);
      if (inicio < new Date()) { toast('Esse horário já passou. Reagende a tarefa.'); return; }
      const ics = buildIcs([{ uid: `${t.id}@planner`, start: stamp(t.data, hh, mm), end: stamp(t.data, hh, mm + (t.dur || 30)), summary: t.titulo, desc: catName(t.cat) + (t.nota ? '\n' + t.nota : ''), alarm: '-PT10M' }], agoraUtc());
      entregar('lembrete-tarefa.ics', 'text/calendar', ics);
      toast(`Lembrete: ${dataCurta(t.data)} às ${t.hora}, com aviso 10 min antes`);
      return;
    }
    const q = quando(t.data, today);
    const ics = buildIcs([{ uid: `${t.id}@planner`, start: stamp(q.data, q.hh, q.mm), end: stamp(q.data, q.hh, q.mm + 30), summary: t.titulo, desc: catName(t.cat) + (t.nota ? '\n' + t.nota : '') }], agoraUtc());
    entregar('lembrete-tarefa.ics', 'text/calendar', ics);
    toast(`Lembrete para ${dataCurta(q.data)} às ${S.cfg.hora}`);
  }
  function lembreteRotina(r, today) {
    const [hh, mm] = hm(r.hora || S.cfg.hora);
    const agora = new Date();
    const prox = C.ocorrencias(r, today, addDays(today, 800)).find((d) => {
      const x = fromYmd(d); x.setHours(hh, mm, 0, 0);
      return x >= agora;
    });
    if (!prox) { toast('Esta rotina não tem próximas ocorrências.'); return; }
    const ics = buildIcs([{
      uid: `${r.id}@planner`, start: stamp(prox, hh, mm), end: stamp(prox, hh, mm + (r.dur || 30)), summary: r.titulo,
      desc: catName(r.cat) + (r.nota ? '\n' + r.nota : ''), rrule: C.rruleDe(r),
      exdates: (r.excecoes || []).filter((x) => x >= prox).map((x) => stamp(x, hh, mm)), alarm: r.hora ? '-PT10M' : '-PT0M',
    }], agoraUtc());
    entregar('lembrete-rotina.ics', 'text/calendar', ics);
    toast(`Lembrete repetido a partir de ${dataCurta(prox)} às ${C.fromMin(hh * 60 + mm)}`);
  }
  function lembreteDiario(today) {
    const q = quando(today, today);
    const ics = buildIcs([{ uid: 'pendencias-diario@planner', start: stamp(q.data, q.hh, q.mm), end: stamp(q.data, q.hh, q.mm + 15), summary: 'Revisar pendências do Planner', desc: 'Abra o Planner e veja o que ficou pendente.', rrule: 'FREQ=DAILY' }], agoraUtc());
    entregar('lembrete-diario-planner.ics', 'text/calendar', ics);
  }

  /* ---------- Ações ---------- */
  function abrirNovaTarefa(today, dataFixa) {
    const ativas = S.cats.filter((c) => !c.parent && c.ativa);
    const cat0 = (ui.lastCat && cat(ui.lastCat) && cat(ui.lastCat).ativa) ? ui.lastCat : (ativas[0] && ativas[0].id) || '';
    let data = today;
    if (dataFixa) data = dataFixa;
    else if (ui.tab === 'mes' && ui.dia) data = ui.dia;
    else if (ui.tab === 'sem' && ui.sem && (today < ui.sem || today > addDays(ui.sem, 6))) data = ui.sem;
    ui.sheet = { type: 'task', id: null, rot: null, fresh: true, draft: novoDraft({ cat: cat0, data }) };
  }

  function salvarTarefa(today) {
    syncDraft();
    const s = ui.sheet, d = s.draft;
    if (!d.titulo.trim()) { toast('Digite o que precisa ser feito.'); return; }
    if (!d.cat) { toast('Escolha uma categoria.'); return; }
    if (!d.data) { toast('Escolha uma data.'); return; }
    const hora = d.hora || '', dur = hora ? (Number(d.dur) || 0) : 0;
    const ehRotina = !!s.rot || (!s.id && d.rep.tipo !== 'nao');
    if (ehRotina) {
      if (d.rep.tipo === 'sem' && !d.rep.dias.length) { toast('Escolha ao menos um dia da semana.'); return; }
      if (d.rep.fim && d.rep.fim < d.data) { toast('A data final vem antes do início.'); return; }
      const campos = { titulo: d.titulo.trim(), cat: d.cat, nota: d.nota.trim(), hora, dur, tipo: d.rep.tipo, dias: d.rep.tipo === 'sem' ? d.rep.dias.slice().sort() : [], diaMes: Number(d.data.slice(8)), inicio: d.data, fim: d.rep.fim || '' };
      if (s.rot) Object.assign(rot(s.rot), campos);
      else S.rotinas.push(Object.assign({ id: uid(), excecoes: [], feitas: {}, criada: Date.now() }, campos));
      toast(s.rot ? 'Rotina atualizada' : 'Rotina criada');
    } else if (s.id) {
      const t = S.tasks.find((x) => x.id === s.id);
      t.titulo = d.titulo.trim(); t.cat = d.cat; t.nota = d.nota.trim(); t.hora = hora; t.dur = dur;
      if (!t.feito && d.data > t.data) postpone(t, d.data, today); else t.data = d.data;
      toast('Tarefa salva');
    } else {
      if (d.subst && rot(d.subst.rid)) { // "alterar só este dia": a ocorrência da rotina é substituída por esta tarefa
        const r = rot(d.subst.rid); r.excecoes = r.excecoes || [];
        if (!r.excecoes.includes(d.subst.date)) r.excecoes.push(d.subst.date);
      }
      S.tasks.push({ id: uid(), titulo: d.titulo.trim(), cat: d.cat, data: d.data, hora, dur, nota: d.nota.trim(), etapas: d.etapas.slice(), feito: false, feitoEm: null, adiamentos: 0, origem: d.data, criada: Date.now() });
      toast('Tarefa salva');
    }
    ui.lastCat = d.cat;
    if (ui.tab === 'mes') { ui.mes = d.data.slice(0, 7); ui.dia = d.data; }
    if (ui.tab === 'sem') ui.sem = startOfWeek(d.data);
    ui.sheet = null; save(); render();
  }

  function alternar(t) { t.feito = !t.feito; t.feitoEm = t.feito ? Date.now() : null; save(); toast(t.feito ? 'Concluída ✓' : 'Reaberta'); }
  function alternarOcc(o) {
    const r = rot(o.rid); if (!r) return false;
    r.feitas = r.feitas || {};
    if (r.feitas[o.date]) delete r.feitas[o.date]; else r.feitas[o.date] = true;
    save(); toast(r.feitas[o.date] ? 'Concluída ✓' : 'Reaberta');
    return true;
  }
  function alternarQualquer(id) {
    const o = parseOcc(id);
    if (o) return alternarOcc(o);
    const t = S.tasks.find((x) => x.id === id);
    if (t) { alternar(t); return true; }
    return false;
  }

  // Etapas: numa tarefa que já existe, valem na hora; numa nova, ficam no rascunho até salvar.
  function tarefaAberta() { return ui.sheet && ui.sheet.id ? S.tasks.find((x) => x.id === ui.sheet.id) : null; }
  function etapasRef() {
    const t = tarefaAberta();
    if (t) { t.etapas = t.etapas || []; return t.etapas; }
    return ui.sheet.draft.etapas;
  }
  function addEtapa() {
    syncDraft();
    const inp = document.getElementById('f-etapa'), v = inp && inp.value.trim();
    if (!v) { toast('Digite a etapa.'); return; }
    etapasRef().push({ id: uid(), t: v, f: false });
    if (tarefaAberta()) save();
    render(); foco('f-etapa');
  }
  function addItemViagem(n) {
    const v = viagem(ui.viagem), inp = document.getElementById(`vnew-${n}`), t = inp && inp.value.trim();
    if (!v) return;
    if (!t) { toast('Digite o item.'); return; }
    v.itens.push({ id: uid(), t, n, f: false, meu: true });
    save(); render(); foco(`vnew-${n}`);
  }

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

  function salvarViagem() {
    syncDraft();
    const s = ui.sheet, d = s.draft;
    if (!d.nome.trim()) { toast('Digite para onde você vai.'); return; }
    if (s.id) {
      const v = viagem(s.id); v.nome = d.nome.trim(); v.data = d.data || '';
    } else {
      const v = { id: uid(), nome: d.nome.trim(), tipo: d.tipo, data: d.data || '', itens: C.itensViagem(d.tipo), criada: Date.now() };
      S.viagens.push(v); ui.viagem = v.id; ui.tab = 'viagem';
    }
    ui.sheet = null; save(); toast('Viagem salva'); render();
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action, id = el.dataset.id, today = ymd(new Date());
    if (a === 'close-sheet' && e.target !== el) return;
    const tarefa = id ? S.tasks.find((t) => t.id === id) : null; // tarefa avulsa (ocorrências de rotina são tratadas à parte)

    switch (a) {
      case 'tab': ui.tab = el.dataset.tab; window.scrollTo(0, 0); render(); break;
      case 'toggle': if (alternarQualquer(id)) render(); break;
      case 'toggle-close': if (alternarQualquer(id)) { ui.sheet = null; render(); } break;
      case 'open-task': {
        const o = parseOcc(id);
        if (o) { if (rot(o.rid)) ui.sheet = { type: 'occ', id, fresh: true }; }
        else if (tarefa) ui.sheet = { type: 'task', id, rot: null, fresh: true, draft: novoDraft({ titulo: tarefa.titulo, cat: tarefa.cat, data: tarefa.data, hora: tarefa.hora || '', dur: tarefa.dur == null ? 60 : tarefa.dur, nota: tarefa.nota || '' }) };
        render(); break;
      }
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

      /* repetição */
      case 'rep-tipo': {
        syncDraft();
        const d = ui.sheet.draft; d.rep.tipo = el.dataset.v;
        if (d.rep.tipo === 'sem' && !d.rep.dias.length) d.rep.dias = [fromYmd(d.data || today).getDay()];
        render(); break;
      }
      case 'rep-dia': {
        syncDraft();
        const dias = ui.sheet.draft.rep.dias, i = Number(el.dataset.v), p = dias.indexOf(i);
        if (p >= 0) dias.splice(p, 1); else dias.push(i);
        render(); break;
      }

      /* ocorrências de rotina */
      case 'occ-skip': {
        const o = parseOcc(id), r = o && rot(o.rid);
        if (r) { r.excecoes = r.excecoes || []; if (!r.excecoes.includes(o.date)) r.excecoes.push(o.date); ui.sheet = null; save(); toast('Dia pulado'); render(); }
        break;
      }
      case 'occ-alter': {
        const o = parseOcc(id), r = o && rot(o.rid);
        if (r) { ui.sheet = { type: 'task', id: null, rot: null, fresh: true, draft: novoDraft({ titulo: r.titulo, cat: r.cat, data: o.date, hora: r.hora || '', dur: r.dur == null ? 60 : r.dur, nota: r.nota || '', subst: { rid: r.id, date: o.date } }) }; render(); toast('Altere e salve: só este dia muda.'); }
        break;
      }
      case 'rot-edit': {
        const o = parseOcc(id), r = o && rot(o.rid);
        if (r) { ui.sheet = { type: 'task', id: null, rot: r.id, fresh: true, draft: novoDraft({ titulo: r.titulo, cat: r.cat, data: r.inicio, hora: r.hora || '', dur: r.dur == null ? 60 : r.dur, nota: r.nota || '', rep: { tipo: r.tipo, dias: (r.dias || []).slice(), fim: r.fim || '' } }) }; render(); }
        break;
      }
      case 'rot-end': {
        const o = parseOcc(id), r = o && rot(o.rid);
        if (r && confirm(`Encerrar "${r.titulo}" a partir de ${dataCurta(o.date)}? Os dias anteriores continuam no histórico.`)) {
          r.fim = addDays(o.date, -1);
          if (r.fim < r.inicio) S.rotinas = S.rotinas.filter((x) => x.id !== r.id);
          ui.sheet = null; save(); toast('Rotina encerrada'); render();
        }
        break;
      }
      case 'rot-del': {
        const r = rot(el.dataset.rid);
        if (r && confirm(`Excluir a rotina "${r.titulo}" por completo, incluindo os dias já passados?`)) { S.rotinas = S.rotinas.filter((x) => x.id !== r.id); ui.sheet = null; save(); toast('Rotina excluída'); render(); }
        break;
      }
      case 'ics-rot': { const o = parseOcc(id), r = o && rot(o.rid); if (r) lembreteRotina(r, today); break; }

      /* etapas */
      case 'et-add': addEtapa(); break;
      case 'et-toggle': {
        const lista = etapasRef(), e2 = lista.find((x) => x.id === el.dataset.eid);
        if (!e2) break;
        e2.f = !e2.f;
        const t = tarefaAberta();
        if (t) {
          save();
          if (!t.feito && e2.f && lista.every((x) => x.f) && confirm('Todas as etapas foram concluídas. Concluir a tarefa também?')) {
            t.feito = true; t.feitoEm = Date.now(); save(); ui.sheet = null; toast('Concluída ✓');
          }
        }
        render(); break;
      }
      case 'et-del': {
        const lista = etapasRef(), i = lista.findIndex((x) => x.id === el.dataset.eid);
        if (i >= 0) { lista.splice(i, 1); if (tarefaAberta()) save(); render(); }
        break;
      }

      /* semana, mês, tema */
      case 'sem-prev': ui.sem = addDays(ui.sem || startOfWeek(today), -7); render(); break;
      case 'sem-next': ui.sem = addDays(ui.sem || startOfWeek(today), 7); render(); break;
      case 'sem-hoje': ui.sem = startOfWeek(today); render(); break;
      case 'open-day': ui.sheet = { type: 'dia', d: el.dataset.d, fresh: true }; render(); break;
      case 'new-task-day': abrirNovaTarefa(today, el.dataset.d); render(); break;
      case 'tema': S.cfg.tema = el.dataset.v; save(); render(); break;
      case 'paleta': S.cfg.paleta = el.dataset.v; save(); render(); break;
      case 'pick-day': ui.dia = el.dataset.d; render(); break;
      case 'mes-prev': ui.mes = addMonthsFirst(ui.mes + '-01', -1).slice(0, 7); ui.dia = null; render(); break;
      case 'mes-next': ui.mes = addMonthsFirst(ui.mes + '-01', 1).slice(0, 7); ui.dia = null; render(); break;
      case 'mes-hoje': ui.mes = today.slice(0, 7); ui.dia = today; render(); break;

      /* categorias */
      case 'cat-edit': { const c = cat(id); if (c) { ui.sheet = { type: 'cat', id, fresh: true, draft: { nome: c.nome, icone: c.icone || '', cor: c.cor, ativa: c.ativa, parent: c.parent } }; render(); } break; }
      case 'cat-new': ui.sheet = { type: 'cat', id: null, fresh: true, draft: { nome: '', icone: '', cor: '#4F6D7A', ativa: true, parent: null } }; render(); break;
      case 'cat-sub': { const p = cat(id); const n = S.cats.filter((c) => c.parent === id).length; ui.sheet = { type: 'cat', id: null, fresh: true, draft: { nome: '', icone: '', cor: shade(p.cor, n), ativa: true, parent: id } }; render(); break; }
      case 'save-cat': salvarCat(); break;
      case 'del-cat': {
        const c = cat(ui.sheet.id), subs = S.cats.filter((x) => x.parent === c.id).length;
        const usadas = S.tasks.filter((t) => t.cat === c.id).length + S.rotinas.filter((r) => r.cat === c.id).length;
        if (subs) { toast('Exclua ou mova as subcategorias primeiro.'); break; }
        if (usadas) { toast(`Há ${usadas} tarefa(s) ou rotina(s) aqui. Desative a categoria em vez de excluir.`); break; }
        if (confirm(`Excluir "${c.nome}"?`)) { S.cats = S.cats.filter((x) => x.id !== c.id); ui.sheet = null; save(); render(); }
        break;
      }

      /* viagens */
      case 'viagem-new': ui.sheet = { type: 'viag', id: null, fresh: true, draft: { nome: '', tipo: 'nacional', data: '' } }; render(); break;
      case 'viag-tipo': syncDraft(); ui.sheet.draft.tipo = el.dataset.v; render(); break;
      case 'save-viag': salvarViagem(); break;
      case 'viagem-open': ui.viagem = id; ui.tab = 'viagem'; window.scrollTo(0, 0); render(); break;
      case 'viagem-edit': { const v = viagem(id); if (v) { ui.sheet = { type: 'viag', id, fresh: true, draft: { nome: v.nome, tipo: v.tipo, data: v.data || '' } }; render(); } break; }
      case 'viagem-del': { const v = viagem(id); if (v && confirm(`Excluir a viagem "${v.nome}" e toda a lista?`)) { S.viagens = S.viagens.filter((x) => x.id !== id); ui.viagem = null; ui.tab = 'viagens'; save(); toast('Viagem excluída'); render(); } break; }
      case 'v-toggle': { const v = viagem(ui.viagem), i = v && v.itens.find((x) => x.id === id); if (i) { i.f = !i.f; save(); render(); } break; }
      case 'v-del': { const v = viagem(ui.viagem); if (v) { v.itens = v.itens.filter((x) => x.id !== id); save(); toast('Item removido'); render(); } break; }
      case 'v-add': addItemViagem(el.dataset.n); break;

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
          S = C.normalizar(o); save(); toast('Backup importado'); render();
        } catch (err) { toast('Arquivo inválido. Use um backup exportado pelo Planner.'); }
      };
      r.readAsText(e.target.files[0]);
      e.target.value = '';
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const id = e.target.id || '';
    if (id === 'f-titulo') { e.preventDefault(); salvarTarefa(ymd(new Date())); }
    else if (id === 'f-etapa') { e.preventDefault(); addEtapa(); }
    else if (id.startsWith('vnew-')) { e.preventDefault(); addItemViagem(id.slice(5)); }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
  if (mq) {
    const seguir = () => { if ((S.cfg.tema || 'auto') === 'auto') render(); }; // iPhone mudou de claro/escuro
    if (mq.addEventListener) mq.addEventListener('change', seguir); else if (mq.addListener) mq.addListener(seguir);
  }

  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));

  render();
})();
