// -------------------------------
// Config
// -------------------------------
const WORLD_ATLAS_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// Open Access ExchangeRate-API (sin key)
const RATES_URL = "https://open.er-api.com/v6/latest/USD";

// Sudamérica (incluye Guayana Francesa como territorio; moneda EUR)
const SOUTH_AMERICA = [
  { name: "Argentina", iso2: "AR", currency: "ARS" },
  { name: "Bolivia", iso2: "BO", currency: "BOB" },
  { name: "Brazil", iso2: "BR", currency: "BRL" },
  { name: "Chile", iso2: "CL", currency: "CLP" },
  { name: "Colombia", iso2: "CO", currency: "COP" },
  { name: "Ecuador", iso2: "EC", currency: "USD" },
  { name: "Guyana", iso2: "GY", currency: "GYD" },
  { name: "Paraguay", iso2: "PY", currency: "PYG" },
  { name: "Peru", iso2: "PE", currency: "PEN" },
  { name: "Suriname", iso2: "SR", currency: "SRD" },
  { name: "Uruguay", iso2: "UY", currency: "UYU" },
  { name: "Venezuela", iso2: "VE", currency: "VES" },
  // Territorio (si aparece en el topojson como French Guiana)
  { name: "French Guiana", iso2: "GF", currency: "EUR" },
];

const NAME_TO_INFO = new Map(SOUTH_AMERICA.map((c) => [c.name, c]));

// -------------------------------
// DOM
// -------------------------------
const svg = d3.select("#mapSvg");
const utcClock = document.getElementById("utcClock");

const countryFlag = document.getElementById("countryFlag");
const countryName = document.getElementById("countryName");
const countryMeta = document.getElementById("countryMeta");

const rateValue = document.getElementById("rateValue");
const rateSub = document.getElementById("rateSub");
const lastUpdate = document.getElementById("lastUpdate");
const nextUpdate = document.getElementById("nextUpdate");

// -------------------------------
// UTC clock
// -------------------------------
function tickUTC() {
  const now = new Date();
  // Ej: Mon, 12 Jan 2026 20:14:05 GMT
  utcClock.textContent = now.toUTCString();
}
tickUTC();
setInterval(tickUTC, 1000);

// -------------------------------
// Rates cache
// -------------------------------
let ratesPayload = null;

async function loadRates() {
  const resp = await fetch(RATES_URL, { cache: "no-store" });
  if (!resp.ok) throw new Error("No se pudieron cargar las cotizaciones.");
  ratesPayload = await resp.json();
}

function getRateFor(currencyCode) {
  if (!ratesPayload || !ratesPayload.rates) return null;
  if (currencyCode === "USD") return 1;
  return ratesPayload.rates[currencyCode] ?? null;
}

function formatMoney(num) {
  // Formato sobrio: separadores y hasta 4 decimales si hace falta
  const abs = Math.abs(num);
  const decimals = abs >= 100 ? 2 : abs >= 1 ? 4 : 6;
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  }).format(num);
}

function setPanelEmpty(msg = "Seleccioná un país") {
  countryName.textContent = msg;
  countryMeta.textContent = "—";
  rateValue.textContent = "—";
  rateSub.textContent = "—";
  lastUpdate.textContent = "—";
  nextUpdate.textContent = "—";
  countryFlag.src = "";
  countryFlag.alt = "";
}

