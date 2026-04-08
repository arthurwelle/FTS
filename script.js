// ============================================================
// SECTION 1: SHARED FORMATTERS
// ============================================================

const fmtN   = d3.format(",.0f");
const fmtPct = d3.format(".1%");


// ============================================================
// SECTION 2: TOOLTIP ELEMENT
// ============================================================

const tooltip = d3.select("body").append("div").attr("class", "chart-tooltip");

function showTooltip(html, event) {
  tooltip.style("display", "block").html(html);
  moveTooltip(event);
}
function moveTooltip(event) {
  tooltip.style("left", (event.clientX + 14) + "px").style("top", (event.clientY - 10) + "px");
}
function hideTooltip() {
  tooltip.style("display", "none");
}

// ============================================================
// SECTION 3: NÍVEL GEOGRÁFICO — CONFIGURAÇÃO
// ============================================================

// Configuração de cada nível: quais camadas mostrar, como extrair código e nome
const LEVEL_CFG = {
  municipio: {
    layers:     ['mun-fill', 'mun-outline', 'mun-sel-fill', 'mun-sel-stroke'],
    eventLayer: 'mun-fill',
    src: 'municipios', srcLayer: 'mun',
    // code_muni tem 7 dígitos; id_municipio na tabela tem 6 → floor(code_muni/10)
    codeFromProps: p => String(Math.floor(p.code_muni / 10)),
    matchExprKey:  () => ['floor', ['/', ['get', 'code_muni'], 10]],
    nameFromProps: p => p.name_muni,
    regionFromProps: p => p.abbrev_state,
    dataField: 'id_municipio',
  },
  micro: {
    layers:     ['micro-fill', 'micro-outline', 'micro-sel-fill', 'micro-sel-stroke'],
    eventLayer: 'micro-fill',
    src: 'micro', srcLayer: 'micro',
    codeFromProps: p => String(Math.round(p.code_micro)),
    matchExprKey:  () => ['round', ['get', 'code_micro']],
    nameFromProps: p => p.name_micro,
    regionFromProps: p => p.abbrev_state,
    dataField: 'id_micro',
  },
  meso: {
    layers:     ['meso-fill', 'meso-outline', 'meso-sel-fill', 'meso-sel-stroke'],
    eventLayer: 'meso-fill',
    src: 'meso', srcLayer: 'meso',
    codeFromProps: p => String(Math.round(p.code_meso)),
    matchExprKey:  () => ['round', ['get', 'code_meso']],
    nameFromProps: p => p.name_meso,
    regionFromProps: p => p.abbrev_state,
    dataField: 'id_meso',
  },
  uf: {
    layers:     ['uf-fill', 'uf-outline', 'uf-sel-fill', 'uf-sel-stroke'],
    eventLayer: 'uf-fill',
    src: 'estados', srcLayer: 'ufs',
    codeFromProps: p => String(Math.round(p.code_state)),
    matchExprKey:  () => ['round', ['get', 'code_state']],
    nameFromProps: p => p.name_state,
    regionFromProps: p => p.abbrev_state,
    dataField: 'id_uf',
  },
  brasil: {
    // Brasil usa mesmas camadas de UF mas com cor uniforme e hover global
    layers:     ['uf-fill', 'uf-outline', 'uf-sel-fill', 'uf-sel-stroke'],
    eventLayer: 'uf-fill',
    src: 'estados', srcLayer: 'ufs',
    codeFromProps: () => 'brasil',
    matchExprKey:  () => null,   // cor uniforme
    nameFromProps: () => 'Brasil',
    regionFromProps: () => '',
    dataField: null,             // usa todos os dados
  },
};

// Todos os grupos de camadas (para toggle de visibilidade)
const ALL_LAYER_GROUPS = {
  municipio: ['mun-fill', 'mun-outline', 'mun-sel-fill', 'mun-sel-stroke'],
  micro:     ['micro-fill', 'micro-outline', 'micro-sel-fill', 'micro-sel-stroke'],
  meso:      ['meso-fill', 'meso-outline', 'meso-sel-fill', 'meso-sel-stroke'],
  uf:        ['uf-fill', 'uf-outline', 'uf-sel-fill', 'uf-sel-stroke'],
};

