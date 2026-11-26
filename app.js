/* Vitta — diário de alimentação, atividades e peso.
   Dados ficam no aparelho (localStorage) e são sincronizados com o Google Sheets
   através de um Web App do Google Apps Script (ver apps-script/Code.gs). */
(() => {
'use strict';

// ---------- Constantes ----------
const LS_KEY = 'vitta:v1';
const DEFAULT_CFG = {
  // metas manuais (usadas no modo "Manual" ou enquanto faltar idade/sexo/altura)
  kcal: 2000, prot: 150, carb: 200, gord: 65, fibra: 30,
  pesoMeta: '', altura: '', imcMeta: '',
  // metas automáticas (calculadas pelo peso, altura, idade e sexo)
  modoMetas: 'auto', idade: '', sexo: '', rotina: 1.2, deficit: 500,
  protMinKg: 1.8, protMaxKg: 2.0, gordMinKg: 0.6, gordMaxKg: 0.8, fibraMin: 25,
};
const CFG_TEXTO = ['modoMetas', 'sexo'];
const MACROS = [
  { k: 'kcal',  nome: 'Calorias',     un: 'kcal', cor: 'var(--kcal)',  tipo: 'alvo' },
  { k: 'prot',  nome: 'Proteína',     un: 'g',    cor: 'var(--prot)',  tipo: 'min'  },
  { k: 'carb',  nome: 'Carboidrato',  un: 'g',    cor: 'var(--carb)',  tipo: 'alvo' },
  { k: 'gord',  nome: 'Gordura',      un: 'g',    cor: 'var(--gord)',  tipo: 'alvo' },
  { k: 'fibra', nome: 'Fibras',       un: 'g',    cor: 'var(--fibra)', tipo: 'min'  },
];
const REFEICOES = [
  { k: 'Café da manhã',  ico: '☕', ate: 10 },
  { k: 'Lanche da manhã', ico: '🍎', ate: 11.5 },
  { k: 'Almoço',          ico: '🍽️', ate: 15 },
  { k: 'Lanche da tarde', ico: '🥪', ate: 18.5 },
  { k: 'Jantar',          ico: '🍲', ate: 22 },
  { k: 'Ceia',            ico: '🌙', ate: 24 },
];
// Pratos do dia a dia: atalhos na tela de refeição. "food" aponta para um alimento da base (foods.js).
// un/g = medida caseira opcional (ex.: 1 ovo = 50 g). medida = unidade mostrada no modo peso.
const PRATOS = [
  { nome: 'Arroz',           food: 'Arroz branco cozido' },
  { nome: 'Feijão',          food: 'Feijão carioca cozido' },
  { nome: 'Frango desfiado', food: 'Frango desfiado cozido' },
  { nome: 'Carne moída',     food: 'Patinho moído refogado' },
  { nome: 'Ovos',            food: 'Ovo inteiro cozido', un: 'un', g: 50, padrao: 'un' },
  { nome: 'Muçarela',        food: 'Queijo muçarela', un: 'fatia', g: 20, padrao: 'un' },
  { nome: 'Leite',           food: 'Leite semidesnatado', un: 'copo', g: 200, medida: 'ml' },
  { nome: 'Sardinha (lata)', food: 'Sardinha em lata (molho de tomate, drenada)', un: 'lata', g: 84, padrao: 'un' },
  { nome: 'Atum (lata)',     food: 'Atum em lata (sólido, drenado)', un: 'lata', g: 120, padrao: 'un' },
  { nome: 'Iogurte Pense Zero', food: 'Iogurte Batavo Pense Zero', un: 'pote', g: 170, padrao: 'un' },
  { nome: 'Bisteca de porco', food: 'Bisteca de porco frita', un: 'bisteca', g: 120, passo: 50 },
  { nome: 'Bife bovino',     food: 'Bife bovino grelhado', un: 'bife', g: 120, passo: 50 },
  { nome: 'Filé mignon suíno', food: 'Filé mignon suíno grelhado', un: 'filé', g: 120, passo: 50 },
  { nome: 'Cerveja light',   food: 'Cerveja baixa caloria (Amstel Ultra, Michelob Ultra)', un: 'long neck', g: 355, medida: 'ml', padrao: 'un' },
  { nome: 'Whey',            food: 'Whey protein (pó)', un: 'dose', g: 30, padrao: 'g', passo: 30 },
];

// campos: dist = distância em km · distm = distância em metros · incl = inclinação da esteira (%)
//         nivel = nível do aparelho · int = intensidade percebida · nome = nome livre
const ATIVIDADES = [
  // mets = MET por intensidade (Compendium of Physical Activities), para atividades sem distância/nível
  { k: 'Musculação', ico: '🏋️', campos: ['treino'], mets: { Leve: 3.5, Moderada: 5, Intensa: 6 } },
  { k: 'Elíptico',   ico: '⚙️', campos: ['nivel', 'dist'] },
  { k: 'Bicicleta',  ico: '🚴', campos: ['dist', 'nivel'] },
  { k: 'Caminhada',  ico: '🚶', campos: ['dist', 'incl'] },
  { k: 'Corrida',    ico: '🏃', campos: ['dist', 'incl'] },
  { k: 'Natação',    ico: '🏊', campos: ['distm'] },
  { k: 'Aspirador de pó', ico: '🏠', campos: ['int'], mets: { Leve: 2.5, Moderada: 3.3, Intensa: 3.8 } },
  { k: 'Varrer a casa',   ico: '🧹', campos: ['int'], mets: { Leve: 2.3, Moderada: 3.3, Intensa: 3.8 } },
  { k: 'Cortar grama',    ico: '🌱', campos: ['int'], mets: { Leve: 4.0, Moderada: 5.0, Intensa: 6.0 } },
  { k: 'Lavar o carro',   ico: '🚗', campos: ['int'], mets: { Leve: 2.5, Moderada: 3.5, Intensa: 4.5 } },
  { k: 'Outros',     ico: '✨', campos: ['nome', 'int'], mets: { Leve: 3, Moderada: 4.5, Intensa: 7 } },
];
const INTENS = ['Leve', 'Moderada', 'Intensa'];

// Treinos de musculação. O gasto vem do treino escolhido (MET × peso × duração típica),
// calibrado nos ~330 kcal por sessão de ~70 min dos seus fechamentos.
// "exercicios" fica para preencher quando você mandar a ficha de cada treino.
// Cada exercício: 4 séries com descanso de 1–2 min ≈ minEx minutos; opc = normalmente não faz (vem desmarcado).
const TREINOS = {
  A: { grupos: 'Peito e tríceps', minutos: 70, met: 3.32, minEx: 10, exercicios: [
    { n: 'Supino reto com barra', met: 4.0 }, { n: 'Crucifixo inclinado com halteres', met: 3.3 },
    { n: 'Crucifixo máquina (peck deck)', met: 3.0 }, { n: 'Flexão de braços', met: 4.0 },
    { n: 'Tríceps testa com barra W', met: 3.3 }, { n: 'Tríceps na polia com corda', met: 3.0 },
    { n: 'Tríceps francês na polia', met: 3.0 }, { n: 'Abdominal supra', met: 3.3, opc: true } ] },
  B: { grupos: 'Costas e bíceps', minutos: 70, met: 3.32, minEx: 11.7, exercicios: [
    { n: 'Puxada aberta barra reta', met: 3.6 }, { n: 'Remada baixa no triângulo', met: 3.6 },
    { n: 'Remada unilateral com halter', met: 3.4 }, { n: 'Rosca direta barra reta', met: 3.2 },
    { n: 'Rosca concentrada', met: 2.9 }, { n: 'Rosca direta no banco inclinado', met: 3.1 },
    { n: 'Abdominal infra / elevação de pernas', met: 3.3, opc: true } ] },
  C: { grupos: 'Ombros, pernas e abdômen', minutos: 70, met: 3.32, minEx: 10, exercicios: [
    { n: 'Leg press 45°', met: 4.0 }, { n: 'Cadeira extensora', met: 3.3 }, { n: 'Cadeira flexora', met: 3.3 },
    { n: 'Panturrilha sentado (no lugar do agachamento)', met: 2.8 },
    { n: 'Desenvolvimento sentado com barra', met: 3.8 }, { n: 'Crucifixo inverso (banco)', met: 3.0 },
    { n: 'Elevação lateral com halteres', met: 3.0 }, { n: 'Abdominal oblíquo alternado', met: 3.3, opc: true } ] },
};
// exercícios marcados (ex = { índice: true/false } só com o que o usuário alterou)
function exMarcado(T, ex, i) { const v = ex && ex[i]; return v === undefined ? !T.exercicios[i].opc : v; }
function calcTreino(T, ex, peso) {
  let min = 0, kcal = 0, n = 0;
  T.exercicios.forEach((e, i) => { if (exMarcado(T, ex, i)) { n++; min += T.minEx; kcal += e.met * peso * T.minEx / 60; } });
  return { n, min: Math.round(min), kcal: Math.round(kcal) };
}

// Cargas por exercício: ficam no fim do campo "obs" da atividade (assim sincronizam com a planilha sem mudar nada lá).
// Formato: "<nota> ‖ cargas: Supino reto com barra=60x10; Rosca concentrada=12.5x12"
const CG_MARCA = ' ‖ cargas: ';
function sepObs(obs) {
  const s = String(obs || ''), i = s.indexOf(CG_MARCA);
  if (i < 0) return { nota: s, cargas: [] };
  const cargas = s.slice(i + CG_MARCA.length).split('; ').map((p) => {
    const m = p.match(/^(.+)=([\d.]+)x(\d+)$/);
    return m ? { n: m[1], c: Number(m[2]), r: Number(m[3]) } : null;
  }).filter(Boolean);
  return { nota: s.slice(0, i), cargas };
}
// nome do exercício → lista cronológica [{ data, c, r }]
function historicoCargas() {
  const h = {};
  [...S.atividades].sort((a, b) => (a.data + (a.criadoEm || '')).localeCompare(b.data + (b.criadoEm || ''))).forEach((a) => {
    sepObs(a.obs).cargas.forEach((x) => { (h[x.n] = h[x.n] || []).push({ data: a.data, c: x.c, r: x.r }); });
  });
  return h;
}
// carga/reps vigentes de um exercício no formulário: o que foi digitado, senão a última vez
function cargaForm(a, i, hist) {
  const T = TREINOS[a.treino], e = T.exercicios[i], dig = (a.cg && a.cg[i]) || {};
  const h = hist[e.n], ult = h ? h[h.length - 1] : null;
  return {
    c: dig.c !== undefined ? dig.c : (ult ? String(ult.c).replace('.', ',') : ''),
    r: dig.r !== undefined ? dig.r : (ult ? String(ult.r) : ''),
    ult,
  };
}
function stringCargas(a) {
  const T = TREINOS[a.treino]; if (!T || !T.exercicios.length) return '';
  const hist = historicoCargas(), partes = [];
  T.exercicios.forEach((e, i) => {
    if (!exMarcado(T, a.ex, i)) return;
    const v = cargaForm(a, i, hist), c = num(v.c), r = Math.round(num(v.r));
    if (c > 0 || r > 0) partes.push(`${e.n}=${r1(c)}x${r}`);
  });
  return partes.length ? CG_MARCA + partes.join('; ') : '';
}
// Sugere o próximo treino do rodízio A → B → C a partir do último lançado.
function proximoTreino() {
  const ult = [...S.atividades].filter((a) => /^Treino [ABC]$/.test(a.intensidade || ''))
    .sort((a, b) => (a.data + (a.criadoEm || '')).localeCompare(b.data + (b.criadoEm || ''))).pop();
  if (!ult) return 'A';
  return { A: 'B', B: 'C', C: 'A' }[ult.intensidade.slice(-1)];
}

/* Cálculo de calorias (gasto bruto) a partir do que você sabe: tempo, distância e nível.
   - Caminhada/Corrida: equações metabólicas do ACSM (velocidade + inclinação).
   - Bicicleta: com nível → ergométrica; com distância → MET pela velocidade (Compendium).
   - Elíptico: MET pelo nível do aparelho.
   - Natação: MET pelo ritmo (m/min).
   - Musculação/Outros: MET pela intensidade (Compendium of Physical Activities).
   kcal = MET × peso (kg) × horas */
function calcAtividade(f, peso) {
  // Musculação com treino A/B/C: duração e MET vêm do treino
  if (f.tipo === 'Musculação' && TREINOS[f.treino]) {
    const T = TREINOS[f.treino];
    if (T.exercicios.length) {
      const r = calcTreino(T, f.ex, peso);
      return { kcal: r.kcal, met: r.min ? (r.kcal * 60) / (peso * r.min) : 0, info: `Treino ${f.treino}: ${r.n} exercícios × 4 séries · ~${r.min} min` };
    }
    const min = T.minutos; // o campo de tempo fica escondido para treinos A/B/C
    return { kcal: Math.round(T.met * peso * min / 60), met: T.met, info: `Treino ${f.treino}: ${T.grupos.toLowerCase()} · ~${min} min` };
  }
  const min = num(f.min), h = min / 60;
  if (!min) return { kcal: 0, met: 0, info: 'Informe a duração' };
  const dist = num(f.dist), nivel = num(f.nivel);
  const vel = dist > 0 ? dist / h : 0;
  let met = 4, info = '';
  switch (f.tipo) {
    case 'Caminhada':
    case 'Corrida': {
      const corrida = f.tipo === 'Corrida';
      const v = vel || (corrida ? 9 : 5);
      const mmin = v * 1000 / 60, g = Math.max(0, nivel) / 100;
      const correndo = corrida || v > 7.5;
      const vo2 = correndo ? 0.2 * mmin + 0.9 * mmin * g + 3.5 : 0.1 * mmin + 1.8 * mmin * g + 3.5;
      met = vo2 / 3.5;
      const pace = 60 / v;
      info = `${fmt(v, 1)} km/h${vel ? '' : ' (velocidade padrão — informe a distância)'}${corrida && vel ? ` · pace ${Math.floor(pace)}:${pad(Math.round((pace % 1) * 60))}/km` : ''}${g ? ` · ${fmt(nivel, 1)}% inclinação` : ''}`;
      break;
    }
    case 'Bicicleta':
      if (nivel) { met = 3.5 + 0.35 * Math.min(nivel, 25); info = `ergométrica, nível ${fmt(nivel)}`; }
      else {
        const v = vel || 18;
        met = v < 16 ? 4 : v < 19 ? 6.8 : v < 22.5 ? 8 : v < 25.5 ? 10 : v < 30 ? 12 : 15.8;
        info = `${fmt(v, 1)} km/h${vel ? '' : ' (velocidade padrão — informe distância ou nível)'}`;
      }
      break;
    case 'Elíptico': {
      const n = nivel || 8;
      met = 4 + 0.25 * Math.min(n, 25);
      info = nivel ? `nível ${fmt(n)}` : 'nível médio (informe o nível do aparelho)';
      break;
    }
    case 'Natação':
      if (vel) { const mpm = dist * 1000 / min; met = mpm < 30 ? 5.8 : mpm < 45 ? 8.3 : 9.8; info = `${fmt(mpm)} m/min · ${fmt(100 / mpm, 1)} min por 100 m`; }
      else { met = 7; info = 'ritmo moderado (informe a distância)'; }
      break;
    default: {
      const A = ATIVIDADES.find((x) => x.k === f.tipo) || ATIVIDADES[ATIVIDADES.length - 1];
      met = A.mets[f.intens] || A.mets.Moderada; info = `intensidade ${String(f.intens).toLowerCase()}`;
    }
  }
  return { kcal: Math.round(met * peso * h), met, info };
}
const DIAS_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// ---------- Estado ----------
function blank() {
  return { refeicoes: [], atividades: [], peso: [], alimentos: [], config: { ...DEFAULT_CFG }, queue: [], conn: { url: '', token: '' }, lastSync: null };
}
function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      return { ...blank(), ...d, config: { ...DEFAULT_CFG, ...(d.config || {}) }, conn: { url: '', token: '', ...(d.conn || {}) } };
    }
  } catch (e) { /* armazenamento indisponível */ }
  return blank();
}
let S = load();
function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) {} }

const ui = { view: 'hoje', dia: hoje(), semanaRef: hoje(), pesoRange: '90', abertoEm: hoje(), grafSem: 'kcal', heatModo: 'abs', pctModo: 'meta', cascataModo: 'mes' };

// ---------- Utilidades ----------
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };
const r1 = (n) => Math.round(n * 10) / 10;
const fmt = (n, d = 0) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function pad(n) { return String(n).padStart(2, '0'); }
function toStr(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function hoje() { return toStr(new Date()); }
function agoraHora() { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function parse(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function addDias(s, n) { const d = parse(s); d.setDate(d.getDate() + n); return toStr(d); }
function inicioSemana(s) { const d = parse(s); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return toStr(d); }
function rotuloDia(s) {
  const t = hoje();
  if (s === t) return 'Hoje';
  if (s === addDias(t, -1)) return 'Ontem';
  const d = parse(s);
  return `${DIAS_CURTO[d.getDay()]}, ${d.getDate()} ${MESES[d.getMonth()]}`;
}
function dataCurta(s) { const d = parse(s); return `${d.getDate()} ${MESES[d.getMonth()]}`; }

// ---------- Metas ----------
// Cada meta é um objeto { tipo, alvo, min, max }:
//   alvo  → bom entre 90% e 110% do alvo (calorias)
//   faixa → bom entre min e max (proteína, gordura)
//   min   → bom a partir do mínimo (fibra)
//   ref   → só referência, sem cor (carboidrato livre)
function avaliar(meta, real) {
  if (!meta || !real || meta.tipo === 'ref') return 'none';
  if (meta.tipo === 'faixa') {
    if (!meta.max) return 'none';
    return real >= meta.min && real <= meta.max ? 'good' : real >= meta.min * 0.85 && real <= meta.max * 1.15 ? 'warn' : 'bad';
  }
  if (!meta.alvo) return 'none';
  const p = real / meta.alvo;
  if (meta.tipo === 'min') return p >= 1 ? 'good' : p >= 0.8 ? 'warn' : 'bad';
  return p >= 0.9 && p <= 1.1 ? 'good' : p >= 0.8 && p <= 1.2 ? 'warn' : 'bad';
}

// Peso válido numa data: a última pesagem até aquele dia.
function pesoEm(data) {
  const ps = pesosOrdenados(); let p = 0;
  for (const x of ps) if (x.data <= data) p = num(x.peso);
  return p || (ps.length ? num(ps[0].peso) : 0);
}
// TMB por Mifflin-St Jeor e gasto base (TMB × fator da rotina, sem contar os treinos).
function calcBase(peso, cfg = S.config) {
  const alt = num(cfg.altura), idade = num(cfg.idade);
  if (!peso || !alt || !idade || !cfg.sexo) return null;
  const tmb = 10 * peso + 6.25 * alt - 5 * idade + (cfg.sexo === 'F' ? -161 : 5);
  return { tmb, base: tmb * (num(cfg.rotina) || 1.2) };
}
// Metas de um dia. No modo automático a meta de calorias = gasto base + atividades do dia − déficit.
function metasDia(data, cfg = S.config) {
  const peso = pesoEm(data);
  const b = cfg.modoMetas === 'manual' ? null : calcBase(peso, cfg);
  if (!b) {
    return {
      auto: false,
      kcal: { tipo: 'alvo', alvo: num(cfg.kcal) },
      prot: { tipo: 'min', alvo: num(cfg.prot), min: num(cfg.prot) },
      carb: { tipo: 'alvo', alvo: num(cfg.carb) },
      gord: { tipo: 'alvo', alvo: num(cfg.gord) },
      fibra: { tipo: 'min', alvo: num(cfg.fibra), min: num(cfg.fibra) },
    };
  }
  const atv = gastoDia(data).kcal;
  const gasto = b.base + atv;
  const kcal = Math.round(gasto - num(cfg.deficit));
  const pMin = Math.round(num(cfg.protMinKg) * peso), pMax = Math.round(num(cfg.protMaxKg) * peso);
  const gMin = Math.round(num(cfg.gordMinKg) * peso), gMax = Math.round(num(cfg.gordMaxKg) * peso);
  const carb = Math.max(0, Math.round((kcal - 4 * (pMin + pMax) / 2 - 9 * (gMin + gMax) / 2) / 4));
  return {
    auto: true, peso, tmb: Math.round(b.tmb), base: Math.round(b.base), atv, gasto: Math.round(gasto),
    kcal: { tipo: 'alvo', alvo: kcal },
    prot: { tipo: 'faixa', min: pMin, max: pMax, alvo: (pMin + pMax) / 2 },
    carb: { tipo: 'ref', alvo: carb },
    gord: { tipo: 'faixa', min: gMin, max: gMax, alvo: (gMin + gMax) / 2 },
    fibra: { tipo: 'min', min: num(cfg.fibraMin), alvo: num(cfg.fibraMin) },
  };
}
// Média das metas de vários dias (a meta de calorias muda conforme as atividades).
function mediaMetas(lista) {
  const out = { auto: lista.some((x) => x.auto) };
  for (const m of MACROS) {
    const xs = lista.map((x) => x[m.k]);
    const avg = (f) => xs.length ? xs.reduce((s, x) => s + num(x[f]), 0) / xs.length : 0;
    out[m.k] = { tipo: xs[0] ? xs[0].tipo : 'alvo', alvo: avg('alvo'), min: Math.round(avg('min')), max: Math.round(avg('max')) };
  }
  return out;
}
// Etiqueta "x%" com quanto um valor representa da meta do dia
// (calorias e carboidrato: alvo/referência; proteína e gordura: meio da faixa; fibra: mínimo).
function pctDia(v, meta, cls = 'pct-dia') {
  const ref = meta ? (meta.tipo === 'min' ? (meta.min || meta.alvo) : meta.alvo) : 0;
  return ref ? `<span class="${cls}">${fmt(num(v) / ref * 100)}%</span>` : '';
}
function rotuloMeta(m, meta) {
  if (!meta || (!meta.alvo && !meta.max)) return '—';
  if (meta.tipo === 'faixa') return `${fmt(meta.min)}–${fmt(meta.max)} ${m.un}`;
  if (meta.tipo === 'min') return `≥ ${fmt(meta.min || meta.alvo)} ${m.un}`;
  if (meta.tipo === 'ref') return `~${fmt(meta.alvo)} ${m.un}`;
  return `${fmt(meta.alvo)} ${m.un}`;
}

function totaisDia(data) {
  const t = { kcal: 0, prot: 0, carb: 0, gord: 0, fibra: 0, n: 0, comMacros: false };
  for (const r of S.refeicoes) if (r.data === data) {
    t.kcal += num(r.kcal); t.prot += num(r.prot); t.carb += num(r.carb); t.gord += num(r.gord); t.fibra += num(r.fibra); t.n++;
    // dias importados da planilha podem ter só calorias, sem macros
    if (r.refeicao !== 'Histórico' || num(r.prot) + num(r.carb) + num(r.gord) + num(r.fibra) > 0) t.comMacros = true;
  }
  return t;
}
function gastoDia(data) {
  let kcal = 0, min = 0, km = 0;
  for (const a of S.atividades) if (a.data === data) { kcal += num(a.kcal); min += num(a.minutos); km += num(a.distancia); }
  return { kcal, min, km };
}
function pesosOrdenados() { return [...S.peso].sort((a, b) => (a.data + (a.criadoEm || '')).localeCompare(b.data + (b.criadoEm || ''))); }
function pesoAtual() { const p = pesosOrdenados(); return p.length ? num(p[p.length - 1].peso) : 0; }

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2200);
}

const ICON = {
  left: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  cal: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15.5" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3.5 10h17M8 3v4M16 3v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};

// ---------- Operações (fila de sincronização) ----------
const LISTAS = ['refeicoes', 'atividades', 'peso', 'alimentos'];
let inflight = new Set();

function applyOp(op) {
  if (op.op === 'add') {
    const L = S[op.tipo];
    if (!L.some((x) => x.id === op.item.id)) L.push(op.item);
  } else if (op.op === 'delete') {
    S[op.tipo] = S[op.tipo].filter((x) => x.id !== op.id);
  } else if (op.op === 'config') {
    S.config = { ...DEFAULT_CFG, ...op.config };
  }
}
function adicionar(tipo, item) {
  item.id = item.id || uid();
  item.criadoEm = new Date().toISOString();
  const op = { opId: uid(), op: 'add', tipo, item };
  applyOp(op); S.queue.push(op); save(); render(); agendarSync();
  return item;
}
function remover(tipo, id) {
  const i = S.queue.findIndex((o) => o.op === 'add' && o.tipo === tipo && o.item.id === id && !inflight.has(o.opId));
  if (i >= 0) { S.queue.splice(i, 1); applyOp({ op: 'delete', tipo, id }); }
  else { const op = { opId: uid(), op: 'delete', tipo, id }; applyOp(op); S.queue.push(op); }
  save(); render(); agendarSync();
}
// Pesagem de domingo conta como segunda-feira (dia real da pesagem, fechamento da semana anterior).
function dataPesagem(data) { return parse(data).getDay() === 0 ? addDias(data, 1) : data; }

// Importa linhas "dd/mm/aaaa ... peso". Ignora linhas sem peso e datas já registradas.
// O id é fixo por data, assim a mesma pesagem importada em dois aparelhos não duplica na planilha.
function lerLinhasPeso(texto) {
  const out = [];
  for (const linha of String(texto).split(/\r?\n/)) {
    const m = linha.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) continue;
    const resto = linha.slice(m.index + m[0].length);
    const pm = resto.match(/(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:kg)?\s*$/i);
    const peso = pm ? num(pm[1]) : 0;
    out.push({ original: `${m[3]}-${pad(m[2])}-${pad(m[1])}`, peso: peso >= 20 && peso <= 400 ? r1(peso) : 0 });
  }
  return out;
}
function importarPesos(texto) {
  const existentes = new Set(S.peso.map((p) => p.data));
  let novos = 0, semPeso = 0, repetidos = 0;
  for (const l of lerLinhasPeso(texto)) {
    if (!l.peso) { semPeso++; continue; }
    const data = dataPesagem(l.original);
    if (existentes.has(data)) { repetidos++; continue; }
    existentes.add(data);
    const item = { id: 'peso-' + data, data, peso: l.peso, obs: '', criadoEm: new Date().toISOString() };
    const op = { opId: uid(), op: 'add', tipo: 'peso', item };
    applyOp(op); S.queue.push(op); novos++;
  }
  if (novos) { save(); agendarSync(); }
  return { novos, semPeso, repetidos };
}

// ---------- Carga inicial (roda uma única vez por aparelho) ----------
const HIST_PESO = ``;
const METAS_INICIAIS = {}; // metas pessoais vêm da planilha (aba Config), não do código

function cargaInicial() {
  if ((S.cargaInicial || 0) < 2) cargaPlanilha();
  if ((S.cargaInicial || 0) >= 1) return;
  // pesagens já lançadas num domingo (importação antiga) passam para a segunda
  const domingos = S.peso.filter((p) => parse(p.data).getDay() === 0);
  for (const p of domingos) {
    const i = S.queue.findIndex((o) => o.op === 'add' && o.tipo === 'peso' && o.item.id === p.id);
    if (i >= 0) S.queue.splice(i, 1); else S.queue.push({ opId: uid(), op: 'delete', tipo: 'peso', id: p.id });
    S.peso = S.peso.filter((x) => x.id !== p.id);
  }
  importarPesos(domingos.map((p) => { const [y, m, d] = p.data.split('-'); return `${d}/${m}/${y} ${p.peso}`; }).join('\n'));
  importarPesos(HIST_PESO);
  preencherMetasIniciais();
  S.cargaInicial = 1;
  save();
}
// Histórico diário da planilha Teste.xlsx (historico.js): cada dia vira
//  - uma refeição "Total do dia (planilha)" com o consumo (e os macros, quando a planilha tem), e
//  - uma atividade "Planilha" com o gasto acima do gasto base, para o gasto do dia bater com a planilha.
// Os ids são fixos por data, então não duplica entre aparelhos nem se rodar de novo.
function cargaPlanilha() {
  if ((S.cargaInicial || 0) < 1) {
    // primeira abertura: pesos e metas precisam existir antes para calcular o gasto base
    importarPesos(HIST_PESO);
  }
  preencherMetasIniciais();
  const ids = { refeicoes: new Set(S.refeicoes.map((x) => x.id)), atividades: new Set(S.atividades.map((x) => x.id)) };
  const add = (tipo, item) => {
    if (ids[tipo].has(item.id)) return;
    ids[tipo].add(item.id);
    const op = { opId: uid(), op: 'add', tipo, item: { ...item, criadoEm: new Date().toISOString() } };
    applyOp(op); S.queue.push(op);
  };
  for (const [data, kcal, gasto, ativ, prot, carb, gord, fibra] of window.HIST_DIAS || []) {
    add('refeicoes', { id: 'hist-ref-' + data, data, hora: '', refeicao: HIST_REF, alimento: 'Total do dia (planilha)', gramas: 0,
      kcal, prot: prot || 0, carb: carb || 0, gord: gord || 0, fibra: fibra || 0 });
    const b = calcBase(pesoEm(data));
    const extra = b ? Math.max(0, Math.round(gasto - b.base)) : 0;
    add('atividades', { id: 'hist-atv-' + data, data, hora: '', tipo: 'Planilha', minutos: 0, distancia: '', nivel: '', intensidade: '',
      kcal: extra, obs: `${ativ} · gasto total ${fmt(gasto)} kcal` });
  }
  S.cargaInicial = Math.max(S.cargaInicial || 0, 2);
  save(); agendarSync();
}
const HIST_REF = 'Histórico';

// Lançamentos detalhados de historico.js (HIST_REGISTROS). Guarda os ids já aplicados
// para não recriar algo que você apagou no app.
function cargaRegistros() {
  const R = window.HIST_REGISTROS; if (!R) return;
  const vistos = new Set(S.importados || []);
  let mudou = false;
  const add = (tipo, item) => {
    if (vistos.has(item.id)) return;
    vistos.add(item.id); mudou = true;
    if (S[tipo].some((x) => x.id === item.id)) return;
    const op = { opId: uid(), op: 'add', tipo, item: { ...item, criadoEm: new Date().toISOString() } };
    applyOp(op); S.queue.push(op);
  };
  for (const [id, data, refeicao, alimento, gramas, kcal, prot, carb, gord, fibra] of R.refeicoes || [])
    add('refeicoes', { id, data, hora: '', refeicao, alimento, gramas, kcal, prot, carb, gord, fibra });
  for (const [id, data, tipo, minutos, distancia, nivel, intensidade, kcal, obs] of R.atividades || [])
    add('atividades', { id, data, hora: '', tipo, minutos, distancia, nivel, intensidade, kcal, obs });
  if (mudou) { S.importados = [...vistos]; save(); agendarSync(); }
}

// Metas de peso/altura/IMC padrão, só onde ainda estão vazias (não sobrescreve o que você definiu).
function preencherMetasIniciais() {
  for (const k in METAS_INICIAIS) if (S.config[k] === '' || S.config[k] == null) S.config[k] = METAS_INICIAIS[k];
}

// chaves da aba Config que não são metas: combos de refeição e medições da balança (JSON em texto)
const CFG_EXTRA = ['combos', 'corpo', 'esporadicos'];
function salvarConfig(cfg) {
  cfg = { ...cfg };
  for (const k of CFG_EXTRA) if (cfg[k] === undefined && S.config[k] !== undefined) cfg[k] = S.config[k];
  S.queue = S.queue.filter((o) => o.op !== 'config' || inflight.has(o.opId));
  const op = { opId: uid(), op: 'config', config: cfg };
  applyOp(op); S.queue.push(op); save(); agendarSync();
}

// ---------- Sincronização com Google Sheets ----------
let syncing = false, syncTimer = null;
function agendarSync() { clearTimeout(syncTimer); syncTimer = setTimeout(() => sync(false), 700); updateSyncPill(); }

function updateSyncPill(estado, msg) {
  const el = $('#syncPill'); if (!el) return;
  let st = estado, txt;
  if (!st) {
    if (!S.conn.url || !S.conn.token) st = 'local';
    else if (!navigator.onLine) st = 'offline';
    else if (S.queue.length) st = 'pending';
    else st = 'ok';
  }
  txt = { local: 'Só no aparelho', offline: 'Offline', pending: `${S.queue.length} pendente${S.queue.length > 1 ? 's' : ''}`, ok: 'Sincronizado', syncing: 'Sincronizando…', erro: 'Erro de sync' }[st];
  el.dataset.state = st; el.querySelector('.txt').textContent = txt;
  el.title = msg || (S.lastSync ? 'Última sincronização: ' + new Date(S.lastSync).toLocaleString('pt-BR') : '');
}

async function chamarApi(payload) {
  const res = await fetch(S.conn.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token: S.conn.token, ...payload }),
    redirect: 'follow',
  });
  const txt = await res.text();
  let data;
  try { data = JSON.parse(txt); } catch (e) { throw new Error('Resposta inválida do Apps Script (verifique a URL e o acesso "Qualquer pessoa").'); }
  if (!data.ok) throw new Error(data.error || 'Erro desconhecido');
  return data;
}

