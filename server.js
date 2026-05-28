const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const INDEX_PATH = path.join(ROOT, "index.html");
const ENV_PATH = path.join(ROOT, ".env");
const ASSETS_ROOT = path.join(ROOT, "assets");
const PRODUCT_ASSETS_MANIFEST = path.join(ASSETS_ROOT, "products", "manifest.json");
const FALLBACK_PRODUCTS_PATH = path.join(ROOT, "assets", "products", "fallback-products.json");

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
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, max-age=0",
    "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
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
    "Content-Type": contentType,
    "Cache-Control": "no-store"
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

function isGalleryConfigured() {
  return Boolean(
    process.env.AIRTABLE_TOKEN &&
    process.env.AIRTABLE_BASE_ID &&
    process.env.AIRTABLE_GALLERY_TABLE_ID
  );
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

function readFallbackProducts() {
  if (!fs.existsSync(FALLBACK_PRODUCTS_PATH)) return [];

  try {
    return JSON.parse(fs.readFileSync(FALLBACK_PRODUCTS_PATH, "utf8"));
  } catch {
    return [];
  }
}

function classifyGalleryCategories(imagePath, fallbackCategory = "") {
  const value = String(imagePath || "").toLowerCase();

  if (value.includes("taula-dolca-candy-bar")) return ["Esdeveniments"];
  if (value.includes("globus-d-heli-personalitzats")) return ["Decoració"];
  if (value.includes("pastis-de-xuxes-personalitzat")) return ["Xuxes personalitzades"];
  if (value.includes("ram-de-xuxes")) return ["Regals i detalls"];
  if (value.includes("regals-originals-i-detalls")) return ["Regals i detalls"];
  if (value.includes("sorpreses-amb-bitllets")) return ["Regals i detalls"];

  if (value.includes("decoracio-de-taules-detalls")) return ["Decoració", "Regals i detalls"];

  return fallbackCategory ? [fallbackCategory] : [];
}

function getInstagramUsername() {
  return process.env.INSTAGRAM_USERNAME || "nati_dolcos_i_festa";
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

  const extraDetails = [
    payload.tipus_esdeveniment ? `Tipus d'esdeveniment: ${payload.tipus_esdeveniment}` : "",
    payload.persones ? `Nombre de persones: ${payload.persones}` : "",
    payload.pressupost ? `Pressupost aproximat: ${payload.pressupost}` : "",
    payload.quantitat ? `Quantitat: ${payload.quantitat}` : "",
    payload.notes ? `Notes de la comanda: ${payload.notes}` : "",
    payload.checkoutSessionId ? `Stripe session: ${payload.checkoutSessionId}` : "",
    payload.paymentStatus ? `Estat del pagament: ${payload.paymentStatus}` : ""
  ].filter(Boolean);

  const message = [
    payload.missatge || "",
    extraDetails.length > 0 ? extraDetails.join("\n") : ""
  ].filter(Boolean).join("\n\n");

  if (message) fields.Missatge = message;

  return fields;
}

function buildSafeAirtableFields(payload) {
  const details = [
    payload.email ? `Email: ${payload.email}` : "",
    payload.tipus_esdeveniment ? `Tipus de celebració: ${payload.tipus_esdeveniment}` : "",
    payload.data_festa ? `Data: ${payload.data_festa}` : "",
    payload.hora ? `Hora aproximada: ${payload.hora}` : "",
    payload.tipus_entrega ? `Recollida o muntatge: ${payload.tipus_entrega}` : "",
    payload.zona ? `Població o zona: ${payload.zona}` : "",
    payload.lloc ? `Lloc: ${payload.lloc}` : "",
    payload.persones ? `Nombre de persones: ${payload.persones}` : "",
    payload.pressupost ? `Pressupost aproximat: ${payload.pressupost}` : "",
    payload.tema_colors ? `Tema o colors: ${payload.tema_colors}` : "",
    payload.quantitat ? `Quantitat: ${payload.quantitat}` : "",
    payload.notes ? `Notes de la comanda: ${payload.notes}` : "",
    payload.checkoutSessionId ? `Stripe session: ${payload.checkoutSessionId}` : "",
    payload.paymentStatus ? `Estat del pagament: ${payload.paymentStatus}` : "",
    payload.missatge ? `Missatge: ${payload.missatge}` : ""
  ].filter(Boolean);

  return {
    "Nom del client": payload.nom || "",
    Contacte: payload.telefon || "",
    Servei: payload.servei || "",
    Missatge: details.join("\n")
  };
}

function buildQuickLeadPayload(payload, product) {
  const pieces = [
    "Reserva o compra iniciada des de la pàgina de producte.",
    product.categoria ? `Categoria: ${product.categoria}` : "",
    product.preuOrientatiu ? `Preu orientatiu: ${product.preuOrientatiu} EUR` : "",
    payload.quantitat ? `Quantitat: ${payload.quantitat}` : "",
    payload.notes ? `Notes de la comanda: ${payload.notes}` : "",
    payload.checkoutSessionId ? `Stripe session: ${payload.checkoutSessionId}` : "",
    payload.paymentStatus ? `Estat pagament: ${payload.paymentStatus}` : ""
  ].filter(Boolean);

  return {
    nom: payload.nom,
    telefon: payload.telefon,
    email: payload.email,
    servei: product.nom,
    missatge: pieces.join("\n")
  };
}

async function createLeadInAirtable(payload) {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableId = process.env.AIRTABLE_LEADS_TABLE_ID;
  const token = process.env.AIRTABLE_TOKEN;

  async function postLead(fields) {
    const response = await fetch(`https://api.airtable.com/v0/${baseId}/${tableId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        records: [
          {
            fields
          }
        ]
      })
    });

    const result = await response.json();
    return { response, result };
  }

  let { response, result } = await postLead(buildAirtableFields(payload));

  if (!response.ok) {
    const message = result?.error?.message || "";
    if (response.status === 422 && /field/i.test(message)) {
      ({ response, result } = await postLead(buildSafeAirtableFields(payload)));
    }
  }

  if (!response.ok) {
    const message = result?.error?.message || "Airtable ha rebutjat la peticio.";
    throw new Error(message);
  }

  return result;
}

async function fetchProductsFromAirtable() {
  if (!isConfigured()) return readFallbackProducts();

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
    const fallbackProducts = readFallbackProducts();
    if (fallbackProducts.length > 0) return fallbackProducts;
    throw new Error(result?.error?.message || "No s'han pogut llegir els productes d'Airtable.");
  }

  return (result.records || [])
    .filter((record) => {
      const fieldsRecord = record.fields || {};
      return fieldsRecord["Actiu"] !== false && Boolean(String(fieldsRecord["Nom"] || "").trim());
    })
    .map((record) => {
      const fieldsRecord = record.fields || {};
      const assetEntry = localAssets[record.id] || localAssets[slugify(fieldsRecord["Nom"] || "")] || null;
      const remoteImages = Array.isArray(fieldsRecord["Imatges"])
        ? fieldsRecord["Imatges"].map((image, index) => ({
            url: image.thumbnails?.large?.url || image.url || "",
            fullUrl: image.url || "",
            alt: image.filename || fieldsRecord["Nom"] || "Imatge del producte",
            galleryCategories: classifyGalleryCategories(image.filename || image.url || "", fieldsRecord["Categoria"]?.name || fieldsRecord["Categoria"] || ""),
            index
          })).filter((image) => image.url)
        : [];

      const localImages = Array.isArray(assetEntry?.images)
        ? assetEntry.images.map((image, index) => ({
            url: image.path,
            fullUrl: image.path,
            alt: image.alt || fieldsRecord["Nom"] || "Imatge del producte",
            galleryCategories: image.galleryCategories || classifyGalleryCategories(image.path || image.url || image.alt, fieldsRecord["Categoria"]?.name || fieldsRecord["Categoria"] || ""),
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

function getAirtableSelectValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => item?.name || item).filter(Boolean).join(", ");
  }

  return value?.name || value || "";
}

async function fetchGalleryFromAirtable() {
  if (!isGalleryConfigured()) return [];

  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableId = process.env.AIRTABLE_GALLERY_TABLE_ID;
  const token = process.env.AIRTABLE_TOKEN;

  const response = await fetch(`https://api.airtable.com/v0/${baseId}/${tableId}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result?.error?.message || "No s'ha pogut llegir la galeria d'Airtable.");
  }

  return (result.records || [])
    .filter((record) => {
      const fieldsRecord = record.fields || {};
      return fieldsRecord["Actiu"] !== false;
    })
    .sort((a, b) => Number(a.fields?.Ordre || 9999) - Number(b.fields?.Ordre || 9999))
    .map((record) => {
      const fieldsRecord = record.fields || {};
      const title = fieldsRecord.Nom || fieldsRecord.Titol || fieldsRecord["Títol"] || "Galeria de Nati";
      const category = getAirtableSelectValue(fieldsRecord.Categoria) || "Altres";
      const attachments = fieldsRecord.Imatges || fieldsRecord.Fotos || fieldsRecord.Foto || fieldsRecord.Imatge || [];

      return {
        id: record.id,
        nom: title,
        slug: slugify(title || record.id),
        categoria: category,
        descripcioCurta: fieldsRecord.Descripcio || fieldsRecord["Descripció"] || "",
        source: "airtable-gallery",
        imatges: Array.isArray(attachments)
          ? attachments.map((image, index) => ({
              url: image.thumbnails?.large?.url || image.url || "",
              fullUrl: image.url || "",
              alt: image.filename || title || "Imatge de galeria",
              galleryCategories: [category],
              index
            })).filter((image) => image.url)
          : []
      };
    })
    .filter((item) => item.imatges.length > 0);
}

async function fetchProductById(productId) {
  const products = await fetchProductsFromAirtable();
  return products.find((product) => product.id === productId || product.slug === productId) || null;
}

function buildInstagramFallbackPosts(products = []) {
  return products
    .flatMap((product) => (product.imatges || []).slice(0, 1).map((image, index) => ({
      id: `${product.id}-${index}`,
      shortcode: "",
      permalink: `https://www.instagram.com/${getInstagramUsername()}/`,
      embedUrl: "",
      caption: product.nom || "Nati Dolcos i Festa",
      mediaType: "fallback",
      thumbnailUrl: image.url || "",
      timestamp: ""
    })))
    .slice(0, 6);
}

function normaliseInstagramNode(node) {
  if (!node?.shortcode) return null;

  const isReel = node.product_type === "clips" || node.__typename === "XDTGraphVideo";
  const postPath = isReel ? "reel" : "p";
  const permalink = `https://www.instagram.com/${postPath}/${node.shortcode}/`;

  return {
    id: node.id || node.shortcode,
    shortcode: node.shortcode,
    permalink,
    embedUrl: `${permalink}embed/captioned/`,
    caption: node.edge_media_to_caption?.edges?.[0]?.node?.text || "",
    mediaType: isReel ? "reel" : "post",
    thumbnailUrl: node.thumbnail_src || node.display_url || "",
    timestamp: node.taken_at_timestamp || ""
  };
}

async function fetchInstagramPosts(products = []) {
  const fallbackPosts = buildInstagramFallbackPosts(products);
  const username = getInstagramUsername();

  try {
    const response = await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "X-IG-App-ID": "936619743392459",
        Accept: "application/json"
      }
    });

    if (response.ok) {
      const result = await response.json();
      const edges =
        result?.data?.user?.edge_owner_to_timeline_media?.edges ||
        result?.user?.edge_owner_to_timeline_media?.edges ||
        [];

      const posts = edges
        .map((edge) => normaliseInstagramNode(edge?.node))
        .filter(Boolean)
        .slice(0, 6);

      if (posts.length > 0) {
        return posts;
      }
    }
  } catch {
    // Ignore and fall back to the local visual feed.
  }

  return fallbackPosts;
}

