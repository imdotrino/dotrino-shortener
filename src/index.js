/**
 * dotrino-shortener — acortador de enlaces del ecosistema Dotrino (Cloudflare Worker + KV).
 *
 * Autohospedado, sin terceros (filosofía Dotrino). Pensado para acortar enlaces de
 * marca tipo `s.dotrino.com/abc123` (p. ej. las fuentes de noticias que cita el bot
 * de posts), reutilizable por cualquier app del ecosistema.
 *
 *   GET  /<code>        -> 302 al destino guardado en KV.
 *   POST /api/shorten   -> { url, code? }  (Bearer SHORTENER_KEY)  -> { ok, code, short }
 *   GET  /              -> UI mínima (admin: pega tu clave + la URL).
 *
 * Binding KV:  LINKS   (code -> JSON { url, ts })
 * Vars:        BASE_URL (p. ej. "https://s.dotrino.com")
 * Secret:      SHORTENER_KEY  (wrangler secret put SHORTENER_KEY)
 */

const BASE62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
const RESERVED = new Set(['api', 'favicon.ico', 'robots.txt', ''])

function genCode(n = 6) {
  const b = crypto.getRandomValues(new Uint8Array(n))
  let s = ''
  for (const x of b) s += BASE62[x % 62]
  return s
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = url.pathname

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() })
    if (path === '/' || path === '') return html(UI(env), 200)
    if (path === '/robots.txt') return new Response('User-agent: *\nDisallow: /', { status: 200, headers: { 'content-type': 'text/plain' } })
    if (path === '/api/shorten') {
      if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)
      return shorten(request, env, url.origin)
    }

    // Redirección: /<code>
    const code = path.replace(/^\/+/, '').replace(/[^0-9A-Za-z_-]/g, '')
    if (RESERVED.has(code)) return new Response('Not found', { status: 404 })
    if (!env.LINKS) return new Response('not_configured', { status: 500 })
    const rec = await env.LINKS.get(code)
    if (!rec) return html(NOTFOUND, 404)
    let dest
    try { dest = JSON.parse(rec).url } catch { dest = rec }
    if (!/^https?:\/\//i.test(dest)) return new Response('bad_target', { status: 500 })
    return Response.redirect(dest, 302)
  },
}

async function shorten(request, env, origin) {
  if (!env.LINKS) return json({ ok: false, error: 'not_configured' }, 500, cors())
  const auth = request.headers.get('Authorization') || ''
  const key = auth.replace(/^Bearer\s+/i, '').trim() || request.headers.get('x-api-key') || ''
  if (!env.SHORTENER_KEY || key !== env.SHORTENER_KEY) return json({ ok: false, error: 'unauthorized' }, 401, cors())

  let body
  try { body = await request.json() } catch { return json({ ok: false, error: 'bad_json' }, 400, cors()) }
  const target = String(body.url || '').trim()
  if (!/^https?:\/\/.+/i.test(target) || target.length > 2048) return json({ ok: false, error: 'bad_url' }, 400, cors())

  let code = String(body.code || '').replace(/[^0-9A-Za-z_-]/g, '').slice(0, 32)
  if (code) {
    if (RESERVED.has(code)) return json({ ok: false, error: 'code_reserved' }, 409, cors())
    if (await env.LINKS.get(code)) return json({ ok: false, error: 'code_taken' }, 409, cors())
  } else {
    for (let i = 0; i < 6; i++) { code = genCode(6); if (!(await env.LINKS.get(code))) break }
  }
  await env.LINKS.put(code, JSON.stringify({ url: target, ts: Date.now() }))
  const base = (env.BASE_URL || origin).replace(/\/+$/, '')
  return json({ ok: true, code, short: `${base}/${code}` }, 200, cors())
}

/* ───────── helpers ───────── */
const cors = () => ({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
})
const json = (obj, status, headers = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { ...headers, 'content-type': 'application/json' } })
const html = (body, status) => new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } })

const NOTFOUND = `<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex">
<title>Enlace no encontrado — Dotrino</title>
<body style="font-family:'Quicksand',system-ui,sans-serif;background:#f4f7f9;color:#181c1e;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">
<div style="text-align:center"><h1 style="color:#00658c">Enlace no encontrado</h1><p>Este enlace corto no existe o expiró. <a href="https://dotrino.com" style="color:#00658c">Ir a Dotrino</a></p></div>`

const UI = (env) => `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Acortador — Dotrino</title>
<style>
  :root{color-scheme:light}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f4f7f9;color:#181c1e;font-family:'Quicksand',system-ui,-apple-system,Segoe UI,sans-serif;padding:1.2rem}
  .card{background:#fff;border:1px solid #e3e9ed;border-radius:20px;box-shadow:0 14px 40px rgba(74,85,96,.08);padding:1.8rem;width:100%;max-width:30rem}
  h1{font-size:1.3rem;margin:0 0 .3rem;color:#181c1e}
  p.sub{margin:0 0 1.3rem;color:#4a5560;font-size:.95rem}
  label{display:block;font-size:.85rem;color:#4a5560;margin:.8rem 0 .3rem;font-weight:600}
  input{width:100%;padding:.7rem .9rem;border:1px solid #cfd8de;border-radius:12px;font:inherit;background:#f1f4f6;color:#181c1e}
  button{margin-top:1.2rem;width:100%;padding:.8rem;border:0;border-radius:999px;background:#00658c;color:#fff;font:inherit;font-weight:700;cursor:pointer}
  button:hover{background:#00506f}
  .out{margin-top:1rem;padding:.8rem 1rem;border-radius:12px;background:#e6f4ea;border:1px solid #b6e0c2;color:#1a7a3a;font-weight:600;word-break:break-all;display:none}
  .err{background:#fdecea;border-color:#f3c0bb;color:#b3261e}
  a{color:#00658c}
</style></head>
<body><div class="card">
  <h1>Acortador de Dotrino</h1>
  <p class="sub">Enlaces cortos propios, sin terceros. Tu información, bajo tus reglas.</p>
  <label for="url">URL larga</label>
  <input id="url" type="url" placeholder="https://ejemplo.com/articulo-muy-largo" autocomplete="off">
  <label for="code">Código personalizado (opcional)</label>
  <input id="code" type="text" placeholder="mi-enlace" autocomplete="off">
  <label for="key">Clave de acortado</label>
  <input id="key" type="password" placeholder="SHORTENER_KEY" autocomplete="off">
  <button id="go">Acortar</button>
  <div class="out" id="out"></div>
</div>
<script>
  const $=(id)=>document.getElementById(id)
  $('key').value = localStorage.getItem('dotrino_short_key') || ''
  $('go').onclick = async () => {
    const url=$('url').value.trim(), code=$('code').value.trim(), key=$('key').value.trim()
    const out=$('out'); out.style.display='block'; out.className='out'
    if(!/^https?:\\/\\//i.test(url)){ out.className='out err'; out.textContent='URL inválida'; return }
    localStorage.setItem('dotrino_short_key', key)
    out.textContent='Acortando…'
    try{
      const r=await fetch('/api/shorten',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},body:JSON.stringify({url,code:code||undefined})})
      const d=await r.json()
      if(d.ok){ out.className='out'; out.innerHTML='Listo: <a href="'+d.short+'" target="_blank">'+d.short+'</a>' }
      else { out.className='out err'; out.textContent='Error: '+(d.error||r.status) }
    }catch(e){ out.className='out err'; out.textContent='Error de red' }
  }
</script></body></html>`