async function sync(manual) {
  if (!S.conn.url || !S.conn.token) { updateSyncPill(); if (manual) toast('Configure a conexão com o Google Sheets em Ajustes'); return; }
  if (!navigator.onLine) { updateSyncPill(); if (manual) toast('Sem internet — os dados ficam salvos e sobem depois'); return; }
  if (syncing) return;
  syncing = true; updateSyncPill('syncing');
  const ops = S.queue.slice();
  ops.forEach((o) => inflight.add(o.opId));
  try {
    const data = await chamarApi({ action: 'sync', ops });
    const enviados = new Set(ops.map((o) => o.opId));
    S.queue = S.queue.filter((o) => !enviados.has(o.opId));
    for (const k of LISTAS) S[k] = (data[k] || []).map(limparItem(k));
    if (data.config && Object.keys(data.config).length) { S.config = { ...DEFAULT_CFG, ...data.config }; preencherMetasIniciais(); }
    S.queue.forEach(applyOp);
    migrarCombos();
    S.lastSync = Date.now();
    save(); render(); updateSyncPill();
    if (manual) toast('Tudo sincronizado com o Google Sheets ✓');
  } catch (e) {
    updateSyncPill('erro', e.message);
    if (manual) toast('Falha ao sincronizar: ' + e.message);
  } finally {
    ops.forEach((o) => inflight.delete(o.opId));
    syncing = false;
    if (S.queue.some((o) => !ops.includes(o))) agendarSync();
  }
}
const CAMPOS_NUM = { refeicoes: ['gramas', 'kcal', 'prot', 'carb', 'gord', 'fibra'], atividades: ['minutos', 'distancia', 'nivel', 'kcal'], peso: ['peso'], alimentos: ['kcal', 'prot', 'carb', 'gord', 'fibra'] };
function limparItem(tipo) {
  return (it) => { const o = { ...it }; for (const c of CAMPOS_NUM[tipo]) o[c] = num(o[c]); return o; };
}

// ---------- Componentes visuais ----------
function ring(pct, cor, size = 150, stroke = 14) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(pct, 1));
  const over = pct > 1 ? Math.min(pct - 1, 1) : 0;
  return `<svg viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${cor}" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${c * p} ${c}" opacity="${p > 0 ? 1 : 0}" style="transition:stroke-dasharray .6s cubic-bezier(.2,.8,.2,1)"/>
    ${over ? `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--bad)" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c * over} ${c}" opacity=".9"/>` : ''}
  </svg>`;
}

function macroBar(m, real, meta) {
  const st = avaliar(meta, real);
  const teto = meta ? (meta.tipo === 'faixa' ? meta.max : meta.alvo) : 0;
  const pct = teto ? real / teto : 0;
  let txt = '—';
  if (teto) {
    if (meta.tipo === 'faixa') txt = real < meta.min ? 'abaixo' : real > meta.max ? 'acima' : 'na faixa';
    else if (meta.tipo === 'ref') txt = 'livre';
    else txt = fmt(real / meta.alvo * 100) + '%';
  }
  // faixa ideal (entre mínimo e máximo) desenhada no fundo da barra
  const zona = meta && meta.tipo === 'faixa' && meta.max ? `<i class="zona" style="left:${meta.min / meta.max * 100}%"></i>` : '';
  return `<div class="macro-row">
    <div class="top">
      <span class="name"><i style="background:${m.cor}"></i>${m.nome}</span>
      <span class="vals num"><b>${fmt(real)}</b> / ${rotuloMeta(m, meta)}<span class="pct s-${st}">${txt}</span></span>
    </div>
    <div class="bar ${pct > 1 ? 'over' : ''}">${zona}<span style="width:${Math.min(pct, 1) * 100}%;background:${m.cor}"></span></div>
  </div>`;
}

// ---------- Telas ----------
function render() {
  const main = $('#main');
  document.querySelectorAll('.tabbar [data-nav]').forEach((b) => b.classList.toggle('active', b.dataset.nav === ui.view));
  $('#title').textContent = { hoje: 'Hoje', semana: 'Semana', peso: 'Peso', ajustes: 'Ajustes' }[ui.view];
  if (ui.view === 'hoje') { $('#title').textContent = ui.dia === hoje() ? 'Hoje' : 'Diário'; main.innerHTML = telaHoje(); }
  else if (ui.view === 'semana') main.innerHTML = telaSemana();
  else if (ui.view === 'peso') main.innerHTML = telaPeso();
  else main.innerHTML = telaAjustes();
  updateSyncPill();
}

// Rodapé do card de calorias: déficit do dia (gasto − comido) comparado ao alvo, em linguagem simples.
// Mesmas faixas do gráfico da semana: até 1,4× o alvo ok, até 2× alto, acima disso muito alto.
function heroDeficit(M, t, d) {
  const alvo = num(S.config.deficit) || 500;
  const ehHoje = d === hoje();
  if (!t.kcal) return `<div class="hero-foot"><span>Lance as refeições para ver o seu <b>déficit do dia</b> (quanto você gastou a mais do que comeu).</span></div>`;
  const def = M.gasto - t.kcal;
  let st, msg;
  if (def < 0) { st = 'bad'; msg = `você comeu ${fmt(-def)} kcal a mais do que gastou`; }
  else if (def <= alvo * 1.4) { st = 'good'; msg = 'dentro do alvo 👍'; }
  else if (def <= alvo * 2) { st = 'warn'; msg = ehHoje ? 'acima do alvo, ainda dá para comer mais' : 'acima do alvo'; }
  else { st = 'bad'; msg = ehHoje ? 'bem acima do alvo, coma mais hoje' : 'bem acima do alvo, comeu pouco'; }
  const pct = Math.max(0, Math.min(def / (alvo * 2.5), 1)) * 100, alvoPct = alvo / (alvo * 2.5) * 100;
  return `<div class="hero-def">
    <div class="hero-def-top"><span>⚖️ Déficit ${ehHoje ? 'até agora' : 'do dia'}<small>gastou − comeu · alvo ${fmt(alvo)}</small></span><b class="num s-${st}">${def < 0 ? '+' + fmt(-def) : fmt(def)} kcal</b></div>
    <div class="def-bar"><span class="def-fill" style="width:${pct}%;background:${corSt(st)}"></span><i style="left:${alvoPct}%"></i></div>
    <div class="def-msg s-${st}">${msg}</div>
  </div>`;
}

// Quanto falta de proteína hoje e o que dá para comer para fechar a meta
const PROT_OPC = [
  ['Whey protein (pó)', 30, 'Whey 30 g'], ['Ovo inteiro cozido', 100, '2 ovos cozidos'], ['Peito de frango grelhado', 100, 'Frango grelhado 100 g'],
  ['Peito de frango grelhado', 150, 'Frango grelhado 150 g'], ['Iogurte grego natural', 170, 'Iogurte grego 170 g'], ['Queijo cottage', 100, 'Cottage 100 g'],
  ['Atum em lata (em água)', 80, 'Atum 80 g'], ['Peito de peru fatiado', 60, 'Peito de peru 60 g'],
];
function opcoesProteina(falta) {
  return PROT_OPC.map(([nome, g, rot]) => {
    const f = alimentoPorNome(nome); if (!f) return null;
    return { nome, g, rot, prot: r1(f.prot * g / 100), kcal: Math.round(f.kcal * g / 100) };
  }).filter(Boolean).sort((a, b) => Math.abs(a.prot - falta) - Math.abs(b.prot - falta)).slice(0, 4);
}
let protOpc = [];
function cardProteina(t, M, ehHoje) {
  const meta = M.prot && (M.prot.min || M.prot.alvo);
  if (!ehHoje || !meta || !t.n) return '';
  const falta = meta - t.prot;
  if (falta < 8) return '';
  protOpc = opcoesProteina(falta);
  return `<div class="card">
    <div class="card-h"><h3>🥩 Faltam ${fmt(falta)} g de proteína</h3><span class="sub">para a meta de hoje</span></div>
    <div class="hint" style="margin:-4px 0 10px">Toque para lançar. O que mais se aproxima do que falta vem primeiro.</div>
    <div class="prot-opc">${protOpc.map((o, i) => `<button class="prot-chip" data-action="prot-add" data-i="${i}"><b>${esc(o.rot)}</b><small>+${fmt(o.prot, 0)} g prot · ${fmt(o.kcal)} kcal</small></button>`).join('')}</div>
  </div>`;
}
function lancarProteina(i) {
  const o = protOpc[i]; if (!o) return;
  const f = alimentoPorNome(o.nome), k = o.g / 100, refeicao = refeicaoPorHora();
  adicionar('refeicoes', { data: hoje(), hora: agoraHora(), refeicao, alimento: o.nome, gramas: o.g, kcal: Math.round(f.kcal * k), prot: r1(f.prot * k), carb: r1(f.carb * k), gord: r1(f.gord * k), fibra: r1(f.fibra * k) });
  toast(`${o.rot} lançado em ${refeicao} 🥩`);
}

function telaHoje() {
  const d = ui.dia;
  const t = totaisDia(d), g = gastoDia(d);
  const M = metasDia(d);
  const metaK = M.kcal.alvo;
  // no modo automático a meta já inclui as atividades; no manual o exercício soma ao saldo
  const restante = M.auto ? metaK - t.kcal : metaK - t.kcal + g.kcal;
  const ehHoje = d === hoje();

  const refs = S.refeicoes.filter((r) => r.data === d);
  const grupos = REFEICOES.map((R) => ({ ...R, itens: refs.filter((r) => r.refeicao === R.k).sort((a, b) => (a.hora || '').localeCompare(b.hora || '')) }))
    .filter((G) => G.itens.length);
  const outros = refs.filter((r) => !REFEICOES.some((R) => R.k === r.refeicao) && r.refeicao !== 'Histórico');
  if (outros.length) grupos.push({ k: 'Outros', ico: '🍴', itens: outros });
  const hist = refs.filter((r) => r.refeicao === 'Histórico');
  if (hist.length) grupos.push({ k: 'Importado da planilha', ico: '📄', itens: hist });

  const ativs = S.atividades.filter((a) => a.data === d).sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));

  return `
  <div class="datenav">
    <button class="iconbtn" data-action="dia" data-n="-1" aria-label="Dia anterior">${ICON.left}</button>
    <div class="lbl">
      <button class="cal-btn" data-action="abrir-cal" data-alvo="dia" aria-label="Escolher data"><b>${rotuloDia(d)} ${ICON.cal}</b></button>
      <small>${ehHoje ? dataCurta(d) : `<button class="link" data-action="ir-hoje">Voltar para hoje</button>`}</small>
    </div>
    <button class="iconbtn" data-action="dia" data-n="1" ${ehHoje ? 'disabled' : ''} aria-label="Próximo dia">${ICON.right}</button>
  </div>

  <div class="card">
    <div class="hero">
      <div class="ring-wrap">${ring(metaK ? t.kcal / metaK : 0, 'var(--kcal)')}
        <div class="ring-center"><b class="num">${fmt(t.kcal)}</b><small>comidas de<br>${fmt(metaK)} kcal</small></div>
      </div>
      <div class="hero-stats">
        ${M.auto ? `
        <div><span>🔥 Gastou<small>corpo ${fmt(M.base)} + treino ${fmt(M.atv)}</small></span><strong class="num">${fmt(M.gasto)}</strong></div>
        <div><span>🎯 Meta<small>gastou − ${fmt(S.config.deficit)}</small></span><strong class="num">${fmt(metaK)}</strong></div>
        <div><span>🍽️ Comeu</span><strong class="num">${fmt(t.kcal)}</strong></div>` : `
        <div><span>🎯 Meta</span><strong class="num">${fmt(metaK)}</strong></div>
        <div><span>🍽️ Comeu</span><strong class="num">${fmt(t.kcal)}</strong></div>
        <div><span>🔥 Treino<small>soma à meta</small></span><strong class="num">+${fmt(g.kcal)}</strong></div>`}
        <div class="big"><span>${restante < 0 ? '⚠️ Passou' : ehHoje ? '✅ Pode comer' : '↘️ Faltou comer'}<small>${restante < 0 ? 'acima da meta' : 'até a meta'}</small></span><strong class="num" style="${restante < 0 ? 'color:var(--bad)' : ''}">${fmt(Math.abs(restante))}</strong></div>
      </div>
    </div>
    ${M.auto ? heroDeficit(M, t, d) : ''}
  </div>

  <div class="card">
    <div class="card-h"><h3>Meta × Realizado</h3><span class="sub">${M.auto ? `metas p/ ${fmt(M.peso, 1)} kg` : `${t.n} ${t.n === 1 ? 'item' : 'itens'}`}</span></div>
    ${t.n && !t.comMacros ? `<div class="note" style="margin-bottom:12px">Dia importado da planilha: só tem o total de calorias, sem os macros.</div>` : ''}
    <div class="macros">${MACROS.slice(1).map((m) => macroBar(m, t[m.k], M[m.k])).join('')}</div>
  </div>

  ${cardProteina(t, M, ehHoje)}

  <div class="card sec sec-food">
    <div class="sec-h">
      <span class="sec-ico"><svg viewBox="0 0 24 24"><path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2.2 0-4 2.5-4 6v4h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
      <div><h3>Refeições</h3><small>${t.n ? `${t.n} ${t.n === 1 ? 'item' : 'itens'} · ${grupos.length} ${grupos.length === 1 ? 'refeição' : 'refeições'}${(() => { const e = refs.filter((r) => String(r.alimento).includes('≈')).reduce((s, r) => s + num(r.kcal), 0); return e ? ` · ≈ ${fmt(e)} kcal estimadas` : ''; })()}` : 'nada registrado ainda'}</small></div>
      <b class="num">${fmt(t.kcal)}<small>kcal</small></b>
    </div>
    ${grupos.length ? `<div class="seg pct-modo">${[['meta', '% da meta'], ['dia', '% do dia']].map(([k, r]) => `<button class="${ui.pctModo === k ? 'on' : ''}" data-action="pct-modo" data-v="${k}">${r}</button>`).join('')}</div>
      <div class="hint" style="margin:-4px 0 10px">${ui.pctModo === 'dia' ? 'Quanto cada item e refeição representa do que você comeu no dia.' : 'Quanto cada item e refeição cobre da meta do dia.'}</div>` : ''}
    ${grupos.length ? grupos.map((G) => {
      // subtotal da refeição, com o % (da meta ou do total do dia) em cada nutriente
      const sub = { kcal: 0, prot: 0, carb: 0, gord: 0, fibra: 0 };
      for (const x of G.itens) for (const k in sub) sub[k] += num(x[k]);
      const semMac = !(sub.prot + sub.carb + sub.gord + sub.fibra);
      const pc = (v, k, cls = 'pct-mini') => ui.pctModo === 'dia'
        ? (t[k] ? `<span class="${cls}">${fmt(num(v) / t[k] * 100)}%</span>` : '')
        : pctDia(v, M[k], cls);
      const macros = (r) => `<span>P <i>${fmt(r.prot)}</i>${pc(r.prot, 'prot')}</span><span>C <i>${fmt(r.carb)}</i>${pc(r.carb, 'carb')}</span><span>G <i>${fmt(r.gord)}</i>${pc(r.gord, 'gord')}</span><span>F <i>${fmt(r.fibra)}</i>${pc(r.fibra, 'fibra')}</span>`;
      return `<div class="meal-group">
        <div class="meal-group-h">${G.ico} ${esc(G.k)}<span class="num">${fmt(sub.kcal)} kcal ${pc(sub.kcal, 'kcal', 'pct-dia')}</span></div>
        ${semMac ? '' : `<div class="chips-mini num meal-group-sub">${macros(sub)}</div>`}
        ${G.itens.map((r) => `<div class="item">
          <div class="body"><b>${esc(r.alimento)}</b>
            <div class="chips-mini num">${num(r.gramas) ? `<span>${fmt(r.gramas)} g</span>` : ''}${r.refeicao === 'Histórico' && !(num(r.prot) + num(r.carb) + num(r.gord) + num(r.fibra))
              ? '<span>só calorias (a planilha não tinha os macros deste dia)</span>'
              : macros(r)}</div>
          </div>
          <div class="right num">${fmt(r.kcal)}<small>kcal ${pc(r.kcal, 'kcal')}</small></div>
          <button class="del edit" data-action="edit-ref" data-id="${esc(r.id)}" aria-label="Editar">✎</button>
          <button class="del" data-action="del" data-tipo="refeicoes" data-id="${esc(r.id)}" aria-label="Excluir">${ICON.x}</button>
        </div>`).join('')}
      </div>`;
    }).join('') : `<div class="empty"><b>Nenhuma refeição registrada</b>Toque no + para adicionar o que você comeu.</div>`}
    <button class="btn sec-add" data-action="nova-refeicao">+ Adicionar alimento</button>
  </div>

  <div class="card sec sec-move">
    <div class="sec-h">
      <span class="sec-ico"><svg viewBox="0 0 24 24"><path d="M3 12h3l3-7 4 14 3-7h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
      <div><h3>Atividades físicas</h3><small>${ativs.length ? `${ativs.length} ${ativs.length === 1 ? 'atividade' : 'atividades'} · ${fmt(g.min)} min` : 'nenhuma ainda'}</small></div>
      <b class="num">${g.kcal ? '−' + fmt(g.kcal) : '0'}<small>kcal</small></b>
    </div>
    ${ativs.length ? ativs.map((a) => {
      const A = ATIVIDADES.find((x) => x.k === a.tipo) || ATIVIDADES[ATIVIDADES.length - 1];
      return `<div class="item">
        <div class="ico">${A.ico}</div>
        <div class="body"><b>${esc(a.tipo === 'Planilha' ? 'Atividades (planilha)' : a.tipo)}</b><small>${[
          num(a.minutos) ? fmt(a.minutos) + ' min' : '',
          num(a.distancia) ? (a.tipo === 'Natação' ? fmt(num(a.distancia) * 1000) + ' m' : fmt(a.distancia, 2) + ' km') : '',
          num(a.nivel) ? ((a.tipo === 'Caminhada' || a.tipo === 'Corrida') ? fmt(a.nivel, 1) + '% incl.' : 'nível ' + fmt(a.nivel)) : '',
          a.intensidade ? esc(/^Treino/.test(a.intensidade) ? a.intensidade : String(a.intensidade).toLowerCase()) : '',
          a.obs ? esc(sepObs(a.obs).nota) : '',
          sepObs(a.obs).cargas.length ? `🏋️ ${sepObs(a.obs).cargas.length} cargas` : '',
        ].filter(Boolean).join(' · ')}</small></div>
        <div class="right num">${fmt(a.kcal)}<small>kcal</small></div>
        <button class="del" data-action="del" data-tipo="atividades" data-id="${esc(a.id)}" aria-label="Excluir">${ICON.x}</button>
      </div>`;
    }).join('') : `<div class="empty"><b>Nenhuma atividade</b>Registre treinos, caminhadas e esportes.</div>`}
    <button class="btn sec-add" data-action="nova-atividade">+ Adicionar atividade</button>
  </div>`;
}

// ---------- Gráfico da semana (Calorias · Déficit · Proteína · Gasto) ----------
const GRAF_OPCOES = [['kcal', 'Comeu'], ['gasto', 'Gastou'], ['cxg', 'Comeu × Gastou'], ['deficit', 'Déficit'], ['prot', 'Proteína']];
const COR_BASE = 'color-mix(in srgb, var(--brand) 45%, var(--surface-2))';
const corSt = (st) => st === 'good' ? 'var(--good)' : st === 'warn' ? 'var(--warn)' : 'var(--bad)';
const fmtK = (v) => Math.abs(v) >= 1000 ? fmt(v / 1000, 1) + 'k' : fmt(v);
const legItem = (cor, txt, tracejado) => tracejado
  ? `<span><i style="background:none;border-top:2px dashed ${cor};height:0;border-radius:0"></i>${txt}</span>`
  : `<span><i style="background:${cor}"></i>${txt}</span>`;

function graficoSemana(dias, tot, metas, comDados, comMac, t0) {
  const tipo = ui.grafSem;
  const def = num(S.config.deficit) || 500;
  // cada barra: { v, cor, linhas: [valores de referência], pilha: [base, extra] }
  const barras = dias.map((d, i) => {
    const M = metas[i], t = tot[i];
    if (tipo === 'kcal') {
      return comDados[i] ? { v: t.kcal, cor: corSt(avaliar(M.kcal, t.kcal)), linhas: [M.kcal.alvo] } : { linhas: [M.kcal.alvo] };
    }
    if (tipo === 'deficit') {
      if (!comDados[i] || !M.auto) return { linhas: [def] };
      const v = M.gasto - t.kcal;
      // como na sua planilha: até ~700 equilibrado, até ~1.000 alto, acima disso exagerado; negativo = superávit
      const st = v < 0 ? 'bad' : v <= def * 1.4 ? 'good' : v <= def * 2 ? 'warn' : 'bad';
      return { v, cor: corSt(st), linhas: [def] };
    }
    if (tipo === 'prot') {
      const lim = M.prot.tipo === 'faixa' ? [M.prot.min, M.prot.max] : [M.prot.alvo];
      return comMac[i] ? { v: t.prot, cor: corSt(avaliar(M.prot, t.prot)), linhas: lim } : { linhas: lim };
    }
    const futuro = d > t0;
    if (tipo === 'cxg') {
      // duas barras lado a lado: o que comeu e o que gastou no dia
      if (futuro) return {};
      return { par: [comDados[i] ? t.kcal : null, M.auto ? M.gasto : null] };
    }
    // gasto: base (TMB × rotina) + atividades, empilhados (dias futuros ainda não têm gasto)
    if (!M.auto || futuro) return {};
    return { v: M.gasto, pilha: [M.base, M.gasto - M.base] };
  });

  const W = 340, H = 180, pl = 6, pb = 22, pt = 20;
  const vals = barras.flatMap((b) => [b.v || 0, ...(b.linhas || []), ...(b.par || []).map((x) => x || 0)]);
  const maxV = Math.max(...vals.map((v) => v * 1.12), tipo === 'prot' ? 50 : 100);
  const minV = Math.min(0, ...barras.map((b) => b.v || 0));
  const bw = (W - pl * 2) / 7;
  const y = (v) => pt + (H - pt - pb) * (1 - (v - minV) / (maxV - minV));
  const y0 = y(0);
  const svg = barras.map((b, i) => {
    const x = pl + i * bw + bw * 0.18, w = bw * 0.64, cx = x + w / 2;
    let g = '';
    if (b.par) {
      // barras lado a lado: comeu (roxo) e gastou (ciano), com o valor em cima de cada uma
      const bw2 = bw * 0.36, gap = bw * 0.04, x0 = cx - bw2 - gap / 2;
      [[b.par[0], 'var(--brand)'], [b.par[1], '#5cc8e0']].forEach(([v, cor], j) => {
        const xx = x0 + j * (bw2 + gap);
        if (v == null) { g += `<rect x="${xx}" y="${y0 - 4}" width="${bw2}" height="4" rx="2" fill="var(--surface-2)"/>`; return; }
        g += `<rect x="${xx}" y="${y(v)}" width="${bw2}" height="${Math.max(4, y0 - y(v))}" rx="5" fill="${cor}"/>`;
        g += `<text x="${xx + bw2 / 2}" y="${y(v) - 4}" text-anchor="middle" style="font-size:8.5px;font-weight:700;fill:var(--text)">${fmtK(v)}</text>`;
      });
      g += `<text x="${cx}" y="${H - 6}" text-anchor="middle" style="${dias[i] === t0 ? 'font-weight:800;fill:var(--brand)' : ''}">${DIAS_CURTO[parse(dias[i]).getDay()]}</text>`;
      return g;
    }
    if (b.pilha) {
      const [base, extra] = b.pilha;
      g += `<rect x="${x}" y="${y(base)}" width="${w}" height="${y0 - y(base)}" rx="7" fill="${COR_BASE}"/>`;
      if (extra > 0) g += `<rect x="${x}" y="${y(base + extra)}" width="${w}" height="${y(base) - y(base + extra)}" rx="7" fill="#5cc8e0"/>`;
    } else if (b.v != null) {
      const top = Math.min(y(b.v), y0), h = Math.max(4, Math.abs(y0 - y(b.v)));
      g += `<rect x="${x}" y="${b.v < 0 ? y0 : top}" width="${w}" height="${h}" rx="7" fill="${b.cor}"/>`;
    } else {
      g += `<rect x="${x}" y="${y0 - 4}" width="${w}" height="4" rx="2" fill="var(--surface-2)"/>`;
    }
    for (const l of b.linhas || []) g += `<line x1="${x - 3}" x2="${x + w + 3}" y1="${y(l)}" y2="${y(l)}" stroke="var(--text)" stroke-opacity=".55" stroke-width="2" stroke-dasharray="3 2"/>`;
    // valor logo acima da barra (abaixo, se for negativo)
    if (b.v != null) {
      const ty = b.v < 0 ? y(b.v) + 13 : y(b.v) - 6;
      g += `<text x="${cx}" y="${ty}" text-anchor="middle" style="font-weight:700;fill:var(--text)">${tipo === 'prot' ? fmt(b.v) : fmtK(b.v)}</text>`;
    }
    g += `<text x="${cx}" y="${H - 6}" text-anchor="middle" style="${dias[i] === t0 ? 'font-weight:800;fill:var(--brand)' : ''}">${DIAS_CURTO[parse(dias[i]).getDay()]}</text>`;
    return g;
  }).join('');
  const zero = minV < 0 ? `<line x1="${pl}" x2="${W - pl}" y1="${y0}" y2="${y0}" stroke="var(--line)"/>` : '';

  // título, resumo e legenda de cada visão
  const comV = barras.filter((b) => b.v != null);
  const soma = comV.reduce((s, b) => s + b.v, 0), media = comV.length ? soma / comV.length : 0;
  // comeu × gastou: só os dias que têm os dois
  const pares = barras.filter((b) => b.par && b.par[0] != null && b.par[1] != null);
  const totComeu = pares.reduce((s, b) => s + b.par[0], 0), totGastou = pares.reduce((s, b) => s + b.par[1], 0);
  const info = {
    cxg: ['Comeu × Gastou', pares.length ? `comeu ${fmt(totComeu)} · gastou ${fmt(totGastou)}` : 'kcal',
      [legItem('var(--brand)', 'Comeu'), legItem('#5cc8e0', 'Gastou'), pares.length ? `<span>diferença (déficit): <b style="color:var(--text)">${fmt(totGastou - totComeu)} kcal</b></span>` : '']],
    kcal: ['Consumo', comV.length ? `média ${fmt(media)} kcal` : 'kcal',
      [legItem('var(--good)', 'Na meta (±10%)'), legItem('var(--warn)', 'Perto (±20%)'), legItem('var(--bad)', 'Fora'), legItem('var(--muted)', 'Meta do dia', true)]],
    deficit: ['Déficit diário', comV.length ? `total ${fmt(soma)} · média ${fmt(media)}` : 'gasto − consumo',
      [legItem('var(--good)', `Até ${fmt(def * 1.4)}`), legItem('var(--warn)', `Até ${fmt(def * 2)}`), legItem('var(--bad)', 'Exagerado ou superávit'), legItem('var(--muted)', `Alvo ${fmt(def)}`, true)]],
    prot: ['Proteína', comV.length ? `média ${fmt(media)} g` : 'g',
      [legItem('var(--good)', 'Na faixa'), legItem('var(--warn)', 'Perto'), legItem('var(--bad)', 'Fora'), legItem('var(--muted)', 'Mín. e máx.', true)]],
    gasto: ['Gasto calórico', comV.length ? `média ${fmt(media)} kcal` : 'kcal',
      [legItem(COR_BASE, 'Gasto base (TMB × rotina)'), legItem('#5cc8e0', 'Atividades')]],
  }[tipo];
  const vazio = tipo === 'cxg' ? !barras.some((b) => b.par && (b.par[0] != null || b.par[1] != null)) : !comV.length;
  const aviso = vazio
    ? `<div class="hint" style="margin:0 0 6px">${tipo === 'cxg' ? 'Sem registros nesta semana.' : tipo === 'prot' ? 'Sem macros registrados nesta semana.' : tipo === 'kcal' ? 'Sem registros nesta semana.' : 'Informe idade e sexo em Ajustes para calcular o gasto.'}</div>` : '';
  return `<div class="card-h"><h3>${info[0]}</h3><span class="sub num">${info[1]}</span></div>${aviso}
    <svg viewBox="0 0 ${W} ${H}">${zero}${svg}</svg>
    <div class="legend">${info[2].join('')}</div>`;
}

