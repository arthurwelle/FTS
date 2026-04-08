# build_pmtiles.py
# Converte meso.gpkg e micro.gpkg para PMTiles em GEO/
# usando fiona + pyproj + mapbox-vector-tile + pmtiles.
# Reprojecta para EPSG:3857 (Web Mercator) antes de codificar os tiles,
# corrigindo o descasamento de geometrias no zoom.

import gzip
import fiona
import mercantile
from pyproj import Transformer
from shapely.geometry import shape, mapping, box
from shapely.ops import transform as shp_transform
from shapely.validation import make_valid
from mapbox_vector_tile import encode as mvt_encode
from pmtiles.writer import Writer, Compression
from pmtiles.reader import zxy_to_tileid

# Reprojetores
_to_3857 = Transformer.from_crs("EPSG:4674", "EPSG:3857", always_xy=True)

def to_3857(geom):
    return shp_transform(_to_3857.transform, geom)

# Bounding box do Brasil em EPSG:4326 (para selecionar tiles)
BRAZIL_BOUNDS_4326 = (-74.0, -34.0, -28.0, 6.0)


def gpkg_to_pmtiles(gpkg_path, pmtiles_path, layer_name, id_field,
                    zoom_min=2, zoom_max=8):
    print(f"\nConvertendo {gpkg_path} -> {pmtiles_path}")

    # 1. Lê e reprojecta todas as features para EPSG:3857
    features = []
    with fiona.open(gpkg_path, encoding="utf-8") as src:
        for feat in src:
            if feat.geometry is None:
                continue
            geom = shape(feat.geometry)
            if not geom.is_valid:
                geom = make_valid(geom)
            geom_3857 = to_3857(geom)
            props = {k: (int(v) if isinstance(v, float) and v == int(v) else v)
                     for k, v in feat.properties.items() if v is not None}
            features.append({
                "geometry": geom_3857,   # agora em metros (EPSG:3857)
                "properties": props,
                "fid": int(props[id_field]),
            })
    print(f"  features lidas e reprojetadas: {len(features)}")

    # 2. Para cada zoom/tile, seleciona e codifica features
    tile_dict = {}
    for i, feat in enumerate(features):
        b = feat["geometry"].bounds   # (minx_3857, miny_3857, maxx_3857, maxy_3857)
        # Converte bounds de volta para 4326 apenas para selecionar quais tiles cobrir
        west  = max(_to_3857.transform(b[0], 0, direction="INVERSE")[0], BRAZIL_BOUNDS_4326[0])
        east  = min(_to_3857.transform(b[2], 0, direction="INVERSE")[0], BRAZIL_BOUNDS_4326[2])
        south = max(_to_3857.transform(0, b[1], direction="INVERSE")[1], BRAZIL_BOUNDS_4326[1])
        north = min(_to_3857.transform(0, b[3], direction="INVERSE")[1], BRAZIL_BOUNDS_4326[3])
        if west > east or south > north:
            continue
        for zoom in range(zoom_min, zoom_max + 1):
            for tile in mercantile.tiles(west, south, east, north, zooms=zoom):
                key = (tile.z, tile.x, tile.y)
                tile_dict.setdefault(key, []).append(i)

    print(f"  tiles a gerar: {len(tile_dict)}")

    # 3. Codifica cada tile em MVT com bounds em EPSG:3857
    with open(pmtiles_path, "wb") as f:
        writer = Writer(f)

        for (z, x, y), feat_ids in sorted(
                tile_dict.items(),
                key=lambda kv: zxy_to_tileid(kv[0][0], kv[0][1], kv[0][2])):

            # Bounds do tile em EPSG:3857
            tb_3857 = mercantile.xy_bounds(x, y, z)
            tile_box_3857 = box(tb_3857.left, tb_3857.bottom, tb_3857.right, tb_3857.top)

            layer_features = []
            for i in feat_ids:
                feat = features[i]
                clipped = feat["geometry"].intersection(tile_box_3857)
                if clipped.is_empty:
                    continue
                layer_features.append({
                    "geometry": mapping(clipped),
                    "properties": feat["properties"],
                    "id": feat["fid"],
                })

            if not layer_features:
                continue

            # Quantiza com bounds em EPSG:3857 — coordenadas já estão em metros
            mvt_raw = mvt_encode(
                {"name": layer_name, "features": layer_features},
                default_options={
                    "quantize_bounds": (tb_3857.left, tb_3857.bottom,
                                        tb_3857.right, tb_3857.top),
                    "extents": 4096,
                },
            )
            mvt_gz = gzip.compress(mvt_raw)

            writer.write_tile(zxy_to_tileid(z, x, y), mvt_gz)

        # 4. Finaliza
        class _TileType:
            value = 1   # MVT

        header = {
            "tile_type":        _TileType(),
            "tile_compression": Compression.GZIP,
            "min_lon_e7": int(BRAZIL_BOUNDS_4326[0] * 1e7),
            "min_lat_e7": int(BRAZIL_BOUNDS_4326[1] * 1e7),
            "max_lon_e7": int(BRAZIL_BOUNDS_4326[2] * 1e7),
            "max_lat_e7": int(BRAZIL_BOUNDS_4326[3] * 1e7),
        }
        metadata = {"name": layer_name, "format": "pbf"}
        writer.finalize(header, metadata)

    print(f"  PMTiles salvo: {pmtiles_path}")


if __name__ == "__main__":
    GEO_SRC = "P:/Desktop/MercadoTrabalho/UFRJ_Saude/GEO"
    GEO_DST = "GEO"

    gpkg_to_pmtiles(
        gpkg_path    = f"{GEO_SRC}/ufs.gpkg",
        pmtiles_path = f"{GEO_DST}/ufs.pmtiles",
        layer_name   = "ufs",
        id_field     = "code_state",
        zoom_min=2, zoom_max=8,
    )

    gpkg_to_pmtiles(
        gpkg_path    = f"{GEO_SRC}/meso.gpkg",
        pmtiles_path = f"{GEO_DST}/meso.pmtiles",
        layer_name   = "meso",
        id_field     = "code_meso",
        zoom_min=2, zoom_max=7,
    )

    gpkg_to_pmtiles(
        gpkg_path    = f"{GEO_SRC}/micro.gpkg",
        pmtiles_path = f"{GEO_DST}/micro.pmtiles",
        layer_name   = "micro",
        id_field     = "code_micro",
        zoom_min=2, zoom_max=9,
    )

    print("\nConcluido!")
