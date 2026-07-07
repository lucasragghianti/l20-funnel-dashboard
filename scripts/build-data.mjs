import { mkdir, writeFile } from "node:fs/promises";

const ADS_SHEET_ID = "1-EE1jMwW3-p1Peq9gVMoydSVSpSXM0UHeCpjOZlI2No";
const LEADS_SHEET_ID = "1nZjONwwL9HGSw2lXjfLjIjEMCzsuS9gykYpp20SKfP0";
const GROUPS_SHEET_ID = "1ap-pQe_To4UgEYx7v6KbCB4Ba-i8vDRQ6f-NiUI2q6A";
const META_TAX = 1.1385;

const SOURCES = [
  {
    key: "meta",
    label: "Meta Ads",
    sheetId: ADS_SHEET_ID,
    sheetName: "Queries | Meta-Ads 📢",
    taxMultiplier: META_TAX,
    sourceMatchers: ["facebook ads"]
  },
  {
    key: "google",
    label: "Google Ads",
    sheetId: ADS_SHEET_ID,
    sheetName: "Queries | YouTube-Ads 📢",
    taxMultiplier: 1,
    sourceMatchers: ["google", "youtube", "yt", "adwords", "gads"]
  }
];

const LEADS_SOURCE = {
  sheetId: LEADS_SHEET_ID,
  sheetName: "Leads"
};

const GROUPS_SOURCE = {
  sheetId: GROUPS_SHEET_ID
};

const FIELD_ALIASES = {
  date: ["date", "data", "dia", "day", "created", "created_at", "data_criacao", "data de criação", "timestamp"],
  spend: ["spend", "gasto", "cost", "custo", "valor gasto", "amount_spent", "investimento", "valor investido"],
  impressions: ["impressions", "impressoes", "impressões", "impr", "views"],
  clicks: ["clicks", "cliques", "link_clicks", "cliques no link", "click"],
  pageViews: ["page views", "pageviews", "landing page views", "lp views", "pages session", "pages / session", "visualizacoes da pagina", "visualizações da página", "visualizacoes de pagina", "visualizações de página"],
  campaign: ["campaign", "campanha", "utm_campaign", "campaign_name", "nome da campanha"],
  adset: ["adset", "ad set", "conjunto", "conjunto de anuncios", "conjunto de anúncios", "utm_content", "adgroup", "ad group", "grupo de anuncio", "grupo de anúncio"],
  ad: ["ad", "anuncio", "anúncio", "ad_name", "nome do anuncio", "nome do anúncio", "utm_term", "creative"],
  source: ["source", "utm_source", "origem", "plataforma", "traffic_source", "fonte"],
  medium: ["medium", "utm_medium", "midia", "mídia"],
  url: ["url", "page url", "landing page", "pagina", "página"],
  entered: ["entrou", "entraram", "entrada", "em grupos"],
  left: ["saiu", "sairam", "saíram", "saida", "saída"],
  total: ["total"]
};