// ---------- Resumo da semana (card do topo), em linguagem simples ----------
function resumoSemana(r) {
  const alvo = num(S.config.deficit) || 500;
  const parcial = r.t0 >= r.ini && r.t0 <= r.fim;
  const diasPassados = parcial ? Math.round((parse(r.t0) - parse(r.ini)) / 864e5) + 1 : 7;
  const linhas = [];

  // 1) Alimentação
  const pctMeta = r.metaK ? Math.round(r.media.kcal / r.metaK * 100) : 0;
  linhas.push(`<div><span>🍽️ Comeu por dia<small>${r.nDias ? `média de ${r.nDias} dia${r.nDias === 1 ? '' : 's'} lançado${r.nDias === 1 ? '' : 's'} · meta ${fmt(r.metaK)}` : 'nenhuma refeição lançada'}</small></span>
    <strong class="num">${r.nDias ? fmt(r.media.kcal) : '—'}${r.nDias && r.metaK ? `<small class="s-${pctMeta >= 90 && pctMeta <= 110 ? 'good' : pctMeta >= 80 && pctMeta <= 120 ? 'warn' : 'bad'}">${pctMeta}% da meta</small>` : ''}</strong></div>`);

  // 2) Déficit
  if (r.metaMedia.auto) {
    const porDia = r.nDias ? r.deficitSem / r.nDias : 0;
    const st = !r.nDias ? 'none' : porDia < 0 ? 'bad' : porDia <= alvo * 1.4 ? 'good' : porDia <= alvo * 2 ? 'warn' : 'bad';
    const msg = { good: 'no alvo 👍', warn: 'acima do alvo', bad: porDia < 0 ? 'superávit' : 'bem acima do alvo', none: '' }[st];
    linhas.push(`<div><span>⚖️ Déficit da semana<small>${r.nDias ? `${fmt(porDia)}/dia · alvo ${fmt(alvo)}/dia` : 'gastou − comeu'}</small></span>
      <strong class="num">${r.nDias ? fmt(r.deficitSem) : '—'}${r.nDias ? `<small class="s-${st}">${msg}</small>` : ''}</strong></div>`);
    if (r.nDias) linhas.push(`<div><span>🧈 Gordura queimada (estimada)<small>déficit ÷ 7.700 kcal por kg</small></span><strong class="num">≈ ${fmt(Math.max(0, r.deficitSem) / 7700, 2)} kg</strong></div>`);
  } else {
    linhas.push(`<div><span>🎯 Dias na meta<small>calorias entre 90% e 110%</small></span><strong class="num">${r.diasNaMeta} de ${r.nDias}</strong></div>`);
  }

  // 3) Atividades
  const detAtv = [r.diasAtivos ? `${r.diasAtivos} dia${r.diasAtivos === 1 ? '' : 's'}` : '', r.minTot ? fmt(r.minTot) + ' min' : '', r.kmTot ? fmt(r.kmTot, 1) + ' km' : ''].filter(Boolean).join(' · ');
  linhas.push(`<div><span>🔥 Gastou em atividades<small>${detAtv || 'nenhuma atividade'}</small></span><strong class="num">${r.kcalAtv ? fmt(r.kcalAtv) + ' kcal' : '—'}</strong></div>`);

  // 3b) Treinos de musculação e proteína
  const muscu = S.atividades.filter((a) => a.data >= r.ini && a.data <= r.fim && a.tipo === 'Musculação');
  const letras = muscu.map((a) => (/^Treino ([ABC])$/.exec(a.intensidade || '') || [])[1]).filter(Boolean).join(' · ');
  linhas.push(`<div><span>💪 Treinos de musculação<small>${muscu.length ? (letras ? 'Treinos ' + letras : 'registrados') : (parcial ? 'nenhum até agora' : 'nenhum na semana')}</small></span><strong class="num">${muscu.length}</strong></div>`);
  if (r.media.prot) linhas.push(`<div><span>🥩 Proteína por dia<small>meta ${rotuloMeta(MACROS[1], r.metaMedia.prot)}</small></span><strong class="num s-${avaliar(r.metaMedia.prot, r.media.prot)}">${fmt(r.media.prot)} g</strong></div>`);

  // 4) Peso: da segunda desta semana até a segunda seguinte
  let pesoTxt, pesoSub, pesoCls = '';
  if (r.varPeso != null) {
    const ult = r.pesosSem[r.pesosSem.length - 1];
    const base = r.pesosAntes.length ? r.pesosAntes[r.pesosAntes.length - 1] : r.pesosSem[0];
    pesoTxt = (r.varPeso > 0 ? '+' : '') + fmt(r.varPeso, 1) + ' kg';
    pesoSub = `${fmt(base.peso, 1)} → ${fmt(ult.peso, 1)} kg (${dataCurta(ult.data)})`;
    pesoCls = r.varPeso <= 0 ? 's-good' : 's-warn';
  } else {
    pesoTxt = '—';
    pesoSub = `sai na pesagem de seg, ${dataCurta(r.fechaAte)}`;
  }
  linhas.push(`<div><span>📉 Peso na semana<small>${pesoSub}</small></span><strong class="num ${pesoCls}">${pesoTxt}</strong></div>`);

  return `<div class="card">
    <div class="card-h"><h3>Resumo da semana</h3><span class="sub">${parcial ? `em andamento · dia ${diasPassados}/7` : 'semana fechada'}</span></div>
    <div class="hero-stats resumo-sem">${linhas.join('')}</div>
  </div>`;
}

// ---------- Resumo das atividades da semana ----------
function icoAtividade(tipo) {
  if (tipo === 'Planilha') return '📄';
  return (ATIVIDADES.find((x) => x.k === tipo) || ATIVIDADES[ATIVIDADES.length - 1]).ico;
}
// descrição curta de uma atividade: "Treino A", "Elíptico 20 min · 5,3 km · nível 8"…
function descAtividade(a) {
  if (a.tipo === 'Planilha') return String(a.obs || 'Atividades').replace(/ · gasto total.*$/, '');
  if (/^Treino [ABC]$/.test(a.intensidade || '')) return a.intensidade;
  const partes = [a.tipo];
  if (num(a.minutos)) partes.push(fmt(a.minutos) + ' min');
  if (num(a.distancia)) partes.push(a.tipo === 'Natação' ? fmt(num(a.distancia) * 1000) + ' m' : fmt(a.distancia, 1) + ' km');
  if (num(a.nivel)) partes.push((a.tipo === 'Caminhada' || a.tipo === 'Corrida') ? fmt(a.nivel, 1) + '% incl.' : 'nível ' + fmt(a.nivel));
  return partes.join(' · ');
}
function resumoAtividades(dias, t0) {
  const ini = dias[0], fim = dias[6];
  const lista = S.atividades.filter((a) => a.data >= ini && a.data <= fim);
  if (!lista.length) {
    return `<div class="card sec sec-move"><div class="sec-h"><span class="sec-ico">${ICO_MOVE}</span><div><h3>Atividades da semana</h3><small>nenhuma atividade registrada</small></div></div>
      <div class="empty">Registre treinos e cardios pelo botão +.</div></div>`;
  }
  const reais = lista.filter((a) => a.tipo !== 'Planilha');
  const kcal = lista.reduce((s, a) => s + num(a.kcal), 0);
  const min = reais.reduce((s, a) => s + num(a.minutos), 0);
  const km = reais.reduce((s, a) => s + (a.tipo === 'Natação' ? 0 : num(a.distancia)), 0);
  // dia de descanso vindo da planilha (sem gasto extra) não conta como dia ativo
  const diasAtivos = new Set(lista.filter((a) => a.tipo !== 'Planilha' || (num(a.kcal) > 0 && !/^Descanso/i.test(a.obs || ''))).map((a) => a.data)).size;

  // por tipo
  const porTipo = {};
  for (const a of reais) {
    const k = ATIVIDADES.some((x) => x.k === a.tipo) ? a.tipo : 'Outros';
    const p = porTipo[k] || (porTipo[k] = { n: 0, min: 0, km: 0, kcal: 0, treinos: {} });
    p.n++; p.min += num(a.minutos); p.kcal += num(a.kcal);
    if (a.tipo !== 'Natação') p.km += num(a.distancia);
    const tr = /^Treino ([ABC])$/.exec(a.intensidade || '');
    if (tr) p.treinos[tr[1]] = (p.treinos[tr[1]] || 0) + 1;
  }
  const ordem = ATIVIDADES.map((x) => x.k).filter((k) => porTipo[k]);
  const tipos = ordem.map((k) => {
    const p = porTipo[k];
    const tr = Object.keys(p.treinos).sort().map((l) => `${l}${p.treinos[l] > 1 ? '×' + p.treinos[l] : ''}`).join(' · ');
    const det = [tr ? 'Treinos ' + tr : '', p.min && !tr ? fmt(p.min) + ' min' : '', p.km ? fmt(p.km, 1) + ' km' : ''].filter(Boolean).join(' · ');
    return `<div class="atv-tipo"><span class="ico">${icoAtividade(k)}</span><div><b>${esc(k)} <i>${p.n}×</i></b><small>${det || '—'}</small></div><span class="num">${fmt(p.kcal)}<small>kcal</small></span></div>`;
  }).join('');
  const temPlanilha = lista.some((a) => a.tipo === 'Planilha');

  // dia a dia
  const linhas = dias.map((d) => {
    const at = lista.filter((a) => a.data === d);
    const k = at.reduce((s, a) => s + num(a.kcal), 0);
    return `<div class="atv-dia ${at.length ? '' : 'vazio'}">
      <span class="d" style="${d === t0 ? 'color:var(--brand)' : ''}">${DIAS_CURTO[parse(d).getDay()]} ${parse(d).getDate()}</span>
      <span class="o">${at.length ? at.map((a) => `<em>${icoAtividade(a.tipo)} ${esc(descAtividade(a))}</em>`).join('') : `<em>${d > t0 ? '—' : d === t0 ? 'nada registrado ainda' : 'descanso'}</em>`}</span>
      <span class="k num">${at.length ? fmt(k) : ''}</span>
    </div>`;
  }).join('');

  return `<div class="card sec sec-move">
    <div class="sec-h"><span class="sec-ico">${ICO_MOVE}</span>
      <div><h3>Atividades da semana</h3><small>${diasAtivos} dia${diasAtivos === 1 ? '' : 's'} ativo${diasAtivos === 1 ? '' : 's'}${min ? ' · ' + fmt(min) + ' min' : ''}${km ? ' · ' + fmt(km, 1) + ' km' : ''}</small></div>
      <b class="num">${fmt(kcal)}<small>kcal</small></b>
    </div>
    ${tipos ? `<div class="atv-tipos">${tipos}</div>` : ''}
    ${temPlanilha ? '<div class="hint" style="margin:0 0 8px">📄 Dias vindos da planilha: mostram o texto das atividades e o gasto acima do gasto base.</div>' : ''}
    <div class="lbl-t" style="margin-top:6px">Dia a dia <span style="float:right;font-weight:500">kcal</span></div>
    <div class="atv-dias">${linhas}</div>
  </div>`;
}
// ---------- Dicas: análise automática dos seus registros (regras, sem IA e sem enviar nada para fora) ----------
const VEG = ['alface', 'tomate', 'brocolis', 'couve', 'cenoura', 'abobrinha', 'pepino', 'espinafre', 'beterraba', 'vagem', 'chuchu', 'repolho', 'rucula', 'salada', 'legume', 'verdura', 'pimentao', 'berinjela', 'abobora', 'cogumelo', 'aspargo', 'agriao'];
const FRUTA = ['banana', 'maca', 'mamao', 'laranja', 'morango', 'uva', 'manga', 'melancia', 'abacaxi', 'kiwi', 'pera', 'abacate', 'acai', 'fruta', 'melao', 'limao', 'tangerina', 'goiaba', 'ameixa'];
function atvDoDia(d) { return S.atividades.filter((a) => a.data === d); }
function diaAtivo(d) { return atvDoDia(d).some((a) => num(a.kcal) > 5 && !/^Descanso/i.test(a.obs || '')); }
function diaForca(d) {
  return atvDoDia(d).some((a) => a.tipo === 'Musculação' || (a.tipo === 'Planilha' && !/^Descanso/i.test(a.obs || '') && /(treino|muscula|for[cç]a|full body|atividade [0-9])/i.test(a.obs || '')));
}
function dicasApp() {
  const t0 = hoje(), fim = addDias(t0, -1);
  const mk = (n) => Array.from({ length: n }, (_, i) => addDias(fim, -(n - 1) + i));
  const d14 = mk(14), d28 = mk(28);
  const T = (d) => totaisDia(d);
  const com = (ds) => ds.filter((d) => T(d).n > 0);
  const media = (xs) => xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
  const out = [];
  const add = (k, prio, ic, t, x, d) => out.push({ k, prio, ic, t, x, d: d || '' });
  const peso = pesoAtual(), B = calcBase(peso), tmb = B ? B.tmb : 0;
  const piso = tmb ? Math.round(tmb * 0.72 / 50) * 50 : 1300;

  // ----- Peso -----
  const ps = pesosOrdenados();
  if (ps.length >= 2) {
    const ult = ps[ps.length - 1], lim = addDias(ult.data, -28);
    const ref = ps.find((p) => p.data >= lim && p !== ult) || ps[ps.length - 2];
    const sem = Math.max(1, (parse(ult.data) - parse(ref.data)) / (7 * 864e5));
    const ritmo = (num(ref.peso) - num(ult.peso)) / sem, pct = ritmo / num(ult.peso) * 100;
    const dado = `${dataCurta(ref.data)} → ${dataCurta(ult.data)}: ${fmt(ref.peso, 1)} → ${fmt(ult.peso, 1)} kg`;
    if (ritmo > 0.05) {
      if (pct > 1) add('ajustar', 2, '🐇', 'Ritmo de perda muito rápido', `Você está perdendo cerca de ${fmt(ritmo, 1)} kg por semana (${fmt(pct, 1)}% do peso). Acima de ~1% por semana aumenta o risco de perder massa magra. Considere um déficit um pouco menor.`, dado);
      else if (ritmo >= 0.3) add('bom', 3, '📉', 'Ritmo de perda saudável', `Cerca de ${fmt(ritmo, 1)} kg por semana (${fmt(pct, 1)}% do peso): bom equilíbrio entre resultado e preservação de músculo.`, dado);
    } else if (ritmo <= 0.05) {
      add('dica', 4, '⏸️', 'Peso estável nas últimas semanas', 'Oscilações de ±1 kg são normais (água, sal, horário). Olhe a tendência de 3 a 4 semanas antes de mudar o plano.', dado);
    }
    // semanas seguidas sem subir
    let seq = 0; for (let i = ps.length - 1; i > 0 && num(ps[i].peso) <= num(ps[i - 1].peso); i--) seq++;
    if (seq >= 4) add('bom', 1, '🏅', `${seq} pesagens seguidas sem subir`, 'Constância é o que mais pesa no resultado. Continue pesando sempre no mesmo dia e horário.', `${dataCurta(ps[ps.length - 1 - seq].data)} → ${dataCurta(ult.data)}`);
    // meta
    const meta = num(S.config.pesoMeta);
    if (meta && num(ult.peso) > meta && ritmo > 0.1) {
      const falta = num(ult.peso) - meta, semanas = Math.ceil(falta / ritmo);
      add('dica', 3, '🎯', `Faltam ${fmt(falta, 1)} kg para a meta`, `No ritmo atual, por volta de ${dataCurta(addDias(ult.data, semanas * 7))}. Perto da meta, vale desacelerar um pouco e planejar a fase de manutenção.`, `meta ${fmt(meta, 1)} kg`);
    }
    // pesagem em dia
    const dsp = Math.round((parse(t0) - parse(ult.data)) / 864e5);
    if (dsp > 9) add('ajustar', 2, '⚖️', 'Pesagem atrasada', `Sua última pesagem foi há ${dsp} dias. Pesar toda semana, no mesmo dia, mantém a análise confiável.`, `última: ${dataCurta(ult.data)}`);
  }

  // ----- Alimentação: calorias -----
  const dd = com(d14);
  if (dd.length >= 7) {
    const avg = media(dd.map((d) => T(d).kcal));
    if (tmb && avg < tmb * 0.95) add('ajustar', 1, '🍽️', 'Você está comendo abaixo do metabolismo basal', `Média de ${fmt(avg)} kcal/dia, contra um basal de ${fmt(tmb)} kcal. Comer pouco demais com muito treino acelera a perda de massa magra. Suba um pouco nos dias de treino.`, `últimos ${dd.length} dias com registro`);
    else if (tmb) add('bom', 3, '🍽️', 'Ingestão calórica coerente com o objetivo', `Média de ${fmt(avg)} kcal/dia, sem ficar abaixo do basal (${fmt(tmb)} kcal).`, `últimos ${dd.length} dias`);
    const baixos = dd.filter((d) => T(d).kcal < piso);
    if (baixos.length >= 2) add('parar', 1, '🛑', `Parar de fechar o dia abaixo de ${fmt(piso)} kcal`, `${baixos.length} dias ficaram abaixo desse piso (${baixos.slice(-3).map((d) => `${dataCurta(d)}: ${fmt(T(d).kcal)}`).join(' · ')}). Em dias de treino, isso pesa contra o músculo.`, `piso = 72% do seu metabolismo basal`);
    else if (baixos.length === 1) add('ajustar', 3, '⚠️', 'Um dia ficou muito baixo', `${dataCurta(baixos[0])}: ${fmt(T(baixos[0]).kcal)} kcal. Evite repetir, principalmente em dia de treino.`, `piso ${fmt(piso)} kcal`);
    // compensação: dia alto seguido de dia baixo
    let comp = 0; for (let i = 1; i < d14.length; i++) { const a = T(d14[i - 1]), b = T(d14[i]); if (a.n && b.n && a.kcal > 2000 && b.kcal < piso * 1.1) comp++; }
    if (comp >= 1) add('parar', 2, '🔁', 'Parar de “compensar” um dia alto com um dia muito baixo', 'Depois de um dia mais calórico, volte ao plano normal. Cortar demais no dia seguinte aumenta fome, perda de músculo e risco de novo exagero.', `${comp} ocorrência(s) nos últimos 14 dias`);
  }
  // déficit real × alvo
  const defs = com(d14).map((d) => { const M = metasDia(d); return M.auto ? M.gasto - T(d).kcal : null; }).filter((x) => x != null);
  const alvoDef = num(S.config.deficit) || 500;
  if (defs.length >= 7) {
    const dm = media(defs);
    if (dm > alvoDef * 1.6) add('ajustar', 1, '⚖️', 'Seu déficit real está bem acima do alvo', `Você está com déficit médio de ${fmt(dm)} kcal/dia, contra um alvo de ${fmt(alvoDef)}. Se o plano é esse, ajuste o alvo em Ajustes; se não, coma um pouco mais.`, `gasto estimado − o que você comeu`);
    else if (dm >= alvoDef * 0.7) add('bom', 2, '✅', 'Déficit dentro do planejado', `Déficit médio de ${fmt(dm)} kcal/dia, perto do alvo de ${fmt(alvoDef)}.`, 'últimos 14 dias');
  }

  // ----- Macros -----
  const mac = d14.filter((d) => T(d).n > 0 && T(d).comMacros);
  if (mac.length >= 4) {
    const pm = media(mac.map((d) => T(d).prot));
    const faixa = mac.map((d) => metasDia(d).prot);
    const nok = mac.filter((d, i) => T(d).prot >= (faixa[i].min || faixa[i].alvo || 0) * 0.98).length;
    const pmin = media(faixa.map((f) => f.min || f.alvo || 0));
    if (pmin) {
      if (pm >= pmin) add('bom', 1, '🥩', 'Proteína em dia', `Média de ${fmt(pm)} g/dia (meta mínima ${fmt(pmin)} g). ${nok} de ${mac.length} dias bateram a meta. Proteína alta é o que mais protege o músculo no déficit.`, `últimos ${mac.length} dias com macros`);
      else add('ajustar', 1, '🥩', 'Proteína abaixo da meta', `Média de ${fmt(pm)} g/dia, meta mínima ${fmt(pmin)} g. Distribua em 4 refeições de 30–40 g.`, `${nok} de ${mac.length} dias na meta`);
    }
    const fibMin = num(S.config.fibraMin) || num(S.config.fibra) || 25, fm = media(mac.map((d) => T(d).fibra));
    if (fm < fibMin * 0.8) add('ajustar', 2, '🥬', 'Fibra abaixo da meta', `Média de ${fmt(fm)} g/dia, meta ${fmt(fibMin)} g. Mais verduras, legumes, frutas e leguminosas ajudam na saciedade e no intestino.`, `${mac.filter((d) => T(d).fibra >= fibMin).length} de ${mac.length} dias na meta`);
    else add('bom', 3, '🥬', 'Fibra em dia', `Média de ${fmt(fm)} g/dia (meta ${fmt(fibMin)} g).`, `últimos ${mac.length} dias`);
    // carboidrato por kg x treino
    const treinos = d14.filter(diaForca).length;
    const cm = media(mac.map((d) => T(d).carb));
    if (peso && treinos >= 8 && cm / peso < 1.6) add('ajustar', 2, '🍚', 'Pouco carboidrato para o volume de treino', `Média de ${fmt(cm)} g/dia (${fmt(cm / peso, 1)} g/kg) com ${treinos} treinos de força em 14 dias. Um pouco mais de carboidrato antes e depois do treino melhora desempenho e recuperação.`, 'referência: ~2 g/kg ou mais em fase de treino intenso');
    // café da manhã
    const cafes = mac.map((d) => S.refeicoes.filter((r) => r.data === d && r.refeicao === 'Café da manhã').reduce((s, r) => s + num(r.prot), 0)).filter((x) => x > 0);
    if (cafes.length >= 4 && media(cafes) < 25) add('dica', 3, '🍳', 'Reforce a proteína do café da manhã', `Hoje ele tem em média ${fmt(media(cafes))} g de proteína. Algo perto de 30 g (ovos, whey, iogurte) distribui melhor a proteína do dia.`, `${cafes.length} dias analisados`);
  }
  const soKcal = d14.filter((d) => T(d).n > 0 && !T(d).comMacros).length;
  if (soKcal >= 4) add('dica', 4, '📝', 'Alguns dias estão só com calorias', `${soKcal} dos últimos 14 dias não têm proteína, carboidrato e gordura. Lance as refeições pelo app para ter essa análise completa.`, '');

  // ----- Vegetais e frutas nos registros -----
  const comReg = d14.filter((d) => S.refeicoes.some((r) => r.data === d && r.refeicao !== 'Histórico'));
  if (comReg.length >= 5) {
    const tem = (d, lista) => S.refeicoes.some((r) => r.data === d && lista.some((v) => norm(r.alimento).includes(v)));
    const dv = comReg.filter((d) => tem(d, VEG)).length, df = comReg.filter((d) => tem(d, FRUTA)).length;
    if (dv / comReg.length < 0.5) add('ajustar', 2, '🥗', 'Poucos legumes e verduras nos registros', `Aparecem em ${dv} de ${comReg.length} dias. Se você come e não registra, lance; se não come, inclua pelo menos uma porção grande no almoço e no jantar.`, 'melhora fibra, saciedade e micronutrientes');
    else add('bom', 3, '🥗', 'Legumes e verduras presentes', `Registrados em ${dv} de ${comReg.length} dias.`, '');
    if (df / comReg.length < 0.4) add('dica', 4, '🍎', 'Inclua frutas', `Apareceram em ${df} de ${comReg.length} dias registrados. Uma por dia já ajuda na fibra e nos micronutrientes.`, '');
  }

  // ----- Treino e descanso -----
  const forca = d14.filter(diaForca).length, ativos = d14.filter(diaAtivo).length;
  if (forca >= 6) add('bom', 1, '💪', 'Constância no treino de força', `${forca} treinos de força nos últimos 14 dias (cerca de ${fmt(forca / 2, 1)} por semana).`, '');
  else if (forca > 0 && forca < 4) add('dica', 3, '💪', 'Frequência de força baixa', `${forca} treinos de força em 14 dias. Em déficit calórico, 3 a 4 treinos por semana ajudam a proteger o músculo.`, '');
  else if (forca === 0 && S.atividades.length) add('ajustar', 2, '💪', 'Nenhum treino de força nos últimos 14 dias', 'O treino de força é o principal sinal para o corpo manter o músculo durante a perda de peso.', '');
  let streak = 0; for (let i = d14.length - 1; i >= 0 && diaAtivo(d14[i]); i--) streak++;
  const descansos = d14.filter((d) => !diaAtivo(d)).length;
  if (streak >= 6) add('parar', 1, '🛑', `Parar de treinar ${streak} dias seguidos sem descanso`, 'Reserve pelo menos 1 dia por semana sem musculação nem cardio longo. O músculo cresce e se preserva na recuperação, principalmente em déficit.', `sequência atual: ${streak} dias ativos`);
  else if (ativos >= 12 && descansos <= 2) add('ajustar', 2, '😴', 'Poucos dias de descanso', `${descansos} dia(s) sem atividade nos últimos 14. Planeje um dia livre por semana.`, '');

  // ----- Cargas dos treinos -----
  const h = historicoCargas(), li = addDias(t0, -60);
  let sobe = 0, desce = 0, igual = 0;
  Object.keys(h).forEach((n) => { const l = h[n].filter((x) => x.data >= li); if (l.length >= 2) { const u = l[l.length - 1], p = l[l.length - 2]; if (u.c > p.c) sobe++; else if (u.c < p.c) desce++; else igual++; } });
  if (sobe + desce + igual >= 3) {
    if (desce > sobe + igual) add('ajustar', 2, '🏋️', 'Cargas caindo em vários exercícios', `${desce} exercícios com carga menor que na vez anterior. Se a força cai junto com o peso, coma um pouco mais e durma melhor antes de reduzir o treino.`, '');
    else if (sobe >= 1) add('bom', 2, '🏋️', 'Cargas estáveis ou subindo', `${sobe} exercício(s) com mais carga e ${igual} igual(is) à vez anterior. Manter a força é o melhor sinal de que o músculo está sendo preservado.`, '');
  } else if (forca >= 4) add('dica', 3, '🏋️', 'Registre as cargas dos treinos', 'Anote carga e repetições dos exercícios A, B e C. Assim o app mostra se a força está se mantendo enquanto o peso cai.', 'em Atividade → Musculação');

  // ----- Composição corporal -----
  const L = corpoOrdenado();
  if (L.length >= 2) {
    const b = L[L.length - 1], lim2 = addDias(b.data, -27);
    const a = L.find((e) => e.data >= lim2 && e.data < b.data) || L[L.length - 2];
    const rot = `${dataCurta(a.data)} → ${dataCurta(b.data)}`;
    if (a.gk != null && b.gk != null) {
      const pa = pesoDoDia(a.data) || pesoEm(a.data), pb = pesoDoDia(b.data) || pesoEm(b.data), dP = pb - pa, dG = b.gk - a.gk;
      if (dP < -0.5 && dG < 0) {
        const lean = 1 - (-dG / -dP);
        if (lean > 0.35) add('ajustar', 1, '🧬', `${fmt(lean * 100)}% do peso perdido foi massa magra`, 'Quanto mais perto de 25% ou menos, melhor. Suba um pouco as calorias e a proteína, mantenha o treino de força e garanta descanso.', rot);
        else if (lean <= 0.25) add('bom', 1, '🧬', 'Quase toda a perda é gordura', `Só ${fmt(Math.max(0, lean) * 100)}% do peso perdido foi massa magra. Excelente: continue como está.`, rot);
        else add('dica', 2, '🧬', `${fmt((1 - lean) * 100)}% da perda foi gordura`, 'Bom resultado; dá para melhorar protegendo ainda mais a massa magra (proteína, treino de força e descanso).', rot);
      }
    }
    if (a.vis != null && b.vis != null && b.vis < a.vis) add('bom', 2, '🫀', 'Gordura visceral caindo', `De ${fmt(a.vis, 1)} para ${fmt(b.vis, 1)}. É a gordura mais ligada ao risco de saúde.`, rot);
    else if (a.vis != null && b.vis != null && b.vis > a.vis) add('ajustar', 2, '🫀', 'Gordura visceral subiu', `De ${fmt(a.vis, 1)} para ${fmt(b.vis, 1)}.`, rot);
    if (b.vis != null && b.vis >= 10) add('dica', 3, '🫀', 'Gordura visceral ainda acima do ideal', `Está em ${fmt(b.vis, 1)}; balanças costumam considerar saudável até cerca de 9.`, `medição de ${dataCurta(b.data)}`);
    if (a.me != null && b.me != null && b.me < a.me - 0.3) add('ajustar', 2, '💪', 'Músculo esquelético em queda', `De ${fmt(a.me, 1)} para ${fmt(b.me, 1)} kg no período. Atenção ao conjunto: proteína, calorias, descanso e cargas.`, rot);
    else if (a.me != null && b.me != null && b.me >= a.me - 0.3) add('bom', 2, '💪', 'Músculo esquelético preservado', `De ${fmt(a.me, 1)} para ${fmt(b.me, 1)} kg.`, rot);
    if (b.ag != null && b.ag < 55) add('dica', 3, '💧', 'Água corporal baixa na balança', `Está em ${fmt(b.ag, 1)}%. Beba água ao longo do dia (cerca de 35 ml por kg, salvo orientação médica diferente), principalmente se o apetite está reduzido.`, `medição de ${dataCurta(b.data)}`);
  } else {
    add('dica', 4, '🧬', 'Registre a composição corporal', 'Na aba Peso → Composição corporal, lance os números da balança toda semana para ver quanto da perda é gordura e quanto é músculo.', '');
  }

  // ----- Padrão da semana -----
  const dw = com(d28);
  if (dw.length >= 14) {
    const fds = dw.filter((d) => [0, 6].includes(parse(d).getDay())), util = dw.filter((d) => ![0, 6].includes(parse(d).getDay()));
    if (fds.length >= 4 && util.length >= 8) {
      const mf = media(fds.map((d) => T(d).kcal)), mu = media(util.map((d) => T(d).kcal));
      if (mf > mu + 300) add('dica', 3, '📅', 'Fim de semana come mais', `Sáb/dom: ${fmt(mf)} kcal em média, contra ${fmt(mu)} nos dias úteis (+${fmt(mf - mu)}). Planeje: reserve as calorias extras para a refeição que você mais aproveita, em vez de espalhar.`, 'últimos 28 dias');
    }
    // estabilidade semanal
    const sem = []; for (let i = 0; i + 7 <= d28.length; i += 7) { const ds = com(d28.slice(i, i + 7)); if (ds.length >= 5) sem.push(media(ds.map((d) => T(d).kcal))); }
    if (sem.length >= 3 && Math.max(...sem) - Math.min(...sem) < 350) add('bom', 2, '📊', 'Média semanal estável', `As 4 últimas semanas variaram de ${fmt(Math.min(...sem))} a ${fmt(Math.max(...sem))} kcal/dia. Dias fora da curva não estragam o resultado quando a semana se mantém.`, '');
  }

  // ----- Registro -----
  const nReg = d14.filter((d) => T(d).n > 0).length;
  if (nReg >= 13) add('bom', 3, '📲', 'Registro quase todo dia', `${nReg} dos últimos 14 dias com refeições lançadas.`, '');
  else if (nReg < 9) add('ajustar', 2, '📲', 'Registre mais dias', `Só ${nReg} dos últimos 14 dias têm refeições. Sem registro, a análise perde precisão.`, '');

  return out.sort((x, y) => x.prio - y.prio);
}
function telaDicas() {
  const L = dicasApp();
  const grupos = [
    ['bom', '✅ O que está indo bem', 'Mantenha'],
    ['ajustar', '⚠️ O que ajustar', 'Pequenas mudanças com grande efeito'],
    ['parar', '🛑 O que parar', 'Hábitos que estão atrapalhando'],
    ['dica', '💡 Dicas importantes', 'Para ir além'],
  ];
  const n = (k) => L.filter((x) => x.k === k).length;
  const cartao = (x) => `<div class="dc ${x.k}"><div class="dc-ic">${x.ic}</div><div><b>${esc(x.t)}</b><p>${esc(x.x)}</p>${x.d ? `<small>${esc(x.d)}</small>` : ''}</div></div>`;
  if (!L.length) return `<div class="card"><div class="empty"><b>Ainda sem dados suficientes</b>Registre refeições, atividades e pesagens por alguns dias para receber dicas personalizadas.</div></div>`;
  return `
  <div class="card dc-res">
    <div class="card-h"><h3>Análise dos seus registros</h3><span class="sub">últimos 14–28 dias</span></div>
    <div class="dc-cont"><div class="dc-n bom"><b>${n('bom')}</b><small>indo bem</small></div><div class="dc-n ajustar"><b>${n('ajustar')}</b><small>ajustar</small></div><div class="dc-n parar"><b>${n('parar')}</b><small>parar</small></div><div class="dc-n dica"><b>${n('dica')}</b><small>dicas</small></div></div>
    <div class="hint">Gerada automaticamente a partir do que você registrou (alimentação, treinos, peso e balança), sem enviar nada para fora do app.</div>
  </div>
  ${grupos.map(([k, tit, sub]) => {
    const xs = L.filter((x) => x.k === k);
    return xs.length ? `<div class="section-title">${tit} <small style="opacity:.6;font-weight:500;text-transform:none">· ${sub}</small></div>${xs.map(cartao).join('')}` : '';
  }).join('')}
  <p class="hint" style="text-align:center;margin-top:14px">Dicas automáticas, baseadas em regras gerais. Não substituem a orientação de médico ou nutricionista, principalmente se você usa medicação para emagrecer.</p>`;
}


