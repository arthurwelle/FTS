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
// SECTION 3: PMTILES + MAPLIBRE SETUP
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
      estados: {
        type: 'vector',
        url: 'pmtiles://./GEO/ufs.pmtiles'
      }
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#d4e8f7' } },
      { id: 'carto-light', type: 'raster', source: 'carto-light' },
      {
        id: 'municipios-fill',
        type: 'fill',
        source: 'municipios',
        'source-layer': 'mun',
        paint: { 'fill-color': '#7ab8d4', 'fill-opacity': 0.85 }
      },
      {
        id: 'municipios-outline',
        type: 'line',
        source: 'municipios',
        'source-layer': 'mun',
        paint: { 'line-color': '#ffffff', 'line-width': 0.3 }
      },
      // Selected municipality highlight (yellow)
      {
        id: 'municipios-selected-fill',
        type: 'fill',
        source: 'municipios',
        'source-layer': 'mun',
        paint: {
          'fill-color': '#ffe600',
          'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.55, 0]
        }
      },
      {
        id: 'municipios-selected-stroke',
        type: 'line',
        source: 'municipios',
        'source-layer': 'mun',
        paint: {
          'line-color': '#ffe600',
          'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2.5, 0]
        }
      },
      // State borders
      {
        id: 'estados-outline',
        type: 'line',
        source: 'estados',
        'source-layer': 'ufs',
        paint: {
          'line-color': '#334',
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1, 8, 2]
        }
      }
    ]
  },
  center: [-52, -14],
  zoom: 4,
  attributionControl: false
});

map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');

const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });

// ============================================================
// SECTION 4: HOVER / CLICK STATE
// ============================================================

let hoveredId  = null;
let selectedId = null;

function clearSelection() {
  if (selectedId !== null) {
    map.setFeatureState({ source: 'municipios', sourceLayer: 'mun', id: selectedId }, { selected: false });
    selectedId = null;
  }
}

// ============================================================
// SECTION 5: DATA DEFINITIONS
// ============================================================

// Grupos de saúde com labels legíveis
const GRUPOS = [
  { key: 'OcupSaude_SetorSaude',   label: 'Ocup. Saúde / Setor Saúde (FTS)' },
  { key: 'OcupSaude_SetorOutros',  label: 'Ocup. Saúde / Outros Setores'     },
  { key: 'OcupOutros_SetorSaude',  label: 'Outros / Setor Saúde'             },
  { key: 'OcupOutros_SetorOutros', label: 'Outros / Outros Setores'           },
];

const NATS = ['Publico', 'Privado', 'Sem Fins Lucrativos', 'Outros'];

// Cores para natureza jurídica
const NAT_COLORS = {
  'Publico':               '#4e79a7',
  'Privado':               '#f28e2b',
  'Sem Fins Lucrativos':   '#59a14f',
  'Outros':                '#bab0ac',
};

// ============================================================
// SECTION 6: LOAD DATA + WIRE EVERYTHING AFTER MAP LOADS
// ============================================================

