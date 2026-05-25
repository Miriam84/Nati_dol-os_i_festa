const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const INDEX_PATH = path.join(ROOT, "index.html");
const ENV_PATH = path.join(ROOT, ".env");
const ASSETS_ROOT = path.join(ROOT, "assets");
const PRODUCT_ASSETS_MANIFEST = path.join(ASSETS_ROOT, "products", "manifest.json");

loadEnvFile();

function loadEnvFile() {
  if (!fs.existsSync(ENV_PATH)) return;

  const raw = fs.readFileSync(ENV_PATH, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
}

function sendHtml(response, statusCode, html) {
  response.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(html);
}

function sendText(response, statusCode, text, contentType = "text/plain; charset=utf-8") {
  response.writeHead(statusCode, {
    "Content-Type": contentType
  });
  response.end(text);
}

function isConfigured() {
  return Boolean(
    process.env.AIRTABLE_TOKEN &&
    process.env.AIRTABLE_BASE_ID &&
    process.env.AIRTABLE_LEADS_TABLE_ID &&
    process.env.AIRTABLE_PRODUCTS_TABLE_ID
  );
}

function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

async function parseJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".gif": "image/gif"
  };

  return types[extension] || "application/octet-stream";
}

function safeJoin(basePath, targetPath) {
  const resolvedPath = path.resolve(basePath, "." + targetPath);
  if (!resolvedPath.startsWith(path.resolve(basePath))) {
    return null;
  }
  return resolvedPath;
}

function readProductAssetsManifest() {
  if (!fs.existsSync(PRODUCT_ASSETS_MANIFEST)) return {};

  try {
    return JSON.parse(fs.readFileSync(PRODUCT_ASSETS_MANIFEST, "utf8"));
  } catch {
    return {};
  }
}

function buildAirtableFields(payload) {
  const fields = {
    "Nom del client": payload.nom || "",
    Contacte: payload.telefon || "",
    Servei: payload.servei || ""
  };

  if (payload.email) fields.Email = payload.email;
  if (payload.data_festa) fields.Data = payload.data_festa;
  if (payload.hora) fields.Hora = payload.hora;
  if (payload.tipus_entrega) fields.Modalitat = payload.tipus_entrega;
  if (payload.zona) fields.Zona = payload.zona;
  if (payload.lloc) fields.Lloc = payload.lloc;
  if (payload.tema_colors) fields["Tema o colors"] = payload.tema_colors;

  const message = [
    payload.missatge || "",
    payload.pressupost ? `Pressupost orientatiu: ${payload.pressupost}` : ""
  ].filter(Boolean).join("\n");

  if (message) fields.Missatge = message;

  return fields;
}

function buildQuickLeadPayload(payload, product) {
  const pieces = [
    "Checkout curt iniciat des de la web.",
    payload.quantitat ? `Quantitat: ${payload.quantitat}` : "",
    payload.notes ? `Notes: ${payload.notes}` : "",
    payload.checkoutSessionId ? `Stripe session: ${payload.checkoutSessionId}` : "",
    payload.paymentStatus ? `Estat pagament: ${payload.paymentStatus}` : ""
  ].filter(Boolean);

  return {
    nom: payload.nom,
    telefon: payload.telefon,
    servei: product.nom,
    missatge: pieces.join("\n")
  };
}