// ---------- Frequência de treino (calendário do mês) ----------
// dia → { letras: ['A'…], muscu: bool, outro: bool }
function diasTreinados() {
  const m = {};
  for (const a of S.atividades) {
    const d = m[a.data] || (m[a.data] = { letras: [], muscu: false, outro: false });
    if (a.tipo === 'Musculação') {
      d.muscu = true;
      const l = /^Treino ([ABC])$/.exec(a.intensidade || ''); if (l) d.letras.push(l[1]);
    } else if (a.tipo === 'Planilha') {
      if (num(a.kcal) > 0 && !/^Descanso/i.test(a.obs || '')) {
        const l = /Treino\s*([ABC])/i.exec(a.obs || '');
        if (l) { d.muscu = true; d.letras.push(l[1].toUpperCase()); } else d.outro = true;
      }
    } else d.outro = true;
  }
  return m;
}
function cardFrequencia(t0) {
  const ym = ui.freqMes || t0.slice(0, 7);
  const [y, mo] = ym.split('-').map(Number);
  const mapa = diasTreinados();
  const primeiro = new Date(y, mo - 1, 1), nDiasMes = new Date(y, mo, 0).getDate();
  const offset = (primeiro.getDay() + 6) % 7;
  let nMuscu = 0, nAtivos = 0;
  const cel = [];
  for (let i = 0; i < offset; i++) cel.push('<span class="fq-v"></span>');
  for (let d = 1; d <= nDiasMes; d++) {
    const s = `${y}-${pad(mo)}-${pad(d)}`, x = mapa[s];
    if (x && x.muscu) nMuscu++;
    if (x && (x.muscu || x.outro)) nAtivos++;
    const cls = x && x.muscu ? 'm' : x && x.outro ? 'o' : '';
    cel.push(`<span class="fq-d ${cls} ${s === t0 ? 'hoje' : ''} ${s > t0 ? 'fut' : ''}"><i>${d}</i>${x && x.letras.length ? `<b>${[...new Set(x.letras)].join('')}</b>` : cls === 'm' ? '<b>●</b>' : cls === 'o' ? '<b>·</b>' : ''}</span>`);
  }
  // há quantos dias o último treino de musculação (em todo o histórico)
  const dm = Object.keys(mapa).filter((s) => mapa[s].muscu && s <= t0).sort();
  const ult = dm[dm.length - 1];
  const dias = ult ? Math.round((parse(t0) - parse(ult)) / 864e5) : null;
  let aviso = '';
  if (dias == null) aviso = 'Nenhum treino de musculação registrado ainda.';
  else if (dias >= 4) aviso = `<span class="s-warn">⚠️ Faz ${dias} dias que você não treina musculação (último: ${dataCurta(ult)}).</span>`;
  else aviso = dias === 0 ? 'Treinou hoje 💪' : `Último treino de musculação: ${dias === 1 ? 'ontem' : 'há ' + dias + ' dias'}.`;
  const mesAtual = ym === t0.slice(0, 7);
  const passados = mesAtual ? Number(t0.slice(8)) : nDiasMes;
  const porSem = passados ? (nMuscu / passados * 7) : 0;
  return `<div class="card">
    <div class="card-h"><h3>Frequência de treino</h3><span class="sub">${MESES[mo - 1]} ${y}</span></div>
    <div class="datenav" style="margin:0 0 8px">
      <button class="iconbtn" data-action="freq-mes" data-n="-1" aria-label="Mês anterior">${ICON.left}</button>
      <div class="lbl"><b>${nMuscu} treino${nMuscu === 1 ? '' : 's'} de musculação</b><small>${nAtivos} dia${nAtivos === 1 ? '' : 's'} ativo${nAtivos === 1 ? '' : 's'} · média ${fmt(porSem, 1)}/semana</small></div>
      <button class="iconbtn" data-action="freq-mes" data-n="1" ${mesAtual ? 'disabled' : ''} aria-label="Próximo mês">${ICON.right}</button>
    </div>
    <div class="fq-grid">${['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((x) => `<span class="fq-h">${x}</span>`).join('')}${cel.join('')}</div>
    <div class="hint" style="margin-top:8px">Letra = treino A/B/C · ● musculação · · outra atividade. ${aviso}</div>
  </div>`;
}

// ---------- Evolução das cargas por exercício ----------
function cardCargas() {
  const h = historicoCargas();
  const grupos = Object.keys(TREINOS).map((k) => {
    const lin = TREINOS[k].exercicios.filter((e) => h[e.n]).map((e) => {
      const l = h[e.n], u = l[l.length - 1], p = l.length > 1 ? l[l.length - 2] : null;
      const dif = p ? u.c - p.c : 0;
      const trilha = l.slice(-5).map((x) => fmt(x.c, x.c % 1 ? 1 : 0)).join(' → ');
      return `<div class="cg-l"><div><b>${esc(e.n)}</b><small>${trilha}${l.length > 5 ? ' (últimas 5)' : ''}</small></div>
        <span class="num">${fmt(u.c, u.c % 1 ? 1 : 0)} kg${u.r ? ' × ' + u.r : ''}${p ? `<small class="${dif > 0 ? 's-good' : dif < 0 ? 's-warn' : ''}">${dif > 0 ? '▲ +' + fmt(dif, 1) : dif < 0 ? '▼ ' + fmt(dif, 1) : '= igual'}</small>` : ''}</span></div>`;
    }).join('');
    return lin ? `<details class="cg-g"><summary>Treino ${k} <small>${TREINOS[k].grupos}</small></summary>${lin}</details>` : '';
  }).join('');
  return `<div class="card">
    <div class="card-h"><h3>Evolução das cargas</h3><span class="sub">por exercício</span></div>
    ${grupos || '<div class="empty">Registre os treinos A/B/C com carga e repetições para acompanhar a evolução aqui.</div>'}
  </div>`;
}
const ICO_MOVE ='<svg viewBox="0 0 24 24"><path d="M3 12h3l3-7 4 14 3-7h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function telaSemana() {
  const sub = `<div class="seg" style="margin-bottom:14px">${[['semana', '📊 Semana'], ['dicas', '💡 Dicas']].map(([k, r]) => `<button class="${(ui.semSub || 'semana') === k ? 'on' : ''}" data-action="sem-sub" data-v="${k}">${r}</button>`).join('')}</div>`;
  if (ui.semSub === 'dicas') return sub + telaDicas();
  const ini = inicioSemana(ui.semanaRef), fim = addDias(ini, 6);
  const dias = Array.from({ length: 7 }, (_, i) => addDias(ini, i));
  const t0 = hoje();
  const tot = dias.map(totaisDia), gas = dias.map(gastoDia);
  const metas = dias.map((d) => metasDia(d));
  const comDados = dias.map((d, i) => tot[i].n > 0);
  const nDias = comDados.filter(Boolean).length;
  // calorias: média dos dias com registro; macros: só dos dias que têm macros
  const comMac = tot.map((t) => t.comMacros);
  const nMac = comMac.filter(Boolean).length;
  const media = {};
  for (const m of MACROS) {
    const usa = m.k === 'kcal' ? comDados : comMac, n = m.k === 'kcal' ? nDias : nMac;
    media[m.k] = n ? tot.reduce((s, t, i) => s + (usa[i] ? t[m.k] : 0), 0) / n : 0;
  }
  const metaMedia = mediaMetas(nDias ? metas.filter((_, i) => comDados[i]) : metas);
  const diasNaMeta = dias.filter((d, i) => comDados[i] && avaliar(metas[i].kcal, tot[i].kcal) === 'good').length;
  // balanço da semana (dias com registro): gasto − consumo
  const deficitSem = metas.reduce((s, M, i) => s + (comDados[i] && M.auto ? M.gasto - tot[i].kcal : 0), 0);
  const minTot = gas.reduce((s, g) => s + g.min, 0), kcalAtv = gas.reduce((s, g) => s + g.kcal, 0), kmTot = gas.reduce((s, g) => s + g.km, 0);
  const diasAtivos = gas.filter((g) => g.min > 0 || g.kcal > 0).length;

  // A pesagem de segunda-feira fecha a semana anterior: a semana seg–dom é medida
  // da pesagem da própria segunda (início) até a pesagem da segunda seguinte (fechamento).
  const fechaAte = addDias(fim, 1);
  const pesosSem = pesosOrdenados().filter((p) => p.data > ini && p.data <= fechaAte);
  const pesosAntes = pesosOrdenados().filter((p) => p.data <= ini);
  let varPeso = null;
  if (pesosSem.length) {
    const base = pesosAntes.length ? num(pesosAntes[pesosAntes.length - 1].peso) : num(pesosSem[0].peso);
    varPeso = num(pesosSem[pesosSem.length - 1].peso) - base;
  }
  const ehAtual = ini === inicioSemana(t0);

  const metaK = metaMedia.kcal.alvo;
  const grafico = graficoSemana(dias, tot, metas, comDados, comMac, t0);

  // calorias em % da meta do dia; macros em gramas, coloridos conforme a faixa
  const cel = (m, v, meta, tem, mac) => {
    if (!tem || (m.k !== 'kcal' && !mac)) return `<td class="h-none">—</td>`;
    const st = avaliar(meta, v);
    // % de atingimento: calorias e carboidrato sobre o alvo/referência do dia, faixas sobre o meio da faixa, fibra sobre o mínimo
    const ref = meta.tipo === 'min' ? (meta.min || meta.alvo) : meta.alvo;
    const txt = ui.heatModo === 'pct' && ref ? fmt(v / ref * 100) + '%' : fmt(v);
    return `<td class="h-${st} num">${txt}</td>`;
  };

  return `
  ${sub}
  <div class="datenav">
    <button class="iconbtn" data-action="semana" data-n="-7" aria-label="Semana anterior">${ICON.left}</button>
    <div class="lbl">
      <button class="cal-btn" data-action="abrir-cal" data-alvo="semana" aria-label="Escolher semana"><b>${dataCurta(ini)} – ${dataCurta(fim)} ${ICON.cal}</b></button>
      <small>${ehAtual ? 'Esta semana' : `<button class="link" data-action="semana-atual">Ir para esta semana</button>`}</small>
    </div>
    <button class="iconbtn" data-action="semana" data-n="7" ${ehAtual ? 'disabled' : ''} aria-label="Próxima semana">${ICON.right}</button>
  </div>

  ${resumoSemana({ ini, fim, t0, nDias, media, metaK, metaMedia, deficitSem, diasNaMeta, minTot, kcalAtv, kmTot, diasAtivos, varPeso, pesosSem, pesosAntes, fechaAte })}

  <div class="card chart">
    <div class="seg seg-scroll" style="margin-bottom:14px">${GRAF_OPCOES.map(([k, rot]) => `<button class="${ui.grafSem === k ? 'on' : ''}" data-action="graf-sem" data-v="${k}">${rot}</button>`).join('')}</div>
    ${grafico}
  </div>

  ${resumoAtividades(dias, t0)}

  ${cardFrequencia(t0)}

  ${cardCargas()}

  <div class="card">
    <div class="card-h"><h3>Média diária × Meta</h3><span class="sub">dias com registro</span></div>
    ${nDias && nMac < nDias ? `<div class="hint" style="margin:-4px 0 10px">${nMac ? `Macros: média de ${nMac} dia${nMac === 1 ? '' : 's'} com detalhamento.` : 'Esta semana veio da planilha só com calorias; os macros não foram registrados.'}</div>` : ''}
    <div class="macros">${MACROS.filter((m) => m.k === 'kcal' || nMac || !nDias).map((m) => macroBar(m, media[m.k], metaMedia[m.k])).join('')}</div>
  </div>

  <div class="card">
    <div class="card-h"><h3>Aderência dia a dia</h3>
      <div class="seg" style="width:150px">${[['abs', 'Valor'], ['pct', '% meta']].map(([k, r]) => `<button class="${ui.heatModo === k ? 'on' : ''}" data-action="heat-modo" data-v="${k}">${r}</button>`).join('')}</div>
    </div>
    <table class="heat">
      <thead><tr><th></th>${ui.heatModo === 'pct'
        ? '<th>Kcal</th><th>Prot</th><th>Carb</th><th>Gord</th><th>Fibra</th>'
        : '<th>Kcal</th><th>Prot g</th><th>Carb g</th><th>Gord g</th><th>Fibra g</th>'}</tr></thead>
      <tbody>${dias.map((d, i) => `<tr>
        <td><button class="link" style="color:var(--text);font-weight:${d === t0 ? 800 : 600}" data-action="abrir-dia" data-d="${d}">${DIAS_CURTO[parse(d).getDay()]} ${parse(d).getDate()}</button></td>
        ${MACROS.map((m) => cel(m, tot[i][m.k], metas[i][m.k], comDados[i], comMac[i])).join('')}
      </tr>`).join('')}</tbody>
    </table>
    <div class="hint">${ui.heatModo === 'pct' ? 'Em %: calorias e carboidrato sobre a meta do dia; proteína e gordura sobre o meio da faixa; fibra sobre o mínimo. ' : ''}${metaMedia.auto
      ? `Calorias: verde entre 90% e 110% da meta do dia (gasto − ${fmt(S.config.deficit)}). Proteína ${rotuloMeta(MACROS[1], metaMedia.prot)} e gordura ${rotuloMeta(MACROS[3], metaMedia.gord)}: verde dentro da faixa. Fibra: verde a partir de ${fmt(metaMedia.fibra.min)} g. Carboidrato livre.`
      : 'Calorias, carboidrato e gordura: verde entre 90% e 110% da meta. Proteína e fibras: verde a partir da meta.'}</div>
  </div>`;
}

// ---------- Card de jornada do peso (topo da aba Peso) ----------
function jornadaPeso(todos, r) {
  if (!todos.length) return `<div class="card"><div class="empty"><b>Nenhuma pesagem ainda</b>Registre seu primeiro peso.</div><button class="btn" data-action="novo-peso">+ Registrar peso</button></div>`;
  const ult = todos[todos.length - 1], prim = todos[0];
  const perdido = r.inicial - r.atual;
  const semanas = Math.max(1, Math.round((parse(ult.data) - parse(prim.data)) / (7 * 864e5)));
  const linhas = [];

  // barra da jornada: início → meta
  let barra = '';
  if (r.meta && r.inicial > r.meta) {
    const pct = Math.max(0, Math.min(1, (r.inicial - r.atual) / (r.inicial - r.meta)));
    barra = `<div class="jornada">
      <div class="jornada-bar"><span style="width:${pct * 100}%"></span><i style="left:${pct * 100}%"></i></div>
      <div class="jornada-leg num"><span>Início<b>${fmt(r.inicial, 1)}</b></span><span class="meio">${fmt(pct * 100)}% do caminho</span><span style="text-align:right">Meta<b>${fmt(r.meta, 1)}</b></span></div>
    </div>`;
  }

  linhas.push(`<div><span>📉 Já perdeu<small>em ${semanas} semanas · média de ${fmt(perdido / semanas, 1)} kg/semana</small></span><strong class="num ${perdido >= 0 ? 's-good' : 's-warn'}">${perdido >= 0 ? '−' : '+'}${fmt(Math.abs(perdido), 1)} kg</strong></div>`);

  if (r.meta) {
    const falta = r.atual - r.meta;
    // previsão pelo ritmo das últimas ~4 semanas
    const desde = addDias(ult.data, -28);
    const janela = todos.filter((p) => p.data >= desde);
    const p0 = janela.length > 1 ? janela[0] : todos[Math.max(0, todos.length - 2)];
    const sem = Math.max(1, (parse(ult.data) - parse(p0.data)) / (7 * 864e5));
    const ritmo = (num(p0.peso) - r.atual) / sem; // kg perdidos por semana
    let prev = '';
    if (falta > 0 && ritmo > 0.05) {
      const semFalta = Math.ceil(falta / ritmo);
      prev = `no ritmo atual (${fmt(ritmo, 1)} kg/sem), ~${semFalta} semana${semFalta === 1 ? '' : 's'} · por volta de ${dataCurta(addDias(ult.data, semFalta * 7))}`;
      // segunda estimativa: pelo déficit planejado (7.700 kcal ≈ 1 kg)
      const defPlan = num(S.config.deficit);
      if (defPlan > 0) {
        const kgSem = defPlan * 7 / 7700, semPlan = Math.ceil(falta / kgSem);
        prev += `<br>pelo déficit planejado (${fmt(kgSem, 2)} kg/sem), ~${semPlan} semana${semPlan === 1 ? '' : 's'} · por volta de ${dataCurta(addDias(ult.data, semPlan * 7))}`;
      }
    } else if (falta <= 0) prev = 'meta atingida 🎉';
    linhas.push(`<div><span>🎯 Falta para a meta<small>${prev || `meta de ${fmt(r.meta, 1)} kg`}</small></span><strong class="num">${falta > 0 ? fmt(falta, 1) + ' kg' : '✓'}</strong></div>`);
  } else {
    linhas.push(`<div><span>🎯 Meta de peso<small>defina em Ajustes</small></span><strong class="num">—</strong></div>`);
  }

  if (r.imc) {
    const cat = r.imc < 18.5 ? 'abaixo do peso' : r.imc < 25 ? 'peso normal' : r.imc < 30 ? 'sobrepeso' : 'obesidade';
    const pesoImc = r.imcMeta && r.alt ? r.imcMeta * Math.pow(r.alt / 100, 2) : 0;
    const sub = r.imcMeta
      ? (r.imc <= r.imcMeta ? `meta de IMC ${fmt(r.imcMeta, 1)} atingida ✓` : `${cat} · IMC ${fmt(r.imcMeta, 1)} em ${fmt(pesoImc, 1)} kg (faltam ${fmt(r.atual - pesoImc, 1)} kg)`)
      : cat;
    linhas.push(`<div><span>⚖️ IMC<small>${sub}</small></span><strong class="num ${r.imcMeta && r.imc <= r.imcMeta ? 's-good' : ''}">${fmt(r.imc, 1)}</strong></div>`);
  } else {
    linhas.push(`<div><span>⚖️ IMC<small>informe a altura em Ajustes</small></span><strong class="num">—</strong></div>`);
  }

  return `<div class="card">
    <div class="peso-topo">
      <button class="pill-add" data-action="novo-peso">+ Registrar</button>
      <div><small>Peso atual</small><b class="num">${fmt(r.atual, 1)}<span> kg</span></b><small>pesagem de ${rotuloDia(ult.data).toLowerCase()}${rotuloDia(ult.data).includes(',') ? '' : ', ' + dataCurta(ult.data)}</small></div>
    </div>
    ${barra}
    <div class="hero-stats resumo-sem">${linhas.join('')}</div>
  </div>`;
}

// ---------- Cascata do peso: início → perda de cada pesagem → peso atual ----------
function cascataPeso(todos) {
  if (todos.length < 2) return '';
  const porMes = ui.cascataModo === 'mes';
  const todosPs = todos.map((p) => ({ data: p.data, peso: num(p.peso) }));
  const ini = todosPs[0], fim = todosPs[todosPs.length - 1];
  // por semana: cada pesagem; por mês: a última pesagem de cada mês
  let ps = todosPs;
  if (porMes) {
    const ultimos = {};
    for (const p of todosPs) ultimos[p.data.slice(0, 7)] = p;
    ps = [ini, ...Object.values(ultimos).filter((p) => p !== ini)];
  }
  const passos = ps.slice(1).map((p, i) => ({ ...p, ant: ps[i].peso, dif: p.peso - ps[i].peso, acum: p.peso - ini.peso, semanas: Math.round((parse(p.data) - parse(ps[i].data)) / (7 * 864e5)) }));
  const totalSem = Math.max(1, Math.round((parse(fim.data) - parse(ini.data)) / (7 * 864e5)));
  const perda = fim.peso - ini.peso;

  // eixo começa um pouco abaixo do menor peso (senão as barras de início/fim engoliriam os degraus)
  const vMin = Math.floor(Math.min(...ps.map((p) => p.peso)) - 3), vMax = Math.ceil(Math.max(...ps.map((p) => p.peso)) + 1);
  // por semana: largura fixa por barra (arrasta para o lado); por mês: as barras se distribuem na largura do card
  const pl = 30, pr = 10, pt = 24, pb = 34, H = porMes ? 260 : 320;
  const n = passos.length + 2;
  const W = porMes ? 360 : pl + n * 38 + pr;
  const step = porMes ? (W - pl - pr) / n : 38;
  const bw = porMes ? Math.min(40, step * 0.62) : 26;
  const y = (v) => pt + (H - pt - pb) * (1 - (v - vMin) / (vMax - vMin));
  const xb = (i) => pl + i * step + (step - bw) / 2;
  const dm = (d) => { const x = parse(d); return `${pad(x.getDate())}/${pad(x.getMonth() + 1)}`; };
  const rotulo = (d) => porMes ? MESES[parse(d).getMonth()] : dm(d);
  let g = '';
  // grade
  for (let v = Math.ceil(vMin / 5) * 5; v <= vMax; v += 5) g += `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${pl - 5}" y="${y(v) + 3.5}" text-anchor="end">${v}</text>`;
  // barras de início e atual (do eixo até o peso)
  const total = (i, v, rot, data) => `<rect x="${xb(i)}" y="${y(v)}" width="${bw}" height="${y(vMin) - y(v)}" rx="5" fill="${COR_BASE}"/>
    <text x="${xb(i) + bw / 2}" y="${y(v) - 6}" text-anchor="middle" style="font-weight:700;fill:var(--text)">${fmt(v, 1)}</text>
    <text x="${xb(i) + bw / 2}" y="${H - 18}" text-anchor="middle" style="font-weight:700;fill:var(--text)">${rot}</text>
    <text x="${xb(i) + bw / 2}" y="${H - 6}" text-anchor="middle">${data}</text>`;
  g += total(0, ini.peso, 'Início', porMes ? rotulo(ini.data) : dm(ini.data));
  passos.forEach((p, k) => {
    const i = k + 1, topo = Math.max(p.ant, p.peso), base = Math.min(p.ant, p.peso), cx = xb(i) + bw / 2;
    const cor = p.dif < 0 ? 'var(--good)' : p.dif > 0 ? 'var(--bad)' : 'var(--muted)';
    // ligação tracejada do degrau anterior
    g += `<line x1="${xb(i) - (step - bw)}" x2="${xb(i)}" y1="${y(p.ant)}" y2="${y(p.ant)}" stroke="var(--muted)" stroke-dasharray="2 2"/>`;
    g += `<rect x="${xb(i)}" y="${y(topo)}" width="${bw}" height="${Math.max(2, y(base) - y(topo))}" rx="4" fill="${cor}"/>`;
    // em cima: quanto perdeu nesse degrau · embaixo: o peso atingido
    g += `<text x="${cx}" y="${y(topo) - 5}" text-anchor="middle" style="font-size:9.5px;font-weight:700;fill:${cor}">${p.dif > 0 ? '+' : ''}${fmt(p.dif, 1)}</text>`;
    g += `<text x="${cx}" y="${y(base) + 12}" text-anchor="middle" style="font-size:9.5px;font-weight:600;fill:var(--text)">${fmt(p.peso, 1)}</text>`;
    if (!porMes && p.semanas > 1) g += `<text x="${cx}" y="${y(base) + 23}" text-anchor="middle" style="font-size:8px">${p.semanas} sem</text>`;
    // rodapé: data (ou mês) e a perda acumulada desde o início
    g += `<text x="${cx}" y="${H - 18}" text-anchor="middle" style="font-size:9.5px">${rotulo(p.data)}</text>`;
    g += `<text x="${cx}" y="${H - 6}" text-anchor="middle" style="font-size:9px;font-weight:700;fill:var(--brand)">${fmt(p.acum, 1)}</text>`;
  });
  const iFim = n - 1;
  g += `<line x1="${xb(iFim) - (step - bw)}" x2="${xb(iFim)}" y1="${y(fim.peso)}" y2="${y(fim.peso)}" stroke="var(--muted)" stroke-dasharray="2 2"/>`;
  g += total(iFim, fim.peso, 'Atual', dm(fim.data)).replace(COR_BASE, 'var(--brand)');

  const quedas = passos.filter((p) => p.dif < 0).length, altas = passos.filter((p) => p.dif > 0).length;
  const melhor = passos.reduce((a, b) => (b.dif < a.dif ? b : a));
  const nMeses = passos.length;
  const resumo = porMes
    ? `Média de <b>${fmt(perda / nMeses, 1)} kg por mês</b> · melhor mês: ${MESES[parse(melhor.data).getMonth()]} (${fmt(melhor.dif, 1)} kg). Cada degrau compara a última pesagem do mês com a do mês anterior.`
    : `Média de <b>${fmt(perda / totalSem, 2)} kg por semana</b> · ${quedas} pesage${quedas === 1 ? 'm' : 'ns'} com queda${altas ? `, ${altas} com alta` : ''} · maior queda ${fmt(melhor.dif, 1)} kg em ${dm(melhor.data)}. Arraste para o lado para ver tudo.`;
  return `<div class="card chart">
    <div class="card-h"><h3>Perda por ${porMes ? 'mês' : 'semana'}</h3>
      <div class="seg" style="width:150px">${[['semana', 'Semana'], ['mes', 'Mês']].map(([k, r]) => `<button class="${(ui.cascataModo || 'mes') === k ? 'on' : ''}" data-action="cascata-modo" data-v="${k}">${r}</button>`).join('')}</div>
    </div>
    <div class="hint" style="margin:-4px 0 8px">${fmt(perda, 1)} kg em ${totalSem} semanas · em cima de cada degrau, quanto perdeu; embaixo, o peso atingido; no rodapé, o total perdido até ali (roxo).</div>
    <div class="cascata ${porMes ? 'cascata-fit' : ''}"><svg viewBox="0 0 ${W} ${H}" ${porMes ? '' : `width="${W}" height="${H}"`}>${g}</svg></div>
    <div class="legend"><span><i style="background:${COR_BASE}"></i>Início</span><span><i style="background:var(--good)"></i>Perdeu</span><span><i style="background:var(--bad)"></i>Ganhou</span><span><i style="background:var(--brand)"></i>Atual</span></div>
    <div class="hint">${resumo} O eixo começa em ${vMin} kg.</div>
  </div>`;
}

