const express = require('express');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';

// One common admin token generated at startup. Anyone who logs in gets this same token.
const ADMIN_TOKEN = crypto.randomBytes(32).toString('hex');

// How long a finished order stays on screen before it disappears
const READY_MS = 20 * 1000;

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory order store
// Each order: { number, name, drinkKey, drink, snackKey, snack, status: 'pending'|'ready', time, readyAt }
let orders = [];
let nextNumber = 1;

const DRINKS = {
  jo:      'The Jo (mint & lime)',
  sti:     'The Sti (lemonade & orange)',
  lim:     'The Lim (cranberry & orange)',
  carro:   'The Carro (specialty)',
  water:   'Water',
  vomsaft: 'Vomsaft (classic)',
};

const SNACKS = {
  fries:  'Fries',
  chips:  'Chips',
  olives: 'Olives',
};

const NAME_RE = /^[A-ZÆØÅa-zæøå ]{3,20}$/;

function requireAdmin(req, res, next) {
  if (req.cookies && req.cookies.token === ADMIN_TOKEN) return next();
  if (req.path.startsWith('/api/') || req.method === 'POST') {
    return res.status(401).json({ ok: false, error: 'Not logged in.' });
  }
  return res.redirect('/login');
}

// Remove finished orders whose 20 seconds are up
function prune() {
  const cutoff = Date.now() - READY_MS;
  orders = orders.filter(o => o.status !== 'ready' || o.readyAt > cutoff);
}
setInterval(prune, 1000);

