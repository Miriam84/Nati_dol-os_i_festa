# Web de Nati connectada a Airtable

## Que inclou

- Landing orientada a conversio per a Nati Dolcos i Festa
- Productes i galeria carregats des d'Airtable
- Checkout curt i formulari detallat
- Enviament segur a Airtable des del servidor, sense exposar el token al navegador
- Preparacio per Stripe, Google Analytics i Search Console

## Fitxers

- `index.html`: landing, checkout i SEO
- `server.js`: servidor Node i integracio amb Airtable
- `scripts/sync-airtable-assets.js`: descarrega imatges d'Airtable a `assets/products`
- `.env.example`: exemple de configuracio

## Com arrancar

1. Copia `.env.example` a `.env`
2. Ompli:
   - `AIRTABLE_TOKEN`
   - `AIRTABLE_BASE_ID`
   - `AIRTABLE_LEADS_TABLE_ID`
   - `AIRTABLE_PRODUCTS_TABLE_ID`
   - `WHATSAPP_NUMBER`
   - `CONTACT_SUMMARY`
   - `STRIPE_SECRET_KEY` si vols activar pagament directe
   - `SITE_URL`
   - `GA_MEASUREMENT_ID` si vols Analytics
   - `GOOGLE_SITE_VERIFICATION` si vols Search Console
3. Executa:

```powershell
npm run sync:assets
npm start
```

4. Obri `http://localhost:3000`

## GitHub

- `.env` esta ignorat per Git i no s'ha de pujar mai
- abans de pujar el repo, revisa que no hi haja cap credencial real en fitxers de mostra
- `assets/products/` es pot versionar si vols mantindre les imatges locals al repo

## Activar pagament directe

Per activar el checkout real amb Stripe:

1. Crea o prepara el compte de Stripe
2. Afig a `.env`:

```env
STRIPE_SECRET_KEY=sk_live_o_sk_test_...
SITE_URL=https://el-teu-domini.com
```

3. Reinicia el servidor
4. Prova una reserva des de `/checkout`

## Camps que crea a Airtable

La configuracio actual esta pensada per a la base `Nati - Dolços i Festa`:

- Base: `app3aUIyZbyJtDc5E`
- Taula de leads: `tblORiw4onOV0rfv2` (`Leads i consultes`)
- Taula de productes: `tblzTpXfOMrEne9jA` (`Productes i serveis`)

La web escriu en aquests camps de `Leads i consultes`:

- `Nom del client`
- `Contacte`
- `Email`
- `Servei`
- `Data`
- `Hora`
- `Modalitat`
- `Zona`
- `Lloc`
- `Tema o colors`
- `Missatge`

La web llig aquests camps de `Productes i serveis`:

- `Nom`
- `Categoria`
- `Descripcio curta`
- `Preu orientatiu`
- `Actiu`
- `Ordre`