// ============================================================
// SECTION 4: PMTILES + MAPLIBRE SETUP
// ============================================================

const protocol = new pmtiles.Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile.bind(protocol));

const map = new maplibregl.Map({
  container: 'map-panel',
  style: {
    version: 8,
    sources: {
      'carto-light': {
        type: 'raster',
        tiles: [
          'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
          'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
          'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
          'https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'
        ],
        tileSize: 256,
        attribution: '© OpenStreetMap © CARTO'
      },
      municipios: {
        type: 'vector',
        url: 'pmtiles://./GEO/municipios.pmtiles',
        promoteId: 'code_muni'
      },
      meso: {
        type: 'vector',
        url: 'pmtiles://./GEO/meso.pmtiles'
        // IDs inteiros embutidos no MVT (code_meso)
      },
      micro: {
        type: 'vector',
        url: 'pmtiles://./GEO/micro.pmtiles'
        // IDs inteiros embutidos no MVT (code_micro)
      },
      estados: {
        type: 'vector',
        url: 'pmtiles://./GEO/ufs.pmtiles',
        promoteId: { 'ufs': 'code_state' }
      }
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#d4e8f7' } },
      { id: 'carto-light', type: 'raster', source: 'carto-light' },

      // ── Município ──────────────────────────────────────────
      { id: 'mun-fill',   type: 'fill',   source: 'municipios', 'source-layer': 'mun',
        layout: { visibility: 'visible' },
        paint: { 'fill-color': '#7ab8d4', 'fill-opacity': 0.85 } },
      { id: 'mun-outline', type: 'line',  source: 'municipios', 'source-layer': 'mun',
        layout: { visibility: 'visible' },
        paint: { 'line-color': '#ffffff', 'line-width': 0.3 } },
      { id: 'mun-sel-fill', type: 'fill', source: 'municipios', 'source-layer': 'mun',
        layout: { visibility: 'visible' },
        paint: { 'fill-color': '#ffe600',
          'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.55, 0] } },
      { id: 'mun-sel-stroke', type: 'line', source: 'municipios', 'source-layer': 'mun',
        layout: { visibility: 'visible' },
        paint: { 'line-color': '#ffe600',
          'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2.5, 0] } },

      // ── Meso ──────────────────────────────────────────────
      { id: 'meso-fill',   type: 'fill',  source: 'meso', 'source-layer': 'meso',
        layout: { visibility: 'none' },
        paint: { 'fill-color': '#7ab8d4', 'fill-opacity': 0.85 } },
      { id: 'meso-outline', type: 'line', source: 'meso', 'source-layer': 'meso',
        layout: { visibility: 'none' },
        paint: { 'line-color': '#ffffff', 'line-width': 0.5 } },
      { id: 'meso-sel-fill', type: 'fill', source: 'meso', 'source-layer': 'meso',
        layout: { visibility: 'none' },
        paint: { 'fill-color': '#ffe600',
          'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.55, 0] } },
      { id: 'meso-sel-stroke', type: 'line', source: 'meso', 'source-layer': 'meso',
        layout: { visibility: 'none' },
        paint: { 'line-color': '#ffe600',
          'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2.5, 0] } },

      // ── Micro ──────────────────────────────────────────────
      { id: 'micro-fill',   type: 'fill',  source: 'micro', 'source-layer': 'micro',
        layout: { visibility: 'none' },
        paint: { 'fill-color': '#7ab8d4', 'fill-opacity': 0.85 } },
      { id: 'micro-outline', type: 'line', source: 'micro', 'source-layer': 'micro',
        layout: { visibility: 'none' },
        paint: { 'line-color': '#ffffff', 'line-width': 0.4 } },
      { id: 'micro-sel-fill', type: 'fill', source: 'micro', 'source-layer': 'micro',
        layout: { visibility: 'none' },
        paint: { 'fill-color': '#ffe600',
          'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.55, 0] } },
      { id: 'micro-sel-stroke', type: 'line', source: 'micro', 'source-layer': 'micro',
        layout: { visibility: 'none' },
        paint: { 'line-color': '#ffe600',
          'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2.5, 0] } },

      // ── UF (também usado para Brasil) ─────────────────────
      { id: 'uf-fill',   type: 'fill',  source: 'estados', 'source-layer': 'ufs',
        layout: { visibility: 'none' },
        paint: { 'fill-color': '#7ab8d4', 'fill-opacity': 0.85 } },
      { id: 'uf-outline', type: 'line', source: 'estados', 'source-layer': 'ufs',
        layout: { visibility: 'none' },
        paint: { 'line-color': '#ffffff', 'line-width': 0.8 } },
      { id: 'uf-sel-fill', type: 'fill', source: 'estados', 'source-layer': 'ufs',
        layout: { visibility: 'none' },
        paint: { 'fill-color': '#ffe600',
          'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.55, 0] } },
      { id: 'uf-sel-stroke', type: 'line', source: 'estados', 'source-layer': 'ufs',
        layout: { visibility: 'none' },
        paint: { 'line-color': '#ffe600',
          'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2.5, 0] } },

      // ── Bordas de estados (permanente) ────────────────────
      { id: 'estados-outline', type: 'line', source: 'estados', 'source-layer': 'ufs',
        paint: { 'line-color': '#334',
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1, 8, 2] } }
    ]
  },
  center: [-52, -14],
  zoom: 4,
  attributionControl: false
});

map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });

// ============================================================
// SECTION 5: HOVER / CLICK STATE + NÍVEL ATUAL
// ============================================================

let currentLevel = 'municipio';
let hoveredId    = null;
let selectedId   = null;

function clearSelection() {
  if (selectedId !== null) {
    const cfg = LEVEL_CFG[currentLevel];
    map.setFeatureState({ source: cfg.src, sourceLayer: cfg.srcLayer, id: selectedId },
                        { selected: false });
    selectedId = null;
  }
}

// ============================================================
// SECTION 6: DADOS — DEFINIÇÕES
// ============================================================

const GRUPOS = [
  { key: 'OcupSaude_SetorSaude',   label: 'Ocup. Saúde / Setor Saúde (FTS)' },
  { key: 'OcupSaude_SetorOutros',  label: 'Ocup. Saúde / Outros Setores'     },
  { key: 'OcupOutros_SetorSaude',  label: 'Outros / Setor Saúde'             },
  { key: 'OcupOutros_SetorOutros', label: 'Outros / Outros Setores'          },
];
const GRUPOS_CHART = GRUPOS.filter(g => g.key !== 'OcupOutros_SetorOutros');
const NATS = ['Publico', 'Privado', 'Sem Fins Lucrativos', 'Outros'];
const NAT_COLORS = {
  'Publico':             '#4e79a7',
  'Privado':             '#f28e2b',
  'Sem Fins Lucrativos': '#59a14f',
  'Outros':              '#bab0ac',
};
const FTS_GRUPOS = ['OcupSaude_SetorSaude', 'OcupSaude_SetorOutros', 'OcupOutros_SetorSaude'];

// ============================================================
// SECTION 7: CARREGA DADOS + INICIALIZA
// ============================================================

// Cores e labels para os gráficos de barra única do CSV novo
const FTS2_COLORS = {
  'OcupSaude_SetorSaude':   '#2166ac',
  'OcupSaude_SetorOutros':  '#74add1',
  'OcupOutros_SetorSaude':  '#f4a582',
};
const FTS2_LABELS = {
  'OcupSaude_SetorSaude':   'Ocup. Saúde / Setor Saúde',
  'OcupSaude_SetorOutros':  'Ocup. Saúde / Outros Setores',
  'OcupOutros_SetorSaude':  'Outros / Setor Saúde',
};

Promise.all([
  d3.csv("DADOS/RAIS_FTS_NatJur_Municipio.csv"),
  d3.csv("DADOS/rais_vinculos_FTS_2024_Municipio.csv"),
]).then(([raw, raw2]) => {

  raw.forEach(r => { r.n = +r.n; });
  raw2.forEach(r => { r.Qtd = +r.Qtd; r.valor_remuneracao_media_ = +r.valor_remuneracao_media_; });

  // Pré-agrega CSV1 (NatJur) por cada nível
  const dataByLevel = {
    municipio: d3.group(raw.filter(r => r.id_municipio), r => r.id_municipio),
    micro:     d3.group(raw.filter(r => r.id_micro),    r => r.id_micro),
    meso:      d3.group(raw.filter(r => r.id_meso),     r => r.id_meso),
    uf:        d3.group(raw.filter(r => r.id_uf),       r => r.id_uf),
    brasil:    new Map([['brasil', raw]]),
  };

  // Pré-agrega CSV2 (CBO+renda) por cada nível
  // id_municipio no CSV2 tem 7 dígitos; os primeiros 6 = chave de municipio
  const dataByLevel2 = {
    municipio: d3.group(raw2.filter(r => r.id_municipio), r => r.id_municipio.slice(0, 6)),
    micro:     d3.group(raw2.filter(r => r.id_micro),     r => r.id_micro),
    meso:      d3.group(raw2.filter(r => r.id_meso),      r => r.id_meso),
    uf:        d3.group(raw2.filter(r => r.id_uf),        r => r.id_uf),
    brasil:    new Map([['brasil', raw2]]),
  };

  // ── Choropleth ─────────────────────────────────────────────

  // Escala discreta: 4 bins para % público na FTS
  const choroBins   = [0, 0.20, 0.40, 0.60, Infinity];
  const choroColors = ['#ffffb2', '#fecc5c', '#fd8d3c', '#e31a1c'];
  const choroLabels = ['< 20%', '20–40%', '40–60%', '> 60%'];

  function colorScale(ratio) {
    for (let i = 0; i < choroBins.length - 1; i++) {
      if (ratio < choroBins[i + 1]) return choroColors[i];
    }
    return choroColors[choroColors.length - 1];
  }

  function computeChoroMap(level) {
    const cmap = new Map();
    dataByLevel[level].forEach((rows, key) => {
      const ftsRows = rows.filter(r => FTS_GRUPOS.includes(r.grupo_saude));
      const total   = d3.sum(ftsRows, r => r.n);
      const pub     = d3.sum(ftsRows.filter(r => r.natureza_juridica_ === 'Publico'), r => r.n);
      cmap.set(key, total > 0 ? pub / total : 0);
    });
    return cmap;
  }

  function applyChoropleth(level) {
    const cfg     = LEVEL_CFG[level];
    const fillId  = cfg.layers[0];   // e.g. 'mun-fill'
    const cmap    = computeChoroMap(level);

    if (level === 'brasil') {
      // Cor uniforme = razão nacional
      const allFts = raw.filter(r => FTS_GRUPOS.includes(r.grupo_saude));
      const ratio  = d3.sum(allFts.filter(r => r.natureza_juridica_ === 'Publico'), r => r.n)
                   / d3.sum(allFts, r => r.n);
      map.setPaintProperty(fillId, 'fill-color', colorScale(ratio));
    } else {
      const matchExpr = ['match', cfg.matchExprKey()];
      cmap.forEach((ratio, id) => {
        matchExpr.push(parseInt(id));
        matchExpr.push(colorScale(ratio));
      });
      matchExpr.push('#d0d0d0');
      map.setPaintProperty(fillId, 'fill-color', matchExpr);
    }
    renderLegend();
  }

  // ── Legenda Viridis contínua ───────────────────────────────

  function renderLegend() {
    const container = document.getElementById('choro-legend');
    container.innerHTML = '';
    const W = 140, H = 80;
    const barY = 14;

    const svg = d3.select(container).append('svg').attr('width', W).attr('height', H);

    svg.append('text').attr('x', 0).attr('y', 10)
      .attr('font-size', 9).attr('fill', '#555').attr('font-weight', 'bold')
      .text('% Público na FTS');

    const SW = 14, SH = 10, gap = 3, rowH = SH + gap;
    choroColors.forEach((col, i) => {
      const y = barY + i * rowH;
      svg.append('rect').attr('x', 0).attr('y', y)
        .attr('width', SW).attr('height', SH)
        .attr('fill', col).attr('stroke', '#aaa').attr('stroke-width', 0.5);
      svg.append('text').attr('x', SW + 4).attr('y', y + SH - 2)
        .attr('font-size', 10).attr('fill', '#333').text(choroLabels[i]);
    });
    const yNoData = barY + choroColors.length * rowH + 4;
    svg.append('rect').attr('x', 0).attr('y', yNoData)
      .attr('width', SW).attr('height', SH).attr('fill', '#d0d0d0')
      .attr('stroke', '#aaa').attr('stroke-width', 0.5);
    svg.append('text').attr('x', SW + 4).attr('y', yNoData + SH - 2)
      .attr('font-size', 10).attr('fill', '#555').text('Sem dado');
  }

  // ── Troca de nível ────────────────────────────────────────

  function switchLevel(newLevel) {
    // Limpa seleção e painel
    clearSelection();
    clearPanel();
    hoveredId = null;
    popup.remove();

    // Esconde todos os grupos
    Object.values(ALL_LAYER_GROUPS).forEach(ids =>
      ids.forEach(id => map.setLayoutProperty(id, 'visibility', 'none'))
    );

    // Mostra o grupo do novo nível (brasil usa grupo uf)
    const groupKey = newLevel === 'brasil' ? 'uf' : newLevel;
    ALL_LAYER_GROUPS[groupKey].forEach(id =>
      map.setLayoutProperty(id, 'visibility', 'visible')
    );

    currentLevel = newLevel;
    applyChoropleth(newLevel);

    if (newLevel === 'brasil') {
      // Mostra dados imediatamente, sem precisar de hover/click
      updatePanel('brasil', 'Brasil', '');
    } else {
      d3.select("#hover-label")
        .text(`Passe o mouse sobre uma ${NIVEL_LABEL[newLevel].toLowerCase()}`)
        .classed("active", false);
    }
  }

  const NIVEL_LABEL = {
    municipio: 'Município',
    micro: 'Microrregião',
    meso: 'Mesorregião',
    uf: 'UF',
    brasil: 'Região',
  };

  document.getElementById('nivel-select').addEventListener('change', e => {
    switchLevel(e.target.value);
  });

  // ── Hover (todos os fill layers — MapLibre só dispara para layers visíveis) ──

  const ALL_FILL_LAYERS = ['mun-fill', 'micro-fill', 'meso-fill', 'uf-fill'];

  ALL_FILL_LAYERS.forEach(layerId => {
    map.on('mousemove', layerId, (e) => {
      if (currentLevel === 'brasil') return;
      if (e.features.length === 0) return;
      const feat = e.features[0];
      const cfg  = LEVEL_CFG[currentLevel];

      if (hoveredId !== null) {
        map.setFeatureState({ source: cfg.src, sourceLayer: cfg.srcLayer, id: hoveredId },
                            { hover: false });
      }
      hoveredId = feat.id;
      map.setFeatureState({ source: cfg.src, sourceLayer: cfg.srcLayer, id: hoveredId },
                          { hover: true });
      map.getCanvas().style.cursor = 'pointer';

      const name   = cfg.nameFromProps(feat.properties);
      const region = cfg.regionFromProps(feat.properties);
      popup.setLngLat(e.lngLat)
        .setHTML(`<strong>${name}</strong>${region ? `<br><span>${region}</span>` : ''}`)
        .addTo(map);

      if (selectedId === null) {
        const code = cfg.codeFromProps(feat.properties);
        updatePanel(code, name, region);
      }
    });

    map.on('mouseleave', layerId, () => {
      if (currentLevel === 'brasil') return;
      const cfg = LEVEL_CFG[currentLevel];
      if (hoveredId !== null) {
        map.setFeatureState({ source: cfg.src, sourceLayer: cfg.srcLayer, id: hoveredId },
                            { hover: false });
      }
      hoveredId = null;
      map.getCanvas().style.cursor = '';
      popup.remove();
      if (selectedId === null) clearPanel();
    });
  });

  // ── Click ────────────────────────────────────────────────

  ALL_FILL_LAYERS.forEach(layerId => {
    map.on('click', layerId, (e) => {
      if (currentLevel === 'brasil') return;
      if (e.features.length === 0) return;
      const feat      = e.features[0];
      const cfg       = LEVEL_CFG[currentLevel];
      const clickedId = feat.id;
      const code      = cfg.codeFromProps(feat.properties);
      const name      = cfg.nameFromProps(feat.properties);
      const region    = cfg.regionFromProps(feat.properties);

      if (selectedId === clickedId) {
        clearSelection();
        clearPanel();
      } else {
        clearSelection();
        selectedId = clickedId;
        map.setFeatureState({ source: cfg.src, sourceLayer: cfg.srcLayer, id: selectedId },
                            { selected: true });
        updatePanel(code, name, region);
      }
    });
  });

  // Click fora deseleciona (não se aplica ao nível Brasil)
  map.on('click', (e) => {
    if (currentLevel === 'brasil') return;
    const cfg      = LEVEL_CFG[currentLevel];
    const features = map.queryRenderedFeatures(e.point, { layers: [cfg.eventLayer] });
    if (features.length === 0) { clearSelection(); clearPanel(); }
  });

  // ── Carregamento do mapa ─────────────────────────────────

  map.on('load', () => {
    applyChoropleth(currentLevel);
    document.getElementById('loading-overlay').style.display = 'none';
  });

  // ============================================================
  // SECTION 8: PAINEL
  // ============================================================

  function clearPanel() {
    d3.select("#hover-label")
      .text(`Passe o mouse sobre uma ${NIVEL_LABEL[currentLevel].toLowerCase()}`)
      .classed("active", false);
    d3.select("#placeholder").style("display", null);
    d3.select("#panel-content").style("display", "none");
    d3.select("#fts-bar-content").html('<p class="no-data">Sem dados para esta região.</p>');
    d3.select("#nat-bar-content").html('<p class="no-data">Sem dados para esta região.</p>');
  }

  function updatePanel(code, name, region) {
    d3.select("#mun-name").text(name);
    d3.select("#mun-state").text(region);
    d3.select("#hover-label").text(region ? `${name} — ${region}` : name).classed("active", true);
    d3.select("#placeholder").style("display", "none");
    d3.select("#panel-content").style("display", "block");

    // Busca linhas para este nível/código
    const rows  = dataByLevel[currentLevel].get(code) || [];
    const rows2 = dataByLevel2[currentLevel].get(code) || [];
    renderTabelaCruzada(rows);
    renderBarChart(rows);
    renderFtsBar(rows2);
    renderNatBar(rows2);
  }

  // ============================================================
  // SECTION 9: TABELA CRUZADA
  // ============================================================

  function renderTabelaCruzada(rows) {
    const container = d3.select("#tabela-content");
    container.html("");

    if (rows.length === 0) {
      container.append("p").attr("class", "no-data").text("Sem dados RAIS para esta região.");
      return;
    }

    const lookup = {};
    GRUPOS.forEach(g => { lookup[g.key] = {}; NATS.forEach(n => { lookup[g.key][n] = 0; }); });
    rows.forEach(r => {
      if (lookup[r.grupo_saude] && NATS.includes(r.natureza_juridica_))
        lookup[r.grupo_saude][r.natureza_juridica_] += r.n;
    });

    const totaisNat  = {};
    NATS.forEach(n => { totaisNat[n] = d3.sum(GRUPOS, g => lookup[g.key][n]); });
    const totalGeral = d3.sum(NATS, n => totaisNat[n]);

    const wrap  = container.append("div").attr("class", "data-table-wrap");
    const table = wrap.append("table").attr("class", "data-table");

    const thead = table.append("thead").append("tr");
    thead.append("th").text("Grupo").style("text-align", "left");
    NATS.forEach(n => thead.append("th").text(n));
    thead.append("th").text("Total").attr("class", "col-total");

    const tbody = table.append("tbody");
    GRUPOS.forEach(g => {
      const rowTotal = d3.sum(NATS, n => lookup[g.key][n]);
      const tr = tbody.append("tr");
      tr.append("td").text(g.label).style("text-align", "left");
      NATS.forEach(n => tr.append("td").text(fmtN(lookup[g.key][n])));
      tr.append("td").text(fmtN(rowTotal)).attr("class", "col-total");
    });

    const trTot = tbody.append("tr").attr("class", "row-total");
    trTot.append("td").text("Total").style("text-align", "left");
    NATS.forEach(n => trTot.append("td").text(fmtN(totaisNat[n])));
    trTot.append("td").text(fmtN(totalGeral)).attr("class", "col-total");
  }

  // ============================================================
  // SECTION 10: GRÁFICO DE BARRAS HORIZONTAIS
  // ============================================================

  function renderBarChart(rows) {
    const container = d3.select("#chart-content");
    container.html("");

    if (rows.length === 0) {
      container.append("p").attr("class", "no-data").text("Sem dados para esta região.");
      return;
    }

    const lookup = {};
    GRUPOS_CHART.forEach(g => { lookup[g.key] = {}; NATS.forEach(n => { lookup[g.key][n] = 0; }); });
    rows.forEach(r => {
      if (lookup[r.grupo_saude] && NATS.includes(r.natureza_juridica_))
        lookup[r.grupo_saude][r.natureza_juridica_] += r.n;
    });

    const chartData = GRUPOS_CHART.map(g => {
      const obj = { grupo: g.key, label: g.label };
      NATS.forEach(n => { obj[n] = lookup[g.key][n]; });
      obj.total = d3.sum(NATS, n => obj[n]);
      return obj;
    });

    const margin = { top: 10, right: 14, bottom: 28, left: 180 };
    const W = 500, H = 140;
    const iW = W - margin.left - margin.right;
    const iH = H - margin.top  - margin.bottom;

    const series  = d3.stack().keys(NATS)(chartData);
    const maxVal  = d3.max(chartData, d => d.total) || 1;

    const xScale = d3.scaleLinear().domain([0, maxVal * 1.05]).range([0, iW]);
    const yScale = d3.scaleBand().domain(GRUPOS_CHART.map(g => g.label)).range([0, iH]).padding(0.2);

    const wrap = container.append("div").attr("class", "chart-wrap");
    const svg  = wrap.append("svg").attr("viewBox", `0 0 ${W} ${H}`)
                    .attr("preserveAspectRatio", "xMidYMid meet");
    const g    = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    g.append("g").selectAll("line")
      .data(xScale.ticks(4)).enter().append("line").attr("class", "gridline")
      .attr("x1", d => xScale(d)).attr("x2", d => xScale(d))
      .attr("y1", 0).attr("y2", iH);

    g.selectAll(".series").data(series).enter().append("g")
      .attr("fill", s => NAT_COLORS[s.key])
      .selectAll("rect").data(s => s).enter().append("rect")
      .attr("y",      d => yScale(GRUPOS_CHART.find(gg => gg.key === d.data.grupo).label))
      .attr("x",      d => xScale(d[0]))
      .attr("width",  d => xScale(d[1]) - xScale(d[0]))
      .attr("height", yScale.bandwidth())
      .on("mouseover", function(event, d) {
        const key = d3.select(this.parentNode).datum().key;
        showTooltip(`<strong>${key}</strong><br>${fmtN(d[1] - d[0])} vínculos`, event);
      })
      .on("mousemove", event => moveTooltip(event))
      .on("mouseout",  () => hideTooltip());

    g.append("g").attr("class", "axis").attr("transform", `translate(0,${iH})`)
      .call(d3.axisBottom(xScale).ticks(4).tickFormat(d => {
        if (d >= 1e6) return d3.format(".1f")(d / 1e6) + " M";
        if (d >= 1e3) return d3.format(".0f")(d / 1e3) + " k";
        return d3.format(".0f")(d);
      }));
    g.append("g").attr("class", "axis")
      .call(d3.axisLeft(yScale).tickSize(0))
      .select(".domain").remove();

    const leg = wrap.append("div").attr("class", "chart-legend");
    NATS.forEach(n => {
      const span = leg.append("span");
      span.append("span").attr("class", "swatch").style("background", NAT_COLORS[n]);
      span.append("span").text(n);
    });
  }

  // ============================================================
  // SECTION 11: STACKED BAR ÚNICA — FTS (excl. OcupOutros_SetorOutros)
  // ============================================================

  function renderFtsBar(rows2) {
    const container = d3.select("#fts-bar-content");
    container.html("");

    // Filtra FTS relevantes (exclui OcupOutros_SetorOutros)
    const FTS_KEYS = ['OcupSaude_SetorSaude', 'OcupSaude_SetorOutros', 'OcupOutros_SetorSaude'];
    const validRows = rows2.filter(r => FTS_KEYS.includes(r.FTS));

    if (validRows.length === 0) {
      container.append("p").attr("class", "no-data").text("Sem dados para esta região.");
      return;
    }

    // Soma Qtd por FTS
    const totByFts = {};
    FTS_KEYS.forEach(k => { totByFts[k] = 0; });
    validRows.forEach(r => { if (totByFts[r.FTS] !== undefined) totByFts[r.FTS] += r.Qtd; });
    const total = d3.sum(FTS_KEYS, k => totByFts[k]);

    renderSingleStackedBar(
      container,
      FTS_KEYS,
      FTS2_COLORS,
      FTS2_LABELS,
      k => totByFts[k],
      total,
      "vínculos FTS"
    );
  }

  // ============================================================
  // SECTION 12: STACKED BAR ÚNICA — NATUREZA JURÍDICA (excl. OcupOutros_SetorOutros)
  // ============================================================

  function renderNatBar(rows2) {
    const container = d3.select("#nat-bar-content");
    container.html("");

    const FTS_KEYS = ['OcupSaude_SetorSaude', 'OcupSaude_SetorOutros', 'OcupOutros_SetorSaude'];
    const validRows = rows2.filter(r => FTS_KEYS.includes(r.FTS));

    if (validRows.length === 0) {
      container.append("p").attr("class", "no-data").text("Sem dados para esta região.");
      return;
    }

    const totByNat = {};
    NATS.forEach(n => { totByNat[n] = 0; });
    validRows.forEach(r => { if (totByNat[r.natureza_juridica_] !== undefined) totByNat[r.natureza_juridica_] += r.Qtd; });
    const total = d3.sum(NATS, n => totByNat[n]);

    renderSingleStackedBar(
      container,
      NATS,
      NAT_COLORS,
      Object.fromEntries(NATS.map(n => [n, n])),
      n => totByNat[n],
      total,
      "vínculos"
    );
  }

  // ── Helper: barra única horizontal empilhada ───────────────
  function renderSingleStackedBar(container, keys, colors, labels, valFn, total, unit) {
    const W = 460, barH = 36, legendH = 50;
    const H = barH + legendH + 20;
    const margin = { left: 0, right: 0 };
    const iW = W - margin.left - margin.right;

    const wrap = container.append("div").attr("class", "chart-wrap");
    const svg  = wrap.append("svg")
      .attr("viewBox", `0 0 ${W} ${H}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    const xScale = d3.scaleLinear().domain([0, total]).range([0, iW]);

    // Barras empilhadas
    let cumX = 0;
    keys.forEach(k => {
      const v = valFn(k);
      const w = xScale(v);
      if (w < 0.5) { cumX += w; return; }

      svg.append("rect")
        .attr("x", cumX).attr("y", 4)
        .attr("width", w).attr("height", barH)
        .attr("fill", colors[k])
        .on("mouseover", (event) =>
          showTooltip(`<strong>${labels[k]}</strong><br>${fmtN(v)} ${unit} (${fmtPct(v / total)})`, event))
        .on("mousemove", event => moveTooltip(event))
        .on("mouseout", () => hideTooltip());

      // Label dentro da barra se larga o suficiente
      if (w > 50) {
        svg.append("text")
          .attr("x", cumX + w / 2).attr("y", 4 + barH / 2 + 4)
          .attr("text-anchor", "middle")
          .attr("font-size", 10).attr("fill", "#fff").attr("font-weight", "bold")
          .attr("pointer-events", "none")
          .text(fmtPct(v / total));
      }
      cumX += w;
    });

    // Total à direita
    svg.append("text")
      .attr("x", iW).attr("y", 4 + barH / 2 + 4)
      .attr("text-anchor", "end")
      .attr("font-size", 10).attr("fill", "#555")
      .attr("pointer-events", "none")
      .text(`n = ${fmtN(total)}`);

    // Legenda abaixo
    const leg = wrap.append("div").attr("class", "chart-legend");
    keys.forEach(k => {
      const v = valFn(k);
      if (v === 0) return;
      const span = leg.append("span");
      span.append("span").attr("class", "swatch").style("background", colors[k]);
      span.append("span").text(`${labels[k]} (${fmtN(v)})`);
    });
  }

}).catch(err => {
  console.error("Erro ao carregar dados:", err);
  document.getElementById('loading-msg').textContent = `Erro: ${err.message}`;
});
