const state = {
  data: null,
  tab: "all",
  table: "campaign",
  charts: {}
};

const TARGETS = {
  meta: { spend: 150000, leads: 42800, cpl: 3.5 },
  google: { spend: 160000, leads: 35550, cpl: 4.5 }
};

const fmtCurrency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtNumber = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const fmtPercent = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtDate = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", year: "numeric" });
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function inRange(row, start, end) {
  return row.date >= start && row.date <= end;
}

function addDays(date, amount) {
  const next = new Date(`${date}T00:00:00`);
  next.setDate(next.getDate() + amount);
  return next.toISOString().slice(0, 10);
}

function daysBetween(start, end) {
  return Math.max(1, Math.round((new Date(`${end}T00:00:00`) - new Date(`${start}T00:00:00`)) / 86400000) + 1);
}

function formatDay(date) {
  return fmtDate.format(new Date(`${date}T00:00:00`)).replace(".", "");
}

function aggregate(rows) {
  return rows.reduce(
    (acc, row) => {
      acc.spend += row.spend || 0;
      acc.impressions += row.impressions || 0;
      acc.clicks += row.clicks || 0;
      acc.pageViews += row.pageViews || 0;
      acc.leads += row.leads || 0;
      return acc;
    },
    { spend: 0, impressions: 0, clicks: 0, pageViews: 0, leads: 0 }
  );
}

function addRates(item) {
  return {
    ...item,
    cpm: item.impressions ? (item.spend / item.impressions) * 1000 : 0,
    ctr: item.impressions ? item.clicks / item.impressions : 0,
    cpc: item.clicks ? item.spend / item.clicks : 0,
    cpv: item.pageViews ? item.spend / item.pageViews : 0,
    cpl: item.leads ? item.spend / item.leads : 0,
    connectRate: item.clicks ? item.pageViews / item.clicks : 0,
    lpConversion: item.pageViews ? item.leads / item.pageViews : 0,
    conversionRate: item.clicks ? item.leads / item.clicks : 0,
    qualificationRate: item.totalLeads ? item.leads / item.totalLeads : 0
  };
}

function getRows(tab, start, end) {
  return state.data.rows.filter((row) => (tab === "all" || row.source === tab) && inRange(row, start, end));
}

function getLeads(tab, start, end) {
  return state.data.leads.filter((lead) => {
    const sourceOk = tab === "all" ? Boolean(lead.source) : lead.source === tab;
    return sourceOk && inRange(lead, start, end);
  });
}

function getTotalLeads(tab, start, end) {
  return state.data.leads.filter((lead) => {
    const sourceOk = tab === "all" ? true : lead.source === tab;
    return sourceOk && inRange(lead, start, end);
  }).length;
}

function summarize(tab, start, end) {
  const rows = getRows(tab, start, end);
  const leads = getLeads(tab, start, end);
  return addRates({ ...aggregate(rows), trafficLeads: leads.length, totalLeads: getTotalLeads(tab, start, end) });
}

function delta(current, previous, lowerIsBetter = false) {
  if (!previous) return { text: "sem base anterior", className: "" };
  const change = (current - previous) / Math.abs(previous);
  const positive = lowerIsBetter ? change < 0 : change > 0;
  return {
    value: change,
    text: `${change >= 0 ? "+" : ""}${fmtPercent.format(change)} vs periodo anterior`,
    short: `${change >= 0 ? "▲" : "▼"} ${fmtPercent.format(Math.abs(change))}`,
    className: positive ? "good" : "bad"
  };
}

function periodContext(tab = state.tab) {
  const start = $("#startDate").value;
  const end = $("#endDate").value;
  const span = daysBetween(start, end);
  const previousEnd = addDays(start, -1);
  const previousStart = addDays(previousEnd, -(span - 1));
  return {
    start,
    end,
    previousStart,
    previousEnd,
    current: summarize(tab, start, end),
    previous: summarize(tab, previousStart, previousEnd)
  };
}

function renderKpis() {
  const { current, previous } = periodContext();
  const cards = [
    ["Investimento", fmtCurrency.format(current.spend), delta(current.spend, previous.spend, false)],
    ["Leads trafego", fmtNumber.format(current.trafficLeads), delta(current.trafficLeads, previous.trafficLeads, false)],
    ["Custo por lead trafego", current.cpl ? fmtCurrency.format(current.cpl) : "R$ 0,00", delta(current.cpl, previous.cpl, true)],
    ["Leads totais", fmtNumber.format(current.totalLeads), delta(current.totalLeads, previous.totalLeads, false)]
  ];

  $("#kpis").innerHTML = cards
    .map(([label, value, info]) => `
      <article class="kpi">
        <span>${label}</span>
        <strong>${value}</strong>
        <div class="delta ${info.className}">${info.text}</div>
      </article>
    `)
    .join("");
}

