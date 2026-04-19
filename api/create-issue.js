function toBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return ["true", "1", "yes", "si", "sí", "on"].includes(normalized);
  }

  return false;
}

function normalizeMetodoPago(payload) {
  const raw =
    payload?.metodo_pago ??
    payload?.metodoPago ??
    (toBoolean(payload?.tarjeta) ? "tarjeta" : "efectivo");

  const value = String(raw || "").trim().toLowerCase();
  return value === "tarjeta" ? "tarjeta" : "efectivo";
}

function normalizeClientTxnId(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9:_-]/g, "")
    .slice(0, 120);
}

function normalizeItem(raw) {
  const item = String(raw?.item || "").trim();
  const cantidad = Number(raw?.cantidad);
  const precio =
    raw?.precio === "" || raw?.precio == null ? "" : Number(raw?.precio);

  if (!item) return null;
  if (!Number.isFinite(cantidad) || cantidad <= 0) return null;

  return {
    item,
    cantidad: Math.trunc(cantidad),
    precio: precio === "" || Number.isFinite(precio) ? precio : ""
  };
}

async function findExistingIssue({ owner, repo, ghToken, marker }) {
  if (!marker) return null;

  const url = `https://api.github.com/repos/${owner}/${repo}/issues?state=all&per_page=100&sort=created&direction=desc`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `token ${ghToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "ventas-backend-vercel"
    }
  });

  if (!resp.ok) return null;

  const issues = await resp.json().catch(() => []);
  return (
    issues.find(
      (issue) =>
        issue &&
        !issue.pull_request &&
        typeof issue.body === "string" &&
        issue.body.includes(marker)
    ) || null
  );
}

export default async function handler(req, res) {
  const allowedOrigins = new Set([
    "https://oswaldocasillas.github.io",
    "http://localhost:3000",
    "http://127.0.0.1:3000"
  ]);

  const origin = req.headers.origin || "";
  if (allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader(
      "Access-Control-Allow-Origin",
      "https://oswaldocasillas.github.io"
    );
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const payload = req.body || {};
  const type = String(payload.type || "").trim();
  const fecha = String(payload.fecha || "").trim();
  const notas = String(payload.notas || "").trim();
  const mercado = toBoolean(payload.mercado) || type === "venta-mercado";
  const metodoPago = normalizeMetodoPago(payload);
  const clientTxnId = normalizeClientTxnId(
    payload.client_txn_id || payload.clientTxnId
  );

  const items = Array.isArray(payload.items)
    ? payload.items.map(normalizeItem).filter(Boolean)
    : [];

  if (!type || !fecha || items.length === 0) {
    return res.status(400).json({ error: "Payload inválido" });
  }

  const GH_TOKEN = process.env.GH_TOKEN;
  let GH_OWNER = process.env.GH_OWNER || "OswaldoCasillas";
  let GH_REPO = process.env.GH_REPO || "Ventas";

  if (GH_REPO.includes("/")) {
    const [owner, repo] = GH_REPO.split("/", 2);
    GH_OWNER = owner || GH_OWNER;
    GH_REPO = repo || GH_REPO;
  }

  if (!GH_TOKEN) {
    return res.status(500).json({ error: "Falta GH_TOKEN" });
  }

  const esTarjeta = metodoPago === "tarjeta";

  const titleBase =
    type === "venta-mercado"
      ? "Venta Mercado"
      : type === "venta"
      ? "Venta"
      : type === "produccion"
      ? "Producción"
      : type === "abasto-mercado"
      ? "Abasto Mercado"
      : "Movimiento";

  const title = `${titleBase}: ${items.length} items @ ${fecha}${
    esTarjeta ? " (TARJETA)" : ""
  }`;

  const labels = [];
  if (type === "venta" || type === "venta-mercado") labels.push("venta");
  if (mercado || type === "venta-mercado") labels.push("venta-mercado");
  if (type === "produccion") labels.push("produccion");
  if (type === "abasto-mercado") labels.push("abasto-mercado");
  if (esTarjeta) labels.push("pago-tarjeta");

  const marker = clientTxnId ? `VENTAS-TXN:${clientTxnId}` : "";

  try {
    const existing = await findExistingIssue({
      owner: GH_OWNER,
      repo: GH_REPO,
      ghToken: GH_TOKEN,
      marker
    });

    if (existing) {
      return res.status(200).json({
        ok: true,
        deduped: true,
        number: existing.number,
        html_url: existing.html_url,
        title: existing.title
      });
    }

    let body = "";
    body += `**Fecha**: ${fecha}\n`;
    if (clientTxnId) body += `**ClientTxnId**: ${clientTxnId}\n`;
    if (marker) body += `${marker}\n`;
    body += `**Método de pago**: ${esTarjeta ? "tarjeta" : "efectivo"}\n`;
    body += `**Notas**: ${notas || "Sin notas"}\n\n`;
    body += `**Items**\n`;
    body += `SKU | Cantidad | Precio\n`;
    body += `--- | --- | ---\n`;

    for (const it of items) {
      body += `${it.item} | ${it.cantidad} | ${
        it.precio === "" ? "" : it.precio
      }\n`;
    }

    const url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/issues`;
    const gh = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `token ${GH_TOKEN}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "ventas-backend-vercel",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title,
        body,
        labels
      })
    });

    const text = await gh.text();
    if (!gh.ok) {
      return res.status(gh.status).json({
        error: text,
        status: gh.status
      });
    }

    const data = JSON.parse(text);
    return res.status(201).json({
      ok: true,
      deduped: false,
      number: data.number,
      html_url: data.html_url,
      title: data.title
    });
  } catch (error) {
    return res.status(500).json({ error: String(error) });
  }
}
