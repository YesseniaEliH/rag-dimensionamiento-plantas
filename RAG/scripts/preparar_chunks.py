"""
Prepara los manuales del proyecto como chunks con metadatos para el RAG en n8n.

Fuentes (solo lectura, NO se modifican):
  - M1 Metcalf & Eddy Vol.1 / Vol.2  -> LIBROS/vol1_texto_ocr.md, vol2_texto_ocr.md
    (OCR Tesseract: conserva tildes mejor que la capa de texto del PDF)
  - M2 Membrane Technology and Applications -> PDF (capa de texto)
  - M3 Reverse Osmosis (Kucera)            -> PDF (capa de texto)

Salida: RAG/chunks/<id_fuente>.json  (lista de objetos {id, texto, metadata})
        RAG/chunks/resumen.txt

Uso:  python RAG/scripts/preparar_chunks.py
Requiere: pip install pymupdf
"""
import json
import re
import unicodedata
from pathlib import Path

import pymupdf

RAIZ = Path(__file__).resolve().parents[2]
LIBROS = RAIZ / "LIBROS"
SALIDA = RAIZ / "RAG" / "chunks"

CHUNK_MAX = 1200      # caracteres objetivo por chunk
CHUNK_SOLAPE = 200    # caracteres de solapamiento entre chunks de la misma página
MIN_PAGINA = 80       # páginas con menos texto útil se descartan

# Capítulos de Metcalf & Eddy 3ra Ed. (numeración continua entre volúmenes).
# Se detectan por el encabezado corrido de las páginas impares.
CAPITULOS_M1 = [
    (1, "Ingeniería sanitaria: una panorámica", ["PANORAMICA"]),
    (2, "Caudales de aguas residuales", ["CAUDALES DE AGUAS"]),
    (3, "Características de las aguas residuales", ["CARACTERISTICAS DE LAS AGUAS"]),
    (4, "Objetivos, métodos y consideraciones sobre el proyecto del tratamiento", ["OBJETIVOS, METODOS"]),
    (5, "Introducción al proyecto de plantas de tratamiento de agua residual", ["INTRODUCCION AL PROYECTO"]),
    (6, "Operaciones físicas unitarias", ["OPERACIONES FISICAS"]),
    (7, "Procesos químicos unitarios", ["PROCESOS QUIMICOS"]),
    (8, "Procesos biológicos unitarios", ["PROCESOS BIOLOGICOS"]),
    (9, "Proyecto de instalaciones para el tratamiento físico y químico", ["TRATAMIENTO FISICO Y QUIMICO"]),
    (10, "Proyecto de instalaciones para el tratamiento biológico", ["PARA EL TRATAMIENTO BIOLOGICO"]),
    (11, "Tratamiento avanzado del agua residual", ["TRATAMIENTO AVANZADO"]),
    (12, "Diseño de instalaciones para el tratamiento y vertido del fango", ["VERTIDO DEL FANGO"]),
    (13, "Sistemas de tratamiento naturales", ["TRATAMIENTO NATURALES"]),
    (14, "Sistemas de tratamiento para pequeñas comunidades", ["PEQUENAS COMUNIDADES"]),
    (15, "Gestión de las aguas residuales de redes de alcantarillado unitarias", ["ALCANTARILLADO UNITARIAS"]),
    (16, "Recuperación y reutilización de efluentes", ["REUTILIZACION DE EFLUENTES"]),
    (17, "Vertido de efluentes", ["VERTIDO DE EFLUENTES"]),
]
FIN_LIBRO_M1 = ["INDICE ANALITICO", "APENDICE"]

