const state = {
  data: null,
  tab: "all",
  table: "campaign",
  charts: {}
};

const fmtCurrency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtNumber = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const fmtPercent = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDecimal = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
    cpl: item.leads ? item.spend / item.leads : 0,
    conversionRate: item.clicks ? item.leads / item.clicks : 0
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
    text: `${change >= 0 ? "+" : ""}${fmtPercent.format(change)} vs período anterior`,
    className: positive ? "good" : "bad"
  };
}

function renderKpis() {
  const start = $("#startDate").value;
  const end = $("#endDate").value;
  const span = daysBetween(start, end);
  const previousEnd = addDays(start, -1);
  const previousStart = addDays(previousEnd, -(span - 1));
  const current = summarize(state.tab, start, end);
  const previous = summarize(state.tab, previousStart, previousEnd);

  const cards = [
    ["Investimento", fmtCurrency.format(current.spend), delta(current.spend, previous.spend, false)],
    ["Leads tráfego", fmtNumber.format(current.trafficLeads), delta(current.trafficLeads, previous.trafficLeads, false)],
    ["Custo por lead tráfego", current.cpl ? fmtCurrency.format(current.cpl) : "R$ 0,00", delta(current.cpl, previous.cpl, true)],
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

function dailySeries() {
  const start = $("#startDate").value;
  const end = $("#endDate").value;
  const rows = getRows(state.tab, start, end);
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
  return ["#0f766e", "#2563eb", "#b45309", "#15803d"][index % 4];
}

function renderCharts() {
  const series = dailySeries();
  const labels = series.map((item) => item.date.split("-").reverse().join("/"));
  const dailyCtx = $("#dailyChart");
  const efficiencyCtx = $("#efficiencyChart");

  state.charts.daily?.destroy();
  state.charts.efficiency?.destroy();

  state.charts.daily = new Chart(dailyCtx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { type: "bar", label: "Investimento", data: series.map((item) => item.spend), backgroundColor: chartColor(0), yAxisID: "money" },
        { type: "line", label: "Leads", data: series.map((item) => item.leads), borderColor: chartColor(1), backgroundColor: chartColor(1), tension: 0.3, yAxisID: "count" }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { position: "bottom" } },
      scales: {
        money: { beginAtZero: true, ticks: { callback: (value) => fmtCurrency.format(value) } },
        count: { beginAtZero: true, position: "right", grid: { drawOnChartArea: false } }
      }
    }
  });

  const summary = summarize(state.tab, $("#startDate").value, $("#endDate").value);
  state.charts.efficiency = new Chart(efficiencyCtx, {
    type: "bar",
    data: {
      labels: ["CPM", "CTR", "CPC", "CPL", "Conv."],
      datasets: [{
        label: "Métricas",
        data: [summary.cpm, summary.ctr * 100, summary.cpc, summary.cpl, summary.conversionRate * 100],
        backgroundColor: [chartColor(0), chartColor(1), chartColor(2), chartColor(3), "#64748b"]
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

function renderTable() {
  const labels = { campaign: "campanha", adset: "conjunto", ad: "anúncio" };
  const start = $("#startDate").value;
  const end = $("#endDate").value;
  const rows = groupBy(getRows(state.tab, start, end), state.table);
  $("#tableTitle").textContent = `Otimização por ${labels[state.table]}`;
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
    : `<tr><td class="empty" colspan="10">Nenhum dado encontrado para o período selecionado.</td></tr>`;
}

function render() {
  renderKpis();
  renderCharts();
  renderTable();
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
      renderTable();
    });
  });
}

async function load(force = false) {
  const response = await fetch(`./data.json?v=${force ? Date.now() : "initial"}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Não foi possível carregar data.json");
  state.data = await response.json();
  $("#updatedAt").textContent = `Atualizado em ${new Date(state.data.generatedAt).toLocaleString("pt-BR")}`;
  if (!$("#startDate").value || !$("#endDate").value) setRange(30);
  render();
}

bindEvents();
load().catch((error) => {
  $("#updatedAt").textContent = error.message;
});
