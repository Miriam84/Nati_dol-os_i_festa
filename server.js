const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT || 3000);
const MAX_HEADER_SIZE = Number(process.env.MAX_HEADER_SIZE || 65536);
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

function escapeHtmlAttribute(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeHtml(value) {
  return escapeHtmlAttribute(value).replaceAll("'", "&#39;");
}

function absoluteUrl(siteUrl, url) {
  const value = String(url || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `${siteUrl}/${value.replace(/^\/+/, "")}`;
}

function getImageExtension(url, fallback = "jpg") {
  const cleanUrl = String(url || "").split("?")[0];
  const extension = path.extname(cleanUrl).replace(".", "").toLowerCase();
  if (["jpg", "jpeg", "png", "webp", "gif", "svg"].includes(extension)) {
    return extension === "jpeg" ? "jpg" : extension;
  }
  return fallback;
}

function getCategorySlugFromLabel(category) {
  const normalised = normaliseText(category);
  const match = galleryCategoryPages.find((item) => matchesGalleryCategory(normalised, item));
  return match?.slug || slugify(category || "galeria");
}

function buildImageSeoAlt({ item, image, categoryLabel }) {
  const base = image?.alt && !/^image|img|foto|whatsapp/i.test(image.alt)
    ? image.alt
    : item?.nom || categoryLabel || "Imatge de Nati Dolços i Festa";
  const category = categoryLabel || item?.categoria || "celebració";
  return `${base} - ${category} a Tortosa, les Terres de l'Ebre i Tarragona`;
}

function buildStableImagePath({ item, image, categoryLabel, index }) {
  const categorySlug = getCategorySlugFromLabel(categoryLabel || item?.categoria || "galeria");
  const itemSlug = slugify(item?.nom || categoryLabel || "imatge");
  const extension = getImageExtension(image?.filename || image?.fullUrl || image?.url || "", "webp");
  return `/imatges/${categorySlug}/${itemSlug}-${String(index + 1).padStart(2, "0")}.${extension}`;
}

function decorateImageForSeo({ item, image, categoryLabel, index, siteUrl }) {
  const stablePath = buildStableImagePath({ item, image, categoryLabel, index });
  return {
    ...image,
    seoAlt: buildImageSeoAlt({ item, image, categoryLabel }),
    stablePath,
    stableUrl: `${siteUrl}${stablePath}`
  };
}

function buildPageHtml(html, request, pathname) {
  const siteUrl = buildPublicUrl(request);
  const canonicalUrl = `${siteUrl}${pathname === "/checkout" ? "/checkout" : "/"}`;
  const robotsContent = pathname === "/checkout"
    ? "noindex,follow"
    : "index,follow,max-image-preview:large";
  const verificationCode = process.env.GOOGLE_SITE_VERIFICATION || "";

  return html
    .replace(
      /<meta name="robots" content="[^"]*" \/>/,
      `<meta name="robots" content="${robotsContent}" />`
    )
    .replace(
      /<link rel="canonical" href="[^"]*" id="canonical-link" \/>/,
      `<link rel="canonical" href="${escapeHtmlAttribute(canonicalUrl)}" id="canonical-link" />`
    )
    .replace(
      /<meta property="og:url" content="[^"]*" id="og-url" \/>/,
      `<meta property="og:url" content="${escapeHtmlAttribute(canonicalUrl)}" id="og-url" />`
    )
    .replace(
      /<meta name="google-site-verification" content="[^"]*" id="google-site-verification" \/>/,
      `<meta name="google-site-verification" content="${escapeHtmlAttribute(verificationCode)}" id="google-site-verification" />`
    );
}