async function createLeadInAirtable(payload) {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableId = process.env.AIRTABLE_LEADS_TABLE_ID;
  const token = process.env.AIRTABLE_TOKEN;

  const response = await fetch(`https://api.airtable.com/v0/${baseId}/${tableId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      records: [
        {
          fields: buildAirtableFields(payload)
        }
      ]
    })
  });

  const result = await response.json();

  if (!response.ok) {
    const message = result?.error?.message || "Airtable ha rebutjat la peticio.";
    throw new Error(message);
  }

  return result;
}

async function fetchProductsFromAirtable() {
  if (!isConfigured()) return [];

  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableId = process.env.AIRTABLE_PRODUCTS_TABLE_ID;
  const token = process.env.AIRTABLE_TOKEN;
  const localAssets = readProductAssetsManifest();
  const fields = [
    "Nom",
    "Categoria",
    "Descripcio curta",
    "Preu orientatiu",
    "Imatges",
    "Mides o opcions",
    "Notes",
    "Actiu",
    "Ordre"
  ];

  const params = new URLSearchParams();
  fields.forEach((field) => params.append("fields[]", field));
  params.append("sort[0][field]", "Ordre");
  params.append("sort[0][direction]", "asc");

  const response = await fetch(`https://api.airtable.com/v0/${baseId}/${tableId}?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result?.error?.message || "No s'han pogut llegir els productes d'Airtable.");
  }

  return (result.records || [])
    .filter((record) => (record.fields || {})["Actiu"] !== false)
    .map((record) => {
      const fieldsRecord = record.fields || {};
      const assetEntry = localAssets[record.id] || localAssets[slugify(fieldsRecord["Nom"] || "")] || null;
      const remoteImages = Array.isArray(fieldsRecord["Imatges"])
        ? fieldsRecord["Imatges"].map((image, index) => ({
            url: image.thumbnails?.large?.url || image.url || "",
            fullUrl: image.url || "",
            alt: image.filename || fieldsRecord["Nom"] || "Imatge del producte",
            index
          })).filter((image) => image.url)
        : [];

      const localImages = Array.isArray(assetEntry?.images)
        ? assetEntry.images.map((image, index) => ({
            url: image.path,
            fullUrl: image.path,
            alt: image.alt || fieldsRecord["Nom"] || "Imatge del producte",
            index
          }))
        : [];

      return {
        id: record.id,
        nom: fieldsRecord["Nom"] || "",
        slug: slugify(fieldsRecord["Nom"] || record.id),
        categoria: fieldsRecord["Categoria"]?.name || fieldsRecord["Categoria"] || "",
        descripcioCurta: fieldsRecord["Descripcio curta"] || "",
        preuOrientatiu: fieldsRecord["Preu orientatiu"] || null,
        opcions: fieldsRecord["Mides o opcions"] || "",
        notes: fieldsRecord["Notes"] || "",
        imatges: localImages.length > 0 ? localImages : remoteImages
      };
    });
}

async function fetchProductById(productId) {
  const products = await fetchProductsFromAirtable();
  return products.find((product) => product.id === productId || product.slug === productId) || null;
}

function buildSiteUrl(requestUrl) {
  if (process.env.SITE_URL) {
    return process.env.SITE_URL.replace(/\/$/, "");
  }

  return `${requestUrl.protocol}//${requestUrl.host}`;
}

async function createStripeCheckoutSession({ requestUrl, product, payload }) {
  const params = new URLSearchParams();
  const siteUrl = buildSiteUrl(requestUrl);
  const unitAmount = Math.round(Number(product.preuOrientatiu || 0) * 100);

  if (!unitAmount || unitAmount < 50) {
    throw new Error("Aquest producte encara no te un preu preparat per al checkout directe.");
  }

  params.append("mode", "payment");
  params.append("success_url", `${siteUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
  params.append("cancel_url", `${siteUrl}/?checkout=cancelled`);
  params.append("customer_creation", "always");
  params.append("line_items[0][quantity]", String(Math.max(1, Number(payload.quantitat || 1))));
  params.append("line_items[0][price_data][currency]", "eur");
  params.append("line_items[0][price_data][unit_amount]", String(unitAmount));
  params.append("line_items[0][price_data][product_data][name]", product.nom);
  params.append("line_items[0][price_data][product_data][description]", product.descripcioCurta || product.categoria || "Comanda directa");
  params.append("metadata[product_id]", product.id);
  params.append("metadata[product_name]", product.nom);
  params.append("metadata[customer_name]", payload.nom || "");
  params.append("metadata[customer_phone]", payload.telefon || "");
  params.append("metadata[quantity]", String(Math.max(1, Number(payload.quantitat || 1))));
  if (payload.notes) params.append("metadata[notes]", payload.notes);

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params.toString()
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result?.error?.message || "No s'ha pogut crear el checkout de Stripe.");
  }

  return result;
}

async function getStripeCheckoutSession(sessionId) {
  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`
    }
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result?.error?.message || "No s'ha pogut recuperar la sessio de Stripe.");
  }

  return result;
}

