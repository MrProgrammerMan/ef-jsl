const express = require('express');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';

// One common admin token generated at startup. Anyone who logs in gets this same token.
const ADMIN_TOKEN = crypto.randomBytes(32).toString('hex');

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory order store
let orders = [];
let nextId = 1;

const DRINKS = {
  jo:    'The Jo (mint & lime)',
  sti:   'The Sti (lemonade & orange)',
  lim:   'The Lim (cranberry & orange)',
  water: 'Water',
};

const NAME_RE = /^[A-Za-z]{3,20}$/;

function requireAdmin(req, res, next) {
  if (req.cookies && req.cookies.token === ADMIN_TOKEN) return next();
  return res.redirect('/login');
}

// ---------- GET / : homepage ----------
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------- POST /order ----------
app.post('/order', (req, res) => {
  const name = String(req.body.name || '').trim();
  const drink = String(req.body.drink || '').trim();

  if (!NAME_RE.test(name)) {
    return res.status(400).json({ ok: false, error: 'Name must be 3-20 letters.' });
  }
  if (!DRINKS[drink]) {
    return res.status(400).json({ ok: false, error: 'Invalid drink selection.' });
  }

  orders.push({
    id: nextId++,
    name,
    drinkKey: drink,
    drink: DRINKS[drink],
    time: new Date().toISOString(),
  });

  return res.json({ ok: true });
});

// ---------- GET /login ----------
app.get('/login', (req, res) => {
  res.send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Login</title>
<style>
  :root{--bg:#0f1115;--card:#1a1d24;--accent:#7c5cff;--text:#e8eaf0;--muted:#9aa0ac;}
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--text);display:flex;min-height:100vh;align-items:center;justify-content:center}
  .card{background:var(--card);padding:2rem;border-radius:16px;width:min(360px,90vw);box-shadow:0 10px 40px rgba(0,0,0,.4)}
  h1{margin:0 0 1.2rem;font-size:1.3rem;text-align:center}
  input{width:100%;padding:.8rem 1rem;border-radius:10px;border:1px solid #2a2e38;background:#0f1115;color:var(--text);font-size:1rem;margin-bottom:1rem}
  button{width:100%;padding:.8rem;border:0;border-radius:10px;background:var(--accent);color:#fff;font-size:1rem;font-weight:600;cursor:pointer}
  button:hover{filter:brightness(1.08)}
  .err{color:#ff6b6b;font-size:.9rem;min-height:1.2em;text-align:center;margin-bottom:.6rem}
</style></head>
<body>
  <div class="card">
    <h1>Admin Login</h1>
    <div class="err" id="err"></div>
    <input id="code" type="password" placeholder="Access code" autocomplete="off" autofocus>
    <button id="go">Submit</button>
  </div>
<script>
  const go=document.getElementById('go'),code=document.getElementById('code'),err=document.getElementById('err');
  async function submit(){
    err.textContent='';
    const r=await fetch('/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:code.value})});
    if(r.ok){location.href='/orders';}else{err.textContent='Wrong code.';}
  }
  go.onclick=submit;
  code.addEventListener('keydown',e=>{if(e.key==='Enter')submit();});
</script>
</body></html>`);
});

// ---------- POST /login ----------
app.post('/login', (req, res) => {
  const code = String(req.body.code || '');
  if (code === ADMIN_PASSWORD) {
    res.cookie('token', ADMIN_TOKEN, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365 * 10, // ~permanent
      sameSite: 'lax',
    });
    return res.json({ ok: true });
  }
  return res.status(401).json({ ok: false });
});

function ordersPage({ manage }) {
  const title = manage ? 'Manage Orders' : 'Orders';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  :root{--bg:#0f1115;--card:#1a1d24;--accent:#7c5cff;--text:#e8eaf0;--muted:#9aa0ac;}
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--text);padding:2rem}
  header{display:flex;align-items:center;gap:1rem;margin-bottom:1.5rem}
  header img{height:56px}
  h1{margin:0;font-size:1.8rem}
  .count{color:var(--muted);font-size:1rem;margin-left:auto}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem}
  .order{background:var(--card);border-radius:14px;padding:1.2rem 1.4rem;box-shadow:0 6px 20px rgba(0,0,0,.3);position:relative;${manage ? 'cursor:pointer;transition:transform .08s,outline .08s;' : ''}}
  ${manage ? '.order:hover{outline:2px solid #ff6b6b;transform:translateY(-2px)}' : ''}
  .name{font-size:1.5rem;font-weight:700;margin:0 0 .3rem}
  .drink{font-size:1.15rem;color:var(--accent)}
  .time{font-size:.8rem;color:var(--muted);margin-top:.5rem}
  .empty{color:var(--muted);font-size:1.2rem;margin-top:2rem}
  ${manage ? '.hint{color:#ff6b6b;font-size:.95rem;margin-bottom:1rem}' : ''}
</style></head>
<body>
  <header>
    <img src="/logo.avif" alt="logo" onerror="this.style.display='none'">
    <h1>${title}</h1>
    <span class="count" id="count"></span>
  </header>
  ${manage ? '<div class="hint">Click an order to remove it.</div>' : ''}
  <div class="grid" id="grid"></div>
<script>
  const MANAGE=${manage ? 'true' : 'false'};
  const grid=document.getElementById('grid'),count=document.getElementById('count');
  function fmt(t){try{return new Date(t).toLocaleTimeString();}catch(e){return '';}}
  async function load(){
    const r=await fetch('/api/orders');
    if(r.status===401){location.href='/login';return;}
    const data=await r.json();
    count.textContent=data.length+' order'+(data.length===1?'':'s');
    if(!data.length){grid.innerHTML='<div class="empty">No orders yet.</div>';return;}
    grid.innerHTML=data.map(o=>
      '<div class="order" '+(MANAGE?'data-id="'+o.id+'"':'')+'>'+
        '<p class="name">'+esc(o.name)+'</p>'+
        '<div class="drink">'+esc(o.drink)+'</div>'+
        '<div class="time">'+fmt(o.time)+'</div>'+
      '</div>'
    ).join('');
    if(MANAGE){
      grid.querySelectorAll('.order').forEach(el=>{
        el.onclick=async()=>{
          const id=el.getAttribute('data-id');
          await fetch('/manage/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:Number(id)})});
          load();
        };
      });
    }
  }
  function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  load();
  setInterval(load,3000);
</script>
</body></html>`;
}

// ---------- GET /orders (TV view) ----------
app.get('/orders', requireAdmin, (req, res) => {
  res.send(ordersPage({ manage: false }));
});

// ---------- GET /manage ----------
app.get('/manage', requireAdmin, (req, res) => {
  res.send(ordersPage({ manage: true }));
});

// JSON feed used by both pages (polled)
app.get('/api/orders', requireAdmin, (req, res) => {
  res.json(orders);
});

// Delete an order
app.post('/manage/delete', requireAdmin, (req, res) => {
  const id = Number(req.body.id);
  orders = orders.filter(o => o.id !== id);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Server on :${PORT}`);
  console.log(`Admin token (startup): ${ADMIN_TOKEN}`);
});
