/* Planner — regras puras (datas, pendências, alertas, cores, calendário).
   Sem acesso à tela, para poder ser testado separadamente. */
(function (root) {
  'use strict';

  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = fromYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
  const monthIdx = (s) => Number(s.slice(0, 4)) * 12 + Number(s.slice(5, 7)) - 1;
  const firstOfMonth = (s) => s.slice(0, 8) + '01';
  const addMonthsFirst = (s, n) => {
    const i = monthIdx(s) + n;
    return `${Math.floor(i / 12)}-${pad((i % 12) + 1)}-01`;
  };
  // Domingo da semana que contém a data (mesma lógica do calendário do mês).
  const startOfWeek = (s) => { const d = fromYmd(s); d.setDate(d.getDate() - d.getDay()); return ymd(d); };

  /* ---------- Pendências e alerta ----------
     Pendência: tarefa não concluída cuja data é de um mês anterior ao atual.
     Adiamentos = reagendamentos feitos por você + meses de atraso.
     Nível: 0 normal · 1 atenção (1ª vez) · 2 urgente (2ª vez em diante). */
  const isPendencia = (t, today) => !t.feito && t.data < firstOfMonth(today);
  const isAtrasadaMes = (t, today) => !t.feito && t.data < today && t.data >= firstOfMonth(today);
  const mesesAtraso = (t, today) => (isPendencia(t, today) ? monthIdx(today) - monthIdx(t.data) : 0);
  const adiamentos = (t, today) => (t.adiamentos || 0) + mesesAtraso(t, today);
  const nivel = (t, today) => {
    if (t.feito) return 0;
    const n = adiamentos(t, today);
    return n >= 2 ? 2 : n;
  };
  // Reagenda e guarda o histórico (inclui os meses de atraso acumulados até agora).
  const postpone = (t, novaData, today) => {
    t.adiamentos = adiamentos(t, today) + 1;
    t.data = novaData;
    return t;
  };

  /* ---------- Cores ---------- */
  function hexToHsl(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return [h, s, l];
  }
  function hslToHex(h, s, l) {
    const f = (p, q, t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    let r, g, b;
    if (s === 0) { r = g = b = l; } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
      r = f(p, q, h + 1 / 3); g = f(p, q, h); b = f(p, q, h - 1 / 3);
    }
    const x = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
    return `#${x(r)}${x(g)}${x(b)}`;
  }
  // Tom da subcategoria: mesma cor da categoria, mais clara ou mais escura.
  const SHADES = [0.16, -0.14, 0.28, -0.26, 0.38, -0.34];
  function shade(hex, idx) {
    const [h, s, l] = hexToHsl(hex);
    const nl = Math.min(0.88, Math.max(0.14, l + SHADES[idx % SHADES.length]));
    return hslToHex(h, s, nl);
  }
  function textOn(hex) {
    const n = parseInt(hex.slice(1), 16);
    const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return lum > 0.62 ? '#14213D' : '#FFFFFF';
  }
  // No modo escuro, cores muito escuras ganham um pouco de brilho para não sumirem no fundo.
  function lift(hex, minL = 0.5) {
    const [h, s, l] = hexToHsl(hex);
    return l >= minL ? hex : hslToHex(h, s, minL);
  }

  /* ---------- Paletas do app (fundo, cartões, texto) ----------
     Cada uma tem versão clara e escura: [fundo, cartão, texto, texto 2, linhas, realce]. */
  const mk = (a) => ({ bg: a[0], surface: a[1], ink: a[2], ink2: a[3], line: a[4], raise: a[5] });
  const PALETAS = {
    marinho:  { nome: 'Marinho',  claro: mk(['#F5F6F8', '#FFFFFF', '#14213D', '#5B6577', '#E3E6EC', '#FFFFFF']), escuro: mk(['#000000', '#1C1C1E', '#F2F2F7', '#9A9AA2', '#38383A', '#2C2C2E']) },
    grafite:  { nome: 'Grafite',  claro: mk(['#F2F2F2', '#FFFFFF', '#1D1D1F', '#6E6E73', '#E0E0E0', '#FFFFFF']), escuro: mk(['#0D0D0D', '#1E1E1E', '#EDEDED', '#A0A0A0', '#333333', '#2A2A2A']) },
    oceano:   { nome: 'Oceano',   claro: mk(['#EEF5F8', '#FFFFFF', '#0B3C5D', '#4F6D7F', '#D5E4EC', '#FFFFFF']), escuro: mk(['#06121A', '#0F2230', '#E3F1F8', '#8FB0C2', '#1E3A4C', '#19364A']) },
    floresta: { nome: 'Floresta', claro: mk(['#F0F5F0', '#FFFFFF', '#1B4332', '#5A7466', '#D8E5DB', '#FFFFFF']), escuro: mk(['#070F0A', '#12211A', '#E4F2E8', '#93B09F', '#22382C', '#1C3328']) },
    ameixa:   { nome: 'Ameixa',   claro: mk(['#F6F1F7', '#FFFFFF', '#4A1942', '#7A647A', '#E7DBE8', '#FFFFFF']), escuro: mk(['#0F0710', '#231226', '#F3E6F5', '#B497B8', '#3A2340', '#331C38']) },
    areia:    { nome: 'Areia',    claro: mk(['#F7F3EC', '#FFFDF8', '#3D2F1F', '#7A6A55', '#E8DFD0', '#FFFDF8']), escuro: mk(['#100C07', '#221B12', '#F4EBDD', '#B3A48C', '#3A3023', '#30271B']) },
  };
  const PALETA_PADRAO = 'marinho';

  /* ---------- Calendário (.ics) ---------- */
  const stamp = (dateStr, hh, mm) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d, hh, mm || 0, 0);
    return `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}T${pad(dt.getHours())}${pad(dt.getMinutes())}00`;
  };
  const icsText = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  function buildIcs(events, nowUtc) {
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Planner//PT-BR//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    for (const e of events) {
      L.push('BEGIN:VEVENT', 'UID:' + e.uid, 'DTSTAMP:' + nowUtc, 'DTSTART:' + e.start, 'DTEND:' + e.end, 'SUMMARY:' + icsText(e.summary));
      if (e.desc) L.push('DESCRIPTION:' + icsText(e.desc));
      if (e.rrule) L.push('RRULE:' + e.rrule);
      L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsText(e.summary), 'TRIGGER:-PT0M', 'END:VALARM', 'END:VEVENT');
    }
    L.push('END:VCALENDAR');
    return L.join('\r\n') + '\r\n';
  }

  /* ---------- Dados iniciais ---------- */
  const SEED_CATS = [
    ['saude', 'Saúde e Bem-estar', '#2E9E5B', '🌿'],
    ['fisica', 'Atividade Física', '#D93636', '💪'],
    ['trabalho', 'Trabalho/Carreira', '#1F4E9C', '💼'],
    ['financeiro', 'Financeiro', '#C9A227', '💰'],
    ['pessoal', 'Planejamento Pessoal', '#7B4FD1', '🗓️'],
    ['casa', 'Casa e Organização', '#A0693C', '🏠'],
    ['lazer', 'Lazer e Hobbies', '#F28C28', '🎨'],
    ['familia', 'Família', '#E85D9F', '👨‍👩‍👧'],
    ['tech', 'Tecnologia/Digital', '#14B8C4', '💻'],
    ['educacao', 'Educação/Aprendizado', '#8E1B4A', '📚'],
    ['espirito', 'Espiritualidade', '#7C8A9A', '🕊️'],
    ['voluntariado', 'Voluntariado', '#8CC63F', '🤝'],
  ];
  const seedState = () => ({
    v: 1,
    cfg: { hora: '09:00' },
    cats: SEED_CATS.map(([id, nome, cor, icone]) => ({ id, nome, cor, icone, parent: null, ativa: true })),
    tasks: [],
  });

  const api = {
    pad, ymd, fromYmd, addDays, monthIdx, firstOfMonth, addMonthsFirst, startOfWeek,
    isPendencia, isAtrasadaMes, mesesAtraso, adiamentos, nivel, postpone,
    shade, textOn, lift, PALETAS, PALETA_PADRAO, stamp, buildIcs, seedState, SEED_CATS,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PlannerCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
