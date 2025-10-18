// Vercel Serverless Function: crea issues en GitHub de forma segura
// Variables de entorno en Vercel:
//  - GH_TOKEN: PAT fine-grained (Issues: Read/Write, Contents: Read) con acceso a OswaldoCasillas/Ventas
//  - GH_REPO:  "OswaldoCasillas/Ventas"

export default async function handler(req, res) {
  // CORS (puedes usar "*" mientras pruebas; ideal: tu dominio de Pages)
  res.setHeader("Access-Control-Allow-Origin", "https://oswaldocasillas.github.io");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  try {
    const { type, fecha, notas, items } = req.body || {};
    if (!type || !fecha || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Payload inválido" });
    }

    const GH_TOKEN = process.env.GH_TOKEN;
    const GH_REPO  = process.env.GH_REPO; // "owner/repo"
    if (!GH_TOKEN || !GH_REPO) {
      return res.status(500).json({ error: "Faltan variables de entorno" });
    }

    const [owner, repo] = GH_REPO.split("/");
    const label = type === "venta" ? "venta" : "produccion";
    const title = type === "venta"
      ? `Venta: ${items.length} items @ ${fecha}`
      : `Producción: ${items.length} items @ ${fecha}`;

    let body = `**Fecha**: ${fecha}\n**Notas**: ${notas || ""}\n\n**Items**\n`;
    if (type === "venta") {
      body += "SKU | Cantidad | Precio\n";
      for (const it of items) body += `${it.item} | ${it.cantidad} | ${it.precio || ""}\n`;
    } else {
      body += "SKU | Cantidad\n";
      for (const it of items) body += `${it.item} | ${it.cantidad}\n`;
    }

    const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GH_TOKEN}`,
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ title, body, labels: [label] })
    });

    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data.message || "Error creando issue", details: data });

    return res.status(200).json({ number: data.number, html_url: data.html_url });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Error interno" });
  }
}
