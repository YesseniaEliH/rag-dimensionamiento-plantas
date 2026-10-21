// Nodo Code de n8n "Construir xlsx" (subflujo de la herramienta generar_excel).
// Recibe en $json.query un JSON con la memoria de cálculo y arma un .xlsx con
// fórmulas reales entre hojas. Está escrito sin librerías externas: un .xlsx es
// un ZIP de archivos XML, y aquí se empaqueta sin compresión (método STORE).
//
// Formato de entrada (los "{id}" en las fórmulas se sustituyen por la celda
// absoluta de ese parámetro, p. ej. {Q_med} -> 'Datos de entrada'!$D$4):
// {
//   "proyecto": "PTAR DEL CARMEN",
//   "datos":   [{"id":"Q_med","parametro":"Caudal medio","valor":150,"unidad":"m³/d","fuente":"Dato del usuario"}],
//   "calculos":[{"id":"V_an","seccion":"Laguna anaerobia","parametro":"Volumen útil",
//                "ecuacion":"V = Q × TRH","formula":"{Q_med}*{TRH_an}","resultado":3000,
//                "unidad":"m³","min":20,"max":50,"cita":"M1 Vol. 2, Tabla 10-20, p. 733"}],
//   "infraestructura":[{"unidad":"Laguna anaerobia","cantidad":2,"largo":"{L_an}","ancho":"{W_an}",
//                "profundidad":"{H_an}","volumen":"{V_an}","area":"{A_an}","material":"Geomembrana HDPE"}],
//   "equipos":[{"equipo":"Reja manual","tipo":"Barras 1/4\"","cantidad":1,"caracteristica":"Separación",
//                "valor":"{b_reja}","unidad":"mm","nota":"Acero inoxidable"}]
// }

const HOJAS = ['Datos de entrada', 'Memoria de cálculo', 'Resumen de infraestructura', 'Equipos'];

// ---------- utilidades XML / celdas ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const col = (n) => { let s = ''; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const ref = (hoja, c, f) => `'${hoja}'!$${col(c)}$${f}`;
const esNum = (v) => typeof v === 'number' && isFinite(v);