function buildProductPageHtml({ product, products, request }) {
  const siteUrl = buildPublicUrl(request);
  const productUrl = `${siteUrl}/producte/${encodeURIComponent(product.slug)}`;
  const image = product.imatges?.[0] || null;
  const decoratedImage = image ? decorateImageForSeo({
    item: product,
    image,
    categoryLabel: product.categoria || "Producte",
    index: 0,
    siteUrl
  }) : null;
  const imageUrl = decoratedImage?.stableUrl || "";
  const title = `${product.nom} | Nati Dolços i Festa a Tortosa i Tarragona`;
  const description = product.descripcioCurta
    || `${product.nom} personalitzat per a celebracions a Tortosa, les Terres de l'Ebre i la província de Tarragona.`;
  const price = Number(product.preuOrientatiu || 0);
  const checkoutUrl = `${siteUrl}/checkout?product=${encodeURIComponent(product.id)}&name=${encodeURIComponent(product.nom)}`;
  const whatsappText = encodeURIComponent(`Hola Nati, vull informació sobre ${product.nom}.`);
  const whatsappUrl = `https://wa.me/${process.env.WHATSAPP_NUMBER || "34626685034"}?text=${whatsappText}`;
  const relatedProducts = products
    .filter((item) => item.id !== product.id)
    .slice(0, 4);
  const structuredData = {
    "@context": "https://schema.org",
    "@type": price ? "Product" : "Service",
    name: product.nom,
    description,
    image: imageUrl ? [imageUrl] : undefined,
    url: productUrl,
    category: product.categoria || undefined,
    areaServed: ["Tortosa", "Terres de l'Ebre", "Província de Tarragona"],
    brand: {
      "@type": "Brand",
      name: "Nati Dolços i Festa"
    },
    offers: price ? {
      "@type": "Offer",
      priceCurrency: "EUR",
      price,
      availability: "https://schema.org/InStock",
      url: checkoutUrl
    } : undefined,
    provider: {
      "@type": "LocalBusiness",
      name: "Nati Dolços i Festa",
      telephone: `+${process.env.WHATSAPP_NUMBER || "34626685034"}`,
      address: {
        "@type": "PostalAddress",
        streetAddress: "Carrer de Verges Pauli, 18",
        addressLocality: "Tortosa",
        addressRegion: "Tarragona",
        postalCode: "43500",
        addressCountry: "ES"
      }
    }
  };

  return `<!DOCTYPE html>
<html lang="ca">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtmlAttribute(description)}" />
  <meta name="robots" content="index,follow,max-image-preview:large" />
  <link rel="canonical" href="${escapeHtmlAttribute(productUrl)}" />
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml" />
  <meta property="og:type" content="product" />
  <meta property="og:title" content="${escapeHtmlAttribute(title)}" />
  <meta property="og:description" content="${escapeHtmlAttribute(description)}" />
  <meta property="og:url" content="${escapeHtmlAttribute(productUrl)}" />
  ${imageUrl ? `<meta property="og:image" content="${escapeHtmlAttribute(imageUrl)}" />` : ""}
  <meta name="google-site-verification" content="${escapeHtmlAttribute(process.env.GOOGLE_SITE_VERIFICATION || "")}" />
  <script type="application/ld+json">${JSON.stringify(structuredData).replace(/</g, "\\u003c")}</script>
  <style>
    :root{--pink:#e95b83;--cream:#fff7ef;--choco:#4b2f2f;--muted:#7a6767;--gold:#d8a657;--mint:#b9ead7;--white:#fff;--shadow:0 18px 45px rgba(75,47,47,.12)}
    *{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--choco);background:linear-gradient(135deg,#fff7ef,#fff)}
    a{color:inherit}.nav{max-width:1180px;margin:0 auto;padding:24px;display:flex;align-items:center;justify-content:space-between;gap:18px}.logo{display:flex;align-items:center;gap:12px;text-decoration:none;font-weight:900;font-size:24px}.logo img{width:46px;height:46px;border-radius:14px;box-shadow:var(--shadow)}
    .btn{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:15px 24px;text-decoration:none;font-weight:900;border:0}.primary{background:var(--pink);color:white;box-shadow:0 16px 34px rgba(233,91,131,.25)}.secondary{background:white;border:1px solid rgba(75,47,47,.14)}
    main{max-width:1180px;margin:0 auto;padding:28px 24px 70px}.hero{display:grid;grid-template-columns:1.05fr .95fr;gap:34px;align-items:center}.eyebrow{color:#9a6a25;text-transform:uppercase;letter-spacing:.08em;font-weight:900;font-size:13px}h1{font-size:clamp(42px,6vw,78px);line-height:.94;margin:16px 0}p{font-size:20px;line-height:1.65;color:var(--muted)}
    .panel{background:white;border-radius:32px;box-shadow:var(--shadow);overflow:hidden}.panel img{width:100%;height:min(520px,58vw);object-fit:cover;display:block}.content{padding:32px}.meta{display:flex;flex-wrap:wrap;gap:12px;margin:18px 0}.tag{background:#fff1de;color:#8a5d1e;border-radius:999px;padding:8px 13px;font-weight:900}.price{color:var(--pink);font-weight:950;font-size:24px}
    .actions{display:flex;flex-wrap:wrap;gap:14px;margin-top:26px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-top:42px}.card{background:white;border-radius:22px;padding:18px;text-decoration:none;box-shadow:0 12px 30px rgba(75,47,47,.08)}.card strong{display:block;margin-bottom:8px}.foot{padding:28px;text-align:center;color:var(--muted)}
    @media(max-width:820px){.nav{align-items:flex-start}.hero,.grid{grid-template-columns:1fr}h1{font-size:44px}.panel img{height:340px}.actions .btn{width:100%}}
  </style>
</head>
<body>
  <header class="nav">
    <a class="logo" href="/"><img src="/assets/favicon.svg" alt="" /><span>Nati Dolços i Festa</span></a>
    <a class="btn primary" href="${escapeHtmlAttribute(whatsappUrl)}" target="_blank" rel="noopener">WhatsApp</a>
  </header>
  <main>
    <section class="hero">
      <div>
        <span class="eyebrow">${escapeHtml(product.categoria || "Celebracions personalitzades")}</span>
        <h1>${escapeHtml(product.nom)}</h1>
        <p>${escapeHtml(description)}</p>
        ${product.opcions ? `<p>${escapeHtml(product.opcions)}</p>` : ""}
        <div class="meta">
          <span class="tag">Tortosa</span>
          <span class="tag">Terres de l'Ebre</span>
          <span class="tag">Tarragona</span>
          <span class="price">${price ? `Des de ${escapeHtml(price)} EUR` : "A pressupost"}</span>
        </div>
        <div class="actions">
          <a class="btn primary" href="${escapeHtmlAttribute(checkoutUrl)}">Reservar o demanar pressupost</a>
          <a class="btn secondary" href="${escapeHtmlAttribute(whatsappUrl)}" target="_blank" rel="noopener">Consultar per WhatsApp</a>
        </div>
      </div>
      <article class="panel">
        ${imageUrl ? `<img src="${escapeHtmlAttribute(imageUrl)}" alt="${escapeHtmlAttribute(decoratedImage?.seoAlt || product.nom)}" />` : ""}
        <div class="content">
          <strong>Servei local i personalitzat</strong>
          <p>Preparem cada proposta segons la data, l'espai, la temàtica, els colors i el tipus de celebració.</p>
        </div>
      </article>
    </section>
    <section>
      <h2>Altres idees per a la teua celebració</h2>
      <div class="grid">
        ${relatedProducts.map((item) => `<a class="card" href="/producte/${encodeURIComponent(item.slug)}"><strong>${escapeHtml(item.nom)}</strong><span>${escapeHtml(item.categoria || "Nati Dolços i Festa")}</span></a>`).join("")}
      </div>
    </section>
  </main>
  <footer class="foot">© 2026 Nati Dolços i Festa · Web creada per ONIX - onixdigital.pro</footer>
</body>
</html>`;
}