FUENTES = [
    {"id": "M1_vol1", "manual": "M1", "tipo": "md", "archivo": "vol1_texto_ocr.md",
     "pdf": "Ingenieria_de_aguas_residuales_Volumen_1.pdf",
     "libro": "Metcalf & Eddy - Ingeniería de aguas residuales, 3ra Ed., Vol. 1",
     "tipo_planta": "PTARD", "idioma": "es"},
    {"id": "M1_vol2", "manual": "M1", "tipo": "md", "archivo": "vol2_texto_ocr.md",
     "pdf": "INGENIERIA_DE_AGUAS_RESIDUALES_Volumen_2.pdf",
     "libro": "Metcalf & Eddy - Ingeniería de aguas residuales, 3ra Ed., Vol. 2",
     "tipo_planta": "PTARD", "idioma": "es"},
    {"id": "M2_UF", "manual": "M2", "tipo": "pdf",
     "archivo": "MembraneTechnologyandApplications2ndEditionPDFDrive. PTAP UF.pdf",
     "libro": "Baker - Membrane Technology and Applications, 2nd Ed.",
     "tipo_planta": "PTAP-UF", "idioma": "en"},
    {"id": "M3_RO", "manual": "M3", "tipo": "pdf",
     "archivo": "Reverse-Osmosis-Design-Processes-and-Applications-for-Engineers. PTAP RO.pdf",
     "libro": "Kucera - Reverse Osmosis: Design, Processes and Applications for Engineers",
     "tipo_planta": "PTAP-RO", "idioma": "en"},
]


# ───────────────────────── utilidades de texto ─────────────────────────

def sin_tildes(s: str) -> str:
    s = unicodedata.normalize("NFD", s)
    return "".join(c for c in s if unicodedata.category(c) != "Mn").upper().replace("Ñ", "N")


LETRAS = "A-Za-zÁÉÍÓÚÜÑáéíóúüñ"
PALABRA = re.compile(rf"^[(\[¿¡\"'“]?([{LETRAS}]+(?:-[{LETRAS}]+)*)[)\]?!.,;:\"'”-]*$")
NUMERICO = re.compile(r"^[(\[]?[-+±~≈<>≤≥]?\d+([.,]\d+)*([-–]\d+([.,]\d+)*)?(%|°C?|[a-zA-Z³²/·]{1,8})?[)\].,;:]*$")
UNIDAD = re.compile(r"^[(\[]?[a-zA-Z]{1,4}[³²]?(/[a-zA-Z0-9³²·]{1,6})+[)\].,;:]*$")   # mg/L, m³/d, kg/m³·d


def tipo_token(t: str) -> str:
    """'bueno' (palabra/número/unidad plausible), 'neutro' (1-2 letras) o 'malo'."""
    if NUMERICO.match(t) or UNIDAD.match(t) or t in {"=", "+", "-", "×", "/", "±", "·", "—"}:
        return "bueno"
    m = PALABRA.match(t)
    if not m:
        return "malo"
    w = m.group(1).replace("-", "")
    if len(w) <= 2:
        return "neutro"
    casing_ok = w.islower() or w.isupper() or (w[0].isupper() and w[1:].islower())
    vocal = re.search(r"[aeiouáéíóúüAEIOUÁÉÍÓÚÜyY]", w)
    return "bueno" if casing_ok and vocal else "malo"


def linea_basura(linea: str) -> bool:
    """Detecta ruido de OCR en figuras. Criterio conservador: ante la duda se
    conserva la línea (es preferible algo de ruido a perder una definición de
    variable o una fila de tabla). Se descarta si:
      - no tiene ninguna palabra real (>= 4 letras) ni ningún número, o
      - tiene >= 4 tokens significativos (sin contar los de 1-2 letras) y
        menos del 35 % son palabras/números/unidades."""
    toks = linea.split()
    if not toks:
        return False
    tipos = [tipo_token(t) for t in toks]
    palabras_reales = sum(
        1 for t, ti in zip(toks, tipos)
        if ti == "bueno" and len(re.sub(rf"[^{LETRAS}]", "", t)) >= 4
    )
    numeros = sum(1 for t in toks if re.search(r"\d", t))
    if palabras_reales == 0 and numeros == 0:
        return True
    significativos = [ti for ti in tipos if ti != "neutro"]
    return len(significativos) >= 4 and significativos.count("bueno") / len(significativos) < 0.35


