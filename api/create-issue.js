// api/create-issue.js  (Serverless Function en Vercel)
export default async function handler(req, res) {
  // CORS sencillo para permitir tu GitHub Pages
  res.setHeader("Access-Control-Allow-Origin", "https://oswaldocasillas.github.io");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { type, fecha, notas, items } = req.body || {};
  if (!type || !fecha || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Payload inválido" });
  }

  const GH_TOKEN = process.env.GH_TOKEN;          // <- PAT personal de GitHub
  const GH_OWNER = process.env.GH_OWNER || "OswaldoCasillas";
  const GH_REPO  = process.env.GH_REPO  || "Ventas";
  if (!GH_TOKEN) return res.status(500).json({ error: "Falta GH_TOKEN" });

  const title = (type === "venta" ? "Venta" : "Movimiento") + `: ${items.length} items @ ${fecha}`;
  let body = `Fecha: ${fecha}\nNotas: ${notas || ""}\n\nItems\nSKU | Cantidad | Precio\n`;
  for (const it of items) body += `${it.item} | ${it.cantidad} | ${it.precio ?? ""}\n`;
  const labels = [ type === "venta" ? "venta" : "produccion" ];

  try {
    const gh = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/issues`, {
      method: "POST",
      headers: {
        "Authorization": `token ${GH_TOKEN}`,
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ title, body, labels })
    });

    if (!gh.ok) {
      const err = await gh.text();
      return res.status(gh.status).json({ error: err });
    }
    const data = await gh.json();
    return res.status(201).json({ number: data.number, html_url: data.html_url });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