const galleryCategoryPages = [
  {
    slug: "taules-dolces",
    label: "Taules dolces",
    title: "Fotos de taules dolces i candy bar a Tortosa i Tarragona",
    description: "Galeria de taules dolces, candy bar i muntatges per a comunions, bodes, bateigs, aniversaris i celebracions a Tortosa, les Terres de l'Ebre i Tarragona.",
    aliases: ["taula dolca", "taules dolces", "candy bar", "sweet", "esdeveniments", "comunions", "bodes"]
  },
  {
    slug: "globus-decoracio",
    label: "Globus i decoració",
    title: "Decoració amb globus, photocall i ambientació a Tarragona",
    description: "Idees reals de decoració amb globus, photocalls, baby showers, aniversaris i muntatges visuals per a festes a Tortosa i Tarragona.",
    aliases: ["globus", "decoracio", "decoració", "photocall", "ambientacio", "ambientació"]
  },
  {
    slug: "pastissos-xuxes",
    label: "Pastissos de xuxes",
    title: "Pastissos de xuxes personalitzats a Tortosa",
    description: "Galeria de pastissos de xuxes personalitzats per a aniversaris, comunions, regals i celebracions especials a les Terres de l'Ebre.",
    aliases: ["pastis", "pastís", "pastissos", "xuxes", "xuxes personalitzades"]
  },
  {
    slug: "regals-detalls",
    label: "Regals i detalls",
    title: "Rams de xuxes, regals originals i detalls personalitzats",
    description: "Idees de rams de xuxes, regals dolços, sorpreses i detalls personalitzats per regalar a Tortosa i Tarragona.",
    aliases: ["regals", "detalls", "ram", "sorpreses"]
  }
];