def limpiar(texto: str, filtrar_ruido: bool = True) -> str:
    """filtrar_ruido=True solo para OCR (Metcalf); en PDFs con capa de texto
    nativa las líneas cortas son celdas de tabla o ecuaciones reales."""
    texto = unicodedata.normalize("NFKC", texto)          # ligaduras ﬁ, ﬂ...
    texto = texto.replace("\r", "")
    texto = re.sub(r"(\w)-\n(\w)", r"\1\2", texto)         # des-silabeo "tratamien-\nto"
    lineas = [l.rstrip() for l in texto.split("\n")]
    if filtrar_ruido:
        lineas = [l for l in lineas if not linea_basura(l)]
    texto = "\n".join(lineas)
    texto = re.sub(r"[ \t]+", " ", texto)
    texto = re.sub(r"\n{3,}", "\n\n", texto)
    return texto.strip()


def trocear(texto: str) -> list[str]:
    """Parte el texto de una página en chunks de ~CHUNK_MAX con solapamiento,
    cortando preferentemente en fin de línea/oración."""
    if len(texto) <= CHUNK_MAX:
        return [texto]
    lineas = texto.split("\n")
    chunks, actual = [], []
    for linea in lineas:
        while len(linea) > CHUNK_MAX:                      # línea gigante (PDF sin saltos)
            corte = linea.rfind(". ", 0, CHUNK_MAX)
            corte = corte + 1 if corte > CHUNK_MAX // 2 else CHUNK_MAX
            lineas_extra, linea = linea[:corte], linea[corte:].lstrip()
            if actual:
                chunks.append("\n".join(actual))
                actual = []
            chunks.append(lineas_extra)
        if actual and len("\n".join(actual)) + len(linea) + 1 > CHUNK_MAX:
            chunks.append("\n".join(actual))
            # solapamiento: arrastrar las últimas líneas hasta ~CHUNK_SOLAPE chars
            arrastre, n = [], 0
            for l in reversed(actual):
                if n + len(l) > CHUNK_SOLAPE:
                    break
                arrastre.insert(0, l)
                n += len(l) + 1
            actual = arrastre
        actual.append(linea)
    if actual:
        resto = "\n".join(actual)
        if chunks and len(resto) < CHUNK_SOLAPE * 1.5:
            chunks[-1] = chunks[-1] + "\n" + resto
        else:
            chunks.append(resto)
    return [c.strip() for c in chunks if c.strip()]