function serveStaticAsset(requestUrl, response) {
  const filePath = safeJoin(ASSETS_ROOT, requestUrl.pathname.replace(/^\/assets/, ""));
  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    sendJson(response, 404, { error: "Asset no trobat." });
    return true;
  }

  response.writeHead(200, {
    "Content-Type": getMimeType(filePath),
    "Cache-Control": "no-cache"
  });
  fs.createReadStream(filePath).pipe(response);
  return true;
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "GET" && requestUrl.pathname.startsWith("/assets/")) {
    serveStaticAsset(requestUrl, response);
    return;
  }

  if (request.method === "GET" && (requestUrl.pathname === "/" || requestUrl.pathname === "/checkout")) {
    const html = fs.readFileSync(INDEX_PATH, "utf8");
    sendHtml(response, 200, html);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/config") {
    try {
      const products = await fetchProductsFromAirtable();
      sendJson(response, 200, {
        whatsappNumber: process.env.WHATSAPP_NUMBER || "",
        contactSummary: process.env.CONTACT_SUMMARY || "",
        gaMeasurementId: process.env.GA_MEASUREMENT_ID || "",
        googleSiteVerification: process.env.GOOGLE_SITE_VERIFICATION || "",
        checkoutEnabled: isStripeConfigured(),
        products
      });
    } catch (error) {
      sendJson(response, 200, {
        whatsappNumber: process.env.WHATSAPP_NUMBER || "",
        contactSummary: process.env.CONTACT_SUMMARY || "",
        gaMeasurementId: process.env.GA_MEASUREMENT_ID || "",
        googleSiteVerification: process.env.GOOGLE_SITE_VERIFICATION || "",
        checkoutEnabled: isStripeConfigured(),
        products: [],
        warning: error.message || "No s'ha pogut carregar el cataleg."
      });
    }
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/checkout-session") {
    try {
      if (!isStripeConfigured()) {
        sendJson(response, 500, { error: "Falta configurar Stripe al servidor." });
        return;
      }

      const sessionId = requestUrl.searchParams.get("session_id");
      if (!sessionId) {
        sendJson(response, 400, { error: "Falta la sessio de checkout." });
        return;
      }

      const session = await getStripeCheckoutSession(sessionId);
      sendJson(response, 200, {
        id: session.id,
        paymentStatus: session.payment_status,
        customerEmail: session.customer_details?.email || "",
        customerName: session.customer_details?.name || session.metadata?.customer_name || "",
        productName: session.metadata?.product_name || ""
      });
    } catch (error) {
      sendJson(response, 500, {
        error: error.message || "No s'ha pogut validar la compra."
      });
    }
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/leads") {
    try {
      if (!isConfigured()) {
        sendJson(response, 500, {
          error: "Falta configurar Airtable al servidor. Revisa el fitxer .env."
        });
        return;
      }

      const body = await parseJsonBody(request);

      if (!body.nom || !body.telefon || !body.servei) {
        sendJson(response, 400, {
          error: "Nom, telefon i servei son obligatoris."
        });
        return;
      }

      const airtableResponse = await createLeadInAirtable(body);

      sendJson(response, 201, {
        ok: true,
        id: airtableResponse.records?.[0]?.id || null
      });
    } catch (error) {
      sendJson(response, 500, {
        error: error.message || "Error intern en enviar la consulta."
      });
    }
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/checkout") {
    try {
      if (!isConfigured()) {
        sendJson(response, 500, { error: "Falta configurar Airtable al servidor." });
        return;
      }

      const body = await parseJsonBody(request);
      if (!body.productId || !body.nom || !body.telefon) {
        sendJson(response, 400, { error: "Producte, nom i telefon son obligatoris." });
        return;
      }

      const product = await fetchProductById(body.productId);
      if (!product) {
        sendJson(response, 404, { error: "Producte no trobat." });
        return;
      }

      if (!isStripeConfigured()) {
        const leadOnlyResponse = await createLeadInAirtable(
          buildQuickLeadPayload(
            {
              nom: body.nom,
              telefon: body.telefon,
              quantitat: body.quantitat,
              notes: body.notes,
              paymentStatus: "lead-only"
            },
            product
          )
        );

        sendJson(response, 201, {
          ok: true,
          leadOnly: true,
          id: leadOnlyResponse.records?.[0]?.id || null
        });
        return;
      }

      const session = await createStripeCheckoutSession({
        requestUrl,
        product,
        payload: body
      });

      await createLeadInAirtable(
        buildQuickLeadPayload(
          {
            nom: body.nom,
            telefon: body.telefon,
            quantitat: body.quantitat,
            notes: body.notes,
            checkoutSessionId: session.id,
            paymentStatus: "pending"
          },
          product
        )
      );

      sendJson(response, 201, {
        ok: true,
        checkoutUrl: session.url,
        sessionId: session.id
      });
    } catch (error) {
      sendJson(response, 500, {
        error: error.message || "No s'ha pogut iniciar el checkout."
      });
    }
    return;
  }

  sendJson(response, 404, { error: "Ruta no trobada." });
});

server.listen(PORT, () => {
  console.log(`Nati web disponible a http://localhost:${PORT}`);
});