function normaliseText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function matchesGalleryCategory(category, config) {
  const value = normaliseText(category);
  return config.aliases.some((alias) => value.includes(normaliseText(alias)));
}

function flattenGalleryImages(items = [], categoryConfig = null) {
  return items.flatMap((item) => (item.imatges || []).map((image) => ({
    item,
    image,
    categories: Array.isArray(image.galleryCategories) && image.galleryCategories.length > 0
      ? image.galleryCategories
      : classifyGalleryCategories(image.url || image.fullUrl || image.alt, item.categoria || "")
  }))).filter(({ item, categories }) => {
    if (!categoryConfig) return true;
    return matchesGalleryCategory(item.categoria, categoryConfig)
      || categories.some((category) => matchesGalleryCategory(category, categoryConfig));
  });
}

async function getAllImageEntriesForSeo(request) {
  const siteUrl = buildPublicUrl(request);
  let products = [];
  let gallery = [];

  try {
    products = await fetchProductsFromAirtable();
  } catch {
    products = readFallbackProducts();
  }

  try {
    gallery = await fetchGalleryFromAirtable();
  } catch {
    gallery = [];
  }

  return flattenGalleryImages([...gallery, ...products]).map((entry, index) => {
    const categoryLabel = entry.categories?.[0] || entry.item?.categoria || "Galeria";
    return {
      ...entry,
      image: decorateImageForSeo({
        item: entry.item,
        image: entry.image,
        categoryLabel,
        index: Number.isFinite(Number(entry.image?.index)) ? Number(entry.image.index) : index,
        siteUrl
      })
    };
  });
}

async function findStableImageByPath(request, pathname) {
  const requestedPath = decodeURIComponent(pathname);
  const entries = await getAllImageEntriesForSeo(request);
  return entries.find((entry) => entry.image.stablePath === requestedPath) || null;
}

