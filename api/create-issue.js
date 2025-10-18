export default async function handler(req, res) {
  // CORS: permitir llamadas desde tu GitHub Pages
  res.setHeader("Access-Control-Allow-Origin", "https://oswaldocasillas.github.io");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { type, fecha, notas, items, mercado, tarjeta } = req.body || {};
  if (!type || !fecha || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: "Payload inválido" });
  }

  const GH_TOKEN = process.env.GH_TOKEN;
  let GH_OWNER = process.env.GH_OWNER || "OswaldoCasillas";
  let GH_REPO  = process.env.GH_REPO  || "Ventas";

  // Normaliza si por error pusiste "owner/repo" en GH_REPO
  if (GH_REPO.includes("/")) {
    const [o, r] = GH_REPO.split("/", 2);
    GH_OWNER = o || GH_OWNER;
    GH_REPO  = r || GH_REPO;
  }
  if (!GH_TOKEN) return res.status(500).json({ error: "Falta GH_TOKEN" });

  const esTarjeta = Boolean(tarjeta);
  const esMercado = Boolean(mercado);

  const titleBase =
    type === "venta-mercado" ? "Venta Mercado" :
    type === "venta" ? "Venta" : "Movimiento";
  const title = `${titleBase}: ${items.length} items @ ${fecha}${esTarjeta ? " (TARJETA)" : ""}`;

  const notasFinal = `${esTarjeta ? "[TARJETA] " : ""}${notas || ""}`.trim();

  let body = `**Fecha**: ${fecha}\n**Método de pago**: ${esTarjeta ? "Tarjeta" : "Efectivo"}\n**Notas**: ${notasFinal}\n\n**Items**\nSKU | Cantidad | Precio\n`;
  for (const it of items) body += `${it.item} | ${it.cantidad} | ${it.precio ?? ""}\n`;

  const labels = [];
  if (type === "venta" || type === "venta-mercado") labels.push("venta");
  if (esMercado) labels.push("venta-mercado");
  if (esTarjeta) labels.push("pago-tarjeta");

  try {
    const url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/issues`;
    const gh = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `token ${GH_TOKEN}`,
        "Accept": "application/vnd.github+json",
        "User-Agent": "ventas-backend-vercel",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ title, body, labels })
    });

    const text = await gh.text();
    if (!gh.ok) return res.status(gh.status).json({ error: text, status: gh.status });

    const data = JSON.parse(text);
    return res.status(201).json({ number: data.number, html_url: data.html_url });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