function setPanelForCountry(featureName) {
  const info = NAME_TO_INFO.get(featureName);
  if (!info) {
    setPanelEmpty("País no disponible");
    return;
  }

  const rate = getRateFor(info.currency);

  countryName.textContent =
    featureName === "Brazil" ? "Brasil" :
    featureName === "Peru" ? "Perú" :
    featureName === "French Guiana" ? "Guayana Francesa" :
    featureName;

  countryMeta.textContent = `Moneda: ${info.currency} · Base: USD`;

  // Bandera (FlagCDN)
  countryFlag.src = `https://flagcdn.com/w40/${info.iso2.toLowerCase()}.png`;
  countryFlag.alt = `Bandera de ${countryName.textContent}`;

  if (!ratesPayload || ratesPayload.result !== "success") {
    rateValue.textContent = "—";
    rateSub.textContent = "No hay datos de cotización.";
    return;
  }

  // Título del usuario: “precio del dólar respecto a la moneda local”
  // => mostramos 1 USD = X MONEDA
  if (rate === null) {
    rateValue.textContent = "No disponible";
    rateSub.textContent = "La moneda no aparece en la fuente actual.";
  } else {
    rateValue.textContent = `${formatMoney(rate)} ${info.currency}`;
    rateSub.textContent = `1 USD = ${formatMoney(rate)} ${info.currency}`;
  }

  lastUpdate.textContent = ratesPayload.time_last_update_utc ?? "—";
  nextUpdate.textContent = ratesPayload.time_next_update_utc ?? "—";
}

// -------------------------------
// Map rendering
// -------------------------------
let activeCountryPath = null;

function renderMap(countriesGeoJson) {
  // Limpieza
  svg.selectAll("*").remove();

  const wrap = document.querySelector(".mapCard");
  const width = wrap.clientWidth;
  const height = wrap.clientHeight;

  svg.attr("viewBox", `0 0 ${width} ${height}`);

  const projection = d3.geoMercator();
  projection.fitSize([width, height], countriesGeoJson);

  const path = d3.geoPath(projection);

  const g = svg.append("g");

  // Fondo “sutil” (no obligatorio, pero da legibilidad)
  g.append("rect")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", width)
    .attr("height", height)
    .attr("fill", "transparent");

  const paths = g
    .selectAll("path")
    .data(countriesGeoJson.features)
    .enter()
    .append("path")
    .attr("d", path)
    .attr("fill", "var(--country)")
    .attr("stroke", "var(--stroke)")
    .attr("stroke-width", 1)
    .style("cursor", "pointer")
    .on("mouseenter", function () {
      if (this !== activeCountryPath) {
        d3.select(this).attr("fill", "var(--countryHover)");
      }
    })
    .on("mouseleave", function () {
      if (this !== activeCountryPath) {
        d3.select(this).attr("fill", "var(--country)");
      }
    })
    .on("click", function (event, d) {
      // Desactivar anterior
      if (activeCountryPath) d3.select(activeCountryPath).attr("fill", "var(--country)");
      activeCountryPath = this;
      d3.select(this).attr("fill", "var(--countryActive)");

      setPanelForCountry(d.properties.name);
    });

  // Mejor toque en móvil: aumenta el área clickeable sin arruinar estética
  paths.attr("pointer-events", "all");
}

async function init() {
  setPanelEmpty("Cargando…");

  // 1) Rates
  try {
    await loadRates();
  } catch (e) {
    // Igual dejamos el mapa usable; el panel avisará sin romper la UI
    ratesPayload = null;
  }

  // 2) Map (TopoJSON -> GeoJSON)
  const topoResp = await fetch(WORLD_ATLAS_URL);
  if (!topoResp.ok) throw new Error("No se pudo cargar el mapa base.");
  const topo = await topoResp.json();

  const allCountries = topojson.feature(topo, topo.objects.countries);

  // Filtrar a Sudamérica por nombre
  const wantedNames = new Set(SOUTH_AMERICA.map((c) => c.name));
  const saFeatures = allCountries.features.filter((f) =>
    wantedNames.has(f.properties.name)
  );

  // Si por alguna razón faltan nombres, al menos no rompemos
  const saGeo = { type: "FeatureCollection", features: saFeatures };

  // Render inicial
  renderMap(saGeo);

  // Panel inicial listo
  setPanelEmpty("Seleccioná un país");

  // Re-render al cambiar tamaño (mobile rotate / resize)
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => renderMap(saGeo), 120);
  });
}

init().catch(() => {
  setPanelEmpty("Error al iniciar la página");
});