async function sendStableImage(request, response, pathname) {
  const entry = await findStableImageByPath(request, pathname);
  if (!entry) {
    sendJson(response, 404, { error: "Imatge no trobada." });
    return;
  }

  const sourceUrl = entry.image.fullUrl || entry.image.url || "";
  if (!sourceUrl) {
    sendJson(response, 404, { error: "Origen de la imatge no trobat." });
    return;
  }

  if (!/^https?:\/\//i.test(sourceUrl)) {
    const filePath = safeJoin(ROOT, "/" + sourceUrl.replace(/^\/+/, ""));
    if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      sendJson(response, 404, { error: "Asset no trobat." });
      return;
    }

    response.writeHead(200, {
      "Content-Type": getMimeType(filePath),
      "Cache-Control": "public, max-age=86400"
    });
    fs.createReadStream(filePath).pipe(response);
    return;
  }

  const imageResponse = await fetch(sourceUrl);
  if (!imageResponse.ok) {
    sendJson(response, 502, { error: "No s'ha pogut carregar la imatge original." });
    return;
  }

  const contentType = imageResponse.headers.get("content-type") || `image/${getImageExtension(sourceUrl)}`;
  const buffer = Buffer.from(await imageResponse.arrayBuffer());
  response.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=86400"
  });
  response.end(buffer);
}

async function buildGalleryPageHtml({ categoryConfig, request }) {
  const siteUrl = buildPublicUrl(request);
  const pageUrl = `${siteUrl}/galeria/${categoryConfig.slug}`;
  let products = [];
  let gallery = [];

  try {
    products = await fetchProductsFromAirtable();
  } catch {
    products = readFallbackProducts();
  }

  try {
    gallery = await fetchGalleryFromAirtable();
  } catch {
    gallery = [];
  }

  const images = flattenGalleryImages([...gallery, ...products], categoryConfig)
    .map((entry, index) => ({
      ...entry,
      image: decorateImageForSeo({
        item: entry.item,
        image: entry.image,
        categoryLabel: categoryConfig.label,
        index: Number.isFinite(Number(entry.image?.index)) ? Number(entry.image.index) : index,
        siteUrl
      })
    }));
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "ImageGallery",
    name: categoryConfig.title,
    description: categoryConfig.description,
    url: pageUrl,
    about: categoryConfig.label,
    image: images.slice(0, 24).map(({ image }) => image.stableUrl)
  };

  return `<!DOCTYPE html>
<html lang="ca">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(categoryConfig.title)} | Nati Dolços i Festa</title>
  <meta name="description" content="${escapeHtmlAttribute(categoryConfig.description)}" />
  <meta name="robots" content="index,follow,max-image-preview:large" />
  <link rel="canonical" href="${escapeHtmlAttribute(pageUrl)}" />
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapeHtmlAttribute(categoryConfig.title)}" />
  <meta property="og:description" content="${escapeHtmlAttribute(categoryConfig.description)}" />
  <meta property="og:url" content="${escapeHtmlAttribute(pageUrl)}" />
  <meta name="google-site-verification" content="${escapeHtmlAttribute(process.env.GOOGLE_SITE_VERIFICATION || "")}" />
  <script type="application/ld+json">${JSON.stringify(structuredData).replace(/</g, "\\u003c")}</script>
  <style>
    :root{--pink:#e95b83;--cream:#fff7ef;--choco:#4b2f2f;--muted:#7a6767;--shadow:0 18px 45px rgba(75,47,47,.12)}
    *{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--cream);color:var(--choco)}a{color:inherit}.nav,main{max-width:1180px;margin:0 auto;padding:24px}.nav{display:flex;align-items:center;justify-content:space-between}.logo{display:flex;align-items:center;gap:12px;text-decoration:none;font-weight:900;font-size:24px}.logo img{width:46px;height:46px;border-radius:14px}.btn{display:inline-flex;border-radius:999px;background:var(--pink);color:#fff;text-decoration:none;font-weight:900;padding:14px 22px}
    h1{font-size:clamp(42px,6vw,76px);line-height:.96;margin:28px 0 14px}p{font-size:20px;line-height:1.65;color:var(--muted);max-width:850px}.filters{display:flex;gap:10px;flex-wrap:wrap;margin:26px 0}.pill{padding:10px 14px;border-radius:999px;background:#fff;text-decoration:none;font-weight:800;box-shadow:0 8px 22px rgba(75,47,47,.08)}.pill.active{background:var(--choco);color:#fff}
    .gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:26px}.photo{background:#fff;border-radius:28px;overflow:hidden;box-shadow:var(--shadow)}.photo img{width:100%;height:320px;object-fit:cover;display:block}.caption{padding:18px}.caption strong{display:block;font-size:18px}.caption span{color:var(--muted)}
    .empty{background:#fff;border-radius:24px;padding:30px}.foot{text-align:center;padding:30px;color:var(--muted)}
    @media(max-width:820px){.nav{align-items:flex-start}.gallery{grid-template-columns:1fr}.photo img{height:300px}h1{font-size:42px}}
  </style>
</head>
<body>
  <header class="nav">
    <a class="logo" href="/"><img src="/assets/favicon.svg" alt="" /><span>Nati Dolços i Festa</span></a>
    <a class="btn" href="/#contacte">Demanar pressupost</a>
  </header>
  <main>
    <span>${escapeHtml(categoryConfig.label)} · Tortosa · Terres de l'Ebre · Tarragona</span>
    <h1>${escapeHtml(categoryConfig.title)}</h1>
    <p>${escapeHtml(categoryConfig.description)}</p>
    <nav class="filters" aria-label="Categories de galeria">
      ${galleryCategoryPages.map((item) => `<a class="pill ${item.slug === categoryConfig.slug ? "active" : ""}" href="/galeria/${item.slug}">${escapeHtml(item.label)}</a>`).join("")}
    </nav>
    ${images.length > 0 ? `<section class="gallery">${images.map(({ item, image }, index) => {
      const imageUrl = image.stableUrl;
      const alt = image.seoAlt || `${categoryConfig.label} de Nati Dolços i Festa a Tortosa`;
      return `<article class="photo">
        <a href="${escapeHtmlAttribute(imageUrl)}" target="_blank" rel="noopener">
          <img src="${escapeHtmlAttribute(imageUrl)}" alt="${escapeHtmlAttribute(alt)}" loading="${index < 4 ? "eager" : "lazy"}" />
        </a>
        <div class="caption"><strong>${escapeHtml(item.nom || categoryConfig.label)}</strong><span>${escapeHtml(item.categoria || categoryConfig.label)}</span></div>
      </article>`;
    }).join("")}</section>` : `<div class="empty">Aquesta galeria s'està actualitzant. Torna prompte per veure noves imatges.</div>`}
  </main>
  <footer class="foot">© 2026 Nati Dolços i Festa · Web creada per ONIX - onixdigital.pro</footer>