function telaPeso() {
  const sub = `<div class="seg" style="margin-bottom:14px">${[['peso', '⚖️ Peso'], ['corpo', '🧬 Composição corporal']].map(([k, r]) => `<button class="${(ui.pesoSub || 'peso') === k ? 'on' : ''}" data-action="peso-sub" data-v="${k}">${r}</button>`).join('')}</div>`;
  if (ui.pesoSub === 'corpo') return sub + telaCorpo();
  const todos = pesosOrdenados();
  const cfg = S.config;
  const atual = todos.length ? num(todos[todos.length - 1].peso) : 0;
  const inicial = todos.length ? num(todos[0].peso) : 0;
  const meta = num(cfg.pesoMeta), alt = num(cfg.altura), imcMeta = num(cfg.imcMeta);
  const imc = atual && alt ? atual / Math.pow(alt / 100, 2) : 0;

  let lista = todos;
  if (ui.pesoRange !== 'all') { const lim = addDias(hoje(), -Number(ui.pesoRange)); lista = todos.filter((p) => p.data >= lim); }

  let chart = `<div class="empty"><b>Sem registros no período</b>Registre uma pesagem pelo botão acima.</div>`;
  if (lista.length) {
    const W = 340, H = 190, pl = 34, pr = 10, pt = 12, pb = 24;
    const xs = lista.map((p) => parse(p.data).getTime());
    const vs = lista.map((p) => num(p.peso));
    let mn = Math.min(...vs, meta || Infinity), mx = Math.max(...vs, meta || -Infinity);
    if (mx - mn < 2) { mn -= 1; mx += 1; }
    const padV = (mx - mn) * 0.12; mn -= padV; mx += padV;
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const X = (t) => x1 === x0 ? (pl + (W - pl - pr) / 2) : pl + (W - pl - pr) * (t - x0) / (x1 - x0);
    const Y = (v) => pt + (H - pt - pb) * (1 - (v - mn) / (mx - mn));
    const pts = lista.map((p, i) => [X(xs[i]), Y(vs[i])]);
    const path = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const area = path + ` L${pts[pts.length - 1][0].toFixed(1)} ${H - pb} L${pts[0][0].toFixed(1)} ${H - pb} Z`;
    const ticks = [0, 1, 2, 3].map((i) => mn + (mx - mn) * i / 3);
    const xl = lista.length > 1 ? [lista[0], lista[lista.length - 1]] : [lista[0]];
    chart = `<svg viewBox="0 0 ${W} ${H}">
      <defs><linearGradient id="gp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--brand)" stop-opacity=".28"/><stop offset="1" stop-color="var(--brand)" stop-opacity="0"/></linearGradient></defs>
      ${ticks.map((v) => `<line x1="${pl}" x2="${W - pr}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${pl - 6}" y="${Y(v) + 3.5}" text-anchor="end">${fmt(v, 1)}</text>`).join('')}
      ${meta ? `<line x1="${pl}" x2="${W - pr}" y1="${Y(meta)}" y2="${Y(meta)}" stroke="var(--good)" stroke-dasharray="5 4" stroke-width="1.5"/><text x="${W - pr}" y="${Y(meta) - 5}" text-anchor="end" style="fill:var(--good);font-weight:700">meta ${fmt(meta, 1)}</text>` : ''}
      ${lista.length > 1 ? `<path d="${area}" fill="url(#gp)"/><path d="${path}" fill="none" stroke="var(--brand)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
      ${pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${i === pts.length - 1 ? 5 : 3}" fill="var(--surface)" stroke="var(--brand)" stroke-width="2.2"/>`).join('')}
      ${xl.map((p, i) => `<text x="${X(parse(p.data).getTime())}" y="${H - 6}" text-anchor="${xl.length > 1 ? (i ? 'end' : 'start') : 'middle'}">${dataCurta(p.data)}</text>`).join('')}
    </svg>`;
  }

  const desc = [...todos].reverse();
  return `
  ${sub}
  ${jornadaPeso(todos, { atual, inicial, meta, alt, imc, imcMeta })}


  <div class="card chart">
    <div class="card-h"><h3>Evolução</h3>
      <div class="seg" style="width:190px">${[['30', '30d'], ['90', '90d'], ['all', 'Tudo']].map(([v, l]) => `<button class="${ui.pesoRange === v ? 'on' : ''}" data-action="peso-range" data-v="${v}">${l}</button>`).join('')}</div>
    </div>
    ${chart}
  </div>

  ${cascataPeso(todos)}

  <div class="section-title">Histórico</div>
  <div class="card">
    ${desc.length ? desc.map((p, i) => {
      const ant = desc[i + 1];
      const dif = ant ? num(p.peso) - num(ant.peso) : null;
      return `<div class="item">
        <div class="ico">⚖️</div>
        <div class="body"><b class="num">${fmt(p.peso, 1)} kg</b><small>${rotuloDia(p.data)}${p.obs ? ' · ' + esc(p.obs) : ''}</small></div>
        <div class="right num" style="color:${dif == null ? 'var(--muted)' : dif <= 0 ? 'var(--good)' : 'var(--warn)'}">${dif == null ? '' : (dif > 0 ? '+' : '') + fmt(dif, 1)}</div>
        <button class="del" data-action="del" data-tipo="peso" data-id="${esc(p.id)}" aria-label="Excluir">${ICON.x}</button>
      </div>`;
    }).join('') : `<div class="empty">Nenhuma pesagem ainda.</div>`}
  </div>`;
}

// ---------- Composição corporal (balança de bioimpedância) ----------
// Guardada na aba Config da planilha (chave "corpo", JSON { "aaaa-mm-dd": { gp: 24.1, … } }), então sincroniza sem mudar o Apps Script.
// bom: +1 = subir é bom, −1 = descer é bom, 0 = neutro. A ordem daqui é também a ordem da importação.
const CORPO = [
  { k: 'gp',  rot: 'Gordura corporal',     un: '%',    dec: 1, bom: -1 },
  { k: 'gk',  rot: 'Peso da gordura',      un: 'kg',   dec: 1, bom: -1 },
  { k: 'mm',  rot: 'Massa muscular',       un: 'kg',   dec: 1, bom: 1 },
  { k: 'mmp', rot: 'Massa muscular',       un: '%',    dec: 1, bom: 1 },
  { k: 'me',  rot: 'Músculo esquelético',  un: 'kg',   dec: 1, bom: 1 },
  { k: 'mep', rot: 'Músculo esquelético',  un: '%',    dec: 1, bom: 1 },
  { k: 'lbm', rot: 'Massa magra',          un: 'kg',  dec: 1, bom: 1 },
  { k: 'ag',  rot: 'Água',                 un: '%',    dec: 1, bom: 0 },
  { k: 'vis', rot: 'Gordura visceral',     un: '',     dec: 1, bom: -1 },
  { k: 'tmb', rot: 'Metabolismo basal',    un: 'kcal', dec: 0, bom: 1 },
  { k: 'im',  rot: 'Idade metabólica',     un: 'anos', dec: 0, bom: -1 },
  { k: 'pr',  rot: 'Proteína',             un: '%',    dec: 1, bom: 1 },
  { k: 'os',  rot: 'Ossos',                un: 'kg',   dec: 2, bom: 0 },
];
const rotCorpo = (c) => c.rot + (c.un === '%' || c.un === 'kg' ? ` (${c.un})` : '');
function lerCorpo() { try { const o = JSON.parse(S.config.corpo || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch { return {}; } }
function gravarCorpo(o) { salvarConfig({ ...S.config, corpo: JSON.stringify(o) }); }
function corpoOrdenado() { const o = lerCorpo(); return Object.keys(o).sort().map((d) => ({ data: d, ...o[d] })); }
function pesoDoDia(data) { const p = S.peso.find((x) => x.data === data); return p ? num(p.peso) : 0; }

function linhaSvg(pts, dec) {
  if (!pts.length) return '<div class="empty">Sem medições desta métrica.</div>';
  const W = 340, H = 170, pl = 38, pr = 10, pt = 12, pb = 24;
  const xs = pts.map((p) => parse(p.data).getTime()), vs = pts.map((p) => p.v);
  let mn = Math.min(...vs), mx = Math.max(...vs);
  if (mx - mn < 0.0001) { mn -= 1; mx += 1; }
  const pv = (mx - mn) * 0.15; mn -= pv; mx += pv;
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const X = (t) => x1 === x0 ? (pl + (W - pl - pr) / 2) : pl + (W - pl - pr) * (t - x0) / (x1 - x0);
  const Y = (v) => pt + (H - pt - pb) * (1 - (v - mn) / (mx - mn));
  const P = pts.map((p, i) => [X(xs[i]), Y(vs[i])]);
  const path = P.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const ticks = [0, 1, 2].map((i) => mn + (mx - mn) * i / 2);
  const xl = pts.length > 1 ? [pts[0], pts[pts.length - 1]] : [pts[0]];
  return `<svg viewBox="0 0 ${W} ${H}">
    ${ticks.map((v) => `<line x1="${pl}" x2="${W - pr}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${pl - 6}" y="${Y(v) + 3.5}" text-anchor="end">${fmt(v, dec)}</text>`).join('')}
    ${pts.length > 1 ? `<path d="${path}" fill="none" stroke="var(--brand)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
    ${P.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${i === P.length - 1 ? 5 : 3}" fill="var(--surface)" stroke="var(--brand)" stroke-width="2.2"/>`).join('')}
    ${xl.map((p, i) => `<text x="${X(parse(p.data).getTime())}" y="${H - 6}" text-anchor="${xl.length > 1 ? (i ? 'end' : 'start') : 'middle'}">${dataCurta(p.data)}</text>`).join('')}
  </svg>`;
}
function deltaCorpo(c, d) {
  if (d == null) return '';
  const cls = !c.bom || Math.abs(d) < 1e-9 ? '' : (d * c.bom > 0 ? 's-good' : 's-warn');
  return `<small class="${cls}">${Math.abs(d) < 1e-9 ? '= igual' : (d > 0 ? '▲ +' : '▼ ') + fmt(d, c.dec)}</small>`;
}
// Período analisado: A → B (por atalho ou datas escolhidas) e as medições dentro dele
const CORPO_PER = [['ant', '2 últimas'], ['4', '4 sem'], ['8', '8 sem'], ['90', '3 meses'], ['tudo', 'Tudo']];
function janelaCorpo(L) {
  const n = L.length, last = L[n - 1].data, per = ui.corpoPer || 'ant';
  let A = L[0].data, B = last;
  if (per === 'custom' && ui.corpoA && ui.corpoB) {
    A = ui.corpoA < ui.corpoB ? ui.corpoA : ui.corpoB; B = ui.corpoA < ui.corpoB ? ui.corpoB : ui.corpoA;
  } else if (per === 'ant') A = L[Math.max(0, n - 2)].data;
  else if (per !== 'tudo') {
    const lim = addDias(last, -(per === '90' ? 90 : Number(per) * 7));
    const e = L.find((x) => x.data >= lim); A = e ? e.data : L[0].data;
    if (A === B && n > 1) A = L[n - 2].data;
  }
  return { A, B, LW: L.filter((e) => e.data >= A && e.data <= B) };
}
// Gráfico agrupado: indicadores parecidos no mesmo gráfico, cada um como variação % desde o início do período
const CORPO_GR = [
  ['gordura', 'Gordura', ['gp', 'gk', 'vis']],
  ['musculo', 'Músculo', ['mm', 'me', 'lbm']],
  ['metab', 'Metabolismo', ['tmb', 'im']],
  ['outros', 'Água e outros', ['ag', 'pr', 'os']],
];
const CORES_CORPO = ['#9b7bff', '#e0a23a', '#4cc38a', '#4aa8e8'];
function multiSvg(series) {
  const W = 340, H = 190, pl = 40, pr = 10, pt = 12, pb = 24;
  const todas = series.flatMap((s) => s.pts);
  const xs = todas.map((p) => parse(p.data).getTime());
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let mn = Math.min(0, ...todas.map((p) => p.pct)), mx = Math.max(0, ...todas.map((p) => p.pct));
  if (mx - mn < 1) { mn -= 0.5; mx += 0.5; }
  const pv = (mx - mn) * 0.12; mn -= pv; mx += pv;
  const X = (t) => x1 === x0 ? (pl + (W - pl - pr) / 2) : pl + (W - pl - pr) * (t - x0) / (x1 - x0);
  const Y = (v) => pt + (H - pt - pb) * (1 - (v - mn) / (mx - mn));
  const ticks = [mn + pv, 0, mx - pv].filter((v, i, a) => a.findIndex((u) => Math.abs(u - v) < (mx - mn) * 0.08) === i);
  const datas = [...new Set(todas.map((p) => p.data))].sort();
  const xl = datas.length > 1 ? [datas[0], datas[datas.length - 1]] : [datas[0]];
  return `<svg viewBox="0 0 ${W} ${H}">
    ${ticks.map((v) => `<line x1="${pl}" x2="${W - pr}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)" ${Math.abs(v) < 1e-9 ? 'stroke-dasharray="4 4" style="stroke:var(--muted)"' : ''}/><text x="${pl - 6}" y="${Y(v) + 3.5}" text-anchor="end">${v > 0.05 ? '+' : ''}${fmt(v, 1)}%</text>`).join('')}
    ${series.map((s) => {
      const P = s.pts.map((p) => [X(parse(p.data).getTime()), Y(p.pct)]);
      const path = P.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
      return `${P.length > 1 ? `<path d="${path}" fill="none" stroke="${s.cor}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>` : ''}${P.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${i === P.length - 1 ? 4.5 : 2.8}" fill="var(--surface)" stroke="${s.cor}" stroke-width="2"/>`).join('')}`;
    }).join('')}
    ${xl.map((d, i) => `<text x="${X(parse(d).getTime())}" y="${H - 6}" text-anchor="${xl.length > 1 ? (i ? 'end' : 'start') : 'middle'}">${dataCurta(d)}</text>`).join('')}
  </svg>`;
}
// mini gráfico de uma única medida, com a escala própria (modo "Valor")
function miniSvg(pts, dec, cor) {
  const W = 340, H = 104, pl = 40, pr = 10, pt = 8, pb = 20;
  const xs = pts.map((p) => parse(p.data).getTime()), vs = pts.map((p) => p.v);
  let mn = Math.min(...vs), mx = Math.max(...vs);
  if (mx - mn < 1e-6) { mn -= 1; mx += 1; }
  const pv = (mx - mn) * 0.18; mn -= pv; mx += pv;
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const X = (t) => x1 === x0 ? (pl + (W - pl - pr) / 2) : pl + (W - pl - pr) * (t - x0) / (x1 - x0);
  const Y = (v) => pt + (H - pt - pb) * (1 - (v - mn) / (mx - mn));
  const P = pts.map((p, i) => [X(xs[i]), Y(vs[i])]);
  const path = P.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const ticks = [mn + pv, mx - pv];
  return `<svg viewBox="0 0 ${W} ${H}">
    ${ticks.map((v) => `<line x1="${pl}" x2="${W - pr}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${pl - 6}" y="${Y(v) + 3.5}" text-anchor="end">${fmt(v, dec)}</text>`).join('')}
    ${P.length > 1 ? `<path d="${path}" fill="none" stroke="${cor}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
    ${P.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${i === P.length - 1 ? 4.5 : 2.6}" fill="var(--surface)" stroke="${cor}" stroke-width="2"/>`).join('')}
    <text x="${pl}" y="${H - 4}" text-anchor="start">${dataCurta(pts[0].data)}</text><text x="${W - pr}" y="${H - 4}" text-anchor="end">${dataCurta(pts[pts.length - 1].data)}</text>
  </svg>`;
}
const CORPO_MODOS = [['abs', 'Valor'], ['pct', '% desde o início'], ['var', 'Variação']];
function graficoCorpo(LW) {
  const gr = CORPO_GR.find((g) => g[0] === ui.corpoGrupo) || CORPO_GR[0];
  const modo = ui.corpoModo || 'pct';
  const chips = `<div class="seg seg-scroll" style="margin-bottom:10px">${CORPO_GR.map(([k, r]) => `<button class="${!ui.corpoMetrica && gr[0] === k ? 'on' : ''}" data-action="corpo-grupo" data-v="${k}">${r}</button>`).join('')}</div>
    <div class="seg" style="margin-bottom:12px">${CORPO_MODOS.map(([k, r]) => `<button class="${modo === k ? 'on' : ''}" data-action="corpo-modo" data-v="${k}">${r}</button>`).join('')}</div>`;
  const sub = { abs: 'valores reais', pct: 'variação % desde o início', var: 'variação em relação à medição anterior' }[modo];
  // um indicador isolado, com os valores reais
  const mk = ui.corpoMetrica && CORPO.find((c) => c.k === ui.corpoMetrica);
  if (mk) {
    const pts = LW.filter((e) => e[mk.k] != null).map((e) => ({ data: e.data, v: e[mk.k] }));
    return `<div class="card chart"><div class="card-h"><h3>Evolução</h3><span class="sub">${esc(rotCorpo(mk))}</span></div>${chips}
      ${linhaSvg(pts, mk.dec)}<div class="hint" style="margin-top:6px">Valores reais. Toque em um grupo acima para voltar a comparar vários.</div></div>`;
  }
  const series = gr[2].map((k, i) => {
    const c = CORPO.find((x) => x.k === k), xs = LW.filter((e) => e[k] != null);
    if (!xs.length) return null;
    const v0 = xs[0][k];
    const base = xs.map((e, j) => ({ data: e.data, v: e[k], pct: v0 ? (e[k] / v0 - 1) * 100 : 0, step: j ? (xs[j - 1][k] ? (e[k] / xs[j - 1][k] - 1) * 100 : 0) : null }));
    return { c, cor: CORES_CORPO[i % CORES_CORPO.length], a: v0, b: xs[xs.length - 1][k], pts: base };
  }).filter(Boolean);
  if (!series.length) return `<div class="card chart"><div class="card-h"><h3>Evolução</h3></div>${chips}<div class="empty">Sem medições deste grupo no período.</div></div>`;
  const cls = (c, d) => !c.bom || Math.abs(d) < 1e-9 ? '' : (d * c.bom > 0 ? 's-good' : 's-warn');
  const sgn = (v, d = 1) => (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v), d);
  let corpo = '', dica = '';
  if (modo === 'abs') {
    // cada indicador no seu próprio gráfico, na escala real
    corpo = series.map((s) => {
      const d = s.b - s.a, pct = s.a ? d / s.a * 100 : 0;
      return `<div class="cp-mini"><div class="cp-lg static"><i style="background:${s.cor}"></i><span>${esc(rotCorpo(s.c))}</span><b class="num">${fmt(s.a, s.c.dec)} → ${fmt(s.b, s.c.dec)}</b><em class="${cls(s.c, d)}">${sgn(pct)}%</em></div>${miniSvg(s.pts, s.c.dec, s.cor)}</div>`;
    }).join('');
    dica = 'Cada indicador tem a sua própria escala, com os valores reais da balança.';
  } else if (modo === 'pct') {
    const leg = series.map((s) => {
      const d = s.b - s.a, pct = s.a ? d / s.a * 100 : 0;
      return `<button class="cp-lg" data-action="corpo-metrica" data-v="${s.c.k}"><i style="background:${s.cor}"></i><span>${esc(rotCorpo(s.c))}</span><b class="num">${fmt(s.a, s.c.dec)} → ${fmt(s.b, s.c.dec)}</b><em class="${cls(s.c, d)}">${sgn(pct)}%</em></button>`;
    }).join('');
    corpo = `${multiSvg(series)}<div class="cp-legs">${leg}</div>`;
    dica = 'Cada linha mostra quanto o indicador mudou em relação ao início do período. Toque em um indicador para ver os valores reais.';
  } else {
    // variação entre uma medição e a seguinte (em %), para ver o ritmo
    const sv = series.map((s) => ({ ...s, pts: s.pts.filter((p) => p.step != null).map((p) => ({ data: p.data, v: p.v, pct: p.step })) })).filter((s) => s.pts.length);
    if (!sv.length) return `<div class="card chart"><div class="card-h"><h3>Evolução</h3><span class="sub">${sub}</span></div>${chips}<div class="empty">Precisa de pelo menos 2 medições no período.</div></div>`;
    const leg = sv.map((s) => {
      const m = s.pts.reduce((t, p) => t + p.pct, 0) / s.pts.length, ult = s.pts[s.pts.length - 1].pct;
      return `<div class="cp-lg static"><i style="background:${s.cor}"></i><span>${esc(rotCorpo(s.c))}</span><b class="num">méd. ${sgn(m, 1)}%</b><em class="${cls(s.c, ult)}">últ. ${sgn(ult, 1)}%</em></div>`;
    }).join('');
    corpo = `${multiSvg(sv)}<div class="cp-legs">${leg}</div>`;
    dica = 'Cada ponto é a mudança em % desde a medição anterior: abaixo de zero caiu, acima subiu. Mostra o ritmo semana a semana.';
  }
  return `<div class="card chart"><div class="card-h"><h3>Evolução</h3><span class="sub">${sub}</span></div>${chips}
    ${corpo}
    <div class="hint" style="margin-top:6px">${dica}</div></div>`;
}
function telaCorpo() {
  const L = corpoOrdenado();
  const bSync = S.conn.url ? '<button class="btn ghost" data-action="sync">🔄 Sincronizar</button>' : '';
  if (!L.length) {
    return `<div class="card"><div class="empty"><b>Nenhuma medição por aqui ainda</b>${S.conn.url
      ? 'Se você já lançou as medições na planilha, toque em Sincronizar para trazê-las.'
      : 'Na segunda-feira, depois de se pesar, registre os números da balança para acompanhar a composição do corpo.'}</div>
      <div class="btn-row"><button class="btn" data-action="nova-corpo">+ Registrar</button>${bSync}</div></div>`;
  }
  const { A, B, LW } = janelaCorpo(L), per = ui.corpoPer || 'ant';
  const semanas = Math.round((parse(B) - parse(A)) / (7 * 864e5));
  const serie = (c) => LW.filter((e) => e[c.k] != null);
  const sg = (v, d = 1, un = ' kg') => (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v), d) + un;

  // 1) seletor do período + comparar duas datas
  const opt = (sel) => L.map((e) => `<option value="${e.data}" ${e.data === sel ? 'selected' : ''}>${dataCurta(e.data)} ${e.data.slice(0, 4)}</option>`).join('');
  const seletor = `<div class="card">
    <div class="card-h"><h3>Período analisado</h3><button class="pill-add" data-action="nova-corpo">+ Registrar</button></div>
    <div class="seg seg-scroll" style="margin-bottom:12px">${CORPO_PER.map(([k, r]) => `<button class="${per === k ? 'on' : ''}" data-action="corpo-per" data-v="${k}">${r}</button>`).join('')}</div>
    <div class="row cp-datas">
      <div class="field"><label>De</label><select class="input" id="cpA">${opt(A)}</select></div>
      <div class="field"><label>Até</label><select class="input" id="cpB">${opt(B)}</select></div>
    </div>
    <div class="hint" style="margin-top:-4px">${A === B ? 'Escolha duas datas diferentes para comparar.' : `${dataCurta(A)} → ${dataCurta(B)} · ${semanas} semana${semanas === 1 ? '' : 's'} · ${LW.length} medições`}</div>
  </div>`;
  if (A === B) return seletor + `<div class="card"><div class="empty">Só há uma medição neste período.</div></div>`;

  // 2) antes × depois: o peso dividido em gordura e massa magra
  const ea = LW[0], eb = LW[LW.length - 1];
  const comp = (e) => { const p = pesoDoDia(e.data) || pesoEm(e.data); return e.gk != null && p ? { p, g: e.gk, m: e.lbm != null ? e.lbm : p - e.gk, data: e.data } : null; };
  const ca = comp(ea), cb = comp(eb);
  let visual = '';
  if (ca && cb) {
    const pct = ui.corpoUnid === 'pct';
    const mx = Math.max(ca.p, cb.p);
    // em kg: barras proporcionais ao peso; em %: cada barra é 100% do corpo naquele dia
    const barra = (c) => `<div class="cp-cl"><span>${dataCurta(c.data)}</span><b class="num">${fmt(c.p, 1)} kg</b></div>
      <div class="cp-stack" style="width:${pct ? 100 : (c.p / mx * 100).toFixed(1)}%"><span class="g" style="flex:${c.g.toFixed(2)}">${pct ? fmt(c.g / c.p * 100, 1) + '%' : fmt(c.g, 1)}</span><span class="m" style="flex:${(c.p - c.g).toFixed(2)}">${pct ? fmt(c.m / c.p * 100, 1) + '%' : fmt(c.m, 1)}</span></div>`;
    const dG = cb.g - ca.g, dM = cb.m - ca.m, dP = cb.p - ca.p;
    const rel = (d, a) => (d > 0 ? '+' : d < 0 ? '−' : '') + fmt(Math.abs(a ? d / a * 100 : 0), 1) + '%';
    const vb = (d, a) => pct ? rel(d, a) : sg(d);
    let nota = '';
    if (dP < -0.4 && dG < 0) {
      const pc = Math.min(100, Math.round(-dG / -dP * 100));
      nota = `<div class="cp-nota ${pc >= 70 ? 'ok' : pc >= 50 ? '' : 'atencao'}">Do que você perdeu de peso, <b>${pc}%</b> foi gordura${pc >= 70 ? ' — ótimo, o músculo está sendo preservado 👏' : pc >= 50 ? ' — bom ritmo, vale manter proteína e treino em dia.' : ': parte da perda vem de massa magra, reforce a proteína e a carga nos treinos.'}</div>`;
    } else if (dP >= -0.4) nota = `<div class="cp-nota">Peso quase estável: olhe gordura e massa magra para ver a recomposição.</div>`;
    visual = `<div class="card"><div class="card-h"><h3>Antes × depois</h3>
        <div class="seg" style="width:120px">${[['kg', 'kg'], ['pct', '%']].map(([k, r]) => `<button class="${(pct ? 'pct' : 'kg') === k ? 'on' : ''}" data-action="corpo-unid" data-v="${k}">${r}</button>`).join('')}</div></div>
      ${barra(ca)}${barra(cb)}
      <div class="cp-leg"><span><i class="g"></i>gordura</span><span><i class="m"></i>massa magra</span></div>
      <div class="cp-res">
        <div><small>Peso</small><b class="num ${dP <= 0 ? 's-good' : 's-warn'}">${vb(dP, ca.p)}</b></div>
        <div><small>Gordura</small><b class="num ${dG <= 0 ? 's-good' : 's-warn'}">${vb(dG, ca.g)}</b></div>
        <div><small>Massa magra</small><b class="num ${dM >= 0 ? 's-good' : 's-warn'}">${vb(dM, ca.m)}</b></div>
      </div>
      <div class="hint" style="margin-top:8px">${pct ? 'Barras: a composição do corpo em % do peso. Quadros: quanto cada item mudou em relação ao valor inicial.' : 'Barras e quadros em kg.'}</div>${nota}</div>`;
  }

  // 3) o que mudou em cada medida (barras divergentes, em %)
  const linhas = CORPO.map((c) => {
    const xs = serie(c); if (xs.length < 2) return null;
    const a = xs[0][c.k], b = xs[xs.length - 1][c.k], d = b - a, pct = a ? d / a * 100 : 0;
    return { c, a, b, d, pct, xs };
  }).filter(Boolean);
  const maxPct = Math.max(1, ...linhas.map((x) => Math.abs(x.pct)));
  const mudou = linhas.length ? `<div class="card"><div class="card-h"><h3>O que mudou</h3><span class="sub">variação em %</span></div>
    ${linhas.map((x) => {
      const cls = !x.c.bom || Math.abs(x.d) < 1e-9 ? 'n' : (x.d * x.c.bom > 0 ? 'good' : 'warn');
      const w = Math.min(50, Math.abs(x.pct) / maxPct * 50).toFixed(1);
      const u = x.c.un === '%' ? '%' : x.c.un ? ' ' + x.c.un : '';
      return `<div class="cp-r"><div class="cp-rh"><span>${esc(rotCorpo(x.c).replace(/ \((kg|%)\)$/, ''))}${x.c.un === '%' || x.c.un === 'kg' ? ` <em>${x.c.un}</em>` : ''}</span><span class="num">${fmt(x.a, x.c.dec)} → <b>${fmt(x.b, x.c.dec)}</b>${esc(u)}</span></div>
        <div class="cp-rb"><i></i><span class="${x.d >= 0 ? 'pos' : 'neg'} ${cls}" style="width:${w}%"></span></div>
        <div class="cp-rd ${cls === 'good' ? 's-good' : cls === 'warn' ? 's-warn' : ''}">${Math.abs(x.d) < 1e-9 ? 'igual' : sg(x.d, x.c.dec, x.c.un === '%' ? ' p.p.' : '') + ' (' + (x.pct > 0 ? '+' : x.pct < 0 ? '−' : '') + fmt(Math.abs(x.pct), 1) + '%)'}</div></div>`;
    }).join('')}
    <div class="hint" style="margin-top:8px">Verde = melhorou, amarelo = piorou, cinza = neutro. Nas medidas em %, a diferença vem em pontos percentuais (p.p.) e o % entre parênteses é a variação relativa. Pequenas oscilações de água e do horário da pesagem são normais.</div></div>` : '';

  // 4) gráfico da métrica escolhida, dentro do período
  const grafico = graficoCorpo(LW);

  const desc = [...L].reverse();
  const hist = `<div class="section-title">Histórico das medições</div>
  <div class="card">
    ${desc.map((e) => `<div class="item">
      <div class="ico">🧬</div>
      <button class="body" style="text-align:left;background:none;border:0;color:inherit;font:inherit;padding:0" data-action="edit-corpo" data-d="${e.data}"><b>${rotuloDia(e.data)}${rotuloDia(e.data).includes(',') ? '' : ', ' + dataCurta(e.data)}</b><small class="num">${[e.gp != null ? `gordura ${fmt(e.gp, 1)}%` : '', e.mm != null ? `músculo ${fmt(e.mm, 1)} kg` : '', e.vis != null ? `visceral ${fmt(e.vis, 1)}` : ''].filter(Boolean).join(' · ') || 'toque para editar'}</small></button>
      <button class="del" data-action="del-corpo" data-d="${e.data}" aria-label="Excluir">${ICON.x}</button>
    </div>`).join('')}
  </div>
  ${bSync ? `<div class="btn-row" style="margin-top:12px">${bSync}</div>` : ''}`;

  return seletor + visual + mudou + grafico + hist;
}
function sheetCorpo(data) {
  const reg = data ? (lerCorpo()[data] || {}) : {};
  const d = data || hoje();
  form = { tipo: 'corpo', orig: data || '' };
  const peso = pesoDoDia(d);
  const campo = (c) => `<div class="field"><label>${esc(rotCorpo(c))}</label><input class="input num" type="text" inputmode="decimal" id="cp_${c.k}" value="${reg[c.k] != null ? String(reg[c.k]).replace('.', ',') : ''}" placeholder="—"></div>`;
  abrirSheet(`
    <div class="sheet-h"><h2>${data ? 'Editar medição' : 'Medição da balança'}</h2><button class="iconbtn" data-action="fechar">${ICON.x}</button></div>
    <div class="row">
      <div class="field"><label>Data</label><input class="input" type="date" id="cpData" value="${d}" max="${hoje()}"></div>
      <div class="field"><label>Peso (kg)</label><input class="input num" type="text" inputmode="decimal" id="cp_peso" value="${peso ? String(peso).replace('.', ',') : ''}" placeholder="${pesoAtual() ? fmt(pesoAtual(), 1) : '—'}"></div>
    </div>
    <div class="hint" style="margin:-4px 0 10px">Preencha só o que a balança mostrar; o resto fica em branco. Se ainda não houver peso nessa data, ele também entra no histórico de peso.</div>
    <div class="row cp-form">${CORPO.map(campo).join('')}</div>
    <button class="btn" data-action="corpo-salvar">Salvar medição</button>`);
}
function salvarCorpo() {
  const data = dataPesagem($('#cpData').value || hoje());
  const reg = {};
  for (const c of CORPO) { const raw = $('#cp_' + c.k).value.trim(); if (raw !== '') { const n = num(raw); if (n > 0) reg[c.k] = n; } }
  const peso = num($('#cp_peso').value);
  if (!Object.keys(reg).length && !(peso >= 20)) { toast('Preencha ao menos um valor'); return; }
  const todos = lerCorpo();
  if (form && form.orig && form.orig !== data) delete todos[form.orig];
  if (Object.keys(reg).length) todos[data] = reg; else delete todos[data];
  gravarCorpo(todos);
  if (peso >= 20 && peso <= 400 && !S.peso.some((p) => p.data === data)) adicionar('peso', { data, peso: r1(peso), obs: '' });
  fecharSheet(); render(); toast('Medição salva 🧬');
}
// Importa linhas "dd/mm/aaaa; peso; gordura%; gordura kg; …" (mesma ordem de CORPO; vazio = sem valor)
function importarCorpo(texto) {
  const todos = lerCorpo(), existentes = new Set(S.peso.map((p) => p.data));
  let novos = 0, atualizados = 0, ignoradas = 0, pesos = 0;
  for (const linha of String(texto).split(/\r?\n/)) {
    if (!linha.trim()) continue;
    const t = linha.split(/[;\t]/).map((x) => x.trim());
    const m = t[0].match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) { ignoradas++; continue; }
    const data = dataPesagem(`${m[3]}-${pad(m[2])}-${pad(m[1])}`);
    const reg = {};
    CORPO.forEach((c, i) => { const n = num((t[i + 2] || '').replace(',', '.')); if (n > 0) reg[c.k] = n; });
    const peso = num((t[1] || '').replace(',', '.'));
    if (peso >= 20 && peso <= 400 && !existentes.has(data)) {
      existentes.add(data);
      const item = { id: 'peso-' + data, data, peso: r1(peso), obs: '', criadoEm: new Date().toISOString() };
      const op = { opId: uid(), op: 'add', tipo: 'peso', item }; applyOp(op); S.queue.push(op); pesos++;
    }
    if (!Object.keys(reg).length) { if (!(peso >= 20)) ignoradas++; continue; }
    if (todos[data]) atualizados++; else novos++;
    todos[data] = reg;
  }
  if (novos || atualizados) gravarCorpo(todos); else if (pesos) { save(); agendarSync(); }
  return { novos, atualizados, ignoradas, pesos };
}

// Texto de prévia das metas automáticas (usa a configuração passada, que pode ainda não estar salva)
function previewMetas(cfg) {
  const p = pesoAtual();
  const b = calcBase(p, cfg);
  if (!b) {
    const falta = [!p && 'uma pesagem', !num(cfg.idade) && 'a idade', !cfg.sexo && 'o sexo', !num(cfg.altura) && 'a altura'].filter(Boolean);
    return `Para calcular, falta informar ${falta.join(', ').replace(/, ([^,]*)$/, ' e $1')}. Enquanto isso, o app usa as metas manuais.`;
  }
  const def = num(cfg.deficit);
  const r = (k) => Math.round(num(cfg[k]) * p);
  return `Com <b>${fmt(p, 1)} kg</b>: taxa basal (TMB) <b>${fmt(b.tmb)}</b> · gasto base <b>${fmt(b.base)} kcal/dia</b>.<br>
    Meta de calorias = gasto do dia − ${fmt(def)}: <b>${fmt(b.base - def)} kcal</b> num dia sem treino, e sobe conforme as atividades lançadas.<br>
    Proteína <b>${r('protMinKg')}–${r('protMaxKg')} g</b> · Gordura <b>${r('gordMinKg')}–${r('gordMaxKg')} g</b> · Fibra <b>≥ ${fmt(cfg.fibraMin)} g</b> · Carboidrato livre.`;
}
// Lê o formulário de metas sem apagar o que não está na tela
function cfgDoForm(form) {
  const fd = new FormData(form), cfg = { ...S.config };
  for (const k of Object.keys(DEFAULT_CFG)) {
    const v = fd.get(k);
    if (v === null) continue;
    cfg[k] = CFG_TEXTO.includes(k) ? String(v) : v === '' ? '' : num(v);
  }
  return cfg;
}

function telaAjustes() {
  const c = S.config;
  const kcalMacros = num(c.prot) * 4 + num(c.carb) * 4 + num(c.gord) * 9;
  const campo = (k, rot, un, step = '1') => `<div class="field"><label>${rot}${un ? ` (${un})` : ''}</label><input class="input num" type="number" inputmode="decimal" step="${step}" name="${k}" value="${esc(c[k])}"></div>`;
  const auto = c.modoMetas !== 'manual';
  const opt = (v, rot, atual) => `<option value="${v}" ${String(atual) === String(v) ? 'selected' : ''}>${rot}</option>`;
  return `
  <form id="formMetas" class="card" autocomplete="off">
    <div class="card-h"><h3>Metas</h3>
      <div class="seg" style="width:210px"><button type="button" class="${auto ? 'on' : ''}" data-action="modo-metas" data-v="auto">Automático</button><button type="button" class="${auto ? '' : 'on'}" data-action="modo-metas" data-v="manual">Manual</button></div>
    </div>
    ${auto ? `
    <div class="row">${campo('idade', 'Idade', 'anos')}
      <div class="field"><label>Sexo</label><select class="input" name="sexo">${opt('', 'Escolha…', c.sexo)}${opt('M', 'Masculino', c.sexo)}${opt('F', 'Feminino', c.sexo)}</select></div></div>
    <div class="row">${campo('altura', 'Altura', 'cm')}
      <div class="field"><label>Peso atual</label><div class="input num" style="color:var(--muted)">${pesoAtual() ? fmt(pesoAtual(), 1) + ' kg' : 'registre o peso'}</div></div></div>
    <div class="row">
      <div class="field"><label>Rotina (sem os treinos)</label><select class="input" name="rotina">${opt(1.2, 'Sedentária', c.rotina)}${opt(1.3, 'Pouco ativa', c.rotina)}${opt(1.4, 'Ativa', c.rotina)}</select></div>
      ${campo('deficit', 'Déficit', 'kcal/dia')}</div>
    <span class="lbl-t">Proteína por kg de peso</span>
    <div class="row">${campo('protMinKg', 'Mínimo', 'g/kg', '0.1')}${campo('protMaxKg', 'Máximo', 'g/kg', '0.1')}</div>
    <span class="lbl-t">Gordura por kg de peso</span>
    <div class="row">${campo('gordMinKg', 'Mínimo', 'g/kg', '0.1')}${campo('gordMaxKg', 'Máximo', 'g/kg', '0.1')}</div>
    <div class="row">${campo('fibraMin', 'Fibra mínima', 'g')}<div></div></div>
    <div class="note" id="metasPrev">${previewMetas(c)}</div>
    <div class="row">${campo('pesoMeta', 'Peso meta', 'kg', '0.1')}${campo('imcMeta', 'IMC meta', 'kg/m²', '0.1')}</div>
    <div class="hint" id="imcPeso" style="margin:-6px 0 14px">${num(c.imcMeta) && num(c.altura) ? `IMC ${fmt(c.imcMeta, 1)} = ${fmt(num(c.imcMeta) * Math.pow(num(c.altura) / 100, 2), 1)} kg` : ''}</div>
    <button class="btn" type="submit">Salvar metas</button>
  </form>` : `
    ${campo('kcal', 'Calorias', 'kcal')}
    <div class="row">${campo('prot', 'Proteína', 'g')}${campo('carb', 'Carboidrato', 'g')}</div>
    <div class="row">${campo('gord', 'Gordura', 'g')}${campo('fibra', 'Fibras', 'g')}</div>
    <div class="note" id="kcalHint">Seus macros somam <b class="num">${fmt(kcalMacros)} kcal</b> (4·P + 4·C + 9·G).</div>
    <div class="row">${campo('pesoMeta', 'Peso meta', 'kg', '0.1')}${campo('altura', 'Altura', 'cm')}</div>
    <div class="row">${campo('imcMeta', 'IMC meta', 'kg/m²', '0.1')}<div class="field"><label>Peso no IMC meta</label><div class="input num" id="imcPeso" style="color:var(--muted)">${num(c.imcMeta) && num(c.altura) ? fmt(num(c.imcMeta) * Math.pow(num(c.altura) / 100, 2), 1) + ' kg' : '—'}</div></div></div>
    <button class="btn" type="submit">Salvar metas</button>
  </form>`}

  <form id="formConn" class="card" autocomplete="off">
    <div class="card-h"><h3>Google Sheets</h3><span class="sub">${S.lastSync ? 'último sync ' + new Date(S.lastSync).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'não conectado'}</span></div>
    <div class="field"><label>URL do Web App (Apps Script)</label><input class="input" name="url" type="url" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(S.conn.url)}"></div>
    <div class="field"><label>Chave de acesso (token)</label><input class="input" name="token" type="password" placeholder="cole o token gerado no setup" value="${esc(S.conn.token)}"></div>
    <div class="btn-row"><button class="btn" type="submit">Salvar e conectar</button><button class="btn ghost" type="button" data-action="sync">Sincronizar</button></div>
    <div class="hint">${S.queue.length ? `${S.queue.length} alteração(ões) aguardando envio.` : 'Os registros ficam salvos no celular e sobem para a planilha automaticamente quando houver internet.'}</div>
  </form>

  <div class="card">
    <div class="card-h"><h3>Meus alimentos</h3><span class="sub">${S.alimentos.length}</span></div>
    ${S.alimentos.length ? [...S.alimentos].sort((a, b) => a.nome.localeCompare(b.nome)).map((f) => `<div class="item">
      <div class="body"><b>${esc(f.nome)}</b><small class="num">100 g: ${fmt(f.kcal)} kcal · P ${fmt(f.prot, 1)} · C ${fmt(f.carb, 1)} · G ${fmt(f.gord, 1)} · F ${fmt(f.fibra, 1)}</small></div>
      <button class="del" data-action="del" data-tipo="alimentos" data-id="${esc(f.id)}" aria-label="Excluir">${ICON.x}</button>
    </div>`).join('') : `<div class="empty">Alimentos adicionados manualmente aparecem aqui e na busca.</div>`}
  </div>

  <div class="card">
    <div class="card-h"><h3>Importar histórico de peso</h3></div>
    <div class="hint" style="margin:0 0 10px">Cole uma linha por pesagem, com a data e o peso (ex.: <b>01/01/2026 90,0</b>). Linhas sem peso e datas já registradas são ignoradas.</div>
    <textarea class="input num" id="impPesos" rows="5" placeholder="01/01/2026 - seg	90,0&#10;08/01/2026 - seg	89,4" style="resize:vertical;font-size:14px"></textarea>
    <button class="btn ghost" style="margin-top:10px" data-action="importar-pesos">Importar pesos</button>
  </div>

  <div class="card">
    <div class="card-h"><h3>Importar composição corporal</h3></div>
    <div class="hint" style="margin:0 0 10px">Uma linha por pesagem, separada por ponto e vírgula (ou tab): <b>data; peso; gordura %; gordura kg; massa muscular kg; massa muscular %; músculo esquelético kg; músculo esquelético %; massa magra kg; água %; gordura visceral; metabolismo; idade metabólica; proteína %; ossos kg</b>. Deixe vazio o que não tiver. Datas já cadastradas são atualizadas.</div>
    <textarea class="input num" id="impCorpo" rows="5" placeholder="01/01/2026; 90,0; 25,0; 22,5; 61,0; 70,5; 33,0; 38,0; 65,0; 52,0; 13; 1800; 42; 18,5; 3,6" style="resize:vertical;font-size:14px"></textarea>
    <button class="btn ghost" style="margin-top:10px" data-action="importar-corpo">Importar medições</button>
  </div>

  <div class="card">
    <div class="card-h"><h3>Relatório do mês</h3></div>
    <div class="hint" style="margin:0 0 10px">Resumo do mês com calorias, macros, treinos, peso e composição corporal. O PDF abre a impressão do aparelho: escolha "Salvar como PDF".</div>
    <div class="field"><label>Mês</label><select class="input" id="relMes">${mesesComDados().map((m) => `<option value="${m}">${esc(rotuloMes(m))}</option>`).join('')}</select></div>
    <div class="btn-row"><button class="btn" data-action="rel-pdf">📄 Salvar em PDF</button><button class="btn ghost" data-action="rel-csv">📊 Baixar CSV</button></div>
  </div>

  <div class="card">
    <div class="card-h"><h3>Dados</h3></div>
    <div class="kv"><span>Refeições registradas</span><b class="num">${S.refeicoes.length}</b></div>
    <div class="kv"><span>Atividades</span><b class="num">${S.atividades.length}</b></div>
    <div class="kv"><span>Pesagens</span><b class="num">${S.peso.length}</b></div>
    <button class="btn ghost" style="margin-top:12px" data-action="backup">Baixar backup (JSON)</button>
  </div>
  <p class="hint" style="text-align:center">Vitta · seus dados ficam no seu Google Sheets</p>`;
}

// ---------- Relatório mensal (PDF pelo "imprimir" do aparelho e CSV) ----------
function mesesComDados() {
  const s = new Set([hoje().slice(0, 7)]);
  for (const l of [S.refeicoes, S.atividades, S.peso]) for (const x of l) if (x.data) s.add(String(x.data).slice(0, 7));
  return [...s].sort().reverse();
}
function rotuloMes(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'][m - 1]} de ${y}`;
}
function dadosMes(ym) {
  const [y, m] = ym.split('-').map(Number), n = new Date(y, m, 0).getDate(), t0 = hoje();
  const dias = [];
  for (let d = 1; d <= n; d++) {
    const data = `${ym}-${pad(d)}`; if (data > t0) break;
    const t = totaisDia(data), g = gastoDia(data), M = metasDia(data);
    const ativs = S.atividades.filter((a) => a.data === data).map((a) => a.tipo === 'Planilha' ? String(a.obs || 'Atividades').replace(/ · gasto total.*$/, '') : descAtividade(a));
    dias.push({ data, t, g, meta: Math.round(M.kcal.alvo || 0), ativs, peso: pesoDoDia(data) });
  }
  return dias;
}
function relatorioCSV(ym) {
  const n = (v, d = 0) => String(Math.round(v * 10 ** d) / 10 ** d).replace('.', ',');
  const linhas = [['Data', 'Calorias comidas', 'Meta de calorias', 'Proteína (g)', 'Carboidrato (g)', 'Gordura (g)', 'Fibras (g)', 'Calorias gastas em atividades', 'Atividades', 'Peso (kg)']];
  for (const d of dadosMes(ym)) {
    const [y, m, dd] = d.data.split('-');
    const mac = d.t.n && d.t.comMacros; // dias importados da planilha só têm calorias
    linhas.push([`${dd}/${m}/${y}`, d.t.n ? n(d.t.kcal) : '', d.meta ? n(d.meta) : '', mac ? n(d.t.prot, 1) : '', mac ? n(d.t.carb, 1) : '', mac ? n(d.t.gord, 1) : '', mac ? n(d.t.fibra, 1) : '', d.g.kcal ? n(d.g.kcal) : '', d.ativs.join(' + '), d.peso ? n(d.peso, 1) : '']);
  }
  return '﻿' + linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
}
function relatorioHTML(ym) {
  const dias = dadosMes(ym), com = dias.filter((d) => d.t.n);
  const comMac = com.filter((d) => d.t.comMacros);
  const media = (k) => { const L = k === 'kcal' ? com : comMac; return L.length ? L.reduce((s, d) => s + d.t[k], 0) / L.length : 0; };
  const treinos = dias.reduce((s, d) => s + S.atividades.filter((a) => a.data === d.data && a.tipo === 'Musculação').length, 0);
  const kcalAtv = dias.reduce((s, d) => s + d.g.kcal, 0);
  const pesos = dias.filter((d) => d.peso);
  const ini = pesos.length ? pesos[0].peso : 0, fim = pesos.length ? pesos[pesos.length - 1].peso : 0;
  const corpo = corpoOrdenado().filter((e) => e.data.startsWith(ym));
  const f1 = (v) => fmt(v, 1);
  const linhaCorpo = corpo.length ? `<h2>Composição corporal</h2><table><tr><th>Medida</th><th>Primeira do mês</th><th>Última do mês</th></tr>${CORPO.filter((c) => corpo.some((e) => e[c.k] != null)).map((c) => {
    const xs = corpo.filter((e) => e[c.k] != null); return `<tr><td>${esc(rotCorpo(c))}</td><td>${fmt(xs[0][c.k], c.dec)}</td><td>${fmt(xs[xs.length - 1][c.k], c.dec)}</td></tr>`;
  }).join('')}</table>` : '';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Vitta — ${esc(rotuloMes(ym))}</title><style>
    body{font:13px/1.45 -apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:24px}
    h1{font-size:22px;margin:0 0 2px}h2{font-size:15px;margin:22px 0 8px}.sub{color:#555;margin-bottom:14px}
    .res{display:flex;flex-wrap:wrap;gap:10px}.res div{border:1px solid #ccc;border-radius:8px;padding:8px 12px;min-width:120px}.res b{display:block;font-size:18px}
    table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:4px 6px;text-align:right;font-size:12px}th{background:#f0f0f0}td:first-child,th:first-child,td.l{text-align:left}
    @page{margin:14mm}</style></head><body>
    <h1>Relatório de ${esc(rotuloMes(ym))}</h1><div class="sub">Vitta · gerado em ${new Date().toLocaleDateString('pt-BR')}</div>
    <div class="res">
      <div>Dias com refeições<b>${com.length}</b></div><div>Calorias (média/dia)<b>${fmt(media('kcal'))}</b></div>
      <div>Proteína (média/dia)<b>${fmt(media('prot'))} g</b></div><div>Carboidrato / Gordura<b>${fmt(media('carb'))} / ${fmt(media('gord'))} g</b></div>
      <div>Treinos de musculação<b>${treinos}</b></div><div>Gasto em atividades<b>${fmt(kcalAtv)} kcal</b></div>
      <div>Peso<b>${ini ? `${f1(ini)} → ${f1(fim)} kg` : '—'}</b></div>
    </div>
    <h2>Dia a dia</h2>
    <table><tr><th>Data</th><th>Kcal</th><th>Meta</th><th>Prot (g)</th><th>Carb (g)</th><th>Gord (g)</th><th>Fibras (g)</th><th>Gasto ativ.</th><th>Peso</th><th class="l">Atividades</th></tr>
    ${dias.map((d) => `<tr><td>${d.data.slice(8)}/${d.data.slice(5, 7)}</td><td>${d.t.n ? fmt(d.t.kcal) : '—'}</td><td>${d.meta ? fmt(d.meta) : '—'}</td><td>${d.t.comMacros ? fmt(d.t.prot) : '—'}</td><td>${d.t.comMacros ? fmt(d.t.carb) : '—'}</td><td>${d.t.comMacros ? fmt(d.t.gord) : '—'}</td><td>${d.t.comMacros ? fmt(d.t.fibra) : '—'}</td><td>${d.g.kcal ? fmt(d.g.kcal) : '—'}</td><td>${d.peso ? f1(d.peso) : ''}</td><td class="l">${esc(d.ativs.join(' + '))}</td></tr>`).join('')}
    </table>${linhaCorpo}</body></html>`;
}
function baixarArquivo(nome, conteudo, tipo) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo })), a = document.createElement('a');
  a.href = url; a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function imprimirHtml(html) {
  const fr = document.createElement('iframe');
  fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(fr);
  const doc = fr.contentWindow.document; doc.open(); doc.write(html); doc.close();
  setTimeout(() => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { toast('Não consegui abrir a impressão neste aparelho'); } setTimeout(() => fr.remove(), 60000); }, 400);
}

// ---------- Sheets (formulários) ----------
let form = null;

function abrirSheet(html) {
  $('#sheet').innerHTML = `<div class="grab"></div>${html}`;
  $('#overlay').hidden = false;
  document.body.style.overflow = 'hidden';
}
function fecharSheet() { $('#overlay').hidden = true; document.body.style.overflow = ''; form = null; }

// ---------- Calendário do app (não depende do seletor de data do navegador) ----------
const cal = { alvo: 'dia', mes: '' };
function sheetCalendario(alvo) {
  cal.alvo = alvo;
  cal.mes = (alvo === 'semana' ? ui.semanaRef : ui.dia).slice(0, 7);
  renderCalendario();
}
function renderCalendario() {
  const [y, m] = cal.mes.split('-').map(Number);
  const t0 = hoje();
  const primeiro = new Date(y, m - 1, 1);
  const offset = (primeiro.getDay() + 6) % 7; // semana começa na segunda
  const nDias = new Date(y, m, 0).getDate();
  const comRefeicao = new Set(S.refeicoes.map((r) => r.data));
  const comAtividade = new Set(S.atividades.map((a) => a.data));
  const comPeso = new Set(S.peso.map((p) => p.data));
  const selIni = cal.alvo === 'semana' ? inicioSemana(ui.semanaRef) : ui.dia;
  const selFim = cal.alvo === 'semana' ? addDias(selIni, 6) : ui.dia;
  let cells = '';
  for (let i = 0; i < offset; i++) cells += '<span></span>';
  for (let dd = 1; dd <= nDias; dd++) {
    const ds = `${y}-${pad(m)}-${pad(dd)}`;
    const futuro = ds > t0;
    const sel = ds >= selIni && ds <= selFim;
    const pontos = [comRefeicao.has(ds) ? '<i style="background:var(--brand)"></i>' : '', comAtividade.has(ds) ? '<i style="background:#5cc8e0"></i>' : '', comPeso.has(ds) ? '<i style="background:var(--good)"></i>' : ''].join('');
    cells += `<button class="cal-d ${sel ? 'sel' : ''} ${ds === t0 ? 'hoje' : ''}" ${futuro ? 'disabled' : ''} data-action="cal-dia" data-d="${ds}">${dd}<span class="pts">${pontos}</span></button>`;
  }
  const mesNome = primeiro.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const noUltimo = cal.mes >= t0.slice(0, 7);
  abrirSheet(`
    <div class="sheet-h"><h2>${cal.alvo === 'semana' ? 'Escolher semana' : 'Escolher dia'}</h2><button class="iconbtn" data-action="fechar">${ICON.x}</button></div>
    <div class="cal-top">
      <button class="iconbtn" data-action="cal-mes" data-n="-1" aria-label="Mês anterior">${ICON.left}</button>
      <b>${mesNome.charAt(0).toUpperCase() + mesNome.slice(1)}</b>
      <button class="iconbtn" data-action="cal-mes" data-n="1" ${noUltimo ? 'disabled' : ''} aria-label="Próximo mês">${ICON.right}</button>
    </div>
    <div class="cal-grid cal-sem">${['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((x) => `<span>${x}</span>`).join('')}</div>
    <div class="cal-grid">${cells}</div>
    <div class="legend" style="justify-content:center;margin:12px 0 14px"><span><i style="background:var(--brand);border-radius:50%"></i>Refeição</span><span><i style="background:#5cc8e0;border-radius:50%"></i>Atividade</span><span><i style="background:var(--good);border-radius:50%"></i>Pesagem</span></div>
    <button class="btn ghost" data-action="cal-hoje">${cal.alvo === 'semana' ? 'Ir para esta semana' : 'Ir para hoje'}</button>`);
}

// ---------- Confirmação do app (os pop-ups do navegador podem estar bloqueados) ----------
function confirmar(msg, textoOk, onOk, aviso = 'Essa ação não pode ser desfeita.', perigo = true) {
  confirmar._ok = onOk;
  abrirSheet(`
    <div class="sheet-h"><h2>${esc(msg)}</h2><button class="iconbtn" data-action="fechar">${ICON.x}</button></div>
    ${aviso ? `<p class="hint" style="margin:-4px 0 18px">${esc(aviso)}</p>` : ''}
    <div class="btn-row"><button class="btn ghost" data-action="fechar">Cancelar</button><button class="btn ${perigo ? 'btn-perigo' : ''}" data-action="conf-ok">${esc(textoOk)}</button></div>`);
}

function sheetMenu() {
  abrirSheet(`
    <div class="sheet-h"><h2>Adicionar</h2><button class="iconbtn" data-action="fechar">${ICON.x}</button></div>
    <div class="add-menu">
      <button class="add-opt" data-action="nova-refeicao"><span class="ico" style="background:color-mix(in srgb,var(--kcal) 16%,transparent)">🍽️</span><span><b>Refeição</b><small>O que você comeu e quanto</small></span></button>
      <button class="add-opt" data-action="nova-atividade"><span class="ico" style="background:color-mix(in srgb,var(--prot) 16%,transparent)">🏃</span><span><b>Atividade física</b><small>Treino, caminhada, esporte…</small></span></button>
      <button class="add-opt" data-action="novo-peso"><span class="ico" style="background:color-mix(in srgb,var(--brand) 16%,transparent)">⚖️</span><span><b>Peso</b><small>Registrar pesagem</small></span></button>
      <button class="add-opt" data-action="nova-corpo"><span class="ico" style="background:color-mix(in srgb,var(--brand) 16%,transparent)">🧬</span><span><b>Composição corporal</b><small>Números da balança (gordura, músculo…)</small></span></button>
    </div>`);
}

function refeicaoPorHora() {
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  return (REFEICOES.find((r) => h < r.ate) || REFEICOES[REFEICOES.length - 1]).k;
}

function todosAlimentos() {
  const base = (window.FOODS_BASE || []).map(([nome, kcal, prot, carb, gord, fibra]) => ({ nome, kcal, prot, carb, gord, fibra, base: true }));
  return [...S.alimentos.map((f) => ({ ...f, meu: true })), ...base];
}
function recentes() {
  const vistos = new Set(), out = [];
  const ord = [...S.refeicoes].sort((a, b) => String(b.criadoEm || b.data).localeCompare(String(a.criadoEm || a.data)));
  for (const r of ord) {
    const k = norm(r.alimento); const g = num(r.gramas);
    if (vistos.has(k) || !g) continue; vistos.add(k);
    out.push({ nome: r.alimento, gramas: g, kcal: r.kcal / g * 100, prot: r.prot / g * 100, carb: r.carb / g * 100, gord: r.gord / g * 100, fibra: r.fibra / g * 100 });
    if (out.length >= 10) break;
  }
  return out;
}

function sheetRefeicao() {
  const refeicao = refeicaoPorHora();
  const lista = listaPratos(refeicao);
  form = { tipo: 'refeicao', data: ui.view === 'hoje' ? ui.dia : hoje(), refeicao, food: null, gramas: 100, manual: false, busca: '', adicionados: [], lista, pratos: novosPratos(lista) };
  renderRefeicao();
}
function novosPratos(lista) { return lista.map((p) => ({ q: '', modo: p.padrao || 'g' })); }
// "Ovos (2 un)" -> "Ovos"
function baseNome(rot) { return String(rot).replace(/\s*\([^)]*\)\s*$/, '').trim(); }
// Pratos da tela de refeição: os fixos, ordenados pelo que você mais lança nessa refeição,
// mais alimentos fora da lista que você repete (2+ vezes) nela.
function listaPratos(refeicao) {
  const cont = {}, nomes = {};
  for (const r of S.refeicoes) {
    if (r.refeicao !== refeicao) continue;
    const b = baseNome(r.alimento), k = norm(b);
    cont[k] = (cont[k] || 0) + 1; nomes[k] = b;
  }
  const fixos = PRATOS.map((p, i) => ({ p, i, c: cont[norm(p.nome)] || 0 })).sort((a, b) => b.c - a.c || a.i - b.i).map((x) => x.p);
  const fixosK = new Set(PRATOS.map((p) => norm(p.nome)));
  const extras = Object.keys(cont).filter((k) => !fixosK.has(k) && cont[k] >= 2 && alimentoPorNome(nomes[k]))
    .sort((a, b) => cont[b] - cont[a]).slice(0, 3).map((k) => ({ nome: nomes[k], food: nomes[k] }));
  return [...fixos, ...extras];
}
function passoPrato(p, st) { return st.modo === 'un' ? 1 : (p.passo || (p.medida === 'ml' ? 100 : 50)); }
// Última vez (em outro dia) em que você lançou esta refeição
function ultimaRefeicao(refeicao, dataAtual) {
  const ok = (r) => r.refeicao === refeicao && r.data !== dataAtual && r.data <= hoje();
  const datas = S.refeicoes.filter(ok).map((r) => r.data).sort();
  const d = datas[datas.length - 1];
  if (!d) return null;
  return { data: d, itens: S.refeicoes.filter((r) => ok(r) && r.data === d) };
}
function repetirRefeicao() {
  const f = form;
  f.data = $('#fData')?.value || f.data;
  const u = ultimaRefeicao(f.refeicao, f.data);
  if (!u) return;
  const dd = (d) => `${d.slice(8)}/${d.slice(5, 7)}`;
  const kcal = u.itens.reduce((s, r) => s + num(r.kcal), 0);
  const dest = f.data, refeicao = f.refeicao;
  confirmar(`Lançar de novo ${refeicao.toLowerCase()} de ${dd(u.data)} em ${dd(dest)}? ${u.itens.length} ${u.itens.length === 1 ? 'item' : 'itens'} · ${fmt(kcal)} kcal`, 'Lançar', () => {
    for (const r of u.itens) {
      adicionar('refeicoes', { data: dest, hora: dest === hoje() ? agoraHora() : '', refeicao, alimento: r.alimento, gramas: r.gramas, kcal: r.kcal, prot: r.prot, carb: r.carb, gord: r.gord, fibra: r.fibra });
    }
    toast(`${u.itens.length} ${u.itens.length === 1 ? 'item lançado' : 'itens lançados'} · ${fmt(kcal)} kcal`);
  }, u.itens.map((r) => r.alimento).join(', '), false);
}

// ---------- Comi fora: porções médias estimadas (valores aproximados, tabelas nutricionais brasileiras) ----------
// Valores do tamanho médio; pequeno = ×0,75 e grande = ×1,25. "tam" troca os rótulos quando o tamanho é em unidades.
const FORA = [
  { nome: 'Prato feito (arroz, feijão, carne, salada)', kcal: 800, prot: 40, carb: 95, gord: 25, fibra: 12 },
  { nome: 'Marmita fitness (frango, arroz, legumes)',   kcal: 550, prot: 40, carb: 60, gord: 14, fibra: 7 },
  { nome: 'Massa (prato)',                              kcal: 650, prot: 22, carb: 90, gord: 22, fibra: 5 },
  { nome: 'Pizza', un: 'fatia', fator: [1, 2, 3],        kcal: 520, prot: 22, carb: 60, gord: 22, fibra: 3 },
  { nome: 'Hambúrguer / lanche',                        kcal: 550, prot: 25, carb: 45, gord: 28, fibra: 2 },
  { nome: 'Pastel', un: 'un', fator: [1, 2, 3],          kcal: 600, prot: 16, carb: 56, gord: 34, fibra: 3 },
  { nome: 'Salgado (coxinha, esfiha)', un: 'un', fator: [1, 2, 3], kcal: 500, prot: 16, carb: 56, gord: 24, fibra: 2 },
  { nome: 'Sanduíche natural',                          kcal: 300, prot: 15, carb: 32, gord: 12, fibra: 3 },
  { nome: 'Sushi / combinado',                          kcal: 400, prot: 18, carb: 70, gord: 6, fibra: 2 },
  { nome: 'Açaí (bowl)',                                kcal: 450, prot: 6, carb: 70, gord: 16, fibra: 6 },
  { nome: 'Sobremesa (fatia de bolo, doce)',            kcal: 350, prot: 5, carb: 50, gord: 14, fibra: 1 },
];
function sheetFora() {
  const f = form;
  f.data = $('#fData')?.value || f.data;
  form = { tipo: 'fora', refeicao: f.refeicao, data: f.data };
  const dd = `${form.data.slice(8)}/${form.data.slice(5, 7)}`;
  abrirSheet(`
    <div class="sheet-h"><h2>Comi fora</h2><button class="iconbtn" data-action="fechar">${ICON.x}</button></div>
    <div class="hint" style="margin:-4px 0 10px">Valores médios estimados, lançados em <b>${esc(form.refeicao)}</b> (${dd}) e marcados com ≈. Você pode corrigir as calorias depois, em ✎.</div>
    ${FORA.map((x, i) => `<div class="prato fora">
      <div class="pn"><b>${esc(x.nome)}</b><small class="num">≈ ${fmt(x.kcal)} kcal (médio)</small></div>
      <div class="pu-seg fora-seg">${['P', 'M', 'G'].map((t, j) => `<button data-action="fora-add" data-i="${i}" data-j="${j}">${x.fator ? x.fator[j] + (x.un === 'fatia' ? (x.fator[j] > 1 ? ' fatias' : ' fatia') : ' un') : t}</button>`).join('')}</div>
    </div>`).join('')}
    <button class="btn ghost" data-action="fechar" style="margin-top:12px">Cancelar</button>`);
}
function addFora(i, j) {
  const f = form, x = FORA[i]; if (!x) return;
  const k = x.fator ? x.fator[j] / x.fator[1] : [0.75, 1, 1.25][j];
  const tam = x.fator ? `${x.fator[j]} ${x.un === 'fatia' ? (x.fator[j] > 1 ? 'fatias' : 'fatia') : 'un'}` : ['pequeno', 'médio', 'grande'][j];
  const nome = `${x.nome} (${tam}) ≈`;
  const item = { data: f.data, hora: f.data === hoje() ? agoraHora() : '', refeicao: f.refeicao, alimento: nome, gramas: 0, kcal: Math.round(x.kcal * k), prot: r1(x.prot * k), carb: r1(x.carb * k), gord: r1(x.gord * k), fibra: r1(x.fibra * k) };
  fecharSheet();
  adicionar('refeicoes', item);
  toast(`${x.nome.split(' (')[0]} lançado · ≈ ${fmt(item.kcal)} kcal`);
}

// ---------- Esporádicos: pratos de vez em quando, com valores estimados (sincronizados pela aba Config) ----------
// Os valores abaixo são estimativas somando os componentes de uma porção média; dá para corrigir em ✎.
const ESP_PADRAO = [
  { nome: 'Dogão de frango com catupiry (Maringá)', kcal: 720, prot: 35, carb: 66, gord: 34, fibra: 3, obs: 'pão, 1 salsicha, frango com catupiry, alface e batata palha' },
  { nome: 'Prato de tutu mineiro (shopping)', kcal: 1200, prot: 80, carb: 60, gord: 70, fibra: 10, obs: 'tutu de feijão, arroz, salada, contra-filé grande, 5 fatias de calabresa e torresmo' },
];
function lerEsp() {
  if (S.config.esporadicos == null || S.config.esporadicos === '') return ESP_PADRAO.map((x) => ({ ...x }));
  try { const c = JSON.parse(S.config.esporadicos); return Array.isArray(c) ? c : []; } catch { return []; }
}
function gravarEsp(c) { salvarConfig({ ...S.config, esporadicos: JSON.stringify(c) }); }
function sheetEsp() {
  const f = form;
  f.data = $('#fData')?.value || f.data;
  form = { tipo: 'esp', refeicao: f.refeicao, data: f.data };
  renderEsp();
}
function renderEsp() {
  const f = form, dd = `${f.data.slice(8)}/${f.data.slice(5, 7)}`, L = lerEsp();
  abrirSheet(`
    <div class="sheet-h"><h2>Esporádicos</h2><button class="iconbtn" data-action="fechar">${ICON.x}</button></div>
    <div class="hint" style="margin:-4px 0 10px">Pratos de vez em quando, com valores estimados. Lançados em <b>${esc(f.refeicao)}</b> (${dd}) e marcados com ≈. Toque em ✎ para ajustar os valores.</div>
    ${L.map((x, i) => `<div class="prato fora">
      <div class="pn"><b>${esc(x.nome)}</b><small class="num">≈ ${fmt(x.kcal)} kcal · P ${fmt(x.prot, 0)} · C ${fmt(x.carb, 0)} · G ${fmt(x.gord, 0)}</small>${x.obs ? `<small>${esc(x.obs)}</small>` : ''}</div>
      <div class="pu-seg fora-seg">${['½', '1', '1½'].map((t, j) => `<button data-action="esp-add" data-i="${i}" data-j="${j}">${t}</button>`).join('')}
        <button data-action="esp-edit" data-i="${i}" aria-label="Editar">✎</button></div>
    </div>`).join('') || '<div class="empty"><b>Nenhum esporádico</b>Adicione o primeiro abaixo.</div>'}
    <button class="btn ghost" data-action="esp-edit" data-i="-1" style="margin-top:12px">+ Novo esporádico</button>`);
}
function addEsp(i, j) {
  const f = form, x = lerEsp()[i]; if (!x) return;
  const k = [0.5, 1, 1.5][j], tam = ['½ porção', '', '1½ porção'][j];
  const item = { data: f.data, hora: f.data === hoje() ? agoraHora() : '', refeicao: f.refeicao, alimento: `${x.nome}${tam ? ' (' + tam + ')' : ''} ≈`, gramas: 0, kcal: Math.round(num(x.kcal) * k), prot: r1(num(x.prot) * k), carb: r1(num(x.carb) * k), gord: r1(num(x.gord) * k), fibra: r1(num(x.fibra) * k) };
  fecharSheet();
  adicionar('refeicoes', item);
  toast(`${x.nome.split(' (')[0]} lançado · ≈ ${fmt(item.kcal)} kcal`);
}
function sheetEspEditar(i) {
  const f = form, L = lerEsp(), x = L[i] || { nome: '', kcal: '', prot: '', carb: '', gord: '', fibra: '', obs: '' };
  form = { tipo: 'esp-edit', refeicao: f.refeicao, data: f.data, idx: i };
  const campo = (id, rot, v) => `<div class="field"><label>${rot}</label><input class="input num" id="${id}" type="number" inputmode="decimal" step="any" min="0" value="${v === '' ? '' : num(v)}"></div>`;
  abrirSheet(`
    <div class="sheet-h"><h2>${i >= 0 ? 'Editar esporádico' : 'Novo esporádico'}</h2><button class="iconbtn" data-action="fechar">${ICON.x}</button></div>
    <div class="field"><label>Nome</label><input class="input" id="eeNome" value="${esc(x.nome)}" placeholder="Ex.: Feijoada completa"></div>
    <div class="field"><label>O que vem (opcional)</label><input class="input" id="eeObs" value="${esc(x.obs || '')}" placeholder="Ex.: arroz, couve, farofa, linguiça"></div>
    <span class="lbl-t">Valores de uma porção (estimativa)</span>
    <div class="row3">${campo('ee_kcal', 'Kcal', x.kcal)}${campo('ee_prot', 'Prot (g)', x.prot)}${campo('ee_carb', 'Carb (g)', x.carb)}${campo('ee_gord', 'Gord (g)', x.gord)}${campo('ee_fibra', 'Fibra (g)', x.fibra)}</div>
    <div class="btn-row">${i >= 0 ? '<button class="btn ghost" data-action="esp-del" style="flex:.6">Excluir</button>' : ''}<button class="btn ghost" data-action="esp-voltar" style="flex:.6">Voltar</button><button class="btn" data-action="esp-salvar">Salvar</button></div>`);
}
function salvarEsp() {
  const f = form, nome = ($('#eeNome')?.value || '').trim(), kcal = num($('#ee_kcal')?.value);
  if (!nome || !(kcal > 0)) { toast('Informe o nome e as calorias'); return; }
  const x = { nome, kcal, prot: num($('#ee_prot')?.value), carb: num($('#ee_carb')?.value), gord: num($('#ee_gord')?.value), fibra: num($('#ee_fibra')?.value), obs: ($('#eeObs')?.value || '').trim() };
  const L = lerEsp();
  if (f.idx >= 0 && L[f.idx]) L[f.idx] = x; else L.push(x);
  gravarEsp(L);
  form = { tipo: 'esp', refeicao: f.refeicao, data: f.data };
  renderEsp(); toast('Esporádico salvo');
}

// ---------- Descrever o que comi (interpretação no próprio app, sem IA e sem enviar nada para fora) ----------
const NUM_PAL = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, meio: 0.5, meia: 0.5, metade: 0.5 };
const UN_PAL = { g: 'g', gr: 'g', grama: 'g', gramas: 'g', kg: 'kg', ml: 'ml', l: 'l', litro: 'l', litros: 'l', un: 'un', unidade: 'un', unidades: 'un',
  fatia: 'un', fatias: 'un', copo: 'copo', copos: 'copo', colher: 'colher', colheres: 'colher', concha: 'concha', conchas: 'concha',
  xicara: 'xicara', xicaras: 'xicara', pedaco: 'pedaco', pedacos: 'pedaco', dose: 'dose', doses: 'dose', prato: 'prato', pratos: 'prato' };
const G_MEDIDA = { copo: 200, colher: 20, concha: 100, xicara: 150, pedaco: 80, dose: 30, prato: 350 };
// gramas de 1 unidade (ou fatia) de alimentos comuns; fora desta lista, assume 100 g e avisa
const G_UNID = [['ovo', 50], ['pao frances', 50], ['pao de forma', 25], ['pao de queijo', 20], ['queijo', 20], ['presunto', 15], ['banana', 100], ['maca', 130],
  ['laranja', 150], ['biscoito', 6], ['iogurte', 170], ['tapioca', 60], ['whey', 30], ['batata', 130], ['bolo', 80], ['cafe', 50]];
const FILLER = new Set(['de', 'do', 'da', 'dos', 'das', 'no', 'na', 'meu', 'minha', 'uns', 'umas', 'o', 'a', 'os', 'as', 'bem', 'pouco', 'pouca', 'comi', 'tomei', 'bebi']);
function singular(w) { return w.length > 3 ? w.replace(/aes$/, 'ao').replace(/oes$/, 'ao').replace(/s$/, '') : w; }
function acharAlimento(tokens) {
  const q = tokens.map(singular);
  const alvo = q.join(' ');
  const pr = PRATOS.find((p) => norm(p.nome) === alvo || singular(norm(p.nome)) === alvo);
  if (pr) { const fd = alimentoPorNome(pr.food); if (fd) return fd; }
  const foodsPratos = new Set(PRATOS.map((p) => norm(p.food)));
  const cands = todosAlimentos().map((a, ord) => ({ a, ord, n: norm(a.nome) }))
    .filter((c) => { const ws = c.n.split(/[^a-z0-9]+/).filter(Boolean); return q.every((t) => ws.some((w) => w.startsWith(t) || singular(w) === t)); });
  if (!cands.length) return null;
  const pont = (c) => (c.a.meu ? 0 : 4) + (c.n === alvo ? -3 : 0) + (foodsPratos.has(c.n) ? 0 : 1) + (c.n.startsWith(q[0]) ? 0 : 1) + c.n.length / 100;
  cands.sort((x, y) => pont(x) - pont(y) || x.ord - y.ord);
  return cands[0].a;
}
function interpretarSegmento(seg) {
  const ws = norm(seg).replace(/(\d)\s*(kg|gr|g|ml|l)\b/g, '$1 $2').replace(/[^a-z0-9.,/\s]/g, ' ').split(/\s+/).filter(Boolean);
  let q = null, un = null; const nome = [];
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i];
    if (q === null && (/^\d+([.,]\d+)?$/.test(w) || NUM_PAL[w] !== undefined)) {
      q = NUM_PAL[w] !== undefined ? NUM_PAL[w] : num(w);
      if (UN_PAL[ws[i + 1]]) { un = UN_PAL[ws[i + 1]]; i++; if (ws[i + 1] === 'de') i++; }
    } else if (q === null && UN_PAL[w] && !nome.length && ws.slice(i + 1).length) { q = 1; un = UN_PAL[w]; }
    else if (!FILLER.has(w) && !/^\d/.test(w)) nome.push(w);
  }
  if (!nome.length) return { txt: seg.trim(), ok: false };
  const fd = acharAlimento(nome);
  if (!fd) return { txt: seg.trim(), ok: false };
  const n = norm(fd.nome);
  const gu = (G_UNID.find(([k]) => n.includes(k) || norm(nome.join(' ')).includes(k)) || [])[1];
  let gramas, assumido = false;
  if (un === 'g' || un === 'ml') gramas = q;
  else if (un === 'kg' || un === 'l') gramas = q * 1000;
  else if (G_MEDIDA[un]) gramas = q * G_MEDIDA[un];
  else if (q !== null || un === 'un') { const k = q === null ? 1 : q; if (gu) gramas = k * gu; else { gramas = k * 100; assumido = true; } }
  else if (gu) gramas = gu;                 // "ovo" = 1 ovo
  else { gramas = 100; assumido = true; }   // sem quantidade: 100 g, para você conferir
  return { txt: seg.trim(), ok: true, fd, gramas: r1(gramas), assumido };
}
function interpretarTexto(texto) {
  const segs = norm(texto).split(/[,;\n+]|\s(?:e|com|mais)\s/).map((s) => s.trim()).filter(Boolean);
  const itens = [], nao = [];
  for (const s of segs) { const r = interpretarSegmento(s); (r.ok ? itens : nao).push(r); }
  return { itens, nao: nao.map((x) => x.txt) };
}
function sheetDescrever() {
  const f = form;
  f.data = $('#fData')?.value || f.data;
  form = { tipo: 'desc', refeicao: f.refeicao, data: f.data, texto: '', itens: null, nao: [] };
  renderDescrever();
}
function renderDescrever() {
  const f = form, dd = `${f.data.slice(8)}/${f.data.slice(5, 7)}`;
  if (!f.itens) {
    abrirSheet(`
      <div class="sheet-h"><h2>Descrever o que comi</h2><button class="iconbtn" data-action="fechar">${ICON.x}</button></div>
      <div class="hint" style="margin:-4px 0 10px">Escreva ou dite (microfone do teclado) o que comeu, separando por vírgula ou "e". Será lançado em <b>${esc(f.refeicao)}</b> (${dd}).</div>
      <textarea class="input" id="dTexto" rows="4" placeholder="Ex.: 2 ovos mexidos, 1 pão francês com queijo, 200 ml de leite" style="resize:vertical;font-size:15px">${esc(f.texto)}</textarea>
      <button class="btn" style="margin-top:10px" data-action="d-ler">Interpretar</button>`);
    setTimeout(() => $('#dTexto')?.focus(), 50);
    return;
  }
  abrirSheet(`
    <div class="sheet-h"><h2>Confira</h2><button class="iconbtn" data-action="fechar">${ICON.x}</button></div>
    <div class="hint" style="margin:-4px 0 8px">"${esc(f.texto)}"<br>Ajuste as gramas se precisar. Itens com ≈ tiveram a quantidade assumida.</div>
    ${f.itens.map((it, i) => `<div class="prato desc">
      <div class="pn"><b>${esc(it.fd.nome)}${it.assumido ? ' ≈' : ''}</b><small class="num" id="dk_${i}"></small></div>
      <div class="pstep"><input class="input num pq" id="dg_${i}" type="number" inputmode="decimal" min="0" step="any" value="${it.gramas}"><span class="pu fixo">g</span></div>
      <button class="del" data-action="d-del" data-i="${i}" aria-label="Remover">${ICON.x}</button>
    </div>`).join('') || '<div class="empty"><b>Nada reconhecido</b>Tente de outro jeito ou use a busca.</div>'}
    ${f.nao.length ? `<div class="note">Não entendi: ${f.nao.map((x) => `"${esc(x)}"`).join(', ')}. Adicione esses pela busca ou por "Comi fora".</div>` : ''}
    <div class="pratos-tot" id="dTot"></div>
    <div class="btn-row"><button class="btn ghost" data-action="d-voltar" style="flex:.6">Editar texto</button><button class="btn" data-action="d-add" id="dAdd">Lançar</button></div>`);
  atualizarDescrever();
}
function itemDesc(it) {
  const k = num(it.gramas) / 100, fd = it.fd;
  return { nome: fd.nome, gramas: r1(num(it.gramas)), kcal: Math.round(fd.kcal * k), prot: r1(fd.prot * k), carb: r1(fd.carb * k), gord: r1(fd.gord * k), fibra: r1(fd.fibra * k) };
}
function atualizarDescrever() {
  const f = form; if (!f?.itens) return;
  const tot = { kcal: 0, prot: 0, carb: 0, gord: 0, fibra: 0 }; let n = 0;
  f.itens.forEach((it, i) => {
    const r = itemDesc(it), el = $('#dk_' + i);
    if (el) el.textContent = num(it.gramas) > 0 ? `${fmt(r.kcal)} kcal · P ${fmt(r.prot, 1)} · C ${fmt(r.carb, 1)} · G ${fmt(r.gord, 1)}` : '';
    if (num(it.gramas) > 0) { n++; for (const k in tot) tot[k] += r[k]; }
  });
  const t = $('#dTot'), b = $('#dAdd');
  if (t) t.innerHTML = n ? `<div class="pk num"><span><b>${fmt(tot.kcal)}</b> kcal</span><span><b>${fmt(tot.prot)}</b> g prot</span><span><b>${fmt(tot.carb)}</b> g carb</span><span><b>${fmt(tot.gord)}</b> g gord</span></div>` : '';
  if (b) { b.disabled = !n; b.textContent = n ? `Lançar ${n} ${n === 1 ? 'item' : 'itens'}` : 'Lançar'; }
}
function lancarDescricao() {
  const f = form; if (!f?.itens) return;
  const itens = f.itens.filter((it) => num(it.gramas) > 0);
  if (!itens.length) return;
  const { data, refeicao } = f; let kcal = 0;
  fecharSheet();
  for (const it of itens) {
    const r = itemDesc(it);
    adicionar('refeicoes', { data, hora: data === hoje() ? agoraHora() : '', refeicao, alimento: r.nome + (it.assumido ? ' ≈' : ''), gramas: r.gramas, kcal: r.kcal, prot: r.prot, carb: r.carb, gord: r.gord, fibra: r.fibra });
    kcal += r.kcal;
  }
  toast(`${itens.length} ${itens.length === 1 ? 'item lançado' : 'itens lançados'} · ${fmt(kcal)} kcal`);
}

// ---------- Combos (sincronizados pela aba Config da planilha) ----------
function lerCombos() { try { const c = JSON.parse(S.config.combos || '[]'); return Array.isArray(c) ? c : []; } catch { return []; } }
function gravarCombos(c) { salvarConfig({ ...S.config, combos: JSON.stringify(c) }); }
// combos antigos, guardados só neste aparelho: entram na lista sincronizada (sem sobrescrever os que já estão lá)
function migrarCombos() {
  let local = [];
  try { local = JSON.parse(localStorage.getItem('vitta:combos') || '[]'); } catch { local = []; }
  if (!Array.isArray(local) || !local.length) return;
  const atuais = lerCombos(), nomes = new Set(atuais.map((x) => norm(x.nome)));
  const novos = local.filter((x) => x && x.nome && !nomes.has(norm(x.nome)));
  if (novos.length) gravarCombos([...atuais, ...novos]);
  try { localStorage.removeItem('vitta:combos'); } catch { /* sem armazenamento */ }
}
function salvarCombo() {
  const f = form;
  const itens = f.lista.map((p, i) => ({ nome: p.nome, q: f.pratos[i].q, modo: f.pratos[i].modo })).filter((x) => num(x.q) > 0);
  if (!itens.length) return;
  const nome = (window.prompt('Nome do combo (ex.: Ceia de sempre)') || '').trim();
  if (!nome) return;
  const c = lerCombos().filter((x) => norm(x.nome) !== norm(nome));
  c.push({ nome, itens });
  gravarCombos(c);
  f.data = $('#fData')?.value || f.data;
  renderRefeicao(); toast(`Combo "${nome}" salvo`);
}
function aplicarCombo(i) {
  const f = form, c = lerCombos()[i]; if (!c) return;
  f.data = $('#fData')?.value || f.data;
  for (const it of c.itens) {
    let k = f.lista.findIndex((p) => norm(p.nome) === norm(it.nome));
    if (k < 0) { if (!alimentoPorNome(it.nome)) continue; f.lista.push({ nome: it.nome, food: it.nome }); f.pratos.push({ q: '', modo: 'g' }); k = f.lista.length - 1; }
    f.pratos[k].q = String(it.q); f.pratos[k].modo = it.modo;
  }
  renderRefeicao();
}
function alimentoPorNome(nome) {
  const n = norm(nome);
  return todosAlimentos().find((a) => norm(a.nome) === n);
}
function calcPrato(i) {
  const p = form.lista[i], st = form.pratos[i], fd = alimentoPorNome(p.food);
  const q = num(st.q);
  if (!fd || !(q > 0)) return null; // ignora vazio, zero e negativo
  const g = st.modo === 'un' ? q * p.g : q;
  const k = g / 100;
  return { nome: p.nome, gramas: r1(g), q, modo: st.modo, kcal: Math.round(fd.kcal * k), prot: r1(fd.prot * k), carb: r1(fd.carb * k), gord: r1(fd.gord * k), fibra: r1(fd.fibra * k) };
}
function htmlPratos() {
  const ultima = ultimaRefeicao(form.refeicao, form.data);
  return `<div class="pratos">
    <div class="pratos-h"><span class="lbl-t">Pratos</span>
      <div class="seg" style="width:160px">${[['meta', '% meta'], ['dia', '% dia']].map(([k, r]) => `<button class="${ui.pctModo === k ? 'on' : ''}" data-action="pct-modo-pratos" data-v="${k}">${r}</button>`).join('')}</div>
    </div>
    <div class="pbusca"><input class="input" id="pBusca" placeholder="Buscar alimento… (ex.: pão, banana)" autocomplete="off"><div id="pRes"></div></div>
    <div class="p-atalhos">
      ${ultima ? `<button class="btn ghost p-rep" data-action="p-repetir">↻ Repetir ${esc(form.refeicao.toLowerCase())} de ${ultima.data.slice(8)}/${ultima.data.slice(5, 7)}</button>` : ''}
      <button class="btn ghost p-rep" data-action="desc-abrir">✍️ Descrever o que comi</button>
      <button class="btn ghost p-rep" data-action="fora-abrir">🍽️ Comi fora (estimado)</button>
      <button class="btn ghost p-rep" data-action="esp-abrir">🌭 Esporádicos</button>
      ${lerCombos().map((c, i) => `<span class="combo"><button data-action="p-combo" data-i="${i}">★ ${esc(c.nome)}</button><button class="cx" data-action="p-combo-del" data-i="${i}" aria-label="Excluir combo">×</button></span>`).join('')}
    </div>
    ${form.lista.map((p, i) => {
      const fd = alimentoPorNome(p.food), st = form.pratos[i];
      const un = st.modo === 'un' ? p.un : (p.medida || 'g');
      return `<div class="prato">
        <div class="pn"><b>${esc(p.nome)}</b><small class="num">${!fd ? 'não encontrado' : p.un ? `1 ${p.un} = ${p.g} ${p.medida || 'g'}` : fmt(fd.kcal) + ' kcal/100 g'}</small></div>
        <div class="pstep"><button class="stp" data-action="p-step" data-i="${i}" data-d="-1" aria-label="Diminuir">−</button><input class="input num pq" id="pq_${i}" type="number" inputmode="decimal" min="0" step="any" placeholder="0" value="${esc(st.q)}"><button class="stp" data-action="p-step" data-i="${i}" data-d="1" aria-label="Aumentar">+</button></div>
        ${p.un
          ? `<div class="pu-seg">${['un', 'g'].map((m) => `<button class="${st.modo === m ? 'on' : ''}" data-action="p-modo" data-i="${i}" data-m="${m}">${m === 'un' ? p.un : (p.medida || 'g')}</button>`).join('')}</div>`
          : `<span class="pu fixo">${un}</span>`}
        <div class="pk num" id="pk_${i}" hidden></div>
      </div>`;
    }).join('')}
    <div class="pratos-tot" id="pTot"></div>
    <button class="btn" data-action="p-add" id="pAdd" disabled>Adicionar pratos</button>
    <button class="link p-save" data-action="p-combo-save" id="pCombo" hidden>★ Salvar esta seleção como combo</button>
  </div>`;
}
function atualizarPratos() {
  let tot = { kcal: 0, prot: 0, carb: 0, gord: 0, fibra: 0 }, n = 0;
  const itens = form.lista.map((_, i) => calcPrato(i));
  for (const r of itens) if (r) { n++; for (const k in tot) tot[k] += r[k]; }
  // % da meta: sobre a meta do dia (calorias e carbo: alvo/referência; proteína e gordura: meio da faixa; fibra: mínimo)
  // % do dia: sobre o total do dia já lançado + estes pratos
  const data = $('#fData')?.value || form.data;
  const M = metasDia(data);
  const jaDia = totaisDia(data);
  const totDia = {}; for (const k in tot) totDia[k] = jaDia[k] + tot[k];
  const pc = (v, k) => ui.pctModo === 'dia'
    ? (totDia[k] ? `<span class="pct-dia">${fmt(v / totDia[k] * 100)}%</span>` : '')
    : pctDia(v, M[k]);
  const item = (v, un, k) => `<span><b>${fmt(v)}</b> ${un} ${pc(v, k)}</span>`;
  const linha = (r) => item(r.kcal, 'kcal', 'kcal') + item(r.prot, 'g prot', 'prot') + item(r.carb, 'g carb', 'carb') + item(r.gord, 'g gord', 'gord') + item(r.fibra, 'g fibra', 'fibra');
  form.lista.forEach((p, i) => {
    const r = itens[i], el = $('#pk_' + i);
    if (el) { el.innerHTML = r ? linha(r) : ''; el.hidden = !r; }
  });
  const t = $('#pTot'), b = $('#pAdd');
  const legenda = ui.pctModo === 'dia'
    ? (jaDia.n ? `% do dia: sobre o que já foi lançado (${fmt(jaDia.kcal)} kcal) + estes pratos` : '% do dia: sobre o total do dia (estes pratos)')
    : '% da meta do dia';
  if (t) t.innerHTML = n ? `<div class="pk num">${linha(tot)}</div><span class="num">${legenda}</span>` : '';
  const cb = $('#pCombo'); if (cb) cb.hidden = !n;
  if (b) { b.disabled = !n; b.textContent = n ? `Adicionar ${n} ${n === 1 ? 'prato' : 'pratos'}` : 'Adicionar pratos'; }
}
function addPratos() {
  const f = form;
  f.data = $('#fData')?.value || f.data;
  const itens = f.lista.map((_, i) => calcPrato(i)).filter(Boolean);
  if (!itens.length) return;
  let kcal = 0;
  for (const it of itens) {
    const p = f.lista.find((x) => x.nome === it.nome);
    const rot = it.modo === 'un' ? `${it.nome} (${fmt(it.q, it.q % 1 ? 1 : 0)} ${p.un}${it.q > 1 && p.un !== 'un' ? 's' : ''})` : it.nome;
    adicionar('refeicoes', { data: f.data, hora: f.data === hoje() ? agoraHora() : '', refeicao: f.refeicao, alimento: rot, gramas: it.gramas, kcal: it.kcal, prot: it.prot, carb: it.carb, gord: it.gord, fibra: it.fibra });
    f.adicionados.push(rot); kcal += it.kcal;
  }
  toast(`${itens.length} ${itens.length === 1 ? 'prato adicionado' : 'pratos adicionados'} · ${fmt(kcal)} kcal`);
  f.pratos = novosPratos(f.lista);
  renderRefeicao();
}
function renderRefeicao() {
  const f = form;
  const rec = recentes();
  abrirSheet(`
    <div class="sheet-h"><h2>Refeição</h2>
      <div style="display:flex;gap:8px;align-items:center"><input class="input date-sm" type="date" id="fData" value="${f.data}" max="${hoje()}" aria-label="Data"><button class="iconbtn" data-action="fechar">${ICON.x}</button></div>
    </div>
    <div class="field"><div class="chips scroll">${REFEICOES.map((r) => `<button class="chip ${f.refeicao === r.k ? 'on' : ''}" data-action="f-ref" data-v="${r.k}">${r.ico} ${r.k}</button>`).join('')}</div></div>
    ${!f.food && !f.manual ? htmlPratos() : ''}
    ${f.food || f.manual ? '<div class="lbl-t" style="margin-top:6px">Alimento</div>' : ''}
    <div id="foodArea"></div>
    ${f.adicionados.length ? `<div class="note">✓ Adicionado nesta refeição: ${f.adicionados.map(esc).join(', ')}</div>` : ''}
    ${!f.food && !f.manual && rec.length ? `<div class="field"><span class="lbl-t">Recentes</span><div class="chips">${rec.map((r, i) => `<button class="chip" data-action="f-rec" data-i="${i}">${esc(r.nome)} · ${fmt(r.gramas)}g</button>`).join('')}</div></div>` : ''}
    ${f.adicionados.length && !f.food && !f.manual ? `<button class="btn" data-action="fechar">Concluir</button>` : ''}
  `);
  renderFoodArea();
  atualizarPratos();
  const chip = $('#sheet .chip.on'), trilho = chip?.parentElement;
  if (chip && trilho) trilho.scrollLeft = chip.offsetLeft - (trilho.clientWidth - chip.offsetWidth) / 2;
  form._rec = rec;
}
function renderFoodArea() {
  const f = form, el = $('#foodArea'); if (!el) return;
  if (f.manual) {
    el.innerHTML = `
      <div class="field"><label>Nome do alimento</label><input class="input" id="mNome" value="${esc(f.busca)}" placeholder="Ex.: Pão de fermentação natural"></div>
      <span class="lbl-t">Informação nutricional por 100 g (veja no rótulo)</span>
      <div class="row3">
        <div class="field"><label>Kcal</label><input class="input num" id="m_kcal" type="number" inputmode="decimal" step="any"></div>
        <div class="field"><label>Prot (g)</label><input class="input num" id="m_prot" type="number" inputmode="decimal" step="any"></div>
        <div class="field"><label>Carb (g)</label><input class="input num" id="m_carb" type="number" inputmode="decimal" step="any"></div>
        <div class="field"><label>Gord (g)</label><input class="input num" id="m_gord" type="number" inputmode="decimal" step="any"></div>
        <div class="field"><label>Fibra (g)</label><input class="input num" id="m_fibra" type="number" inputmode="decimal" step="any"></div>
        <div class="field"><label>Comi (g)</label><input class="input num" id="fGramas" type="number" inputmode="decimal" value="${f.gramas}"></div>
      </div>
      <label class="check"><input type="checkbox" id="mSalvar" checked> Salvar em "Meus alimentos"</label>
      <div id="prev"></div>
      <div class="btn-row"><button class="btn ghost" data-action="f-cancel-manual" style="flex:.6">Voltar</button><button class="btn" data-action="f-add">Adicionar</button></div>`;
    atualizarPreview();
    return;
  }
  if (!f.food) {
    el.innerHTML = `<button class="link" data-action="f-manual" style="margin:2px 0 12px">+ Alimento que não está na busca (digitar os valores)</button>`;
    return;
  }
  const fd = f.food;
  el.innerHTML = `
    <div class="field"><div class="picked"><div><b>${esc(fd.nome)}</b><small class="num">por 100 g: ${fmt(fd.kcal)} kcal · P ${fmt(fd.prot, 1)} · C ${fmt(fd.carb, 1)} · G ${fmt(fd.gord, 1)}</small></div><button class="link" data-action="f-trocar">Trocar</button></div></div>
    <div class="field"><label>Quantidade (gramas)</label>
      <input class="input num" id="fGramas" type="number" inputmode="decimal" value="${f.gramas}">
      <div class="chips" style="margin-top:8px">${[30, 50, 100, 150, 200, 250].map((g) => `<button class="chip" data-action="f-g" data-v="${g}">${g} g</button>`).join('')}</div>
    </div>
    <div id="prev"></div>
    <button class="btn" data-action="f-add">Adicionar</button>`;
  atualizarPreview();
}
function buscarPratos(texto) {
  const el = $('#pRes'); if (!el) return;
  const q = norm(texto.trim());
  if (!q) { el.innerHTML = ''; form._pres = []; return; }
  form.busca = texto.trim();
  const termos = q.split(/\s+/);
  const res = todosAlimentos().filter((a) => { const n = norm(a.nome); return termos.every((t) => n.includes(t)); })
    .sort((a, b) => (norm(a.nome).startsWith(q) ? 0 : 1) - (norm(b.nome).startsWith(q) ? 0 : 1)).slice(0, 6);
  form._pres = res;
  el.innerHTML = `<div class="sugg">${res.length ? res.map((a, i) => `<button data-action="p-pick" data-i="${i}"><span>${esc(a.nome)}${a.meu ? '<span class="tag">MEU</span>' : ''}</span><small class="num">${fmt(a.kcal)} kcal/100g</small></button>`).join('') : '<div class="hint" style="padding:10px 12px">Nada encontrado.</div>'}
    <button data-action="f-manual"><span class="link">+ Adicionar "${esc(texto.trim())}" manualmente</span></button></div>`;
}
// ---------- Editar lançamento de refeição (refeição, quantidade, horário, data) ----------
function sheetEditarRef(id) {
  const r = S.refeicoes.find((x) => x.id === id); if (!r) return;
  form = { tipo: 'edit', r, refeicao: r.refeicao };
  const g = num(r.gramas);
  const refs = REFEICOES.map((x) => x.k); if (!refs.includes(r.refeicao)) refs.unshift(r.refeicao);
  abrirSheet(`
    <div class="sheet-h"><h2>Editar lançamento</h2><button class="iconbtn" data-action="fechar">${ICON.x}</button></div>
    <div class="picked" style="margin-bottom:12px"><div><b>${esc(r.alimento)}</b><small class="num">${fmt(r.kcal)} kcal${g ? ' · ' + fmt(g) + ' g' : ''}</small></div></div>
    <div class="field"><label>Refeição</label><div class="chips scroll">${refs.map((k) => { const R = REFEICOES.find((x) => x.k === k); return `<button class="chip ${r.refeicao === k ? 'on' : ''}" data-action="e-ref" data-v="${esc(k)}">${R ? R.ico + ' ' : ''}${esc(k)}</button>`; }).join('')}</div></div>
    ${g ? `<div class="field"><label>Quantidade (gramas)</label><input class="input num" id="eGramas" type="number" inputmode="decimal" min="0" step="any" value="${g}"><div class="hint">Calorias e macros acompanham a nova quantidade.</div></div>`
      : num(r.kcal) > 0 ? `<div class="field"><label>Calorias (kcal)</label><input class="input num" id="eKcal" type="number" inputmode="decimal" min="0" step="any" value="${num(r.kcal)}"><div class="hint">Se souber o valor real, corrija aqui. Os macros acompanham.</div></div>` : ''}
    <div class="row3">
      <div class="field"><label>Data</label><input class="input" id="eData" type="date" value="${esc(r.data)}" max="${hoje()}"></div>
      <div class="field"><label>Hora</label><input class="input" id="eHora" type="time" value="${esc(r.hora || '')}"></div>
    </div>
    <button class="btn" data-action="e-save">Salvar alterações</button>`);
}
function salvarEdicaoRef() {
  const f = form, r = f?.r; if (!r) return;
  const g0 = num(r.gramas);
  let g = g0 ? num($('#eGramas')?.value) : 0;
  if (g0 && !(g > 0)) { toast('Informe a quantidade'); return; }
  let k = g0 ? g / g0 : 1;
  if (!g0 && $('#eKcal')) { const nk = num($('#eKcal').value); if (!(nk > 0)) { toast('Informe as calorias'); return; } k = nk / num(r.kcal); }
  let alimento = r.alimento;
  const m = String(alimento).match(/^(.*?)\s*\(([\d.,]+)\s*([^)]*)\)\s*$/);
  const p = m && PRATOS.find((x) => norm(x.nome) === norm(m[1]));
  if (p && p.un && g0 && k !== 1) { const q = r1(g / p.g); alimento = `${m[1]} (${fmt(q, q % 1 ? 1 : 0)} ${p.un}${q > 1 && p.un !== 'un' ? 's' : ''})`; }
  const novo = {
    data: $('#eData')?.value || r.data, hora: $('#eHora')?.value || '', refeicao: f.refeicao, alimento,
    gramas: g0 ? r1(g) : r.gramas, kcal: Math.round(num(r.kcal) * k), prot: r1(num(r.prot) * k), carb: r1(num(r.carb) * k), gord: r1(num(r.gord) * k), fibra: r1(num(r.fibra) * k),
  };
  fecharSheet();
  remover('refeicoes', r.id);
  adicionar('refeicoes', novo);
  toast('Lançamento atualizado');
}
function renderSugestoes() {
  const el = $('#sugg'); if (!el) return;
  const q = norm(form.busca.trim());
  if (!q) { el.innerHTML = ''; return; }
  const termos = q.split(/\s+/);
  const res = todosAlimentos().filter((a) => { const n = norm(a.nome); return termos.every((t) => n.includes(t)); })
    .sort((a, b) => (norm(a.nome).startsWith(q) ? 0 : 1) - (norm(b.nome).startsWith(q) ? 0 : 1)).slice(0, 8);
  form._sugg = res;
  el.innerHTML = `<div class="sugg">${res.map((a, i) => `<button data-action="f-pick" data-i="${i}"><span>${esc(a.nome)}${a.meu ? '<span class="tag">MEU</span>' : ''}</span><small class="num">${fmt(a.kcal)} kcal/100g</small></button>`).join('')}
    <button data-action="f-manual"><span class="link">+ Adicionar "${esc(form.busca.trim())}" manualmente</span></button></div>`;
}
function valoresManuais() {
  const g = (id) => Math.max(0, num($('#' + id)?.value));
  return { nome: ($('#mNome')?.value || '').trim(), kcal: g('m_kcal'), prot: g('m_prot'), carb: g('m_carb'), gord: g('m_gord'), fibra: g('m_fibra') };
}
function calcItem() {
  const f = form;
  const fd = f.manual ? valoresManuais() : f.food;
  const g = num($('#fGramas')?.value ?? f.gramas);
  if (!fd || !(g > 0)) return null;
  const k = g / 100;
  return { nome: fd.nome, gramas: g, kcal: Math.round(fd.kcal * k), prot: r1(fd.prot * k), carb: r1(fd.carb * k), gord: r1(fd.gord * k), fibra: r1(fd.fibra * k) };
}
function atualizarPreview() {
  const el = $('#prev'); if (!el) return;
  const it = calcItem() || { kcal: 0, prot: 0, carb: 0, gord: 0, fibra: 0 };
  el.innerHTML = `<div class="preview num">
    <div><b style="color:var(--kcal)">${fmt(it.kcal)}</b><small>kcal</small></div>
    <div><b style="color:var(--prot)">${fmt(it.prot)}</b><small>Prot</small></div>
    <div><b style="color:var(--carb)">${fmt(it.carb)}</b><small>Carb</small></div>
    <div><b style="color:var(--gord)">${fmt(it.gord)}</b><small>Gord</small></div>
    <div><b style="color:var(--fibra)">${fmt(it.fibra)}</b><small>Fibra</small></div></div>`;
}
function addRefeicao() {
  const f = form;
  const it = calcItem();
  if (!it || !it.nome) { toast(f.manual ? 'Informe o nome e a quantidade' : 'Escolha um alimento e a quantidade'); return; }
  if (f.manual && $('#mSalvar')?.checked) {
    const v = valoresManuais();
    if (!S.alimentos.some((a) => norm(a.nome) === norm(v.nome))) adicionar('alimentos', { nome: v.nome, kcal: v.kcal, prot: v.prot, carb: v.carb, gord: v.gord, fibra: v.fibra });
  }
  f.data = $('#fData')?.value || f.data;
  adicionar('refeicoes', { data: f.data, hora: f.data === hoje() ? agoraHora() : '', refeicao: f.refeicao, alimento: it.nome, gramas: it.gramas, kcal: it.kcal, prot: it.prot, carb: it.carb, gord: it.gord, fibra: it.fibra });
  toast(`${it.nome} adicionado (${fmt(it.kcal)} kcal)`);
  f.adicionados.push(it.nome);
  f.food = null; f.manual = false; f.busca = ''; f.gramas = 100;
  renderRefeicao();
}

function pesoRef() { return pesoAtual() || 70; }
function sheetAtividade() {
  form = { tipo: 'atividade', data: ui.view === 'hoje' ? ui.dia : hoje(), a: { tipo: 'Musculação', treino: proximoTreino(), ex: {}, cg: {}, min: '', dist: '', nivel: '', intens: 'Moderada', nome: '' } };
  abrirSheet(`
    <div class="sheet-h"><h2>Atividade física</h2><button class="iconbtn" data-action="fechar">${ICON.x}</button></div>
    <div class="field"><div class="chips">${ATIVIDADES.map((a) => `<button class="chip ${a.k === form.a.tipo ? 'on' : ''}" data-action="a-tipo" data-v="${a.k}">${a.ico} ${a.k}</button>`).join('')}</div></div>
    <div class="row">
      <div class="field"><label>Data</label><input class="input" type="date" id="aData" value="${form.data}" max="${hoje()}"></div>
      <div class="field" id="aMinWrap"><label>Tempo (min)</label><input class="input num" type="number" inputmode="numeric" id="a_min" placeholder="Ex.: 45"></div>
    </div>
    <div id="aCampos"></div>
    <div class="calc" id="aCalc"></div>
    <div class="field"><label>Observação (opcional)</label><input class="input" id="aObs" placeholder="Ex.: treino de pernas"></div>
    <button class="btn" data-action="a-add">Salvar atividade</button>`);
  renderCamposAtividade();
}
function renderCamposAtividade() {
  const a = form.a, A = ATIVIDADES.find((x) => x.k === a.tipo);
  // na musculação com treino A/B/C o tempo não é pedido
  const comTreino = a.tipo === 'Musculação' && TREINOS[a.treino];
  $('#aMinWrap').style.visibility = comTreino ? 'hidden' : '';
  const html = A.campos.map((c) => {
    if (c === 'treino') {
      return `<div class="field"><span class="lbl-t">Treino</span>
        <div class="seg">${[...Object.keys(TREINOS), 'Livre'].map((k) => `<button class="${a.treino === k ? 'on' : ''}" data-action="a-treino" data-v="${k}">${k === 'Livre' ? 'Livre' : 'Treino ' + k}</button>`).join('')}</div>
        <div class="hint">${comTreino ? `${TREINOS[a.treino].grupos} · 4 séries por exercício. Desmarque o que não fez:` : 'Treino fora do rodízio: informe o tempo e a intensidade.'}</div>
        ${comTreino ? `<div class="exlist">${TREINOS[a.treino].exercicios.map((e, i) => {
          const on = exMarcado(TREINOS[a.treino], a.ex, i), v = cargaForm(a, i, historicoCargas());
          return `<div class="exrow"><button type="button" class="exi ${on ? 'on' : ''}" data-action="a-ex" data-v="${i}"><span class="exk">${on ? '✓' : ''}</span>${esc(e.n)}</button>
            ${on ? `<input class="input num excg" id="cg_${i}" type="number" inputmode="decimal" step="0.5" placeholder="kg" value="${esc(v.c)}" aria-label="Carga em kg"><input class="input num excg" id="rp_${i}" type="number" inputmode="numeric" placeholder="reps" value="${esc(v.r)}" aria-label="Repetições">` : ''}</div>`;
        }).join('')}</div><div class="hint">Carga (kg) e repetições de cada exercício; já vêm preenchidas com a última vez. Deixe em branco o que não quiser registrar.</div>` : ''}</div>
        ${comTreino ? '' : `<div class="field"><span class="lbl-t">Intensidade</span><div class="seg">${INTENS.map((k) => `<button class="${k === a.intens ? 'on' : ''}" data-action="a-int" data-v="${k}">${k}</button>`).join('')}</div></div>`}`;
    }
    if (c === 'nome') return `<div class="field"><label>Qual atividade?</label><input class="input" id="a_nome" value="${esc(a.nome)}" placeholder="Ex.: Futebol, Yoga, Funcional"></div>`;
    if (c === 'int') return `<div class="field"><span class="lbl-t">Intensidade</span><div class="seg">${INTENS.map((k) => `<button class="${k === a.intens ? 'on' : ''}" data-action="a-int" data-v="${k}">${k}</button>`).join('')}</div></div>`;
    if (c === 'dist') return `<div class="field"><label>Distância (km)</label><input class="input num" type="number" inputmode="decimal" step="0.01" id="a_dist" value="${a.dist}" placeholder="${a.tipo === 'Elíptico' ? 'opcional' : 'Ex.: 5,2'}"></div>`;
    if (c === 'distm') return `<div class="field"><label>Distância (metros)</label><input class="input num" type="number" inputmode="numeric" id="a_distm" value="${a.dist ? Math.round(a.dist * 1000) : ''}" placeholder="Ex.: 1000"></div>`;
    if (c === 'incl') return `<div class="field"><label>Inclinação (%)</label><input class="input num" type="number" inputmode="decimal" step="0.5" id="a_nivel" value="${a.nivel}" placeholder="esteira · opcional"></div>`;
    if (c === 'nivel') return `<div class="field"><label>Nível${a.tipo === 'Bicicleta' ? ' (ergométrica)' : ''}</label><input class="input num" type="number" inputmode="numeric" id="a_nivel" value="${a.nivel}" placeholder="opcional"></div>`;
    return '';
  });
  // distância e nível lado a lado quando houver os dois
  const temPar = A.campos.length === 2 && !A.campos.includes('int');
  $('#aCampos').innerHTML = temPar ? `<div class="row">${html.join('')}</div>` : html.join('');
  atualizarCalc();
}
function atualizarCalc() {
  const el = $('#aCalc'); if (!el || !form?.a) return;
  const r = calcAtividade(form.a, pesoRef());
  el.innerHTML = `<div><small>Calorias gastas (estimativa)</small><b class="num">${r.kcal ? fmt(r.kcal) : '—'}<span> kcal</span></b></div>
    <p>${esc(r.info)}${r.met ? ` · MET ${fmt(r.met, 1)}` : ''} · peso ${fmt(pesoRef(), 1)} kg${pesoAtual() ? '' : ' (registre seu peso para mais precisão)'}</p>`;
}
function addAtividade() {
  const a = form.a;
  const T = a.tipo === 'Musculação' ? TREINOS[a.treino] : null;
  if (!T && !num(a.min)) { toast('Informe o tempo da atividade'); return; }
  const r = calcAtividade(a, pesoRef());
  const data = $('#aData').value || hoje();
  const usaInt = ATIVIDADES.find((x) => x.k === a.tipo).campos.some((c) => c === 'int' || c === 'treino');
  adicionar('atividades', {
    data, hora: data === hoje() ? agoraHora() : '',
    tipo: a.tipo === 'Outros' ? (a.nome.trim() || 'Outros') : a.tipo,
    minutos: T ? (T.exercicios.length ? calcTreino(T, a.ex, pesoRef()).min : T.minutos) : num(a.min), distancia: num(a.dist) || '', nivel: num(a.nivel) || '',
    intensidade: T ? 'Treino ' + a.treino : usaInt ? a.intens : '',
    kcal: r.kcal, obs: ($('#aObs').value.trim() || (T ? T.grupos : '')) + (T ? stringCargas(a) : ''),
  });
  fecharSheet(); toast(`Atividade registrada · ${fmt(r.kcal)} kcal 💪`);
}

function sheetPeso() {
  form = { tipo: 'peso' };
  abrirSheet(`
    <div class="sheet-h"><h2>Registrar peso</h2><button class="iconbtn" data-action="fechar">${ICON.x}</button></div>
    <div class="field"><label>Peso (kg)</label><input class="input num" type="number" inputmode="decimal" step="0.1" id="pPeso" placeholder="${pesoAtual() ? fmt(pesoAtual(), 1) : '70,0'}" style="font-size:28px;font-weight:800;text-align:center;padding:16px"></div>
    <div class="field"><label>Data</label><input class="input" type="date" id="pData" value="${hoje()}" max="${hoje()}"></div>
    <div class="field"><label>Observação (opcional)</label><input class="input" id="pObs" placeholder="Ex.: em jejum"></div>
    <button class="btn" data-action="p-add">Salvar peso</button>`);
  setTimeout(() => $('#pPeso')?.focus(), 250);
}
function addPeso() {
  const p = num($('#pPeso').value);
  if (!p || p < 20 || p > 400) { toast('Informe um peso válido'); return; }
  adicionar('peso', { data: $('#pData').value || hoje(), peso: r1(p), obs: $('#pObs').value.trim() });
  fecharSheet(); toast('Peso registrado ⚖️');
}

// ---------- Eventos ----------
document.addEventListener('click', (e) => {
  const nav = e.target.closest('[data-nav]');
  if (nav) { ui.view = nav.dataset.nav; if (ui.view === 'hoje') ui.dia = ui.dia || hoje(); render(); window.scrollTo(0, 0); return; }
  if (e.target.id === 'overlay') { fecharSheet(); return; }
  const b = e.target.closest('[data-action]'); if (!b) return;
  const a = b.dataset.action;
  switch (a) {
    case 'open-add': sheetMenu(); break;
    case 'fechar': fecharSheet(); break;
    case 'sync': sync(true); break;
    case 'dia': ui.dia = addDias(ui.dia, Number(b.dataset.n)); if (ui.dia > hoje()) ui.dia = hoje(); render(); break;
    case 'ir-hoje': ui.dia = hoje(); render(); break;
    case 'semana': ui.semanaRef = addDias(ui.semanaRef, Number(b.dataset.n)); render(); break;
    case 'freq-mes': { const t = hoje(), [y, m] = (ui.freqMes || t.slice(0, 7)).split('-').map(Number), d = new Date(y, m - 1 + Number(b.dataset.n), 1); const novo = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; ui.freqMes = novo > t.slice(0, 7) ? t.slice(0, 7) : novo; render(); break; }
    case 'semana-atual': ui.semanaRef = hoje(); render(); break;
    case 'abrir-dia': ui.dia = b.dataset.d; ui.view = 'hoje'; render(); window.scrollTo(0, 0); break;
    case 'peso-range': ui.pesoRange = b.dataset.v; render(); break;
    case 'graf-sem': ui.grafSem = b.dataset.v; render(); break;
    case 'cascata-modo': ui.cascataModo = b.dataset.v; render(); break;
    case 'abrir-cal': sheetCalendario(b.dataset.alvo); break;
    case 'cal-mes': {
      const [y, m] = cal.mes.split('-').map(Number);
      const nd = new Date(y, m - 1 + Number(b.dataset.n), 1);
      cal.mes = `${nd.getFullYear()}-${pad(nd.getMonth() + 1)}`; renderCalendario();
      break;
    }
    case 'cal-dia': {
      if (cal.alvo === 'semana') { ui.semanaRef = b.dataset.d; } else { ui.dia = b.dataset.d; }
      fecharSheet(); render(); window.scrollTo(0, 0);
      break;
    }
    case 'cal-hoje': { if (cal.alvo === 'semana') ui.semanaRef = hoje(); else ui.dia = hoje(); fecharSheet(); render(); break; }
    case 'conf-ok': { const fn = confirmar._ok; fecharSheet(); confirmar._ok = null; if (fn) fn(); break; }
    case 'heat-modo': ui.heatModo = b.dataset.v; render(); break;
    case 'pct-modo': ui.pctModo = b.dataset.v; render(); break;
    case 'pct-modo-pratos':
      ui.pctModo = b.dataset.v;
      document.querySelectorAll('[data-action="pct-modo-pratos"]').forEach((c) => c.classList.toggle('on', c === b));
      atualizarPratos(); render();
      break;
    case 'nova-refeicao': sheetRefeicao(); break;
    case 'prot-add': lancarProteina(Number(b.dataset.i)); break;
    case 'nova-atividade': sheetAtividade(); break;
    case 'novo-peso': sheetPeso(); break;
    case 'del': {
      const nomes = { refeicoes: 'este alimento', atividades: 'esta atividade', peso: 'esta pesagem', alimentos: 'este alimento de "Meus alimentos"' };
      const tipo = b.dataset.tipo, id = b.dataset.id;
      confirmar(`Excluir ${nomes[tipo]}?`, 'Excluir', () => { remover(tipo, id); toast('Excluído'); });
      break;
    }
    case 'modo-metas': {
      const f = $('#formMetas');
      salvarConfig({ ...(f ? cfgDoForm(f) : S.config), modoMetas: b.dataset.v });
      render();
      break;
    }
    case 'importar-pesos': {
      const r = importarPesos($('#impPesos').value);
      if (!r.novos && !r.repetidos) { toast('Nenhuma linha com data e peso encontrada'); break; }
      render();
      toast(`${r.novos} pesage${r.novos === 1 ? 'm importada' : 'ns importadas'}${r.repetidos ? ` · ${r.repetidos} já existia${r.repetidos === 1 ? '' : 'm'}` : ''}${r.semPeso ? ` · ${r.semPeso} sem peso` : ''}`);
      break;
    }
    case 'importar-corpo': {
      const r = importarCorpo($('#impCorpo').value);
      if (!r.novos && !r.atualizados && !r.pesos) { toast('Nenhuma linha válida encontrada'); break; }
      render();
      toast(`${r.novos} nova${r.novos === 1 ? '' : 's'} · ${r.atualizados} atualizada${r.atualizados === 1 ? '' : 's'}${r.pesos ? ` · ${r.pesos} peso${r.pesos === 1 ? '' : 's'}` : ''}${r.ignoradas ? ` · ${r.ignoradas} ignorada${r.ignoradas === 1 ? '' : 's'}` : ''}`);
      break;
    }
    case 'rel-pdf': imprimirHtml(relatorioHTML($('#relMes').value)); break;
    case 'rel-csv': { const ym = $('#relMes').value; baixarArquivo(`vitta-${ym}.csv`, relatorioCSV(ym), 'text/csv;charset=utf-8'); toast('CSV baixado'); break; }
    case 'peso-sub': ui.pesoSub = b.dataset.v; render(); if (ui.pesoSub === 'corpo') sync(false); break; // ao abrir a composição, busca as medições mais recentes da planilha
    case 'nova-corpo': sheetCorpo(); break;
    case 'edit-corpo': sheetCorpo(b.dataset.d); break;
    case 'corpo-salvar': salvarCorpo(); break;
    case 'sem-sub': ui.semSub = b.dataset.v; render(); window.scrollTo(0, 0); break;
    case 'corpo-modo': ui.corpoModo = b.dataset.v; ui.corpoMetrica = ''; render(); break;
    case 'corpo-unid': ui.corpoUnid = b.dataset.v; render(); break;
    case 'corpo-per': ui.corpoPer = b.dataset.v; render(); break;
    case 'corpo-metrica': ui.corpoMetrica = b.dataset.v; render(); break;
    case 'corpo-grupo': ui.corpoGrupo = b.dataset.v; ui.corpoMetrica = ''; render(); break;
    case 'del-corpo': {
      const d = b.dataset.d;
      confirmar('Excluir esta medição?', 'Excluir', () => { const o = lerCorpo(); delete o[d]; gravarCorpo(o); render(); toast('Medição excluída'); }, `Medição de ${dataCurta(d)}. O peso do dia não é apagado.`);
      break;
    }
    case 'backup': {
      const blob = new Blob([JSON.stringify({ ...S, conn: undefined }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const l = document.createElement('a');
      l.href = url; l.download = `vitta-backup-${hoje()}.json`; l.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      break;
    }
    // refeição
    case 'f-ref':
      form.refeicao = b.dataset.v; form.data = $('#fData')?.value || form.data;
      // sem nada digitado, a lista se reordena pelo que você mais lança nessa refeição
      if (form.lista && !form.pratos.some((s) => num(s.q) > 0) && !form.food && !form.manual) { form.lista = listaPratos(form.refeicao); form.pratos = novosPratos(form.lista); renderRefeicao(); }
      else document.querySelectorAll('[data-action="f-ref"]').forEach((c) => c.classList.toggle('on', c === b));
      break;
    case 'p-step': {
      const i = Number(b.dataset.i), st = form.pratos[i], p = form.lista[i];
      const v = Math.max(0, Math.round((num(st.q) + Number(b.dataset.d) * passoPrato(p, st)) * 100) / 100);
      st.q = v ? String(v) : '';
      const inp = $('#pq_' + i); if (inp) inp.value = st.q;
      atualizarPratos();
      break;
    }
    case 'p-pick': {
      const a = form._pres[Number(b.dataset.i)]; if (!a) break;
      form.data = $('#fData')?.value || form.data;
      const i = form.lista.findIndex((p) => norm(p.nome) === norm(a.nome));
      if (i >= 0) { const st = form.pratos[i]; st.q = String(num(st.q) + passoPrato(form.lista[i], st)); }
      else { form.lista.unshift({ nome: a.nome, food: a.nome }); form.pratos.unshift({ q: '100', modo: 'g' }); }
      renderRefeicao();
      break;
    }
    case 'p-repetir': repetirRefeicao(); break;
    case 'desc-abrir': sheetDescrever(); break;
    case 'd-ler': {
      form.texto = $('#dTexto')?.value || form.texto;
      if (!form.texto.trim()) { toast('Escreva o que você comeu'); break; }
      const r = interpretarTexto(form.texto); form.itens = r.itens; form.nao = r.nao; renderDescrever();
      break;
    }
    case 'd-voltar': form.itens = null; renderDescrever(); break;
    case 'd-del': form.itens.splice(Number(b.dataset.i), 1); renderDescrever(); break;
    case 'd-add': lancarDescricao(); break;
    case 'fora-abrir': sheetFora(); break;
    case 'fora-add': addFora(Number(b.dataset.i), Number(b.dataset.j)); break;
    case 'esp-abrir': sheetEsp(); break;
    case 'esp-add': addEsp(Number(b.dataset.i), Number(b.dataset.j)); break;
    case 'esp-edit': sheetEspEditar(Number(b.dataset.i)); break;
    case 'esp-voltar': form = { tipo: 'esp', refeicao: form.refeicao, data: form.data }; renderEsp(); break;
    case 'esp-salvar': salvarEsp(); break;
    case 'esp-del': {
      const f = form, L = lerEsp(); if (!L[f.idx]) break;
      L.splice(f.idx, 1); gravarEsp(L);
      form = { tipo: 'esp', refeicao: f.refeicao, data: f.data }; renderEsp(); toast('Esporádico excluído');
      break;
    }
    case 'p-combo': aplicarCombo(Number(b.dataset.i)); break;
    case 'p-combo-save': salvarCombo(); break;
    case 'p-combo-del': {
      const i = Number(b.dataset.i), c = lerCombos(), alvo = c[i]; if (!alvo) break;
      const dataF = $('#fData')?.value || form.data;
      c.splice(i, 1); gravarCombos(c); form.data = dataF; renderRefeicao(); toast('Combo excluído');
      break;
    }
    case 'edit-ref': sheetEditarRef(b.dataset.id); break;
    case 'e-ref': form.refeicao = b.dataset.v; document.querySelectorAll('[data-action="e-ref"]').forEach((c) => c.classList.toggle('on', c === b)); break;
    case 'e-save': salvarEdicaoRef(); break;
    case 'f-pick': form.food = form._sugg[Number(b.dataset.i)]; form.data = $('#fData')?.value || form.data; renderRefeicao(); setTimeout(() => $('#fGramas')?.select(), 50); break;
    case 'f-rec': { const r = form._rec[Number(b.dataset.i)]; form.food = r; form.gramas = r.gramas; form.data = $('#fData')?.value || form.data; renderRefeicao(); break; }
    case 'f-trocar': form.food = null; renderRefeicao(); setTimeout(() => $('#fBusca')?.focus(), 50); break;
    case 'f-manual': form.manual = true; form.data = $('#fData')?.value || form.data; renderRefeicao(); setTimeout(() => $('#m_kcal')?.focus(), 50); break;
    case 'f-cancel-manual': form.manual = false; renderRefeicao(); break;
    case 'f-g': $('#fGramas').value = b.dataset.v; form.gramas = num(b.dataset.v); atualizarPreview(); break;
    case 'f-add': addRefeicao(); break;
    case 'p-modo': {
      const i = Number(b.dataset.i), st = form.pratos[i];
      st.modo = b.dataset.m;
      b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      atualizarPratos(); $('#pq_' + i)?.focus();
      break;
    }
    case 'p-add': addPratos(); break;
    // atividade
    case 'a-tipo': form.a.tipo = b.dataset.v; form.a.nivel = ''; document.querySelectorAll('[data-action="a-tipo"]').forEach((c) => c.classList.toggle('on', c === b)); renderCamposAtividade(); break;
    case 'a-treino': form.a.treino = b.dataset.v; form.a.ex = {}; form.a.cg = {}; renderCamposAtividade(); break;
    case 'a-ex': { const i = +b.dataset.v, T = TREINOS[form.a.treino]; form.a.ex = form.a.ex || {}; form.a.ex[i] = !exMarcado(T, form.a.ex, i); renderCamposAtividade(); break; }
    case 'a-int': form.a.intens = b.dataset.v; document.querySelectorAll('[data-action="a-int"]').forEach((c) => c.classList.toggle('on', c === b)); atualizarCalc(); break;
    case 'a-add': addAtividade(); break;
    case 'p-add': addPeso(); break;
  }
});

document.addEventListener('input', (e) => {
  // nenhum campo numérico do app aceita valor negativo (as setinhas do campo podiam descer abaixo de zero)
  if (e.target.type === 'number') {
    e.target.min = '0';
    if (num(e.target.value) < 0) e.target.value = '0';
  }
  const id = e.target.id;
  if (id && id.startsWith('pq_') && form?.pratos) { form.pratos[Number(id.slice(3))].q = e.target.value; atualizarPratos(); }
  else if (id && /^(cg|rp)_\d+$/.test(id) && form?.a) {
    const i = Number(id.slice(3)); form.a.cg = form.a.cg || {}; form.a.cg[i] = form.a.cg[i] || {};
    form.a.cg[i][id.startsWith('cg') ? 'c' : 'r'] = e.target.value;
  }
  else if (id === 'pBusca' && form?.lista) buscarPratos(e.target.value);
  else if (id === 'dTexto' && form?.tipo === 'desc') form.texto = e.target.value;
  else if (id && id.startsWith('dg_') && form?.itens) { form.itens[Number(id.slice(3))].gramas = e.target.value; atualizarDescrever(); }
  else if (id === 'fBusca') { form.busca = e.target.value; renderSugestoes(); }
  else if (id === 'fGramas') { form.gramas = num(e.target.value); atualizarPreview(); }
  else if (id && id.startsWith('m_')) atualizarPreview();
  else if (id === 'mNome') form.busca = e.target.value;
  else if (id && id.startsWith('a_') && form?.a) {
    const v = e.target.value;
    if (id === 'a_distm') form.a.dist = v ? num(v) / 1000 : '';
    else form.a[id.slice(2)] = v;
    atualizarCalc();
  }
  else if (e.target.closest('#formMetas')) atualizarFormMetas(e.target.closest('#formMetas'));
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'calDia' && e.target.value) { ui.dia = e.target.value > hoje() ? hoje() : e.target.value; render(); return; }
  if (e.target.id === 'calSem' && e.target.value) { ui.semanaRef = e.target.value > hoje() ? hoje() : e.target.value; render(); return; }
  if (e.target.id === 'cpA' || e.target.id === 'cpB') { ui.corpoPer = 'custom'; ui.corpoA = $('#cpA').value; ui.corpoB = $('#cpB').value; render(); return; }
  if (e.target.id === 'fData' && form?.pratos) { form.data = e.target.value || form.data; atualizarPratos(); }
  if (e.target.closest && e.target.closest('#formMetas')) atualizarFormMetas(e.target.closest('#formMetas'));
});
function atualizarFormMetas(f) {
  const c = cfgDoForm(f);
  if ($('#kcalHint')) $('#kcalHint').innerHTML = `Seus macros somam <b class="num">${fmt(num(c.prot) * 4 + num(c.carb) * 4 + num(c.gord) * 9)} kcal</b> (4·P + 4·C + 9·G).`;
  if ($('#metasPrev')) $('#metasPrev').innerHTML = previewMetas(c);
  const im = num(c.imcMeta), al = num(c.altura), el = $('#imcPeso');
  if (el) el.textContent = im && al ? (c.modoMetas === 'manual' ? '' : `IMC ${fmt(im, 1)} = `) + fmt(im * Math.pow(al / 100, 2), 1) + ' kg' : (c.modoMetas === 'manual' ? '—' : '');
}

document.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  if (e.target.id === 'formMetas') {
    salvarConfig(cfgDoForm(e.target)); render(); toast('Metas salvas ✓');
  } else if (e.target.id === 'formConn') {
    S.conn = { url: String(fd.get('url') || '').trim(), token: String(fd.get('token') || '').trim() };
    save();
    if (!S.conn.url || !S.conn.token) { toast('Preencha a URL e o token'); return; }
    // Na primeira conexão, os registros locais ainda não enviados entram na fila
    if (!S.lastSync) {
      const naFila = new Set(S.queue.filter((o) => o.op === 'add').map((o) => o.item.id));
      for (const t of LISTAS) for (const it of S[t]) if (!naFila.has(it.id)) S.queue.push({ opId: uid(), op: 'add', tipo: t, item: it });
      if (!S.queue.some((o) => o.op === 'config')) S.queue.push({ opId: uid(), op: 'config', config: S.config });
      save();
    }
    await sync(true); render();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#overlay').hidden) fecharSheet();
  if (e.key === 'Enter' && e.target.id === 'fGramas') { e.preventDefault(); addRefeicao(); }
});

window.addEventListener('online', () => sync(false));
window.addEventListener('offline', () => updateSyncPill());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    // virou o dia com o app aberto em segundo plano → volta para "hoje"
    if (ui.abertoEm !== hoje() && !form) { if (ui.dia === ui.abertoEm) ui.dia = hoje(); ui.semanaRef = hoje(); ui.abertoEm = hoje(); render(); }
    sync(false);
  }
});

// ---------- Início ----------
cargaInicial();
cargaRegistros();
if (!S.conn.url) migrarCombos(); // com planilha conectada, a migração roda depois do primeiro sync
render();
sync(false);
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  // updateViaCache 'none': sempre confere se há um sw.js novo (versão nova do app)
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  // quando uma versão nova assume, recarrega uma vez para já mostrar as mudanças
  const tinhaControle = !!navigator.serviceWorker.controller;
  let recarregou = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!tinhaControle || recarregou) return;
    recarregou = true; location.reload();
  });
}
})();
