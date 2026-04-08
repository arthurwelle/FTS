# build_pmtiles.py
# Converte meso.gpkg e micro.gpkg para PMTiles em GEO/
# usando fiona + mapbox-vector-tile + pmtiles.
import gzip
import fiona
import mercantile
from shapely.geometry import shape, mapping, box
from shapely.validation import make_valid
from mapbox_vector_tile import encode as mvt_encode
from pmtiles.writer import Writer, Compression
from pmtiles.reader import zxy_to_tileid

# ─── Bounding box do Brasil ────────────────────────────────────────────────
BRAZIL_BOUNDS = (-74.0, -34.0, -28.0, 6.0)

# ─── Função principal de conversão ────────────────────────────────────────
def gpkg_to_pmtiles(gpkg_path, pmtiles_path, layer_name, id_field,
                    zoom_min=2, zoom_max=8, compress=True):
    print(f"\nConvertendo {gpkg_path} -> {pmtiles_path}")

    # 1. Lê todas as features do gpkg
    features = []
    with fiona.open(gpkg_path, encoding="utf-8") as src:
        for feat in src:
            if feat.geometry is None:
                continue
            geom = shape(feat.geometry)
            if not geom.is_valid:
                geom = make_valid(geom)
            props = {k: (int(v) if isinstance(v, float) and v == int(v) else v)
                     for k, v in feat.properties.items() if v is not None}
            features.append({
                "geometry": geom,
                "properties": props,
                "fid": int(props[id_field]),
            })
    print(f"  features lidas: {len(features)}")

    # 2. Índice espacial simples: feature bbox → tiles cobertas
    tile_dict = {}   # (z,x,y) → [feature indices]
    for i, feat in enumerate(features):
        b = feat["geometry"].bounds   # (minx, miny, maxx, maxy)
        # clip ao Brasil
        minx = max(b[0], BRAZIL_BOUNDS[0])
        miny = max(b[1], BRAZIL_BOUNDS[1])
        maxx = min(b[2], BRAZIL_BOUNDS[2])
        maxy = min(b[3], BRAZIL_BOUNDS[3])
        if minx > maxx or miny > maxy:
            continue
        for zoom in range(zoom_min, zoom_max + 1):
            for tile in mercantile.tiles(minx, miny, maxx, maxy, zooms=zoom):
                key = (tile.z, tile.x, tile.y)
                tile_dict.setdefault(key, []).append(i)

    print(f"  tiles a gerar: {len(tile_dict)}")

    # 3. Gera cada tile MVT e escreve em PMTiles
    with open(pmtiles_path, "wb") as f:
        writer = Writer(f)

        for (z, x, y), feat_ids in sorted(tile_dict.items(),
                                           key=lambda kv: zxy_to_tileid(kv[0][0], kv[0][1], kv[0][2])):
            tb = mercantile.bounds(x, y, z)
            tile_box = box(tb.west, tb.south, tb.east, tb.north)

            layer_features = []
            for i in feat_ids:
                feat = features[i]
                clipped = feat["geometry"].intersection(tile_box)
                if clipped.is_empty:
                    continue
                layer_features.append({
                    "geometry": mapping(clipped),
                    "properties": feat["properties"],
                    "id": feat["fid"],
                })

            if not layer_features:
                continue

            mvt_raw = mvt_encode(
                {"name": layer_name, "features": layer_features},
                default_options={
                    "quantize_bounds": (tb.west, tb.south, tb.east, tb.north),
                    "extents": 4096,
                },
            )
            mvt = gzip.compress(mvt_raw) if compress else mvt_raw

            tile_id = zxy_to_tileid(z, x, y)
            writer.write_tile(tile_id, mvt)

        # 4. Finaliza com header e metadados
        # tile_type: 1 = MVT (precisa de .value como enum)
        class _TileType:
            value = 1
        tile_compression = Compression.GZIP if compress else Compression.NONE
        header = {
            "tile_type":        _TileType(),
            "tile_compression": tile_compression,
            "min_lon_e7": int(BRAZIL_BOUNDS[0] * 1e7),
            "min_lat_e7": int(BRAZIL_BOUNDS[1] * 1e7),
            "max_lon_e7": int(BRAZIL_BOUNDS[2] * 1e7),
            "max_lat_e7": int(BRAZIL_BOUNDS[3] * 1e7),
        }
        metadata = {"name": layer_name, "format": "pbf"}
        writer.finalize(header, metadata)

    print(f"  PMTiles salvo: {pmtiles_path}")


if __name__ == "__main__":
    GEO_SRC = "P:/Desktop/MercadoTrabalho/UFRJ_Saude/GEO"
    GEO_DST = "GEO"

    gpkg_to_pmtiles(
        gpkg_path   = f"{GEO_SRC}/meso.gpkg",
        pmtiles_path= f"{GEO_DST}/meso.pmtiles",
        layer_name  = "meso",
        id_field    = "code_meso",
        zoom_min=2, zoom_max=7,
    )

    gpkg_to_pmtiles(
        gpkg_path   = f"{GEO_SRC}/micro.gpkg",
        pmtiles_path= f"{GEO_DST}/micro.pmtiles",
        layer_name  = "micro",
        id_field    = "code_micro",
        zoom_min=2, zoom_max=9,
    )

    print("\nConcluido!")
