# RAG para n8n: Dimensionamiento de plantas

Esta carpeta es independiente del resto del proyecto. `LIBROS/`, `PROMPT/` y
`RESULTADOS/` solo se leen y no se modifican, así que el proyecto sigue
funcionando igual en Claude.

## Contenido

| Ruta | Qué es |
|---|---|
| `scripts/preparar_chunks.py` | Convierte los 4 manuales en chunks con metadatos |
| `chunks/M1_vol1.json`, `M1_vol2.json` | Metcalf & Eddy (desde los `.md` OCR, que conservan las tildes) |
| `chunks/M2_UF.json` | Baker, Membrane Technology (desde la capa de texto del PDF) |
| `chunks/M3_RO.json` | Kucera, Reverse Osmosis (desde la capa de texto del PDF) |
| `chunks/resumen.txt` | Conteos de la última ejecución |

## Regenerar

```bash
pip install pymupdf
python RAG/scripts/preparar_chunks.py
```

## Formato de cada chunk

```json
{
  "id": "M1_vol2-p0046-c01",
  "texto": "[M1 | Metcalf & Eddy ... Vol. 2 | Cap. 9 | p. 531 (PDF 46)]\nTABLA 9-5 ...",
  "metadata": {
    "manual": "M1", "fuente": "M1_vol2", "libro": "...", "archivo_pdf": "...",
    "tipo_planta": "PTARD", "idioma": "es",
    "capitulo": 9, "capitulo_titulo": "...", "seccion": null,
    "pagina_pdf": 46, "pagina_libro": 531,
    "chunk": 1, "chunks_en_pagina": 2,
    "tablas": ["9-5"], "ecuaciones": []
  }
}
```

- `texto` empieza con una cabecera de cita. Así el agente puede citar aunque
  la herramienta de n8n no le muestre los metadatos.
- `pagina_libro` es el número impreso en el libro, el que se cita.
  `pagina_pdf` sirve para abrir el PDF y verificar tablas y fórmulas.
- `tipo_planta` (`PTARD` / `PTAP-UF` / `PTAP-RO`) sirve para filtrar búsquedas.
- `id` es estable: si vuelves a ingestar, usa el `id` para no duplicar chunks.

## n8n

- Inicia n8n con `N8N_RESTRICT_FILE_ACCESS_TO` apuntando a la carpeta del proyecto y `NODE_FUNCTION_ALLOW_EXTERNAL=exceljs`.
- `n8n/01_ingesta_manuales.json`: workflow de ingesta. Guarda en la tabla
  `manuales_chunks` de `rag_db` (la tabla `documents` que ya existía no se toca).
  Se ejecuta una vez por fuente (`M1_vol2`, `M1_vol1`, `M2_UF`, `M3_RO`).
  Con `modo = reanudar` solo carga los chunks que faltan; con `desde_cero` borra la
  fuente y la recarga. Lotes de 10 con reintento automático. En CPU tarda unos
  2,2 s por chunk (~3 h en total). Estado al 2026-09-25: los 4.999 chunks cargados.

- `n8n/02_agente_dimensionamiento_claude.json`: agente con Claude Sonnet 5 (recomendado).
- `n8n/02_agente_dimensionamiento.json`: agente de chat (Gemini + memoria Postgres
  `n8n_chat_histories` + 3 herramientas de búsqueda filtradas por `tipo_planta`:
  `buscar_manual_PTARD`, `buscar_manual_UF`, `buscar_manual_RO`).
- `n8n/prompt_agente_n8n.txt`: prompt del agente, adaptado de
  `PROMPT/PROMPT_DIMENSIONAMIENTO_PLANTAS.txt` (ese archivo no se modifica).

## Embeddings

Modelo `bge-m3` (Ollama), 1024 dimensiones, multilingüe: una pregunta en
español recupera texto de M2 y M3 en inglés.