function metricDelta(metric, lowerIsBetter = false) {
  const { current, previous } = periodContext("all");
  return delta(current[metric], previous[metric], lowerIsBetter);
}

function renderMetricRail() {
  const { current } = periodContext("all");
  const metrics = [
    {
      mainLabel: "Impressoes",
      mainValue: fmtNumber.format(current.impressions),
      sideLabel: "CPM",
      sideValue: fmtCurrency.format(current.cpm),
      subLabel: "CTR",
      subValue: fmtPercent.format(current.ctr),
      change: metricDelta("ctr")
    },
    {
      mainLabel: "Link Clicks",
      mainValue: fmtNumber.format(current.clicks),
      sideLabel: "CPC",
      sideValue: fmtCurrency.format(current.cpc),
      subLabel: "CR (clique -> LP)",
      subValue: fmtPercent.format(current.connectRate),
      change: metricDelta("connectRate")
    },
    {
      mainLabel: "Page Views",
      mainValue: fmtNumber.format(current.pageViews),
      sideLabel: "CPV",
      sideValue: fmtCurrency.format(current.cpv),
      subLabel: "Conversao LP",
      subValue: fmtPercent.format(current.lpConversion),
      change: metricDelta("lpConversion")
    },
    {
      mainLabel: "Leads",
      mainValue: fmtNumber.format(current.leads),
      sideLabel: "CPL",
      sideValue: fmtCurrency.format(current.cpl),
      subLabel: "Taxa de qualificacao",
      subValue: fmtPercent.format(current.qualificationRate),
      change: metricDelta("qualificationRate")
    }
  ];

  $("#metricRail").innerHTML = metrics
    .map((item) => `
      <article class="metricSplit">
        <div class="metricMain">
          <span>${item.mainLabel}</span>
          <strong>${item.mainValue}</strong>
        </div>
        <div class="metricSide">
          <span>${item.sideLabel}</span>
          <strong>${item.sideValue}</strong>
          <small>${item.subLabel}: ${item.subValue} <b class="${item.change.className}">${item.change.short}</b></small>
        </div>
      </article>
    `)
    .join("");
}

function dailySeries(tab = state.tab) {
  const start = $("#startDate").value;
  const end = $("#endDate").value;
  const rows = getRows(tab, start, end);
  const map = new Map();
  rows.forEach((row) => {
    if (!map.has(row.date)) map.set(row.date, []);
    map.get(row.date).push(row);
  });
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayRows]) => addRates({ date, ...aggregate(dayRows) }));
}

function chartColor(index) {
  return ["#3b8edb", "#ffd166", "#6ee7b7", "#f472b6"][index % 4];
}

function chartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: { legend: { position: "bottom", labels: { color: "#dbe4ff" } } },
    scales: {
      x: { ticks: { color: "#9aa5c2" }, grid: { color: "rgba(255,255,255,.08)" } },
      money: { beginAtZero: true, ticks: { color: "#9aa5c2", callback: (value) => fmtCurrency.format(value) }, grid: { color: "rgba(255,255,255,.08)" } },
      count: { beginAtZero: true, position: "right", ticks: { color: "#9aa5c2" }, grid: { drawOnChartArea: false } }
    }
  };
}

function renderLineChart(canvasId, tab, chartKey) {
  const series = dailySeries(tab);
  const labels = series.map((item) => formatDay(item.date));
  state.charts[chartKey]?.destroy();
  state.charts[chartKey] = new Chart($(`#${canvasId}`), {
    type: "bar",
    data: {
      labels,
      datasets: [
        { type: "bar", label: "Investimento", data: series.map((item) => item.spend), backgroundColor: chartColor(0), yAxisID: "money" },
        { type: "line", label: "Leads", data: series.map((item) => item.leads), borderColor: chartColor(1), backgroundColor: chartColor(1), tension: 0.28, yAxisID: "count" }
      ]
    },
    options: chartOptions()
  });
}

function renderCplChart(canvasId, tab, chartKey) {
  const series = dailySeries(tab);
  const labels = series.map((item) => formatDay(item.date));
  state.charts[chartKey]?.destroy();
  state.charts[chartKey] = new Chart($(`#${canvasId}`), {
    data: {
      labels,
      datasets: [
        { type: "bar", label: "Investimento", data: series.map((item) => item.spend), backgroundColor: chartColor(0), yAxisID: "money" },
        { type: "line", label: "CPL", data: series.map((item) => item.cpl), borderColor: chartColor(2), backgroundColor: chartColor(2), tension: 0.28, yAxisID: "count" }
      ]
    },
    options: chartOptions()
  });
}