function celda(c, f, v, estilo, extra = {}) {
  const r = col(c) + f;
  if (extra.formula) {
    const cache = extra.cache;
    if (typeof cache === 'string') return `<c r="${r}" s="${estilo}" t="str"><f>${esc(extra.formula)}</f><v>${esc(cache)}</v></c>`;
    return `<c r="${r}" s="${estilo}"><f>${esc(extra.formula)}</f>${esNum(cache) ? `<v>${cache}</v>` : ''}</c>`;
  }
  if (v === null || v === undefined || v === '') return `<c r="${r}" s="${estilo}"/>`;
  if (esNum(v)) return `<c r="${r}" s="${estilo}"><v>${v}</v></c>`;
  return `<c r="${r}" s="${estilo}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
}

function hojaXml(filas, anchos, combinadas = [], congelar = 0) {
  const cols = anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  const pane = congelar ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${congelar}" topLeftCell="A${congelar + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : '';
  const datos = filas.map(([f, celdas]) => `<row r="${f}">${celdas.join('')}</row>`).join('');
  const merge = combinadas.length ? `<mergeCells count="${combinadas.length}">${combinadas.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${pane}<cols>${cols}</cols><sheetData>${datos}</sheetData>${merge}</worksheet>`;
}

// estilos: 0 normal | 1 título | 2 encabezado | 3 texto con borde | 4 número | 5 dato de entrada
//          6 sección | 7 verificación | 8 texto ajustado | 9 total
const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>
<fonts count="4"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="14"/><color rgb="FF1F4E79"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font></fonts>
<fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4E79"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDDEBF7"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE2EFDA"/></patternFill></fill></fills>
<borders count="2"><border/><border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom></border></borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="10">
<xf/>
<xf fontId="1" applyFont="1"/>
<xf fontId="2" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf borderId="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="164" borderId="1" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="164" fillId="3" borderId="1" applyNumberFormat="1" applyFill="1" applyBorder="1"/>
<xf fontId="3" fillId="4" borderId="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf fontId="3" borderId="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf borderId="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="164" fontId="3" fillId="5" borderId="1" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
</cellXfs></styleSheet>`;

// ---------- ZIP sin compresión ----------
const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function zip(archivos) {
  const partes = [], central = [];
  let offset = 0;
  for (const [nombre, contenido] of archivos) {
    const n = Buffer.from(nombre, 'utf8'), d = Buffer.from(contenido, 'utf8'), crc = crc32(d);
    const loc = Buffer.alloc(30);
    loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(0x0800, 6);
    loc.writeUInt32LE(crc, 14); loc.writeUInt32LE(d.length, 18); loc.writeUInt32LE(d.length, 22); loc.writeUInt16LE(n.length, 26);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(d.length, 20); cen.writeUInt32LE(d.length, 24); cen.writeUInt16LE(n.length, 28); cen.writeUInt32LE(offset, 42);
    partes.push(loc, n, d); central.push(cen, n);
    offset += 30 + n.length + d.length;
  }
  const tam = central.reduce((s, b) => s + b.length, 0), fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(archivos.length, 8); fin.writeUInt16LE(archivos.length, 10);
  fin.writeUInt32LE(tam, 12); fin.writeUInt32LE(offset, 16);
  return Buffer.concat([...partes, ...central, fin]);
}

// ---------- construcción del libro ----------
function construir(spec) {
  const errores = [];
  const datos = Array.isArray(spec.datos) ? spec.datos : [];
  const calculos = Array.isArray(spec.calculos) ? spec.calculos : [];
  if (!datos.length) errores.push('Falta "datos" (lista de parámetros de entrada).');
  if (!calculos.length) errores.push('Falta "calculos" (pasos de la memoria de cálculo).');

  // 1) posición de cada id
  const celdaDe = {}, cacheDe = {};
  const registrar = (id, r, cache) => {
    if (!id) return;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(id)) errores.push(`id no válido "${id}" (solo letras, números y _).`);
    if (celdaDe[id]) errores.push(`id repetido "${id}".`);
    celdaDe[id] = r; cacheDe[id] = cache;
  };
  datos.forEach((d, i) => registrar(d.id, ref(HOJAS[0], 3, 4 + i), d.valor));
  let fila = 4, seccion = null;
  const filaCalc = calculos.map((c) => {
    if ((c.seccion || '') !== seccion) { seccion = c.seccion || ''; fila++; }
    registrar(c.id, ref(HOJAS[1], 5, fila), c.resultado);
    return fila++;
  });

  // 2) traducción de fórmulas
  const traducir = (formula, donde) => {
    let f = String(formula).trim().replace(/^=/, '');
    f = f.replace(/\{([^{}]+)\}/g, (m, id) => {
      if (!celdaDe[id.trim()]) { errores.push(`${donde}: id desconocido {${id}}.`); return '0'; }
      return celdaDe[id.trim()];
    });
    return f;
  };
  const valorCelda = (c, f, v, estilo, donde) => {
    if (typeof v === 'string' && /^\s*\{[A-Za-z0-9_]+\}\s*$/.test(v)) {
      const id = v.trim().slice(1, -1);
      return celda(c, f, null, 4, { formula: traducir(v, donde), cache: cacheDe[id] });
    }
    if (typeof v === 'string' && v.trim().startsWith('=')) return celda(c, f, null, 4, { formula: traducir(v, donde) });
    return celda(c, f, v, esNum(v) ? 4 : estilo);
  };

  // Hoja 1: Datos de entrada
  const h1 = [[1, [celda(0, 1, `${spec.proyecto || 'Proyecto'} — Datos de entrada`, 1)]],
    [2, [celda(0, 2, 'Única fuente de verdad: si cambia un valor amarillo, todo el libro se recalcula.', 0)]],
    [3, ['Ítem', 'ID', 'Parámetro', 'Valor', 'Unidad', 'Fuente / cita'].map((t, c) => celda(c, 3, t, 2))]];
  datos.forEach((d, i) => {
    const f = 4 + i;
    h1.push([f, [celda(0, f, i + 1, 3), celda(1, f, d.id, 3), celda(2, f, d.parametro, 8),
      esNum(d.valor) ? celda(3, f, d.valor, 5) : celda(3, f, d.valor, 3), celda(4, f, d.unidad, 3), celda(5, f, d.fuente || d.cita, 8)]]);
  });

  // Hoja 2: Memoria de cálculo
  const h2 = [[1, [celda(0, 1, `${spec.proyecto || 'Proyecto'} — Memoria de cálculo`, 1)]],
    [3, ['N°', 'Unidad de proceso', 'ID', 'Parámetro', 'Ecuación (notación estándar)', 'Resultado', 'Unidad', 'Mín. manual', 'Máx. manual', 'Verificación', 'Cita'].map((t, c) => celda(c, 3, t, 2))]];
  const merges2 = [];
  seccion = null;
  const filasVerif = [];
  let avisos = 0;
  calculos.forEach((c, i) => {
    const f = filaCalc[i];
    if ((c.seccion || '') !== seccion) {
      seccion = c.seccion || '';
      h2.push([f - 1, [celda(0, f - 1, seccion || 'General', 6), ...Array.from({ length: 10 }, (_, k) => celda(k + 1, f - 1, '', 6))]]);
      merges2.push(`A${f - 1}:K${f - 1}`);
    }
    const res = c.formula ? celda(5, f, null, 4, { formula: traducir(c.formula, `calculos.${c.id || i}`), cache: c.resultado })
      : celda(5, f, c.resultado, 4);
    if (!c.formula) errores.push(`calculos.${c.id || i}: falta "formula" (ninguna celda de resultado puede ser un número fijo).`);
    const hayMin = esNum(c.min), hayMax = esNum(c.max), F = `F${f}`;
    let verif = celda(9, f, '—', 7);
    if (hayMin || hayMax) {
      const cond = hayMin && hayMax ? `AND(${F}>=H${f},${F}<=I${f})` : hayMin ? `${F}>=H${f}` : `${F}<=I${f}`;
      const ok = esNum(c.resultado) ? (!hayMin || c.resultado >= c.min) && (!hayMax || c.resultado <= c.max) : true;
      if (!ok) avisos++;
      verif = celda(9, f, null, 7, { formula: `IF(${cond},"✓","⚠ fuera de rango")`, cache: ok ? '✓' : '⚠ fuera de rango' });
      filasVerif.push(f);
    }
    h2.push([f, [celda(0, f, i + 1, 3), celda(1, f, c.seccion, 3), celda(2, f, c.id, 3), celda(3, f, c.parametro, 8),
      celda(4, f, c.ecuacion, 8), res, celda(6, f, c.unidad, 3), celda(7, f, hayMin ? c.min : '', hayMin ? 4 : 3),
      celda(8, f, hayMax ? c.max : '', hayMax ? 4 : 3), verif, celda(10, f, c.cita, 8)]]);
  });
  const ultima = filaCalc.length ? filaCalc[filaCalc.length - 1] : 4, fv = ultima + 2;
  const rango = `J4:J${ultima}`;
  h2.push([fv, [celda(0, fv, 'Verificación global', 9), ...Array.from({ length: 8 }, (_, k) => celda(k + 1, fv, '', 9)),
    celda(9, fv, null, 9, { formula: `IF(COUNTIF(${rango},"⚠*")=0,"✓ Cálculo consistente","⚠ Revisar "&COUNTIF(${rango},"⚠*")&" parámetro(s) fuera de rango")`,
      cache: avisos ? `⚠ Revisar ${avisos} parámetro(s) fuera de rango` : '✓ Cálculo consistente' }), celda(10, fv, '', 9)]]);
  merges2.push(`A${fv}:I${fv}`);

  // Hoja 3: Resumen de infraestructura
  const infra = Array.isArray(spec.infraestructura) ? spec.infraestructura : [];
  const camposI = ['unidad', 'cantidad', 'largo', 'ancho', 'profundidad', 'area', 'volumen', 'material'];
  const h3 = [[1, [celda(0, 1, `${spec.proyecto || 'Proyecto'} — Resumen de infraestructura`, 1)]],
    [3, ['Unidad', 'Cantidad', 'Largo (m)', 'Ancho (m)', 'Profundidad (m)', 'Área (m²)', 'Volumen (m³)', 'Material / notas'].map((t, c) => celda(c, 3, t, 2))]];
  infra.forEach((u, i) => { const f = 4 + i; h3.push([f, camposI.map((k, c) => valorCelda(c, f, u[k], c === 7 ? 8 : 3, `infraestructura.${i}.${k}`))]); });
  if (infra.length) {
    const ft = 4 + infra.length;
    h3.push([ft, [celda(0, ft, 'TOTAL', 9), celda(1, ft, null, 9, { formula: `SUM(B4:B${ft - 1})` }), ...[2, 3, 4].map((c) => celda(c, ft, '', 9)),
      celda(5, ft, null, 9, { formula: `SUMPRODUCT(B4:B${ft - 1},F4:F${ft - 1})` }), celda(6, ft, null, 9, { formula: `SUMPRODUCT(B4:B${ft - 1},G4:G${ft - 1})` }), celda(7, ft, 'Área y volumen totales = cantidad × unitario', 9)]]);
  }

  // Hoja 4: Equipos
  const eq = Array.isArray(spec.equipos) ? spec.equipos : [];
  const camposE = ['equipo', 'tipo', 'cantidad', 'caracteristica', 'valor', 'unidad', 'nota'];
  const h4 = [[1, [celda(0, 1, `${spec.proyecto || 'Proyecto'} — Equipos`, 1)]],
    [3, ['Equipo', 'Tipo', 'Cantidad', 'Característica', 'Valor', 'Unidad', 'Nota'].map((t, c) => celda(c, 3, t, 2))]];
  eq.forEach((e, i) => { const f = 4 + i; h4.push([f, camposE.map((k, c) => valorCelda(c, f, e[k], c === 6 ? 8 : 3, `equipos.${i}.${k}`))]); });

  if (errores.length) return { errores };

  const sheets = [
    hojaXml(h1, [6, 14, 42, 14, 12, 50], ['A1:F1', 'A2:F2'], 3),
    hojaXml(h2, [5, 22, 12, 34, 36, 14, 11, 11, 11, 18, 44], ['A1:K1', ...merges2], 3),
    hojaXml(h3, [28, 10, 11, 11, 14, 13, 14, 40], ['A1:H1'], 3),
    hojaXml(h4, [26, 22, 10, 26, 13, 10, 40], ['A1:G1'], 3),
  ];
  const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const wb = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${HOJAS.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`;
  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

  const buffer = zip([['[Content_Types].xml', ct], ['_rels/.rels', rels], ['xl/workbook.xml', wb], ['xl/_rels/workbook.xml.rels', wbRels],
    ['xl/styles.xml', ESTILOS], ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, s])]);
  return { buffer, avisos, n: { datos: datos.length, calculos: calculos.length, infra: infra.length, equipos: eq.length } };
}

function nombreArchivo(proyecto) {
  const base = String(proyecto || 'memoria').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || 'memoria';
  const d = new Date(), p = (x) => String(x).padStart(2, '0');
  return `${base}_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.xlsx`;
}

function ejecutar(query) {
  let spec;
  try {
    spec = typeof query === 'string' ? JSON.parse(query.replace(/^```(?:json)?\s*|\s*```$/g, '')) : query;
  } catch (e) {
    return { json: { ok: false, response: `ERROR: el argumento no es JSON válido (${e.message}). Envía un único objeto JSON con "proyecto", "datos", "calculos", "infraestructura" y "equipos".` } };
  }
  const r = construir(spec || {});
  if (r.errores) return { json: { ok: false, response: 'ERROR: corrige y vuelve a llamar a la herramienta:\n- ' + r.errores.slice(0, 25).join('\n- ') } };
  const archivo = nombreArchivo(spec.proyecto);
  return {
    json: { ok: true, archivo, avisos: r.avisos, resumen: r.n },
    binary: { data: { data: r.buffer.toString('base64'), mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', fileName: archivo, fileExtension: 'xlsx' } },
  };
}

// --- n8n ---
if (typeof $input !== 'undefined') {
  return $input.all().map((item) => ejecutar(item.json.query));
}
module.exports = { ejecutar, construir };
