# enrich_new_csv.py
# Enriquece rais_vinculos_FTS_2024_Municipio.csv com colunas geograficas
# (id_micro, id_meso, id_uf, abbrev_uf) usando o RAIS_FTS_NatJur_Municipio.csv
# ja enriquecido como lookup. O novo CSV usa id_municipio com 7 digitos (IBGE
# completo); os primeiros 6 digitos = codigo RAIS sem digito verificador.

import csv

OLD_CSV = "DADOS/RAIS_FTS_NatJur_Municipio.csv"
NEW_IN  = "DADOS/rais_vinculos_FTS_2024_Municipio.csv"
NEW_OUT = "DADOS/rais_vinculos_FTS_2024_Municipio.csv"

GEO_COLS = ["id_micro", "id_meso", "id_uf", "abbrev_uf"]

# 1. Constroi lookup id6 -> dict de colunas geo a partir do CSV ja enriquecido
lookup = {}
with open(OLD_CSV, newline="", encoding="utf-8") as f:
    for row in csv.DictReader(f):
        id6 = row["id_municipio"].strip()
        if id6 and id6 not in lookup:
            lookup[id6] = {c: row[c] for c in GEO_COLS}

print(f"Lookup construido: {len(lookup)} municipios")

# 2. Le novo CSV, computa id6 e enriquece
rows_out = []
missing  = set()

with open(NEW_IN, newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    existing = [c for c in reader.fieldnames if c not in GEO_COLS]
    fieldnames = existing + GEO_COLS
    for row in reader:
        id7 = row["id_municipio"].strip()
        id6 = id7[:6] if id7 else ""
        info = lookup.get(id6)
        if info:
            row.update(info)
        else:
            if id6:
                missing.add(id6)
            for c in GEO_COLS:
                row[c] = ""
        rows_out.append(row)

if missing:
    print(f"AVISO: {len(missing)} municipios sem correspondencia")
    print("Exemplos:", sorted(missing)[:5])

# 3. Salva
with open(NEW_OUT, "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows_out)

print(f"Salvo: {NEW_OUT} — {len(rows_out)} linhas, colunas: {fieldnames}")
