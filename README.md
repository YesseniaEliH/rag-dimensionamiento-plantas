# Dimensionamiento de plantas de tratamiento de agua

Herramientas y resultados para dimensionar plantas de tratamiento de agua con apoyo de IA:

- **PTARD**: planta de tratamiento de aguas residuales domésticas (Metcalf & Eddy).
- **PTAP-UF**: potabilización con ultrafiltración (Baker, *Membrane Technology and Applications*).
- **PTAP-RO**: potabilización con ósmosis inversa (Kucera, *Reverse Osmosis*).

## Estructura

| Carpeta | Contenido |
|---|---|
| `PROMPT/` | Prompt de ingeniería y plantilla de datos de entrada |
| `RAG/` | Agente RAG en n8n: scripts de chunking, workflows y generador de Excel (ver `RAG/README.md`) |
| `LIBROS/` | Manuales de referencia — **no incluidos** (ver `LIBROS/README.md`) |

## Requisitos

- Python 3 con `openpyxl` (generación de Excel) y `pymupdf` (preparación de chunks).
- Para el RAG: n8n, PostgreSQL con pgvector y Ollama (`bge-m3`). Detalles en `RAG/README.md`.

## Aviso

Los manuales técnicos citados son propiedad de sus autores y editoriales; este repositorio
no los distribuye. Los cálculos son de apoyo y deben ser revisados por un profesional.