function groupBy(rows, field) {
  const groups = new Map();
  rows.forEach((row) => {
    const key = row[field] || "Sem nome";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  return [...groups.entries()]
    .map(([name, groupRows]) => addRates({ name, ...aggregate(groupRows) }))
    .sort((a, b) => (a.cpl || Number.MAX_SAFE_INTEGER) - (b.cpl || Number.MAX_SAFE_INTEGER));
}

function heat(value, max, kind = "normal") {
  if (!max) return "";
  const p = Math.min(1, Math.max(0, value / max));
  if (kind === "green") return `style="background-color: rgba(74, 222, 128, ${0.12 + p * 0.28})"`;
  if (kind === "money") return `style="background-color: rgba(226, 232, 240, ${0.18 + p * 0.44})"`;
  return `style="background-color: rgba(125, 140, 190, ${0.18 + p * 0.38})"`;
}

function renderDailyTable(tab = "all", targetId = "dailyTableBody", compact = false) {
  const rows = dailySeries(tab).sort((a, b) => b.date.localeCompare(a.date));
  const totals = addRates({ ...aggregate(rows) });
  const max = {
    spend: Math.max(...rows.map((row) => row.spend), 0),
    leads: Math.max(...rows.map((row) => row.leads), 0),
    cpl: Math.max(...rows.map((row) => row.cpl), 0),
    cpm: Math.max(...rows.map((row) => row.cpm), 0),
    cpc: Math.max(...rows.map((row) => row.cpc), 0),
    ctr: Math.max(...rows.map((row) => row.ctr), 0)
  };
  const extra = compact ? "" : "";
  $(`#${targetId}`).innerHTML = rows.length
    ? `${rows.map((row) => `
      <tr>
        <td>${formatDay(row.date)}</td>
        <td ${heat(row.spend, max.spend, "money")}>${fmtCurrency.format(row.spend)}</td>
        <td ${heat(row.leads, max.leads)}>${fmtNumber.format(row.leads)}</td>
        <td ${heat(row.cpl, max.cpl)}>${fmtCurrency.format(row.cpl)}</td>
        <td ${heat(row.cpm, max.cpm)}>${fmtCurrency.format(row.cpm)}</td>
        <td ${heat(row.cpc, max.cpc, "money")}>${fmtCurrency.format(row.cpc)}</td>
        <td ${heat(row.ctr, max.ctr, "green")}>${fmtPercent.format(row.ctr)}</td>
        ${extra}
      </tr>
    `).join("")}
    <tr class="totalRow">
      <td>Total geral</td>
      <td>${fmtCurrency.format(totals.spend)}</td>
      <td>${fmtNumber.format(totals.leads)}</td>
      <td>${fmtCurrency.format(totals.cpl)}</td>
      <td>${fmtCurrency.format(totals.cpm)}</td>
      <td>${fmtCurrency.format(totals.cpc)}</td>
      <td>${fmtPercent.format(totals.ctr)}</td>
    </tr>`
    : `<tr><td class="empty" colspan="7">Nenhum dado encontrado para o periodo selecionado.</td></tr>`;
}

function platformCard(label, value, target, percent, good) {
  const clamped = Math.max(0, Math.min(100, percent));
  return `
    <article class="goalCard">
      <span>${label}</span>
      <strong>${value}</strong>
      <small class="${good ? "good" : "bad"}">${fmtPercent.format(percent / 100)}</small>
      <div class="progress"><i style="width:${clamped}%"></i></div>
      <b>Meta: ${target}</b>
    </article>
  `;
}

function renderPlatformResults() {
  const blocks = ["meta", "google"].map((tab) => {
    const label = tab === "meta" ? "Meta Ads" : "Google Ads";
    const title = `Resultado ${label}`;
    const target = TARGETS[tab];
    const { current } = periodContext(tab);
    const spendPct = target.spend ? (current.spend / target.spend) * 100 : 0;
    const leadsPct = target.leads ? (current.leads / target.leads) * 100 : 0;
    const cplPct = target.cpl && current.cpl ? ((current.cpl - target.cpl) / target.cpl) * 100 : 0;
    const canvasA = `${tab}ResultChart`;
    const canvasB = `${tab}ResultCplChart`;
    const tableId = `${tab}ResultTable`;
    return `
      <section class="platformBlock">
        <h2>${title}</h2>
        <div class="resultGrid">
          <div class="goalGrid">
            ${platformCard(tab === "meta" ? "Investimento c/ Imposto" : "Investimento", fmtCurrency.format(current.spend), fmtCurrency.format(target.spend), spendPct, spendPct >= 100)}
            ${platformCard("Leads Captados", fmtNumber.format(current.leads), fmtNumber.format(target.leads), leadsPct, leadsPct >= 100)}
            ${platformCard("Custo por Lead", fmtCurrency.format(current.cpl), fmtCurrency.format(target.cpl), Math.abs(cplPct), cplPct <= 0)}
          </div>
          <div class="panel darkPanel">
            <canvas id="${canvasA}" height="250"></canvas>
          </div>
        </div>
        <div class="panel tablePanel darkTablePanel">
          <div class="tableWrap">
            <table class="dailyTable">
              <thead>
                <tr>
                  <th>Dia</th>
                  <th>${tab === "meta" ? "Investimento c/ Imp." : "Investimento"}</th>
                  <th>Leads</th>
                  <th>CPL</th>
                  <th>CPM</th>
                  <th>CPC</th>
                  <th>CTR</th>
                </tr>
              </thead>
              <tbody id="${tableId}"></tbody>
            </table>
          </div>
        </div>
      </section>
    `;
  }).join("");

  $("#platformResults").innerHTML = blocks;
  ["meta", "google"].forEach((tab) => {
    renderLineChart(`${tab}ResultChart`, tab, `${tab}ResultChart`);
    renderDailyTable(tab, `${tab}ResultTable`, true);
  });
}

function renderOptimizationTable() {
  const labels = { campaign: "campanha", adset: "conjunto", ad: "anuncio" };
  const start = $("#startDate").value;
  const end = $("#endDate").value;
  const rows = groupBy(getRows(state.tab, start, end), state.table);
  $("#tableTitle").textContent = `Otimizacao por ${labels[state.table]}`;
  $("#tableBody").innerHTML = rows.length
    ? rows.map((row) => `
      <tr>
        <td>${row.name}</td>
        <td>${fmtCurrency.format(row.spend)}</td>
        <td>${fmtNumber.format(row.impressions)}</td>
        <td>${fmtNumber.format(row.clicks)}</td>
        <td>${fmtNumber.format(row.leads)}</td>
        <td>${fmtCurrency.format(row.cpm)}</td>
        <td>${fmtPercent.format(row.ctr)}</td>
        <td>${fmtCurrency.format(row.cpc)}</td>
        <td>${row.cpl ? fmtCurrency.format(row.cpl) : "R$ 0,00"}</td>
        <td>${fmtPercent.format(row.conversionRate)}</td>
      </tr>
    `).join("")
    : `<tr><td class="empty" colspan="10">Nenhum dado encontrado para o periodo selecionado.</td></tr>`;
}

function renderGeneral() {
  $("#generalView").hidden = false;
  $("#platformView").hidden = true;
  renderLineChart("dailyChart", "all", "daily");
  renderCplChart("cplChart", "all", "cpl");
  renderMetricRail();
  renderDailyTable("all");
  renderPlatformResults();
}

function renderPlatform() {
  $("#generalView").hidden = true;
  $("#platformView").hidden = false;
  renderLineChart("platformDailyChart", state.tab, "platformDaily");
  renderCplChart("platformCplChart", state.tab, "platformCpl");
  renderOptimizationTable();
}

function render() {
  renderKpis();
  if (state.tab === "all") renderGeneral();
  else renderPlatform();
}

function setRange(days) {
  const { min, max } = state.data.dateRange;
  $("#endDate").value = max;
  $("#startDate").value = days === "all" ? min : addDays(max, -(Number(days) - 1));
  render();
}

function bindEvents() {
  $("#startDate").addEventListener("change", render);
  $("#endDate").addEventListener("change", render);
  $("#refreshButton").addEventListener("click", () => load(true));

  $$(".quick button").forEach((button) => {
    button.addEventListener("click", () => setRange(button.dataset.range));
  });

  $$(".tabs button").forEach((button) => {
    button.addEventListener("click", () => {
      $$(".tabs button").forEach((item) => item.classList.toggle("active", item === button));
      state.tab = button.dataset.tab;
      render();
    });
  });

  $$(".tableNav button").forEach((button) => {
    button.addEventListener("click", () => {
      $$(".tableNav button").forEach((item) => item.classList.toggle("active", item === button));
      state.table = button.dataset.table;
      renderOptimizationTable();
    });
  });
}

async function load(force = false) {
  const response = await fetch(`./data.json?v=${force ? Date.now() : "initial"}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Nao foi possivel carregar data.json");
  state.data = await response.json();
  $("#updatedAt").textContent = `Atualizado em ${new Date(state.data.generatedAt).toLocaleString("pt-BR")}`;
  if (!$("#startDate").value || !$("#endDate").value) setRange(30);
  render();
}

bindEvents();
load().catch((error) => {
  $("#updatedAt").textContent = error.message;
});