d3.csv("DADOS/RAIS_FTS_NatJur_Municipio.csv").then(raw => {

  // Parse numeric columns e normaliza id
  raw.forEach(r => {
    r.n = +r.n;
    r.id_municipio = String(r.id_municipio).trim();
  });

  // Agrupa por id_municipio (6 dígitos)
  const dataMap = d3.group(raw, d => d.id_municipio);

  // --- Choropleth: % público no total da FTS (excluindo OcupOutros_SetorOutros) ---
  const FTS_GRUPOS = ['OcupSaude_SetorSaude', 'OcupSaude_SetorOutros', 'OcupOutros_SetorSaude'];

  const choroMap = new Map();
  dataMap.forEach((rows, id) => {
    const ftsRows = rows.filter(r => FTS_GRUPOS.includes(r.grupo_saude));
    const total   = d3.sum(ftsRows, r => r.n);
    const publico = d3.sum(ftsRows.filter(r => r.natureza_juridica_ === 'Publico'), r => r.n);
    choroMap.set(id, total > 0 ? publico / total : 0);
  });

  // Escala contínua Viridis (0 = mínimo público, 1 = máximo público)
  const colorScale = d3.scaleSequential(d3.interpolateViridis).domain([0, 1]);

  // --- Aplica choropleth ---
  // Mapeamento 7→6 dígitos via expressão MapLibre: floor(code_muni / 10)
  function applyChoropleth() {
    const matchExpr = ['match', ['floor', ['/', ['get', 'code_muni'], 10]]];
    choroMap.forEach((ratio, id) => {
      matchExpr.push(parseInt(id));
      matchExpr.push(colorScale(ratio));
    });
    matchExpr.push('#d0d0d0'); // municípios sem dado
    map.setPaintProperty('municipios-fill', 'fill-color', matchExpr);
    renderLegend();
  }

  // --- Legenda contínua (gradiente Viridis) ---
  function renderLegend() {
    const container = document.getElementById('choro-legend');
    container.innerHTML = '';
    const W = 140, H = 58;
    const barX = 0, barY = 14, barW = W - 10, barH = 12;

    const svg = d3.select(container).append('svg').attr('width', W).attr('height', H);

    svg.append('text')
      .attr('x', 0).attr('y', 10)
      .attr('font-size', 9).attr('fill', '#555').attr('font-weight', 'bold')
      .text('% Público na FTS');

    // Gradiente
    const defs = svg.append('defs');
    const grad = defs.append('linearGradient').attr('id', 'viridis-grad')
      .attr('x1', '0%').attr('x2', '100%');
    d3.range(0, 1.01, 0.05).forEach(t => {
      grad.append('stop').attr('offset', `${Math.round(t * 100)}%`)
        .attr('stop-color', colorScale(t));
    });

    svg.append('rect')
      .attr('x', barX).attr('y', barY).attr('width', barW).attr('height', barH)
      .attr('fill', 'url(#viridis-grad)');

    // Rótulos dos extremos e meio
    [0, 0.5, 1].forEach(t => {
      svg.append('text')
        .attr('x', barX + t * barW).attr('y', barY + barH + 9)
        .attr('font-size', 9).attr('fill', '#333').attr('text-anchor', 'middle')
        .text(`${Math.round(t * 100)}%`);
    });

    // Sem dado
    svg.append('rect').attr('x', 0).attr('y', barY + barH + 18)
      .attr('width', 10).attr('height', 8).attr('fill', '#d0d0d0')
      .attr('stroke', '#aaa').attr('stroke-width', 0.5);
    svg.append('text').attr('x', 14).attr('y', barY + barH + 26)
      .attr('font-size', 9).attr('fill', '#555').text('Sem dado');
  }

  // --- Hover ---
  map.on('mousemove', 'municipios-fill', (e) => {
    if (e.features.length === 0) return;

    if (hoveredId !== null) {
      map.setFeatureState({ source: 'municipios', sourceLayer: 'mun', id: hoveredId }, { hover: false });
    }
    hoveredId = e.features[0].id;
    map.setFeatureState({ source: 'municipios', sourceLayer: 'mun', id: hoveredId }, { hover: true });
    map.getCanvas().style.cursor = 'pointer';

    const { name_muni, abbrev_state, code_muni } = e.features[0].properties;
    popup.setLngLat(e.lngLat)
      .setHTML(`<strong>${name_muni}</strong><br><span>${abbrev_state}</span>`)
      .addTo(map);

    if (selectedId === null) {
      const code6 = String(Math.floor(code_muni / 10));
      updatePanel(code6, name_muni, abbrev_state);
    }
  });

  map.on('mouseleave', 'municipios-fill', () => {
    if (hoveredId !== null) {
      map.setFeatureState({ source: 'municipios', sourceLayer: 'mun', id: hoveredId }, { hover: false });
    }
    hoveredId = null;
    map.getCanvas().style.cursor = '';
    popup.remove();
    if (selectedId === null) {
      clearPanel();
    }
  });

  // --- Click ---
  map.on('click', 'municipios-fill', (e) => {
    if (e.features.length === 0) return;
    const feat      = e.features[0];
    const clickedId = feat.id;
    const { name_muni, abbrev_state, code_muni } = feat.properties;
    const code6 = String(Math.floor(code_muni / 10));

    if (selectedId === clickedId) {
      clearSelection();
      clearPanel();
    } else {
      clearSelection();
      selectedId = clickedId;
      map.setFeatureState({ source: 'municipios', sourceLayer: 'mun', id: selectedId }, { selected: true });
      updatePanel(code6, name_muni, abbrev_state);
    }
  });

  // Click fora deseleciona
  map.on('click', (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: ['municipios-fill'] });
    if (features.length === 0) {
      clearSelection();
      clearPanel();
    }
  });

  // Aguarda mapa carregar para aplicar choropleth
  map.on('load', () => {
    applyChoropleth();
    document.getElementById('loading-overlay').style.display = 'none';
  });

  // ============================================================
  // SECTION 7: PANEL UPDATE
  // ============================================================

  function clearPanel() {
    d3.select("#hover-label").text("Passe o mouse sobre um município").classed("active", false);
    d3.select("#placeholder").style("display", null);
    d3.select("#panel-content").style("display", "none");
  }

  function updatePanel(id, name, state) {
    d3.select("#mun-name").text(name);
    d3.select("#mun-state").text(state);
    d3.select("#hover-label").text(`${name} — ${state}`).classed("active", true);
    d3.select("#placeholder").style("display", "none");
    d3.select("#panel-content").style("display", "block");
    renderTabelaCruzada(id);
    renderBarChart(id);
  }

  // ============================================================
  // SECTION 8: TABELA CRUZADA
  // ============================================================

  function renderTabelaCruzada(id) {
    const container = d3.select("#tabela-content");
    container.html("");

    const rows = dataMap.get(id) || [];
    if (rows.length === 0) {
      container.append("p").attr("class", "no-data").text("Sem dados RAIS para este município.");
      return;
    }

    // Monta lookup: grupo → nat → n
    const lookup = {};
    GRUPOS.forEach(g => {
      lookup[g.key] = {};
      NATS.forEach(nat => { lookup[g.key][nat] = 0; });
    });
    rows.forEach(r => {
      if (lookup[r.grupo_saude] && NATS.includes(r.natureza_juridica_)) {
        lookup[r.grupo_saude][r.natureza_juridica_] += r.n;
      }
    });

    // Totais por coluna (natureza)
    const totaisNat = {};
    NATS.forEach(nat => {
      totaisNat[nat] = d3.sum(GRUPOS, g => lookup[g.key][nat]);
    });
    const totalGeral = d3.sum(NATS, nat => totaisNat[nat]);

    const wrap  = container.append("div").attr("class", "data-table-wrap");
    const table = wrap.append("table").attr("class", "data-table");

    // Cabeçalho
    const thead = table.append("thead").append("tr");
    thead.append("th").text("Grupo").style("text-align", "left");
    NATS.forEach(nat => thead.append("th").text(nat));
    thead.append("th").text("Total").attr("class", "col-total");

    // Corpo
    const tbody = table.append("tbody");
    GRUPOS.forEach(g => {
      const rowTotal = d3.sum(NATS, nat => lookup[g.key][nat]);
      const tr = tbody.append("tr");
      tr.append("td").text(g.label).style("text-align", "left");
      NATS.forEach(nat => tr.append("td").text(fmtN(lookup[g.key][nat])));
      tr.append("td").text(fmtN(rowTotal)).attr("class", "col-total");
    });

    // Linha de totais
    const trTot = tbody.append("tr").attr("class", "row-total");
    trTot.append("td").text("Total").style("text-align", "left");
    NATS.forEach(nat => trTot.append("td").text(fmtN(totaisNat[nat])));
    trTot.append("td").text(fmtN(totalGeral)).attr("class", "col-total");
  }

  // ============================================================
  // SECTION 9: GRÁFICO DE BARRAS HORIZONTAIS EMPILHADAS
  // ============================================================

  function renderBarChart(id) {
    const container = d3.select("#chart-content");
    container.html("");

    const rows = dataMap.get(id) || [];
    if (rows.length === 0) {
      container.append("p").attr("class", "no-data").text("Sem dados para este município.");
      return;
    }

    // Prepara dados: por grupo, total por natureza (exclui OcupOutros_SetorOutros do gráfico)
    const GRUPOS_CHART = GRUPOS.filter(g => g.key !== 'OcupOutros_SetorOutros');

    const lookup = {};
    GRUPOS_CHART.forEach(g => {
      lookup[g.key] = {};
      NATS.forEach(nat => { lookup[g.key][nat] = 0; });
    });
    rows.forEach(r => {
      if (lookup[r.grupo_saude] && NATS.includes(r.natureza_juridica_)) {
        lookup[r.grupo_saude][r.natureza_juridica_] += r.n;
      }
    });

    const chartData = GRUPOS_CHART.map(g => {
      const obj = { grupo: g.key, label: g.label };
      NATS.forEach(nat => { obj[nat] = lookup[g.key][nat]; });
      obj.total = d3.sum(NATS, nat => obj[nat]);
      return obj;
    });

    const margin = { top: 10, right: 14, bottom: 28, left: 180 };
    const W = 500, H = 160;
    const iW = W - margin.left - margin.right;
    const iH = H - margin.top  - margin.bottom;

    const series  = d3.stack().keys(NATS)(chartData);
    const maxVal  = d3.max(chartData, d => d.total);

    const xScale = d3.scaleLinear().domain([0, maxVal * 1.05]).range([0, iW]);
    const yScale = d3.scaleBand().domain(GRUPOS_CHART.map(g => g.label)).range([0, iH]).padding(0.2);

    const wrap = container.append("div").attr("class", "chart-wrap");
    const svg  = wrap.append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("preserveAspectRatio", "xMidYMid meet");
    const g    = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // Gridlines
    g.append("g").selectAll("line")
      .data(xScale.ticks(4)).enter().append("line").attr("class", "gridline")
      .attr("x1", d => xScale(d)).attr("x2", d => xScale(d))
      .attr("y1", 0).attr("y2", iH);

    // Barras
    g.selectAll(".series")
      .data(series).enter().append("g")
      .attr("fill", s => NAT_COLORS[s.key])
      .selectAll("rect").data(s => s).enter().append("rect")
      .attr("y",      d => yScale(GRUPOS.find(gg => gg.key === d.data.grupo).label))
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

    // Legenda
    const leg = wrap.append("div").attr("class", "chart-legend");
    NATS.forEach(nat => {
      const span = leg.append("span");
      span.append("span").attr("class", "swatch").style("background", NAT_COLORS[nat]);
      span.append("span").text(nat);
    });
  }

}).catch(err => {
  console.error("Erro ao carregar dados:", err);
  document.getElementById('loading-msg').textContent = `Erro: ${err.message}`;
});