function buildSiteUrl(requestUrl) {
  if (process.env.SITE_URL) {
    return process.env.SITE_URL.replace(/\/$/, "");
  }

  const forwardedProto = requestUrl.headers?.["x-forwarded-proto"];
  const protocol = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  return `${protocol || requestUrl.protocol.replace(":", "")}://${requestUrl.host}`;
}

function buildPublicUrl(request) {
  if (process.env.SITE_URL) {
    return process.env.SITE_URL.replace(/\/$/, "");
  }

  const protocol = request.headers["x-forwarded-proto"] || "https";
  const host = request.headers["x-forwarded-host"] || request.headers.host || "www.nati.cat";
  return `${protocol}://${host}`.replace(/\/$/, "");
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

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    response.end();
    return;
  }

  if (request.method === "GET" && requestUrl.pathname.startsWith("/assets/")) {
    serveStaticAsset(requestUrl, response);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/robots.txt") {
    const siteUrl = buildPublicUrl(request);
    sendText(response, 200, [
      "User-agent: *",
      "Allow: /",
      `Sitemap: ${siteUrl}/sitemap.xml`,
      ""
    ].join("\n"));
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/sitemap.xml") {
    const siteUrl = buildPublicUrl(request);
    const routes = [
      { path: "/", priority: "1.0", changefreq: "weekly" },
      { path: "/checkout", priority: "0.4", changefreq: "monthly" }
    ];
    sendText(response, 200, [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...routes.flatMap((route) => [
        "  <url>",
        `    <loc>${siteUrl}${route.path}</loc>`,
        `    <changefreq>${route.changefreq}</changefreq>`,
        `    <priority>${route.priority}</priority>`,
        "  </url>"
      ]),
      "</urlset>",
      ""
    ].join("\n"), "application/xml; charset=utf-8");
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/llms.txt") {
    const siteUrl = buildPublicUrl(request);
    sendText(response, 200, [
      "# Nati Dolços i Festa",
      "",
      "Nati Dolços i Festa és un negoci local de Tortosa especialitzat en taules dolces, candy bar, decoració amb globus, photocalls, pastissos de xuxes, rams de xuxes, regals personalitzats i muntatges per a celebracions.",
      "",
      "Àrea de servei: Tortosa, Terres de l'Ebre i província de Tarragona.",
      "",
      "Serveis principals:",
      "- Taules dolces i candy bar per a comunions, bodes, bateigs, aniversaris i baby showers.",
      "- Decoració amb globus, arcs, garlandes, photocalls i ambientació d'espais.",
      "- Pastissos de xuxes, rams de xuxes i detalls dolços personalitzats.",
      "- Regals originals i sorpreses amb bitllets.",
      "",
      "URLs importants:",
      `- Web principal: ${siteUrl}/`,
      `- Sitemap: ${siteUrl}/sitemap.xml`,
      `- Catàleg i configuració pública: ${siteUrl}/api/config`,
      `- Galeria visual: ${siteUrl}/#galeria`,
      `- Contacte i pressupostos: ${siteUrl}/#contacte`,
      "",
      "Objectiu de la web: generar converses per WhatsApp, consultes de pressupost i reserves per a celebracions personalitzades.",
      ""
    ].join("\n"));
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
      const gallery = await fetchGalleryFromAirtable();
      const instagramPosts = await fetchInstagramPosts(products);
      sendJson(response, 200, {
        whatsappNumber: process.env.WHATSAPP_NUMBER || "",
        contactSummary: process.env.CONTACT_SUMMARY || "",
        gaMeasurementId: process.env.GA_MEASUREMENT_ID || "",
        googleSiteVerification: process.env.GOOGLE_SITE_VERIFICATION || "",
        instagramUsername: getInstagramUsername(),
        instagramPosts,
        checkoutEnabled: isStripeConfigured(),
        gallery,
        products
      });
    } catch (error) {
      sendJson(response, 200, {
        instagramUsername: getInstagramUsername(),
        instagramPosts: [],
        whatsappNumber: process.env.WHATSAPP_NUMBER || "",
        contactSummary: process.env.CONTACT_SUMMARY || "",
        gaMeasurementId: process.env.GA_MEASUREMENT_ID || "",
        googleSiteVerification: process.env.GOOGLE_SITE_VERIFICATION || "",
        checkoutEnabled: isStripeConfigured(),
        gallery: [],
        products: [],
        warning: error.message || "No s'ha pogut carregar el cataleg."
      });
    }
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      airtableConfigured: isConfigured(),
      stripeConfigured: isStripeConfigured(),
      galleryConfigured: isGalleryConfigured(),
      siteUrl: buildPublicUrl(request)
    });
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
              email: body.email,
              quantitat: body.quantitat,
              notes: body.notes,
              paymentStatus: "lead-only"
            },
            product
          )
        );
        const recordId = leadOnlyResponse.records?.[0]?.id || null;

        sendJson(response, 201, {
          ok: true,
          leadOnly: true,
          id: recordId
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
            email: body.email,
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

if (!process.env.VERCEL) {
  server.listen(PORT, () => {
    console.log(`Nati web disponible a http://localhost:${PORT}`);
  });
}

module.exports = server;
