const state = {
  data: null,
  tab: "all",
  table: "campaign",
  filters: {
    meta: {},
    google: {}
  },
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

function sameValue(a, b) {
  return String(a || "") === String(b || "");
}

function getFilter(tab = state.tab) {
  return state.filters[tab] || {};
}

function getFilteredRows(tab = state.tab, start = $("#startDate").value, end = $("#endDate").value) {
  const filter = getFilter(tab);
  return getRows(tab, start, end).filter((row) => {
    return (!filter.campaign || sameValue(row.campaign, filter.campaign))
      && (!filter.adset || sameValue(row.adset, filter.adset))
      && (!filter.ad || sameValue(row.ad, filter.ad));
  });
}

function getRowsForMenu(tab = state.tab, field = state.table, start = $("#startDate").value, end = $("#endDate").value) {
  const filter = getFilter(tab);
  return getRows(tab, start, end).filter((row) => {
    if (field === "campaign") return true;
    if (field === "adset") return !filter.campaign || sameValue(row.campaign, filter.campaign);
    if (field === "ad") {
      return (!filter.campaign || sameValue(row.campaign, filter.campaign))
        && (!filter.adset || sameValue(row.adset, filter.adset));
    }
    return true;
  });
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

function getAllLeadsInRange(start = $("#startDate").value, end = $("#endDate").value) {
  return state.data.leads.filter((lead) => inRange(lead, start, end));
}

function getGroupEntriesInRange(start = $("#startDate").value, end = $("#endDate").value) {
  return (state.data.groupEntries || []).filter((entry) => inRange(entry, start, end));
}

function normalizeLabel(value, fallback) {
  const label = String(value || "").trim();
  return label || fallback;
}

function normalizeToken(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function leadHasMedium(lead, medium) {
  return normalizeToken(lead.rawMedium) === normalizeToken(medium);
}

function getTrafficLeads(tab = "all", start = $("#startDate").value, end = $("#endDate").value) {
  return state.data.leads.filter((lead) => {
    const sourceOk = tab === "all" ? true : lead.source === tab;
    return sourceOk && inRange(lead, start, end) && leadHasMedium(lead, "trafego-pago");
  });
}

function getOrganicLeads(start = $("#startDate").value, end = $("#endDate").value) {
  return state.data.leads.filter((lead) => inRange(lead, start, end) && leadHasMedium(lead, "organico"));
}

function groupEntrySummary() {
  const leads = getAllLeadsInRange();
  const entries = getGroupEntriesInRange();
  const entered = entries.reduce((sum, entry) => sum + (entry.entered || 0), 0);
  const left = entries.reduce((sum, entry) => sum + (entry.left || 0), 0);
  const rate = leads.length ? entered / leads.length : 0;
  return { leads: leads.length, entered, left, rate };
}

function summarize(tab, start, end) {
  const rows = getRows(tab, start, end);
  const leads = tab === "all" ? getTrafficLeads(tab, start, end) : getLeads(tab, start, end);
  const summary = addRates({ ...aggregate(rows), trafficLeads: leads.length, totalLeads: getTotalLeads(tab, start, end) });
  summary.leads = leads.length;
  summary.cpl = leads.length ? summary.spend / leads.length : 0;
  return summary;
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
      sideValue: fmtCurrency.format(current.cpl)
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
          ${item.subLabel ? `<small>${item.subLabel}: ${item.subValue} <b class="${item.change.className}">${item.change.short}</b></small>` : ""}
        </div>
      </article>
    `)
    .join("");
}

function dailySeries(tab = state.tab, rowsOverride = null) {
  const rows = rowsOverride || getRows(tab, $("#startDate").value, $("#endDate").value);
  const map = new Map();
  rows.forEach((row) => {
    if (!map.has(row.date)) map.set(row.date, []);
    map.get(row.date).push(row);
  });
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayRows]) => {
      const item = addRates({ date, ...aggregate(dayRows) });
      if (!rowsOverride && tab === "all") {
        const trafficLeads = getTrafficLeads(tab, date, date).length;
        item.leads = trafficLeads;
        item.cpl = trafficLeads ? item.spend / trafficLeads : 0;
      }
      return item;
    });
}

function chartColor(index) {
  return ["#13b8c9", "#f20587", "#ff7a00", "#ffb000", "#8a7f12", "#f8f8ff", "#767c98", "#3b8edb", "#6ee7b7", "#f472b6"][index % 10];
}

const pointValueLabelPlugin = {
  id: "pointValueLabels",
  afterDatasetsDraw(chart, args, options) {
    const { ctx } = chart;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.font = "700 11px Inter, sans-serif";
    ctx.fillStyle = options?.color || "#ffffff";
    chart.data.datasets.forEach((dataset, datasetIndex) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      if (meta.hidden) return;
      meta.data.forEach((point, index) => {
        const value = dataset.data[index];
        if (value === null || value === undefined || value === 0) return;
        const label = options?.formatter ? options.formatter(value) : fmtNumber.format(value);
        ctx.fillText(label, point.x, point.y - 8);
      });
    });
    ctx.restore();
  }
};

const stackedTotalLabelPlugin = {
  id: "stackedTotalLabels",
  afterDatasetsDraw(chart, args, options) {
    const { ctx, data } = chart;
    if (!data.datasets.length) return;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.font = "700 11px Inter, sans-serif";
    ctx.fillStyle = options?.color || "#ffffff";
    data.labels.forEach((label, index) => {
      let total = 0;
      let topY = Number.POSITIVE_INFINITY;
      let x = null;
      data.datasets.forEach((dataset, datasetIndex) => {
        const value = Number(dataset.data[index] || 0);
        if (!value) return;
        const meta = chart.getDatasetMeta(datasetIndex);
        const bar = meta.data[index];
        if (!bar || meta.hidden) return;
        total += value;
        topY = Math.min(topY, bar.y);
        x = bar.x;
      });
      if (total && x !== null) ctx.fillText(fmtNumber.format(total), x, topY - 6);
    });
    ctx.restore();
  }
};

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

function leadChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: "bottom", labels: { color: "#dbe4ff" } } },
    scales: {
      x: { ticks: { color: "#9aa5c2" }, grid: { color: "rgba(255,255,255,.08)" } },
      y: { beginAtZero: true, ticks: { color: "#9aa5c2", precision: 0 }, grid: { color: "rgba(255,255,255,.08)" } }
    }
  };
}

function stackedBarOptions() {
  const options = leadChartOptions();
  options.scales.x.stacked = true;
  options.scales.y.stacked = true;
  return options;
}

function horizontalPercentOptions() {
  return {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: {
        beginAtZero: true,
        max: 1,
        ticks: { color: "#9aa5c2", callback: (value) => fmtPercent.format(value) },
        grid: { color: "rgba(255,255,255,.08)" }
      },
      y: { ticks: { color: "#dbe4ff" }, grid: { color: "rgba(255,255,255,.06)" } }
    }
  };
}

function percentLineOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "top", labels: { color: "#dbe4ff" } },
      pointValueLabels: { color: "#ffd400", formatter: (value) => fmtPercent.format(value) }
    },
    scales: {
      x: { ticks: { color: "#9aa5c2" }, grid: { color: "rgba(255,255,255,.08)" } },
      y: {
        beginAtZero: true,
        ticks: { color: "#9aa5c2", callback: (value) => fmtPercent.format(value) },
        grid: { color: "rgba(255,255,255,.08)" }
      }
    }
  };
}

function renderLineChart(canvasId, tab, chartKey, rowsOverride = null) {
  const series = dailySeries(tab, rowsOverride);
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

function renderCplChart(canvasId, tab, chartKey, rowsOverride = null) {
  const series = dailySeries(tab, rowsOverride);
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

function renderLeadCplChart(canvasId, tab, chartKey, rowsOverride = null) {
  const series = dailySeries(tab, rowsOverride);
  const labels = series.map((item) => formatDay(item.date));
  state.charts[chartKey]?.destroy();
  state.charts[chartKey] = new Chart($(`#${canvasId}`), {
    data: {
      labels,
      datasets: [
        { type: "line", label: "Leads", data: series.map((item) => item.leads), borderColor: chartColor(1), backgroundColor: chartColor(1), tension: 0.28, yAxisID: "count" },
        { type: "line", label: "CPL", data: series.map((item) => item.cpl), borderColor: chartColor(2), backgroundColor: chartColor(2), tension: 0.28, yAxisID: "money" }
      ]
    },
    options: chartOptions()
  });
}

function renderGroupStats() {
  const summary = groupEntrySummary();
  const goal = 0.8;
  $("#groupStats").innerHTML = `
    <article class="groupStatCard">
      <span>Em grupos</span>
      <strong>${fmtNumber.format(summary.entered)}</strong>
      <small>${fmtNumber.format(summary.leads)} leads no periodo</small>
    </article>
    <article class="groupStatCard">
      <span>Tx. Entrada</span>
      <strong>${fmtPercent.format(summary.rate)}</strong>
      <small>Meta: ${fmtPercent.format(goal)}</small>
    </article>
  `;
}

function renderLeadSourceChart() {
  const leads = getAllLeadsInRange();
  const groups = new Map();
  leads.forEach((lead) => {
    const key = normalizeLabel(lead.rawSource, "Sem utm_source");
    groups.set(key, (groups.get(key) || 0) + 1);
  });
  const rows = [...groups.entries()].sort((a, b) => b[1] - a[1]);
  state.charts.leadSource?.destroy();
  state.charts.leadSource = new Chart($("#leadSourceChart"), {
    type: "bar",
    data: {
      labels: rows.map(([name]) => name),
      datasets: [{
        label: "Leads",
        data: rows.map(([, count]) => count),
        backgroundColor: rows.map((_, index) => chartColor(index))
      }]
    },
    options: leadChartOptions()
  });
}

function renderLeadMediumDailyChart() {
  const leads = getAllLeadsInRange();
  const dates = [...new Set(leads.map((lead) => lead.date))].sort();
  const mediumTotals = new Map();
  leads.forEach((lead) => {
    const medium = normalizeLabel(lead.rawMedium, "Sem utm_medium");
    mediumTotals.set(medium, (mediumTotals.get(medium) || 0) + 1);
  });
  const mediums = [...mediumTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7).map(([name]) => name);
  const countFor = (date, medium) => leads.filter((lead) => lead.date === date && normalizeLabel(lead.rawMedium, "Sem utm_medium") === medium).length;

  state.charts.leadMediumDaily?.destroy();
  state.charts.leadMediumDaily = new Chart($("#leadMediumDailyChart"), {
    type: "bar",
    data: {
      labels: dates.map(formatDay),
      datasets: mediums.map((medium, index) => ({
        label: medium,
        data: dates.map((date) => countFor(date, medium)),
        backgroundColor: chartColor(index)
      }))
    },
    options: stackedBarOptions()
  });
}

function renderGroupEntryRateChart() {
  const leads = getAllLeadsInRange();
  const leadDates = [...new Set(leads.map((lead) => lead.date))];
  const groupDates = (state.data.groupEntries || []).map((entry) => entry.date);
  const dates = [...new Set([...leadDates, ...groupDates])].filter(Boolean).sort();
  const entriesByDate = new Map((state.data.groupEntries || []).map((entry) => [entry.date, entry]));
  const leadCount = (date) => leads.filter((lead) => lead.date === date).length;
  const rateFor = (date) => {
    const total = leadCount(date);
    const entered = entriesByDate.get(date)?.entered || 0;
    return total ? entered / total : 0;
  };

  state.charts.groupEntryRate?.destroy();
  state.charts.groupEntryRate = new Chart($("#groupEntryRateChart"), {
    type: "line",
    data: {
      labels: dates.map(formatDay),
      datasets: [{
        label: "% Entrada",
        data: dates.map(rateFor),
        borderColor: "#ffd400",
        backgroundColor: "#ffd400",
        pointRadius: 3,
        pointHoverRadius: 5,
        tension: 0.22
      }]
    },
    options: percentLineOptions(),
    plugins: [pointValueLabelPlugin]
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

function renderDailyTable(tab = "all", targetId = "dailyTableBody", compact = false, rowsOverride = null) {
  const rows = dailySeries(tab, rowsOverride).sort((a, b) => b.date.localeCompare(a.date));
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

function renderPlatformDailyTable() {
  const tab = state.tab;
  const rows = getFilteredRows(tab);
  const series = dailySeries(tab, rows).sort((a, b) => b.date.localeCompare(a.date));
  const isMeta = tab === "meta";
  const columns = isMeta
    ? [
        ["Dia", "date"],
        ["Investimento c/ Imposto", "spend"],
        ["Leads", "leads"],
        ["CPL", "cpl"],
        ["CPM", "cpm"],
        ["CPC", "cpc"],
        ["CTR", "ctr"],
        ["Connect Rate", "connectRate"],
        ["Conversao LP", "lpConversion"]
      ]
    : [
        ["Dia", "date"],
        ["Investimento", "spend"],
        ["Leads", "leads"],
        ["CPL", "cpl"],
        ["CPM", "cpm"],
        ["CTR", "ctr"]
      ];
  const totals = addRates({ ...aggregate(series) });
  const max = Object.fromEntries(columns.map(([, key]) => [key, Math.max(...series.map((row) => row[key] || 0), 0)]));

  $("#platformDailyTitle").textContent = `Visao diaria ${isMeta ? "Meta Ads" : "Google Ads"}`;
  $("#platformDailyHead").innerHTML = `<tr>${columns.map(([label]) => `<th>${label}</th>`).join("")}</tr>`;
  $("#platformDailyBody").innerHTML = series.length
    ? `${series.map((row) => `
      <tr>
        ${columns.map(([, key], index) => `<td ${index && key !== "date" ? heat(row[key], max[key], key === "ctr" || key === "connectRate" || key === "lpConversion" ? "green" : key === "spend" || key === "cpc" ? "money" : "normal") : ""}>${formatMetric(key, row[key], row.date)}</td>`).join("")}
      </tr>
    `).join("")}
    <tr class="totalRow">${columns.map(([, key]) => `<td>${formatMetric(key, totals[key], "Total geral")}</td>`).join("")}</tr>`
    : `<tr><td class="empty" colspan="${columns.length}">Nenhum dado encontrado para os filtros selecionados.</td></tr>`;
}

function formatMetric(key, value, dateValue) {
  if (key === "date") return dateValue === "Total geral" ? dateValue : formatDay(dateValue);
  if (["spend", "cpl", "cpm", "cpc"].includes(key)) return fmtCurrency.format(value || 0);
  if (["ctr", "connectRate", "lpConversion"].includes(key)) return fmtPercent.format(value || 0);
  return fmtNumber.format(value || 0);
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

function countBy(items, keyFn) {
  const groups = new Map();
  items.forEach((item) => {
    const key = keyFn(item);
    groups.set(key, (groups.get(key) || 0) + 1);
  });
  return [...groups.entries()].sort((a, b) => b[1] - a[1]);
}

function dailyStackData(leads, dimensionFn, maxDimensions = 10) {
  const dates = [...new Set(leads.map((lead) => lead.date))].filter(Boolean).sort();
  const totals = countBy(leads, dimensionFn);
  const top = totals.slice(0, maxDimensions).map(([name]) => name);
  const hasOther = totals.length > maxDimensions;
  const dimensions = hasOther ? [...top, "Outros"] : top;
  const dimensionFor = (lead) => {
    const value = dimensionFn(lead);
    return top.includes(value) ? value : "Outros";
  };
  const countFor = (date, dimension) => leads.filter((lead) => lead.date === date && dimensionFor(lead) === dimension).length;

  return {
    dates,
    dimensions,
    datasets: dimensions.map((dimension, index) => ({
      label: dimension,
      data: dates.map((date) => countFor(date, dimension)),
      backgroundColor: chartColor(index),
      stack: "leads"
    }))
  };
}

function renderOrganicCounter() {
  const leads = getOrganicLeads();
  const target = 40000;
  const percent = target ? (leads.length / target) * 100 : 0;
  $("#organicCounter").innerHTML = `
    <article class="goalCard">
      <span>Leads Orgânico</span>
      <strong>${fmtNumber.format(leads.length)}</strong>
      <small class="${percent >= 100 ? "good" : "bad"}">${fmtPercent.format(percent / 100)}</small>
      <div class="progress"><i style="width:${Math.min(100, percent)}%"></i></div>
      <b>Meta: ${fmtNumber.format(target)}</b>
    </article>
  `;
}

function renderOrganicTemporalChart() {
  const leads = getOrganicLeads();
  const dates = [...new Set(leads.map((lead) => lead.date))].sort();
  const countFor = (date) => leads.filter((lead) => lead.date === date).length;
  state.charts.organicTemporal?.destroy();
  state.charts.organicTemporal = new Chart($("#organicTemporalChart"), {
    type: "line",
    data: {
      labels: dates.map(formatDay),
      datasets: [{
        label: "Leads orgânicos",
        data: dates.map(countFor),
        borderColor: "#ffffff",
        backgroundColor: "#ffffff",
        tension: 0.22
      }]
    },
    options: {
      ...leadChartOptions(),
      plugins: {
        legend: { position: "bottom", labels: { color: "#dbe4ff" } },
        pointValueLabels: { color: "#ffffff" }
      }
    },
    plugins: [pointValueLabelPlugin]
  });
}

function renderOrganicSourceChart() {
  const stack = dailyStackData(getOrganicLeads(), (lead) => normalizeLabel(lead.rawSource, "Sem utm_source"));
  state.charts.organicSource?.destroy();
  state.charts.organicSource = new Chart($("#organicSourceChart"), {
    type: "bar",
    data: {
      labels: stack.dates.map(formatDay),
      datasets: stack.datasets
    },
    options: {
      ...stackedBarOptions(),
      plugins: {
        legend: { position: "top", labels: { color: "#dbe4ff" } },
        stackedTotalLabels: { color: "#ffffff" }
      }
    },
    plugins: [stackedTotalLabelPlugin]
  });
}

function renderOrganicTable() {
  const rows = countBy(getOrganicLeads(), (lead) => {
    const source = normalizeLabel(lead.rawSource, "Sem utm_source");
    const term = normalizeLabel(lead.rawTerm, "Sem utm_term");
    return `${source}|||${term}`;
  });
  $("#organicTableBody").innerHTML = rows.length
    ? rows.map(([key, count]) => {
      const [source, term] = key.split("|||");
      return `<tr><td>${source}</td><td>${term}</td><td>${fmtNumber.format(count)}</td></tr>`;
    }).join("")
    : `<tr><td class="empty" colspan="3">Nenhum lead orgânico encontrado no período.</td></tr>`;
}

function renderOrganicInstagramChart() {
  const leads = getOrganicLeads().filter((lead) => normalizeToken(lead.rawSource).includes("instagram"));
  const stack = dailyStackData(leads, (lead) => normalizeLabel(lead.rawTerm, "Sem utm_term"));
  state.charts.organicInstagram?.destroy();
  state.charts.organicInstagram = new Chart($("#organicInstagramChart"), {
    type: "bar",
    data: {
      labels: stack.dates.map(formatDay),
      datasets: stack.datasets
    },
    options: {
      ...stackedBarOptions(),
      plugins: {
        legend: { position: "top", labels: { color: "#dbe4ff" } },
        stackedTotalLabels: { color: "#ffffff" }
      }
    },
    plugins: [stackedTotalLabelPlugin]
  });
}

function renderActiveFilters() {
  const labels = { campaign: "Campanha", adset: "Grupo", ad: "Anuncio" };
  const filter = getFilter();
  const entries = Object.entries(filter).filter(([, value]) => value);
  $("#activeFilters").innerHTML = entries.length
    ? entries.map(([key, value]) => `<span>${labels[key]}: <b>${value}</b></span>`).join("")
    : `<span>Nenhum filtro aplicado</span>`;
}

function renderOptimizationTable() {
  const labels = { campaign: "campanha", adset: "conjunto", ad: "anuncio" };
  const start = $("#startDate").value;
  const end = $("#endDate").value;
  const baseRows = getRowsForMenu(state.tab, state.table, start, end);
  const rows = groupBy(baseRows, state.table);
  $("#tableTitle").textContent = `Otimizacao por ${labels[state.table]}`;
  $("#tableBody").innerHTML = rows.length
    ? rows.map((row) => `
      <tr class="clickableRow" data-filter-field="${state.table}" data-filter-value="${encodeURIComponent(row.name)}">
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
  $$("#tableBody .clickableRow").forEach((row) => {
    row.addEventListener("click", () => {
      const field = row.dataset.filterField;
      const value = decodeURIComponent(row.dataset.filterValue);
      const filter = state.filters[state.tab];
      filter[field] = value;
      if (field === "campaign") {
        delete filter.adset;
        delete filter.ad;
        state.table = "adset";
      }
      if (field === "adset") {
        delete filter.ad;
        state.table = "ad";
      }
      $$(".tableNav button").forEach((button) => button.classList.toggle("active", button.dataset.table === state.table));
      renderPlatform();
    });
  });
  renderActiveFilters();
}

function renderGeneral() {
  $("#generalView").hidden = false;
  $("#platformView").hidden = true;
  $("#organicView").hidden = true;
  $("#kpis").hidden = false;
  renderGroupStats();
  renderLeadSourceChart();
  renderLeadMediumDailyChart();
  renderGroupEntryRateChart();
  renderLineChart("dailyChart", "all", "daily");
  renderCplChart("cplChart", "all", "cpl");
  renderMetricRail();
  renderDailyTable("all");
  renderPlatformResults();
}

function renderPlatform() {
  $("#generalView").hidden = true;
  $("#platformView").hidden = false;
  $("#organicView").hidden = true;
  $("#kpis").hidden = false;
  const filteredRows = getFilteredRows(state.tab);
  renderLineChart("platformDailyChart", state.tab, "platformDaily", filteredRows);
  renderLeadCplChart("platformFilterChart", state.tab, "platformFilter", filteredRows);
  renderPlatformDailyTable();
  renderOptimizationTable();
  const suffix = Object.values(getFilter()).filter(Boolean).length ? " filtrado" : "";
  $("#filterChartTitle").textContent = `Leads e CPL por dia${suffix}`;
}

function renderOrganic() {
  $("#generalView").hidden = true;
  $("#platformView").hidden = true;
  $("#organicView").hidden = false;
  $("#kpis").hidden = true;
  renderOrganicCounter();
  renderOrganicTemporalChart();
  renderOrganicSourceChart();
  renderOrganicTable();
  renderOrganicInstagramChart();
}

function render() {
  if (state.tab === "organic") {
    renderOrganic();
    return;
  }
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
      state.table = "campaign";
      $$(".tableNav button").forEach((item) => item.classList.toggle("active", item.dataset.table === "campaign"));
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

  $("#clearFilters").addEventListener("click", () => {
    if (state.tab === "all") return;
    state.filters[state.tab] = {};
    state.table = "campaign";
    $$(".tableNav button").forEach((item) => item.classList.toggle("active", item.dataset.table === "campaign"));
    renderPlatform();
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
