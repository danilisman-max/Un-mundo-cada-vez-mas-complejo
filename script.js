// ====== Config ======

// API sin key (open access). Docs: ExchangeRate-API Open Access
// Endpoint típico: https://open.er-api.com/v6/latest/USD
const RATES_URL = "https://open.er-api.com/v6/latest/USD";

// Países (Sudamérica) + moneda local (ISO 4217)
const SOUTH_AMERICA = [
  { name: "Argentina", currency: "ARS" },
  { name: "Bolivia", currency: "BOB" },
  { name: "Brazil", currency: "BRL" },
  { name: "Chile", currency: "CLP" },
  { name: "Colombia", currency: "COP" },
  { name: "Ecuador", currency: "USD" },
  { name: "Guyana", currency: "GYD" },
  { name: "Paraguay", currency: "PYG" },
  { name: "Peru", currency: "PEN" },
  { name: "Suriname", currency: "SRD" },
  { name: "Uruguay", currency: "UYU" },
  { name: "Venezuela", currency: "VES" },
];

// Nombres tal como vienen en el dataset (Natural Earth / world-atlas)
const NAME_TO_CURRENCY = new Map(SOUTH_AMERICA.map(x => [x.name, x.currency]));

// UI
const elCountry = document.getElementById("countryName");
const elCurrency = document.getElementById("currencyCode");
const elRate = document.getElementById("usdRate");
const elLastUpdate = document.getElementById("lastUpdate");
const elRateNote = document.getElementById("rateNote");

const elUtcTime = document.getElementById("utcTime");
const elUtcDate = document.getElementById("utcDate");

// Estado
let rates = null;
let lastUpdateUtc = null;

// ====== UTC Clock ======
function tickUTC() {
  const now = new Date();
  // ISO: YYYY-MM-DDTHH:mm:ss.sssZ
  const iso = now.toISOString();
  const date = iso.slice(0, 10);
  const time = iso.slice(11, 19);
  elUtcDate.textContent = date;
  elUtcTime.textContent = time;
}
tickUTC();
setInterval(tickUTC, 1000);

// ====== Fetch rates ======
async function fetchRates() {
  try {
    const res = await fetch(RATES_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Formato esperado: { result, time_last_update_utc, rates: {...} }
    rates = data.rates || null;
    lastUpdateUtc = data.time_last_update_utc || null;

    elLastUpdate.textContent = lastUpdateUtc ? lastUpdateUtc : "—";
    elRateNote.textContent = "Tocá un país para ver 1 USD en su moneda.";
  } catch (err) {
    console.error(err);
    elLastUpdate.textContent = "Error al cargar cotizaciones";
    elRateNote.textContent = "Revisá conexión o CORS de la API.";
  }
}
fetchRates();
// Refrescá cada 10 min (sin castigar la API)
setInterval(fetchRates, 10 * 60 * 1000);

// ====== Map (D3 + TopoJSON) ======
const svg = d3.select("#map");
const width = 900;
const height = 520;

svg.attr("viewBox", `0 0 ${width} ${height}`);

const g = svg.append("g");

// Proyección: ajusta Sudamérica a la pantalla
const projection = d3.geoMercator()
  .center([-60, -15])
  .scale(420)
  .translate([width / 2, height / 2 + 10]);

const path = d3.geoPath(projection);

let selected = null;

function formatRate(value) {
  if (value == null || Number.isNaN(value)) return "—";
  // máximo 4 decimales, pero si es muy grande (ej CLP/COP) se ve mejor con 2
  const digits = value >= 100 ? 2 : 4;
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: digits }).format(value);
}

function showCountry(name) {
  const currency = NAME_TO_CURRENCY.get(name);
  elCountry.textContent = name || "—";
  elCurrency.textContent = currency || "—";

  if (!currency) {
    elRate.textContent = "—";
    elRateNote.textContent = "Este país no está en la lista de Sudamérica configurada.";
    return;
  }

  if (!rates) {
    elRate.textContent = "—";
    elRateNote.textContent = "Todavía no cargaron las cotizaciones.";
    return;
  }

  const value = rates[currency];
  // 1 USD = value * currency
  elRate.textContent = value != null ? `1 USD = ${formatRate(value)} ${currency}` : "—";
  elRateNote.textContent = "Cotización de referencia (no necesariamente el precio bancario de venta).";
}

function selectPath(d, node) {
  if (selected) selected.classed("selected", false);
  selected = d3.select(node).classed("selected", true);
  showCountry(d.properties.name);
}

async function drawMap() {
  // Dataset mundo (TopoJSON) desde CDN
  const world = await d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json");
  const countries = topojson.feature(world, world.objects.countries);

  // Filtrar solo países de Sudamérica que nos interesan (por nombre)
  const features = countries.features.filter(f => NAME_TO_CURRENCY.has(f.properties.name));

  // Dibujar
  g.selectAll("path")
    .data(features)
    .join("path")
    .attr("class", "country")
    .attr("d", path)
    .on("click", function(event, d) { selectPath(d, this); })
    .append("title")
    .text(d => d.properties.name);

  // Si querés que arranque con Argentina seleccionada:
  const defaultName = "Argentina";
  const defaultFeature = features.find(f => f.properties.name === defaultName);
  if (defaultFeature) {
    // Buscar su path y seleccionarlo
    const nodes = g.selectAll("path").nodes();
    const idx = features.findIndex(f => f.properties.name === defaultName);
    if (idx >= 0) selectPath(defaultFeature, nodes[idx]);
  }
}

drawMap().catch(err => {
  console.error(err);
  elRateNote.textContent = "Error cargando el mapa (CDN).";
});
