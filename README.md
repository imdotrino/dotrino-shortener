# @dotrino/shortener

Acortador de enlaces del ecosistema **Dotrino**. Cloudflare Worker + KV.
Autohospedado, sin terceros (filosofía Dotrino: tu información, bajo tus reglas).
Enlaces de marca tipo `s.dotrino.com/abc123`.

## Endpoints

- `GET /<code>` → 302 al destino guardado.
- `POST /api/shorten` (header `Authorization: Bearer <SHORTENER_KEY>`)
  body `{ "url": "https://…", "code": "opcional" }` → `{ ok, code, short }`.
- `GET /` → UI mínima (admin: pegar clave + URL).

## Deploy

1. **KV**: `npx wrangler kv namespace create LINKS` y pega el `id` en `wrangler.toml`
   (`[[kv_namespaces]].id`).
2. **Secret**: `npx wrangler secret put SHORTENER_KEY` (clave fuerte; la usa el bot
   de posts y la UI admin).
3. **Deploy**: `npx wrangler deploy`.
4. **Dominio** `s.dotrino.com`: en el dashboard de Cloudflare → Workers →
   `dotrino-shortener` → Settings → Domains & Routes → Add Custom Domain →
   `s.dotrino.com` (sobreescribe el wildcard `*.dotrino.com`→GitHub). Si usas otro
   subdominio, ajusta `BASE_URL` en `wrangler.toml`.

## Uso desde scripts (p. ej. el bot social)

```sh
curl -X POST https://s.dotrino.com/api/shorten \
  -H "Authorization: Bearer $SHORTENER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://themarkup.org/privacy/2021/12/06/..."}'
# -> {"ok":true,"code":"a1B2c3","short":"https://s.dotrino.com/a1B2c3"}
```

## Uso en share buttons (y DOS reglas)

Muchas apps tienen botones de "compartir" que generan URLs largas (con data
adicional). Pueden acortarse con este servicio para enlaces cortos de marca. Pero:

1. **Auth = server-side.** La API exige `SHORTENER_KEY`. Úsala desde scripts,
   workers o el bot. En un share button **client-side NO** embebas la key (se
   expone y cualquiera abusaría del acortador). Para client-side falta auth por
   **firma del vault** (identity-gated, igual que `@dotrino/feedback` verifica
   firmas server-side) o un endpoint público con rate-limit — **pendiente**.

2. **Privacidad.** Acortar **guarda la URL completa en KV (servidor)**. Si el
   share link lleva **contenido de usuario en el `#fragment`** (`#room=`, `#rm=`,
   pronósticos, perfiles…), ese contenido **llega al servidor** y contradice la
   regla del ecosistema "el `#fragment` nunca llega al servidor". Acorta libremente
   links **públicos** (noticias, marketing, landing de apps); para share links con
   datos de usuario es un trade-off consciente (compartir es consensuado + TTL
   corto) o **no los acortes** (deja el `#fragment` client-side).