</body>
</html>`;
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
            filename: image.filename || "",
            alt: image.filename || fieldsRecord["Nom"] || "Imatge del producte",
            galleryCategories: classifyGalleryCategories(image.filename || image.url || "", fieldsRecord["Categoria"]?.name || fieldsRecord["Categoria"] || ""),
            index
          })).filter((image) => image.url)
        : [];

      const localImages = Array.isArray(assetEntry?.images)
        ? assetEntry.images.map((image, index) => ({
            url: image.path,
            fullUrl: image.path,
            filename: image.filename || image.path || "",
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
              filename: image.filename || "",
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

const server = http.createServer({ maxHeaderSize: MAX_HEADER_SIZE }, async (request, response) => {
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

  if (request.method === "GET" && requestUrl.pathname.startsWith("/imatges/")) {
    await sendStableImage(request, response, requestUrl.pathname);
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
    const lastmod = new Date().toISOString().slice(0, 10);
    let products = [];
    let imageEntries = [];
    let productRoutes = [];

    try {
      products = await fetchProductsFromAirtable();
      productRoutes = products.map((product) => ({
        path: `/producte/${encodeURIComponent(product.slug)}`,
        priority: "0.8",
        changefreq: "weekly",
        images: (product.imatges || []).slice(0, 3).map((image, index) => decorateImageForSeo({
          item: product,
          image,
          categoryLabel: product.categoria || "Producte",
          index,
          siteUrl
        }))
      }));
    } catch {
      productRoutes = [];
    }

    try {
      imageEntries = await getAllImageEntriesForSeo(request);
    } catch {
      imageEntries = [];
    }

    const routes = [
      { path: "/", priority: "1.0", changefreq: "weekly" },
      ...galleryCategoryPages.map((category) => ({
        path: `/galeria/${category.slug}`,
        priority: "0.75",
        changefreq: "weekly",
        images: imageEntries
          .filter((entry) => matchesGalleryCategory(entry.item?.categoria, category) || entry.categories.some((itemCategory) => matchesGalleryCategory(itemCategory, category)))
          .slice(0, 30)
          .map((entry) => entry.image)
      })),
      ...productRoutes
    ];
    sendText(response, 200, [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
      ...routes.flatMap((route) => [
        "  <url>",
        `    <loc>${escapeHtml(siteUrl + route.path)}</loc>`,
        `    <lastmod>${lastmod}</lastmod>`,
        `    <changefreq>${route.changefreq}</changefreq>`,
        `    <priority>${route.priority}</priority>`,
        ...(route.images || []).flatMap((image) => [
          "    <image:image>",
          `      <image:loc>${escapeHtml(image.stableUrl)}</image:loc>`,
          `      <image:title>${escapeHtml(image.seoAlt || "Nati Dolços i Festa")}</image:title>`,
          "    </image:image>"
        ]),
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
      `- Galeria de taules dolces: ${siteUrl}/galeria/taules-dolces`,
      `- Galeria de globus i decoració: ${siteUrl}/galeria/globus-decoracio`,
      `- Galeria de pastissos de xuxes: ${siteUrl}/galeria/pastissos-xuxes`,
      `- Galeria de regals i detalls: ${siteUrl}/galeria/regals-detalls`,
      `- Catàleg i configuració pública: ${siteUrl}/api/config`,
      `- Galeria visual: ${siteUrl}/#galeria`,
      `- Contacte i pressupostos: ${siteUrl}/#contacte`,
      "",
      "Objectiu de la web: generar converses per WhatsApp, consultes de pressupost i reserves per a celebracions personalitzades.",
      ""
    ].join("\n"));
    return;
  }

  if (request.method === "GET" && requestUrl.pathname.startsWith("/producte/")) {
    const slug = decodeURIComponent(requestUrl.pathname.replace(/^\/producte\//, "").replace(/\/$/, ""));
    const products = await fetchProductsFromAirtable();
    const product = products.find((item) => item.slug === slug || item.id === slug);

    if (!product) {
      sendJson(response, 404, { error: "Producte no trobat." });
      return;
    }

    sendHtml(response, 200, buildProductPageHtml({ product, products, request }));
    return;
  }

  if (request.method === "GET" && requestUrl.pathname.startsWith("/galeria/")) {
    const slug = decodeURIComponent(requestUrl.pathname.replace(/^\/galeria\//, "").replace(/\/$/, ""));
    const categoryConfig = galleryCategoryPages.find((item) => item.slug === slug);

    if (!categoryConfig) {
      sendJson(response, 404, { error: "Galeria no trobada." });
      return;
    }

    sendHtml(response, 200, await buildGalleryPageHtml({ categoryConfig, request }));
    return;
  }

  if (request.method === "GET" && (requestUrl.pathname === "/" || requestUrl.pathname === "/checkout")) {
    const html = fs.readFileSync(INDEX_PATH, "utf8");
    sendHtml(response, 200, buildPageHtml(html, request, requestUrl.pathname));
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/config") {
    try {
      const products = await fetchProductsFromAirtable();
      let gallery = [];
      let galleryWarning = "";

      try {
        gallery = await fetchGalleryFromAirtable();
      } catch (galleryError) {
        galleryWarning = galleryError.message || "No s'ha pogut carregar la galeria d'Airtable.";
      }

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
        products,
        galleryWarning
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
