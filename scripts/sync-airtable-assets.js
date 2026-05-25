const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const ENV_PATH = path.join(ROOT, ".env");
const OUTPUT_DIR = path.join(ROOT, "assets", "products");
const MANIFEST_PATH = path.join(OUTPUT_DIR, "manifest.json");

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

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function ensureOutputDir() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function fetchProducts() {
  const fields = ["Nom", "Imatges", "Actiu", "Ordre"];
  const params = new URLSearchParams();
  fields.forEach((field) => params.append("fields[]", field));
  params.append("sort[0][field]", "Ordre");
  params.append("sort[0][direction]", "asc");

  const response = await fetch(
    `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_PRODUCTS_TABLE_ID}?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`
      }
    }
  );

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result?.error?.message || "No s'han pogut llegir els productes.");
  }

  return result.records || [];
}

async function downloadImage(url, destinationPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`No s'ha pogut descarregar ${url}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  fs.writeFileSync(destinationPath, Buffer.from(arrayBuffer));
}

async function main() {
  if (!process.env.AIRTABLE_TOKEN || !process.env.AIRTABLE_BASE_ID || !process.env.AIRTABLE_PRODUCTS_TABLE_ID) {
    throw new Error("Falta configurar Airtable al fitxer .env.");
  }

  ensureOutputDir();
  const records = await fetchProducts();
  const manifest = {};

  for (const record of records) {
    const fields = record.fields || {};
    if (fields["Actiu"] === false) continue;

    const productSlug = slugify(fields["Nom"] || record.id);
    const images = Array.isArray(fields["Imatges"]) ? fields["Imatges"] : [];
    const manifestImages = [];

    for (let index = 0; index < images.length; index += 1) {
      const image = images[index];
      const extension = path.extname(image.filename || image.url || "").split("?")[0] || ".jpg";
      const fileName = `${productSlug}-${String(index + 1).padStart(2, "0")}${extension}`;
      const destinationPath = path.join(OUTPUT_DIR, fileName);

      await downloadImage(image.url, destinationPath);

      manifestImages.push({
        path: `/assets/products/${fileName}`,
        alt: image.filename || fields["Nom"] || "Imatge del producte"
      });
    }

    manifest[record.id] = {
      slug: productSlug,
      images: manifestImages
    };
  }

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`Imatges sincronitzades a ${OUTPUT_DIR}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