def paginas_impresas(candidatos: dict[int, int], ventana: int = 6) -> dict[int, int]:
    """Número de página impresa para cada página PDF, a partir de los números
    leídos en encabezados/pies. El desfase (pdf - impresa) no siempre es fijo
    (hojas faltantes o láminas en el escaneo), así que se usa la mediana local
    de una ventana de ±`ventana` páginas; el número leído en la propia página
    solo se acepta si concuerda con esa mediana (descarta números de referencias,
    tablas, etc.)."""
    if not candidatos:
        return {}
    orden = sorted(candidatos)
    lo, hi = orden[0], orden[-1]
    resultado = {}
    for p in range(lo, hi + 1):
        vecinos = sorted(pdf - candidatos[pdf] for pdf in orden if abs(pdf - p) <= ventana)
        if len(vecinos) < 3:
            continue
        mediana = vecinos[len(vecinos) // 2]
        if p in candidatos and abs((p - candidatos[p]) - mediana) <= 1:
            resultado[p] = candidatos[p]
        else:
            resultado[p] = p - mediana
    return resultado


# ───────────────────────── M1: Metcalf (OCR .md) ─────────────────────────

def paginas_md(ruta: Path) -> dict[int, str]:
    md = ruta.read_text(encoding="utf-8")
    partes = re.split(r"^## \[Página PDF (\d+)\]\s*$", md, flags=re.M)
    return {int(partes[i]): partes[i + 1].strip() for i in range(1, len(partes), 2)}


def es_encabezado(linea: str) -> bool:
    l = linea.strip()
    if not l or len(l) > 130:
        return False
    letras = [c for c in l if c.isalpha()]
    mayus = sum(1 for c in letras if c.isupper())
    return bool(letras) and mayus / len(letras) > 0.8 and bool(re.search(r"\d", l))


def procesar_m1(fuente: dict) -> list[dict]:
    paginas = paginas_md(LIBROS / fuente["archivo"])

    # 1) número impreso: primer número (pág. par) o último (pág. impar) del encabezado
    candidatos = {}
    for p, t in paginas.items():
        primera = t.split("\n", 1)[0] if t else ""
        if es_encabezado(primera):
            m = re.match(r"^\W*(\d{1,4})\b", primera) or re.search(r"\b(\d{1,4})\W*$", primera)
            if m:
                candidatos[p] = int(m.group(1))
    impresas = paginas_impresas(candidatos)

    # 2) recorrer páginas en orden arrastrando el capítulo vigente
    docs, cap_actual, cap_titulo, en_cuerpo = [], None, None, False
    for p in sorted(paginas):
        texto = paginas[p]
        lineas = texto.split("\n")
        primera = lineas[0] if lineas else ""
        norm = sin_tildes(primera)

        m_cap = re.match(r"^\W*CAPITULO\s+(\d{1,2})\b", sin_tildes(texto[:40]))
        if m_cap and not re.search(r"CONTENIDO", sin_tildes(texto[:200])):
            n = int(m_cap.group(1))
            cap_actual, cap_titulo = n, next(t for c, t, _ in CAPITULOS_M1 if c == n)
            en_cuerpo = True
        elif es_encabezado(primera):
            if any(k in norm for k in FIN_LIBRO_M1):
                break                                      # índice analítico / apéndices
            for n, titulo, claves in CAPITULOS_M1:
                if any(k in norm for k in claves):
                    cap_actual, cap_titulo, en_cuerpo = n, titulo, True
                    break
        if not en_cuerpo:
            continue                                        # portada, créditos, índice
        if es_encabezado(primera):
            texto = "\n".join(lineas[1:])

        texto = limpiar(texto)
        if len(texto) < MIN_PAGINA:
            continue
        docs += construir_docs(fuente, p, impresas.get(p), cap_actual, cap_titulo, None, texto)
    return docs


# ───────────────────────── M2 / M3: PDFs en inglés ─────────────────────────

def procesar_pdf(fuente: dict) -> list[dict]:
    doc = pymupdf.open(LIBROS / fuente["archivo"])
    toc = doc.get_toc(simple=True)                          # [nivel, título, página]

    def titulo_limpio(t):
        return re.sub(r"\s+", " ", t.replace("\r", " ")).strip()

    # Capítulos: entradas del TOC que empiezan por número ("5 REVERSE OSMOSIS", "Chapter 3 ...")
    marcas = []
    for nivel, titulo, pag in toc:
        t = titulo_limpio(titulo)
        m = re.match(r"^(?:chapter\s+)?(\d{1,2})(?:\.(\d{1,2}))?\.?\s+(.+)$", t, re.I)
        if m and pag > 0:
            marcas.append((pag, int(m.group(1)), m.group(2), t))
    marcas.sort(key=lambda m: (m[0], m[2] is not None, int(m[2] or 0)))

    # Rangos a excluir: bibliografía general, índice alfabético, prefacio...
    # (entradas de nivel alto del TOC; las referencias por capítulo se conservan)
    altos = sorted((pag, titulo_limpio(t)) for nivel, t, pag in toc if nivel <= 2)
    excluidas = set()
    for i, (pag, t) in enumerate(altos):
        if re.fullmatch(r"(references|bibliography|index|contents|preface)", t, re.I):
            fin = altos[i + 1][0] if i + 1 < len(altos) else doc.page_count + 1
            excluidas.update(range(pag, max(fin, pag + 1)))

    def ubicar(p):
        cap = cap_t = sec_t = None
        for pag, n, sub, t in marcas:
            if pag > p:
                break
            if sub is None:
                cap, cap_t, sec_t = n, t, None
            elif n == cap:
                sec_t = t
        return cap, cap_t, sec_t

    # número impreso: etiqueta de página del PDF si existe (M3); si no, número
    # aislado en las primeras/últimas líneas (M2)
    textos, candidatos, etiquetas = {}, {}, {}
    for i in range(doc.page_count):
        p = i + 1
        textos[p] = doc[i].get_text()
        etiqueta = doc[i].get_label()
        if etiqueta.isdigit():
            etiquetas[p] = int(etiqueta)
        ls = [l.strip() for l in textos[p].splitlines() if l.strip()]
        for l in ls[:3] + ls[-2:]:
            if re.fullmatch(r"\d{1,3}", l) and int(l) < p:
                candidatos[p] = int(l)
                break
    impresas = etiquetas if len(etiquetas) > doc.page_count / 2 else paginas_impresas(candidatos)
    primer_cap = marcas[0][0] if marcas else 1

    docs = []
    for p, bruto in textos.items():
        if p < primer_cap or p in excluidas:
            continue                                        # portada, prefacio, índices
        cap, cap_t, sec_t = ubicar(p)
        ls = bruto.splitlines()
        # quitar número de página aislado y encabezado corrido (líneas en
        # MAYÚSCULAS al inicio de la página, p. ej. "MEMBRANE TECHNOLOGY AND APPLICATIONS")
        ls = [l for l in ls if l.strip() and not re.fullmatch(r"\s*\d{1,3}\s*", l)]
        while ls and len(ls[0]) < 60 and ls[0].strip().isupper():
            ls.pop(0)
        texto = limpiar("\n".join(ls), filtrar_ruido=False)
        if len(texto) < MIN_PAGINA:
            continue
        docs += construir_docs(fuente, p, impresas.get(p), cap, cap_t, sec_t, texto)
    return docs


# ───────────────────────── salida ─────────────────────────

def construir_docs(fuente, pag_pdf, pag_impresa, cap, cap_titulo, seccion, texto):
    ref_pag = f"p. {pag_impresa}" if pag_impresa else f"p. PDF {pag_pdf}"
    cabecera = f"[{fuente['manual']} | {fuente['libro']}"
    if cap:
        cabecera += f" | Cap. {cap}"
    if seccion:
        cabecera += f" | {seccion}"
    cabecera += f" | {ref_pag} (PDF {pag_pdf})]"

    trozos = trocear(texto)
    out = []
    for k, t in enumerate(trozos, 1):
        tablas = sorted(set(re.findall(r"\b(?:TABLA|Table|TABLE)\s+(\d{1,2}[.\-]\d{1,2})", t)))
        ecuaciones = sorted(set(re.findall(r"\((\d{1,2}[.\-]\d{1,3})\)\s*$", t, flags=re.M)))
        out.append({
            "id": f"{fuente['id']}-p{pag_pdf:04d}-c{k:02d}",
            "texto": f"{cabecera}\n{t}",
            "metadata": {
                "manual": fuente["manual"],
                "fuente": fuente["id"],
                "libro": fuente["libro"],
                "archivo_pdf": fuente.get("pdf", fuente["archivo"]),
                "tipo_planta": fuente["tipo_planta"],
                "idioma": fuente["idioma"],
                "capitulo": cap,
                "capitulo_titulo": cap_titulo,
                "seccion": seccion,
                "pagina_pdf": pag_pdf,
                "pagina_libro": pag_impresa,
                "chunk": k,
                "chunks_en_pagina": len(trozos),
                "tablas": tablas,
                "ecuaciones": ecuaciones,
            },
        })
    return out


def main():
    SALIDA.mkdir(parents=True, exist_ok=True)
    resumen = []
    for fuente in FUENTES:
        docs = procesar_m1(fuente) if fuente["tipo"] == "md" else procesar_pdf(fuente)
        destino = SALIDA / f"{fuente['id']}.json"
        destino.write_text(json.dumps(docs, ensure_ascii=False, indent=1), encoding="utf-8")
        paginas = {d["metadata"]["pagina_pdf"] for d in docs}
        sin_cap = sum(1 for d in docs if d["metadata"]["capitulo"] is None)
        sin_pag = sum(1 for d in docs if d["metadata"]["pagina_libro"] is None)
        largos = [len(d["texto"]) for d in docs]
        linea = (f"{fuente['id']:8} chunks={len(docs):5}  páginas={len(paginas):4}  "
                 f"chars_prom={sum(largos) // max(len(largos), 1):5}  "
                 f"sin_capítulo={sin_cap}  sin_pág_libro={sin_pag}  -> {destino.name}")
        print(linea)
        resumen.append(linea)
    (SALIDA / "resumen.txt").write_text("\n".join(resumen) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
