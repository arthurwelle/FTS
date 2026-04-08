"""
enrich_csv.py
Busca API IBGE Localidades para obter o mapeamento
  id_municipio (6d RAIS) → id_micro (5d) + id_meso (4d) + id_uf (2d)
usando a classificação ANTIGA (mesorregiões/microrregiões) que coincide com
os arquivos meso.gpkg e micro.gpkg fornecidos pelo geobr.

Enriquece DADOS/RAIS_FTS_NatJur_Municipio.csv com essas colunas.
"""
import csv
import json
import gzip
import urllib.request

CSV_IN  = "DADOS/RAIS_FTS_NatJur_Municipio.csv"
CSV_OUT = "DADOS/RAIS_FTS_NatJur_Municipio.csv"

# ── 1. Busca todos os municípios na API IBGE ───────────────────────────────
print("Buscando API IBGE localidades/municipios ...")
url = "https://servicodados.ibge.gov.br/api/v1/localidades/municipios"
req = urllib.request.Request(url, headers={"Accept-Encoding": "gzip"})
with urllib.request.urlopen(req, timeout=60) as resp:
    raw = resp.read()
    try:
        raw = gzip.decompress(raw)
    except Exception:
        pass
    municipios = json.loads(raw.decode("utf-8"))

print(f"  {len(municipios)} municípios recebidos da API")

# ── 2. Monta lookup: id6 (str) → dict de hierarquia ───────────────────────
lookup = {}
for m in municipios:
    id7 = str(m["id"])
    id6 = id7[:6]           # 6 dígitos = padrão RAIS (sem dígito verificador)

    micro_obj = m.get("microrregiao")
    # Municípios muito novos podem não ter microregião antiga
    if micro_obj:
        meso_obj = micro_obj["mesorregiao"]
        uf_obj   = meso_obj["UF"]
        id_micro  = str(int(micro_obj["id"]))
        id_meso   = str(int(meso_obj["id"]))
        nome_micro = micro_obj["nome"]
        nome_meso  = meso_obj["nome"]
    else:
        # fallback: usar regiao-intermediaria para meso e deixar micro vazio
        inter = m.get("regiao-imediata", {}).get("regiao-intermediaria", {})
        uf_obj    = inter.get("UF", {})
        id_micro  = ""
        id_meso   = str(int(inter["id"])) if inter.get("id") else ""
        nome_micro = ""
        nome_meso  = inter.get("nome", "")

    lookup[id6] = {
        "id_micro":   id_micro,
        "id_meso":    id_meso,
        "id_uf":      str(int(uf_obj["id"])) if uf_obj.get("id") else "",
        "abbrev_uf":  uf_obj.get("sigla", ""),
        "nome_micro": nome_micro,
        "nome_meso":  nome_meso,
        "nome_uf":    uf_obj.get("nome", ""),
    }

print(f"  lookup construído: {len(lookup)} entradas")

# ── 3. Lê CSV e adiciona colunas ──────────────────────────────────────────
new_cols = ["id_micro", "id_meso", "id_uf", "abbrev_uf",
            "nome_micro", "nome_meso", "nome_uf"]
missing  = set()
rows_out = []

with open(CSV_IN, newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    # Remove colunas novas caso já existam (re-run seguro)
    existing = [c for c in reader.fieldnames if c not in new_cols]
    fieldnames = existing + new_cols
    for row in reader:
        id6 = row["id_municipio"].strip()
        info = lookup.get(id6)
        if info:
            row.update(info)
        else:
            missing.add(id6)
            for c in new_cols:
                row[c] = ""
        rows_out.append(row)

if missing:
    print(f"  AVISO: {len(missing)} id_municipio sem correspondência na API IBGE")
    print("  Exemplos:", sorted(missing)[:10])

# ── 4. Escreve CSV enriquecido ────────────────────────────────────────────
with open(CSV_OUT, "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows_out)

print(f"CSV salvo em {CSV_OUT}")
print(f"  linhas: {len(rows_out)}   colunas: {len(fieldnames)}")
print(f"  colunas: {fieldnames}")
