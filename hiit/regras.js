// Regras de carga da sala HIIT para as telas de planejamento. É a mesma conta do computador da sala
// (fabrik_fc_turma/sala/motor.py), conferida caso a caso por um teste de paridade. O teste vale; sem teste máximo,
// a FC máxima sai da idade (208 − 0,7 × idade, como no HTML de prescrição) e o perfil completa idade e repouso.
(function (g) {
  "use strict";
  const PARTIDA = { curto: 1.10, longo: 0.90, limiar: 0.85 };
  // o console da esteira caminha até 6,9 km/h e corre a partir de 7,0: limite de quem está "sem corrida"
  const CAMINHADA_MAX_KMH = 6.9;
  const ACSM_CAMINHADA_ATE_KMH = 6.0;   // a equação de caminhada do ACSM vale até 100 m/min
  const FAIXA = { curto: [1.1, 1.5], longo: { int: [0.9, 0.95], ava: [0.9, 1.0], ini: null }, limiar: [0.75, 0.95] };
  function num(x, lo, hi) {
    if (x === null || x === undefined || typeof x === "boolean") return null;
    const v = Number(String(x).trim().replace(",", "."));
    if (String(x).trim() === "" || !Number.isFinite(v)) return null;
    if ((lo != null && v < lo) || (hi != null && v > hi)) return null;
    return v;
  }
  // ACSM: até 6,0 km/h caminhada (0,1·v + 1,8·v·i), acima corrida (0,2·v + 0,9·v·i); v em m/min
  function velEquivalentePlano(vKmh, inclPct) {
    const v = vKmh * 1000 / 60, i = inclPct / 100;
    const vo2 = vKmh <= ACSM_CAMINHADA_ATE_KMH + 1e-9 ? 0.1 * v + 1.8 * v * i + 3.5 : 0.2 * v + 0.9 * v * i + 3.5;
    return (vo2 - 3.5) / 0.2 * 60 / 1000;
  }
  // teste fora do formato da Ficha (rows que não é lista, linha que não é objeto): lê como o banco, linha sem nada
  function linhas(teste) {
    const rows = teste && Array.isArray(teste.rows) ? teste.rows : [];
    return rows.map((r) => (r && typeof r === "object" && !Array.isArray(r) ? r : {})).filter((r) => !r.warm).map((r) => ({
      w: num(r.w, 1, 2000), fc: num(r.fc, 40, 240), vel: num(r.vel, 1, 30), incl: num(r.incl, 0, 30) }));
  }
  function extrapola(x1, f1, x2, f2, fcmax) {
    if ([x1, f1, x2, f2].some((v) => v == null) || !(x2 > x1 && f2 > f1 && fcmax > f2)) return null;
    return x2 + (x2 - x1) / (f2 - f1) * (fcmax - f2);
  }
  // 208 − 0,7 × idade (anos completos), meio para cima, em conta inteira: o mesmo número na sala e no banco
  function fcmaxPelaIdade(idade) { return Math.floor((2085 - 7 * Math.floor(idade)) / 10); }
  // av: avaliação da Ficha VO₂ ({id, dados:{aluno:{fcrep, idade}, p:{bmax,emax,bsub,esub}}}) ou o formato da cópia da sala
  // ({fcrep, idade, testes}); perfil: {idade, fcrep} do perfil HIIT, que só completa o que o teste não tem
  function referencias(av, perfil) {
    const R = { avaliacao_id: null, fcmax: null, fcmax_fonte: null, idade: null, fcrep: null, bike_w: null, esteira_kmh: null, fontes: {}, avisos: [] };
    const pf = perfil || {};
    let t = {};
    if (av) {
      const al = (av.dados && av.dados.aluno) || {};
      t = av.testes || (av.dados && av.dados.p) || {};
      R.avaliacao_id = av.id || null;
      R.fcrep = num(av.fcrep !== undefined ? av.fcrep : al.fcrep, 30, 110);
      R.idade = num(av.idade !== undefined ? av.idade : al.idade, 14, 95);
    } else R.avisos.push("sem teste");
    if (R.fcrep != null) R.fontes.fcrep = "teste";
    else if ((R.fcrep = num(pf.fcrep, 30, 110)) != null) R.fontes.fcrep = "perfil";
    if (R.idade == null) R.idade = num(pf.idade, 14, 95);
    const picos = [];
    for (const k of ["bmax", "emax"]) {
      if (!t[k]) continue;
      const fcs = linhas(t[k]).filter((l) => l.fc).map((l) => l.fc);
      const p = num(t[k].fcpico, 110, 230) || (fcs.length ? Math.max(...fcs) : null);
      if (p && p >= 110 && p <= 230) picos.push(p);
    }
    if (picos.length) { R.fcmax = Math.max(...picos); R.fcmax_fonte = "teste"; R.fontes.fcmax = "teste máximo"; }
    else if (R.idade != null) {
      R.fcmax = fcmaxPelaIdade(R.idade); R.fcmax_fonte = "idade"; R.fontes.fcmax = "208 − 0,7 × idade";
      R.avisos.push(av ? "sem teste máximo: FC máxima pela idade" : "FC máxima pela idade");
    } else R.avisos.push(av ? "sem teste máximo e sem idade: sem FC máxima" : "sem idade: sem FC máxima");
    if (R.fcrep == null) R.avisos.push("FC de repouso não anotada");
    let feitas = linhas(t.bmax).filter((l) => l.w && l.fc);
    if (feitas.length) { R.bike_w = feitas[feitas.length - 1].w; R.fontes.bike = "bike máximo"; }
    else {
      const sub = linhas(t.bsub).filter((l) => l.w && l.fc);
      if (sub.length >= 2 && R.fcmax) {
        const a = sub[sub.length - 2], b = sub[sub.length - 1];
        R.bike_w = extrapola(a.w, a.fc, b.w, b.fc, R.fcmax);
        if (R.bike_w) R.fontes.bike = "bike submáximo extrapolado";
      }
    }
    feitas = linhas(t.emax).filter((l) => l.vel && l.fc);
    if (feitas.length) { const u = feitas[feitas.length - 1]; R.esteira_kmh = velEquivalentePlano(u.vel, u.incl || 0); R.fontes.esteira = "corrida máxima"; }
    else {
      const sub = linhas(t.esub).filter((l) => l.vel && l.fc);
      if (sub.length >= 2 && R.fcmax) {
        const a = sub[sub.length - 2], b = sub[sub.length - 1];
        R.esteira_kmh = extrapola(velEquivalentePlano(a.vel, a.incl || 0), a.fc, velEquivalentePlano(b.vel, b.incl || 0), b.fc, R.fcmax);
        if (R.esteira_kmh) R.fontes.esteira = "corrida submáxima extrapolada";
      }
    }
    return R;
  }
  const ref = (R, mod) => (mod === "bike" ? R.bike_w : R.esteira_kmh);
  // arredonda como o round() do Python, para os números baterem com a sala: usa o valor exato do número
  // (toFixed) e, só no empate exato, o par mais próximo
  function roundPy(x, casas) {
    const n = casas || 0, exato = Math.abs(x).toFixed(100), ponto = exato.indexOf(".");
    const resto = exato.slice(ponto + 1 + n);
    if (/^50*$/.test(resto)) {                                   // empate exato: vai para o par
      const corte = Number(exato.slice(0, ponto + 1 + n).replace(/\.$/, "")), f = Math.pow(10, n);
      const u = Math.round(corte * f);
      return Math.sign(x) * (u % 2 === 0 ? u : u + 1) / f;
    }
    return Number(x.toFixed(n));
  }
  function faixaCarga(tipo, nivel, mod, R) {
    const r = ref(R, mod);
    let f = FAIXA[tipo];
    if (f && !Array.isArray(f)) f = f[nivel] || null;
    if (r == null || !f || nivel === "ini") return null;
    if (mod === "bike") return { watts: [roundPy(r * f[0] / 5) * 5, roundPy(r * f[1] / 5) * 5] };
    return { vel_kmh: [roundPy(r * f[0], 1), roundPy(r * f[1], 1)] };
  }
  // carga de partida tirada do teste, arredondada PARA CIMA no passo do console (5 W; 0,1 km/h).
  // Iniciante não recebe carga do teste (o estímulo dele é guiado pela FC): só a que o treinador prescrever.
  function cargaDoTeste(tipo, mod, R, nivel) {
    const r = ref(R, mod);
    if (r == null || !(tipo in PARTIDA) || nivel === "ini") return null;
    if (mod === "bike") return { watts: Math.ceil(r * PARTIDA[tipo] / 5 - 1e-9) * 5 };
    return { vel_kmh: Math.ceil(r * PARTIDA[tipo] * 10 - 1e-9) / 10, incl_pct: 0 };
  }
  g.HiitRegras = { num, velEquivalentePlano, fcmaxPelaIdade, referencias, faixaCarga, cargaDoTeste, PARTIDA, CAMINHADA_MAX_KMH };
})(globalThis);