function csvUrl(sheetId, sheetName) {
  if (!sheetName) return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
  const sheet = encodeURIComponent(sheetName);
  return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${sheet}`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

function normalizeKey(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeValue(value) {
  return normalizeKey(value).replace(/\s+/g, " ");
}

function mapRows(csv) {
  const rows = parseCsv(csv);
  if (!rows.length) return [];
  const headers = rows[0].map((header) => String(header ?? "").trim());
  return rows.slice(1).map((row) => {
    const mapped = {};
    headers.forEach((header, index) => {
      mapped[header] = row[index] ?? "";
    });
    return mapped;
  });
}

function pick(row, field) {
  const aliases = FIELD_ALIASES[field].map(normalizeKey);
  const direct = Object.entries(row).find(([key]) => aliases.includes(normalizeKey(key)));
  if (direct) return direct[1];

  const fuzzy = Object.entries(row).find(([key]) => {
    const normalized = normalizeKey(key);
    return aliases.some((alias) => normalized.includes(alias) || alias.includes(normalized));
  });

  return fuzzy?.[1] ?? "";
}

function pickLead(row, field, utmParam) {
  const direct = pick(row, field);
  if (direct) return direct;
  const url = String(pick(row, "url") || "");
  if (!url || !utmParam) return "";
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get(utmParam) ?? "";
  } catch {
    return "";
  }
}

function parseNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const onlyNumber = raw.replace(/[^\d,.-]/g, "");
  const hasComma = onlyNumber.includes(",");
  const hasDot = onlyNumber.includes(".");
  const commaThousands = hasComma && !hasDot && /,\d{3}$/.test(onlyNumber);
  const cleaned = onlyNumber
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(commaThousands ? /,/g : ",", commaThousands ? "" : ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDate(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (br) {
    const year = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${year}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return "";
}

async function fetchCsv(source) {
  const url = csvUrl(source.sheetId, source.sheetName);
  const response = await fetch(url, {
    headers: {
      "user-agent": "l20-funnel-dashboard/1.0"
    }
  });
  if (!response.ok) {
    throw new Error(`Falha ao ler ${source.sheetName}: HTTP ${response.status}`);
  }
  return response.text();
}

function makeMetricRow(raw, source) {
  const date = parseDate(pick(raw, "date"));
  const spendWithoutTax = parseNumber(pick(raw, "spend"));
  return {
    source: source.key,
    sourceLabel: source.label,
    date,
    campaign: String(pick(raw, "campaign") || "Sem campanha").trim(),
    adset: String(pick(raw, "adset") || "Sem conjunto").trim(),
    ad: String(pick(raw, "ad") || "Sem anúncio").trim(),
    spendWithoutTax,
    spend: spendWithoutTax * source.taxMultiplier,
    taxMultiplier: source.taxMultiplier,
    impressions: parseNumber(pick(raw, "impressions")),
    clicks: parseNumber(pick(raw, "clicks")),
    pageViews: parseNumber(pick(raw, "pageViews"))
  };
}

function sourceFromLead(row) {
  const source = normalizeValue(pickLead(row, "source", "utm_source"));
  if (source === "facebook ads") return "meta";
  if (["google ads", "youtube ads", "google", "youtube", "adwords", "gads"].includes(source)) return "google";
  return "";
}

function makeLeadRow(raw) {
  const rawSource = String(pickLead(raw, "source", "utm_source")).trim();
  const rawMedium = String(pickLead(raw, "medium", "utm_medium")).trim();
  const rawTerm = String(pickLead(raw, "ad", "utm_term")).trim();
  return {
    date: parseDate(pick(raw, "date")),
    source: sourceFromLead(raw),
    rawSource,
    rawMedium,
    rawTerm,
    campaign: String(pickLead(raw, "campaign", "utm_campaign")).trim(),
    adset: String(pickLead(raw, "adset", "utm_content")).trim(),
    ad: rawTerm
  };
}

function makeGroupEntryRow(raw) {
  return {
    date: parseDate(pick(raw, "date")),
    entered: parseNumber(pick(raw, "entered")),
    left: parseNumber(pick(raw, "left")),
    total: parseNumber(pick(raw, "total"))
  };
}

function attributionKey(row) {
  return [
    row.source,
    normalizeValue(row.campaign),
    normalizeValue(row.adset),
    normalizeValue(row.ad)
  ].join("|");
}

function attachLeads(metrics, leads) {
  const rows = metrics.map((row) => ({ ...row, leads: 0, attributionKey: attributionKey(row) }));

  for (const lead of leads.filter((item) => item.source)) {
    let bestRow = null;
    let bestScore = 0;

    for (const row of rows) {
      if (row.date !== lead.date || row.source !== lead.source) continue;
      let score = 0;
      if (lead.campaign && normalizeValue(lead.campaign) === normalizeValue(row.campaign)) score += 4;
      if (lead.adset && normalizeValue(lead.adset) === normalizeValue(row.adset)) score += 3;
      if (lead.adset && normalizeValue(lead.adset) === normalizeValue(row.ad)) score += 2;
      if (lead.ad && normalizeValue(lead.ad) === normalizeValue(row.ad)) score += 3;
      if (lead.ad && normalizeValue(lead.ad) === normalizeValue(row.adset)) score += 1;
      if (score > bestScore) {
        bestScore = score;
        bestRow = row;
      }
    }

    if (bestRow && bestScore >= 4) bestRow.leads += 1;
  }

  return rows;
}

function getDateRange(rows) {
  const dates = rows.map((row) => row.date).filter(Boolean).sort();
  return {
    min: dates[0] ?? "",
    max: dates[dates.length - 1] ?? ""
  };
}

function aggregate(rows) {
  return rows.reduce(
    (acc, row) => {
      acc.spend += row.spend || 0;
      acc.spendWithoutTax += row.spendWithoutTax || 0;
      acc.impressions += row.impressions || 0;
      acc.clicks += row.clicks || 0;
      acc.pageViews += row.pageViews || 0;
      acc.leads += row.leads || 0;
      return acc;
    },
    { spend: 0, spendWithoutTax: 0, impressions: 0, clicks: 0, pageViews: 0, leads: 0 }
  );
}

function addRates(item) {
  return {
    ...item,
    cpm: item.impressions ? (item.spend / item.impressions) * 1000 : 0,
    ctr: item.impressions ? item.clicks / item.impressions : 0,
    cpc: item.clicks ? item.spend / item.clicks : 0,
    cpl: item.leads ? item.spend / item.leads : 0,
    conversionRate: item.clicks ? item.leads / item.clicks : 0,
    pageViewRate: item.clicks ? item.pageViews / item.clicks : 0
  };
}

function groupBy(rows, field) {
  const groups = new Map();
  for (const row of rows) {
    const key = row[field] || `Sem ${field}`;
    if (!groups.has(key)) groups.set(key, { name: key, rows: [] });
    groups.get(key).rows.push(row);
  }
  return [...groups.values()]
    .map((group) => addRates({ name: group.name, ...aggregate(group.rows) }))
    .sort((a, b) => (a.cpl || Number.MAX_SAFE_INTEGER) - (b.cpl || Number.MAX_SAFE_INTEGER));
}

function daily(rows, leads) {
  const days = new Map();
  for (const row of rows) {
    if (!row.date) continue;
    if (!days.has(row.date)) days.set(row.date, { date: row.date, rows: [] });
    days.get(row.date).rows.push(row);
  }
  const trafficLeadDays = [...days.entries()].map(([date, value]) => {
    const totalLeads = leads.filter((lead) => lead.date === date).length;
    return addRates({ date, totalLeads, ...aggregate(value.rows) });
  });
  return trafficLeadDays.sort((a, b) => a.date.localeCompare(b.date));
}

async function main() {
  const ads = [];
  for (const source of SOURCES) {
    const csv = await fetchCsv(source);
    ads.push(...mapRows(csv).map((row) => makeMetricRow(row, source)).filter((row) => row.date));
  }

  const leadsCsv = await fetchCsv(LEADS_SOURCE);
  const leads = mapRows(leadsCsv).map(makeLeadRow).filter((row) => row.date);
  const groupsCsv = await fetchCsv(GROUPS_SOURCE);
  const groupEntries = mapRows(groupsCsv).map(makeGroupEntryRow).filter((row) => row.date);
  const rows = attachLeads(ads, leads);

  const payload = {
    generatedAt: new Date().toISOString(),
    cacheBust: Date.now(),
    config: {
      metaTaxMultiplier: META_TAX,
      sources: SOURCES.map(({ key, label, sheetName, taxMultiplier }) => ({ key, label, sheetName, taxMultiplier }))
    },
    dateRange: getDateRange([...rows, ...leads]),
    rows,
    leads,
    groupEntries,
    summary: {
      all: addRates({ totalLeads: leads.length, ...aggregate(rows) }),
      meta: addRates({ totalLeads: leads.filter((lead) => lead.source === "meta").length, ...aggregate(rows.filter((row) => row.source === "meta")) }),
      google: addRates({ totalLeads: leads.filter((lead) => lead.source === "google").length, ...aggregate(rows.filter((row) => row.source === "google")) })
    },
    tables: {
      all: {
        campaign: groupBy(rows, "campaign"),
        adset: groupBy(rows, "adset"),
        ad: groupBy(rows, "ad")
      },
      meta: {
        campaign: groupBy(rows.filter((row) => row.source === "meta"), "campaign"),
        adset: groupBy(rows.filter((row) => row.source === "meta"), "adset"),
        ad: groupBy(rows.filter((row) => row.source === "meta"), "ad")
      },
      google: {
        campaign: groupBy(rows.filter((row) => row.source === "google"), "campaign"),
        adset: groupBy(rows.filter((row) => row.source === "google"), "adset"),
        ad: groupBy(rows.filter((row) => row.source === "google"), "ad")
      }
    },
    daily: {
      all: daily(rows, leads),
      meta: daily(rows.filter((row) => row.source === "meta"), leads.filter((lead) => lead.source === "meta")),
      google: daily(rows.filter((row) => row.source === "google"), leads.filter((lead) => lead.source === "google"))
    }
  };

  await mkdir("public", { recursive: true });
  await writeFile("public/data.json", `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Gerado public/data.json com ${rows.length} linhas de mídia e ${leads.length} leads.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
