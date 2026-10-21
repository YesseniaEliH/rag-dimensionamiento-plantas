// Nodo Code de n8n "Limpiar formato": convierte el LaTeX que a veces escribe el
// modelo ($...$, \text{}, \frac{}{}...) a texto plano con símbolos Unicode.
// No toca los bloques de código (```...```) ni el código en línea (`...`),
// para no romper fórmulas de Excel como ='Datos de entrada'!$B$5.

const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻', '+': '⁺' };
const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' };
const CMD = {
  times: '×', cdot: '·', div: '÷', le: '≤', leq: '≤', ge: '≥', geq: '≥', neq: '≠', approx: '≈',
  sim: '~', pm: '±', implies: '⇒', Rightarrow: '⇒', rightarrow: '→', to: '→', infty: '∞',
  lambda: 'λ', theta: 'θ', Delta: 'Δ', delta: 'δ', Sigma: 'Σ', sum: 'Σ', mu: 'µ', pi: 'π',
  rho: 'ρ', alpha: 'α', beta: 'β', gamma: 'γ', eta: 'η', phi: 'φ', tau: 'τ', circ: '°',
  degree: '°', quad: ' ', qquad: ' ', left: '', right: '', displaystyle: '', ldots: '…', dots: '…',
};
const CMD_RE = new RegExp('\\\\(' + Object.keys(CMD).sort((a, b) => b.length - a.length).join('|') + ')', 'g');

const digitos = (txt, tabla) => [...txt].map((c) => tabla[c] || c).join('');
const agrupar = (x) => (/[\s+\-×·]/.test(x) ? '(' + x + ')' : x);

function convertir(s) {
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_, m) => '\n' + m.trim() + '\n');
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => '\n' + m.trim() + '\n');
  s = s.replace(/\\\(([\s\S]+?)\\\)/g, '$1');
  s = s.replace(/\$([^$\n]+?)\$/g, '$1');
  // de dentro hacia fuera: \text{}, subíndices con llaves, fracciones, raíces
  for (let i = 0; i < 4; i++) {
    s = s.replace(/\\(?:text|mathrm|mathbf|textbf|mathit|textit|operatorname|boldsymbol)\s*\{([^{}]*)\}/g, '$1');
    s = s.replace(/_\{([0-9]+)\}/g, (_, a) => digitos(a, SUB));
    s = s.replace(/_\{([^{}]*)\}/g, '_$1');
    s = s.replace(/\^\s*(?:\{\s*\\circ\s*\}|\\circ)/g, '°');
    s = s.replace(/\^\{([0-9+\-]+)\}/g, (_, a) => digitos(a, SUP));
    s = s.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_, a, b) => agrupar(a) + ' / ' + agrupar(b));
    s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)');
  }
  s = s.replace(/\^([0-9])/g, (_, a) => SUP[a]);
  s = s.replace(/\^\{([^{}]*)\}/g, '^($1)');
  s = s.replace(/_([0-9])(?![0-9])/g, (_, a) => SUB[a]);
  s = s.replace(/\{,\}/g, ',');
  s = s.replace(/\\([%$#&_])/g, '$1');
  s = s.replace(/\\[,;:! ]/g, ' ');
  s = s.replace(CMD_RE, (_, c) => CMD[c]);
  s = s.replace(/\\([a-zA-Z]+)/g, '$1');
  s = s.replace(/(\S) {2,}(?=\S)/g, '$1 ');
  return s;
}

function limpiar(texto) {
  if (typeof texto !== 'string') return texto;
  // separa bloques de código y código en línea; solo convierte el resto
  return texto
    .split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g)
    .map((parte, i) => (i % 2 === 1 ? parte : convertir(parte)))
    .join('');
}

// --- n8n ---
if (typeof $input !== 'undefined') {
  return $input.all().map((item) => ({ json: { ...item.json, output: limpiar(item.json.output) } }));
}
module.exports = { limpiar };