// ---------- GET / : homepage ----------
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------- POST /order ----------
app.post('/order', (req, res) => {
  const name = String(req.body.name || '').trim();
  const drink = String(req.body.drink || '').trim();
  const snack = String(req.body.snack || '').trim();

  if (!NAME_RE.test(name)) {
    return res.status(400).json({ ok: false, error: 'Name must be 3-20 letters.' });
  }
  if (drink && !DRINKS[drink]) {
    return res.status(400).json({ ok: false, error: 'Invalid drink selection.' });
  }
  if (snack && !SNACKS[snack]) {
    return res.status(400).json({ ok: false, error: 'Invalid snack selection.' });
  }
  if (!drink && !snack) {
    return res.status(400).json({ ok: false, error: 'Choose a drink or a snack.' });
  }

  const number = nextNumber++;
  orders.push({
    number,
    name,
    drinkKey: drink || null,
    drink: drink ? DRINKS[drink] : null,
    snackKey: snack || null,
    snack: snack ? SNACKS[snack] : null,
    status: 'pending',
    time: new Date().toISOString(),
    readyAt: null,
  });

  return res.json({ ok: true, number });
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
  :root{--bg:#0f1115;--card:#1a1d24;--accent:#7c5cff;--accent2:#5ce0c4;--green:#2ecc71;--red:#ff6b6b;--text:#e8eaf0;--muted:#9aa0ac;--border:#2a2e38;}
  *{box-sizing:border-box}
  html,body{height:100%}
  body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--text);padding:1.5rem 2rem;display:flex;flex-direction:column}
  header{display:flex;align-items:center;gap:1rem;margin-bottom:1.2rem}
  header img{height:56px}
  h1{margin:0;font-size:1.8rem}
  .board{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:0;min-height:0}
  .col{padding:0 1.5rem;overflow-y:auto;min-height:0}
  .col:first-child{padding-left:0;border-right:2px solid var(--border)}
  .col:last-child{padding-right:0}
  .col h2{margin:0 0 1rem;font-size:1.4rem;display:flex;align-items:baseline;gap:.6rem;position:sticky;top:0;background:var(--bg);padding:.3rem 0;z-index:1}
  .col.pending h2{color:var(--accent)}
  .col.ready h2{color:var(--green)}
  .col h2 .c{font-size:.95rem;color:var(--muted);font-weight:500}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:1rem;align-content:start}
  .order{background:var(--card);border-radius:14px;padding:1.1rem 1.3rem;box-shadow:0 6px 20px rgba(0,0,0,.3);position:relative;overflow:hidden;border:1px solid var(--border);transition:opacity .4s}
  .order.ready{border-color:rgba(46,204,113,.5);padding-bottom:1.5rem}
  .order.gone{opacity:0}
  .num{font-size:1rem;font-weight:800;color:var(--muted);letter-spacing:.03em}
  .order.ready .num{color:var(--green)}
  .name{font-size:1.5rem;font-weight:700;margin:.1rem 0 .4rem}
  .item{font-size:1.1rem;color:var(--accent);line-height:1.4}
  .item.snack{color:var(--accent2)}
  .time{font-size:.8rem;color:var(--muted);margin-top:.5rem}
  .actions{display:flex;gap:.5rem;margin-top:.9rem}
  .btn{flex:1;padding:.6rem;border:0;border-radius:9px;font-size:.95rem;font-weight:700;cursor:pointer;color:#fff}
  .btn:hover{filter:brightness(1.1)}
  .btn:disabled{opacity:.5;cursor:default}
  .btn.fin{background:var(--green);color:#062312}
  .btn.del{background:transparent;border:1px solid var(--red);color:var(--red)}
  .timer{position:absolute;left:0;right:0;bottom:0;height:6px;background:rgba(46,204,113,.15)}
  .bar{height:100%;width:100%;background:var(--green)}
  .empty{color:var(--muted);font-size:1.1rem;margin-top:.5rem}
  @media (max-width:700px){
    body{padding:1rem}
    .board{grid-template-columns:1fr}
    .col,.col:first-child,.col:last-child{padding:0;border:0}
    .col:first-child{border-bottom:2px solid var(--border);padding-bottom:1rem;margin-bottom:1rem}
  }
</style></head>
<body>
  <header>
    <img src="/logo.png" alt="logo" onerror="this.style.display='none'">
    <h1>${title}</h1>
  </header>
  <div class="board">
    <section class="col pending">
      <h2>Pending <span class="c" id="pCount"></span></h2>
      <div class="grid" id="pending"></div>
    </section>
    <section class="col ready">
      <h2>Ready for pickup <span class="c" id="rCount"></span></h2>
      <div class="grid" id="ready"></div>
    </section>
  </div>
<script>
  const MANAGE=${manage ? 'true' : 'false'};
  const READY_MS=${READY_MS};
  const pendingEl=document.getElementById('pending'),readyEl=document.getElementById('ready');
  const pCount=document.getElementById('pCount'),rCount=document.getElementById('rCount');
  let offset=0,lastSig='';

  function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function fmt(t){try{return new Date(t).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});}catch(e){return '';}}

  function card(o){
    let h='<div class="order '+o.status+'" data-id="'+o.number+'"'+(o.status==='ready'?' data-ready="'+o.readyAt+'"':'')+'>';
    h+='<div class="num">#'+o.number+'</div>';
    h+='<p class="name">'+esc(o.name)+'</p>';
    if(o.drink) h+='<div class="item drink">'+esc(o.drink)+'</div>';
    if(o.snack) h+='<div class="item snack">'+esc(o.snack)+'</div>';
    h+='<div class="time">'+fmt(o.time)+'</div>';
    if(MANAGE){
      h+='<div class="actions">'+
        (o.status==='pending'?'<button class="btn fin" data-act="finish">Finished</button>':'')+
        '<button class="btn del" data-act="delete">Delete</button></div>';
    }
    if(o.status==='ready') h+='<div class="timer"><div class="bar"></div></div>';
    return h+'</div>';
  }

  function render(list){
    const p=list.filter(o=>o.status==='pending').sort((a,b)=>a.number-b.number);
    const r=list.filter(o=>o.status==='ready').sort((a,b)=>a.number-b.number);
    pCount.textContent=p.length?'('+p.length+')':'';
    rCount.textContent=r.length?'('+r.length+')':'';
    pendingEl.innerHTML=p.length?p.map(card).join(''):'<div class="empty">No pending orders.</div>';
    readyEl.innerHTML=r.length?r.map(card).join(''):'<div class="empty">Nothing waiting.</div>';
    tick();
  }

  async function load(){
    try{
      const res=await fetch('/api/orders');
      if(res.status===401){location.href='/login';return;}
      const data=await res.json();
      offset=data.now-Date.now();
      const sig=JSON.stringify(data.orders);
      if(sig!==lastSig){lastSig=sig;render(data.orders);}
    }catch(e){}
  }

  // Shrink the green bar on finished orders, fade out when time is up
  function tick(){
    const now=Date.now()+offset;
    document.querySelectorAll('.order.ready').forEach(el=>{
      const left=Number(el.dataset.ready)+READY_MS-now;
      const f=Math.max(0,Math.min(1,left/READY_MS));
      const bar=el.querySelector('.bar');
      if(bar) bar.style.width=(f*100)+'%';
      if(left<=0) el.classList.add('gone');
    });
  }
  function loop(){tick();requestAnimationFrame(loop);}

  if(MANAGE){
    document.addEventListener('click',async e=>{
      const b=e.target.closest('button[data-act]');
      if(!b) return;
      const id=Number(b.closest('.order').dataset.id);
      b.closest('.actions').querySelectorAll('button').forEach(x=>x.disabled=true);
      try{
        const res=await fetch('/manage/'+b.dataset.act,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});
        if(res.status===401){location.href='/login';return;}
      }catch(err){}
      load();
    });
  }

  load();
  setInterval(load,2000);
  requestAnimationFrame(loop);
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

// JSON feed used by both pages (polled). Includes server time so timers stay in sync.
app.get('/api/orders', requireAdmin, (req, res) => {
  prune();
  res.json({ now: Date.now(), orders });
});

// Mark an order as finished (moves it to "Ready for pickup" for 20 seconds)
app.post('/manage/finish', requireAdmin, (req, res) => {
  const id = Number(req.body.id);
  const order = orders.find(o => o.number === id);
  if (!order) return res.status(404).json({ ok: false, error: 'Order not found.' });
  if (order.status !== 'ready') {
    order.status = 'ready';
    order.readyAt = Date.now();
  }
  res.json({ ok: true });
});

// Delete an order
app.post('/manage/delete', requireAdmin, (req, res) => {
  const id = Number(req.body.id);
  orders = orders.filter(o => o.number !== id);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Server on :${PORT}`);
  console.log(`Admin token (startup): ${ADMIN_TOKEN}`);
});