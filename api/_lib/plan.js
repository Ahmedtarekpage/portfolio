// The plan page, served at /plan (a rewrite onto /api/tasks?plan=page) and
// shown inside the Plan tab of /time. It is a function response rather than a
// static file so that it sits behind the passkey like everything else the
// owner keeps here. The owner wrote the page itself (2026-10-21,
// "khatet-ahmed.html"); the only changes are the Chart.js copy under /vendor,
// the shared theme, and saving to the server instead of the browser alone.
import { json } from "./util.js";

const MAX_STATE_CHARS = 20_000;

export async function handlePlan(req, res, sql) {
  if (req.query.plan === "page") {
    if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).send(PLAN_HTML);
  }
  if (req.query.plan === "state") {
    if (req.method === "GET") {
      const [row] = await sql`SELECT value FROM app_settings WHERE key = 'plan_state'`;
      let state = null;
      if (row) { try { state = JSON.parse(row.value); } catch { state = null; } }
      return json(res, 200, { state });
    }
    if (req.method === "PUT" || req.method === "POST") {
      const b = req.body;
      if (!b || typeof b !== "object" || Array.isArray(b)) return json(res, 400, { error: "The plan state has to be an object." });
      const value = JSON.stringify(b);
      if (value.length > MAX_STATE_CHARS) return json(res, 400, { error: "The plan state is too large." });
      await sql`INSERT INTO app_settings (key, value) VALUES ('plan_state', ${value})
        ON CONFLICT (key) DO UPDATE SET value = ${value}`;
      return json(res, 200, { ok: true });
    }
    return json(res, 405, { error: "Method not allowed" });
  }
  return json(res, 400, { error: "plan must be page or state" });
}

export const PLAN_HTML = `<!doctype html><html lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>خطة أحمد</title>
<meta name="robots" content="noindex, nofollow">
<script>
// the same theme as the tool it sits inside — set before the CSS applies
(function(){ try{ var t=localStorage.getItem("tools-theme"); if(t) document.documentElement.setAttribute("data-theme",t); }catch(e){}
  if(window.self!==window.top) document.documentElement.className+=" embedded"; })();
</script>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600&display=swap">
<style>
/* layout: one column of cards, charts first, then the checklist and the dials side by side on wide screens */
:root{
  --bg:#f6f7f9; --card:#ffffff; --fg:#141a26; --muted:#5e6878; --line:#dfe3ea;
  --accent:#1f5fbf; --accent-soft:#e4edfb;
  --biz:#e0652f; --brand:#15966b; --job:#2a78d6; --learn:#d99a00; --goal:#c93b3b; --done:#15966b;
  --font:"IBM Plex Sans Arabic",system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;
}
@media (prefers-color-scheme:dark){ :root:not([data-theme="light"]){
  --bg:#12151b; --card:#1a1f28; --fg:#eef1f5; --muted:#a3acb9; --line:#2b3240;
  --accent:#6ea2f0; --accent-soft:#1d2b45; --biz:#f08358; --brand:#3cc191; --job:#5a9cf0; --learn:#f0b73a; --goal:#ef6b6b; --done:#3cc191;
  color-scheme:dark } }
:root[data-theme="dark"]{
  --bg:#12151b; --card:#1a1f28; --fg:#eef1f5; --muted:#a3acb9; --line:#2b3240;
  --accent:#6ea2f0; --accent-soft:#1d2b45; --biz:#f08358; --brand:#3cc191; --job:#5a9cf0; --learn:#f0b73a; --goal:#ef6b6b; --done:#3cc191;
  color-scheme:dark }
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font-family:var(--font);font-size:15px;line-height:1.6;direction:rtl;
  padding-block:20px 48px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
main{max-width:980px;margin:0 auto;display:grid;gap:16px}
h1{font-size:22px;font-weight:600;margin:0;text-wrap:balance}
h2{font-size:15px;font-weight:600;margin:0 0 10px;color:var(--muted)}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;min-width:0}
.head{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between}
.status{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.pill{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;font-weight:500;font-size:14px;background:var(--accent-soft);color:var(--accent)}
.pill b{font-weight:600}
.pill.quiet{background:transparent;border:1px solid var(--line);color:var(--muted);font-weight:400}
.legend{display:flex;flex-wrap:wrap;gap:14px;font-size:13px;color:var(--muted);margin:0 0 8px}
.legend span{display:inline-flex;align-items:center;gap:6px}
.sw{width:14px;height:3px;border-radius:2px;display:inline-block}
.sw.dash{height:0;border-top:2px dashed currentColor;color:inherit}
.chart{position:relative;width:100%;height:280px}
.chart.short{height:230px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media (max-width:720px){.two{grid-template-columns:1fr}}
ol.ms{list-style:none;margin:0;padding:0;display:grid;gap:6px}
ol.ms li{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;padding:8px 10px;border-radius:10px;border:1px solid var(--line)}
ol.ms li.cur{border-color:var(--accent);background:var(--accent-soft)}
ol.ms li.ok{opacity:.85}
ol.ms li.ok .t{text-decoration:line-through;text-decoration-color:var(--done)}
ol.ms input[type=checkbox]{width:20px;height:20px;accent-color:var(--done);margin:0}
ol.ms .t{font-weight:500}
ol.ms .m{font-size:13px;color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap}
ol.ms input[type=date]{font:inherit;font-size:12px;border:1px solid var(--line);border-radius:8px;padding:2px 6px;background:var(--card);color:var(--fg);max-width:140px}
.dials{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px}
@media (max-width:420px){.dials{grid-template-columns:1fr}}
label.f{display:grid;gap:4px;font-size:13px;color:var(--muted)}
label.f input{font:inherit;font-size:15px;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:8px 10px;width:100%;font-variant-numeric:tabular-nums}
input:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.tbl{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums;min-width:520px}
th,td{padding:8px 6px;text-align:center;border-bottom:1px solid var(--line)}
th{font-weight:500;color:var(--muted);font-size:13px}
td:first-child,th:first-child{text-align:right;white-space:nowrap}
td input{width:64px;font:inherit;text-align:center;background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:8px;padding:6px 4px}
td.sum{font-weight:600}
td.sum.bad{color:var(--goal)}
tr.cur td{background:var(--accent-soft)}
.dot{display:inline-block;width:10px;height:10px;border-radius:3px;margin-inline-start:6px;vertical-align:middle}
.note{font-size:13px;color:var(--muted);margin:8px 0 0}
.save{font-size:12px;color:var(--muted)}
.btn{font:inherit;font-size:13px;padding:6px 12px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--fg);cursor:pointer}
.btn:hover{border-color:var(--accent)}
@media (prefers-reduced-motion:no-preference){.pill{transition:background .2s}}
/* inside the /time Plan tab the page has no chrome of its own: the card it sits in is the frame */
html.embedded body{background:transparent;padding:0}
</style>
</head><body>

<main>
  <section class="card head">
    <div>
      <h1>خطة أحمد: من الوظيفة للـ ٥٠٠ ألف دولار</h1>
      <div class="note" id="sub">١٢ ساعة في اليوم على أربع حاجات. علّم على اللي خلص، وغيّر الأرقام، والرسمة بتتحرك.</div>
    </div>
    <div class="status">
      <span class="pill" id="phasePill">المرحلة ١</span>
      <span class="pill quiet" id="monthPill">شهر ١</span>
      <span class="pill quiet" id="nextPill"></span>
    </div>
  </section>

  <section class="card">
    <h2>الدخل في الشهر (ألف جنيه، المحور بيتضاعف)</h2>
    <div class="legend">
      <span><i class="sw" style="background:var(--job)"></i>الوظيفة</span>
      <span><i class="sw" style="background:var(--biz)"></i>إيراد البيزنس</span>
      <span style="color:var(--muted)"><i class="sw dash"></i>المصاريف</span>
      <span style="color:var(--goal)"><i class="sw dash"></i>الهدف</span>
    </div>
    <div class="chart"><canvas id="incomeChart" role="img" aria-label="الدخل في الشهر: الوظيفة والبيزنس والهدف"></canvas></div>
  </section>

  <section class="card">
    <h2>الـ ١٢ ساعة في اليوم</h2>
    <div class="legend">
      <span><i class="sw" style="background:var(--biz)"></i>البيزنس</span>
      <span><i class="sw" style="background:var(--brand)"></i>البراندينج</span>
      <span><i class="sw" style="background:var(--job)"></i>الوظيفة</span>
      <span style="color:var(--learn)"><i class="sw dash"></i>التعلم</span>
    </div>
    <div class="chart short"><canvas id="hoursChart" role="img" aria-label="ساعات اليوم على الأربع حاجات بمرور الشهور"></canvas></div>
  </section>

  <div class="two">
    <section class="card">
      <h2>المحطات: علّم على اللي خلص</h2>
      <ol class="ms" id="msList"></ol>
      <p class="note">المحطة اللي بعد آخر علامة هي المرحلة اللي أنت فيها. التاريخ بيتحط لوحده يوم ما تعلّم، وتقدر تغيّره.</p>
    </section>

    <section class="card">
      <div class="head" style="margin-bottom:10px"><h2 style="margin:0">الأرقام</h2><button class="btn reset" type="button">الأرقام اللي اتفقنا عليها</button></div>
      <div class="dials">
        <label class="f">بداية الخطة<input type="date" id="s_startDate"></label>
        <label class="f">سعر الدولار بالجنيه<input type="number" id="s_egpPerUsd" min="1" step="1"></label>
        <label class="f">مرتب الوظيفة (دولار في الشهر)<input type="number" id="s_salaryUsd" min="0" step="50"></label>
        <label class="f">شهر عرض الشغل المتوقع<input type="number" id="s_offerMonth" min="1" step="1"></label>
        <label class="f">إيراد البيزنس دلوقتي (ألف جنيه)<input type="number" id="s_startRevenueK" min="0" step="1"></label>
        <label class="f">نمو البيزنس في الشهر (٪)<input type="number" id="s_growthPct" min="0" step="0.5"></label>
        <label class="f">مصاريفك في الشهر (ألف جنيه)<input type="number" id="s_expensesK" min="0" step="1"></label>
        <label class="f">الهدف (دولار في السنة)<input type="number" id="s_goalYearlyUsd" min="0" step="10000"></label>
      </div>
      <p class="note" id="growthNote"></p>
    </section>
  </div>

  <section class="card">
    <h2>الساعات في كل مرحلة (بالنص ساعة، المجموع لازم ١٢)</h2>
    <div class="tbl"><table id="hoursTable">
      <thead><tr><th>المرحلة</th><th><i class="dot" style="background:var(--biz)"></i>بيزنس</th><th><i class="dot" style="background:var(--brand)"></i>براندينج</th><th><i class="dot" style="background:var(--job)"></i>وظيفة</th><th><i class="dot" style="background:var(--learn)"></i>تعلم</th><th>المجموع</th></tr></thead>
      <tbody></tbody>
    </table></div>
    <div class="head" style="margin-top:10px">
      <span class="save" id="saveState"></span>
      <button class="btn reset" type="button">الأرقام اللي اتفقنا عليها</button>
    </div>
  </section>
</main>

<script src="/vendor/chart-4.4.1.umd.min.js"></script>
<script>
(function(){
  var DEFAULT = {
    settings:{startDate:'2026-10-21', egpPerUsd:50, salaryUsd:2000, offerMonth:3, startRevenueK:7, growthPct:12, expensesK:20, goalYearlyUsd:500000},
    hours:{p1:{biz:5,brand:3,job:2.5,learn:1.5}, p2:{biz:2,brand:1.5,job:8,learn:0.5}, p3:{biz:2.5,brand:1,job:8,learn:0.5}, p4:{biz:6,brand:4,job:0,learn:2}},
    milestones:{offer:{done:false,date:''}, team:{done:false,date:''}, passed:{done:false,date:''}, left:{done:false,date:''}, goal200:{done:false,date:''}, goal:{done:false,date:''}}
  };
  var MS = [
    {k:'offer',  t:'عرض شغل', phaseAfter:2},
    {k:'team',   t:'البيزنس غطّى المصاريف ٣ شهور، وعيّنت فريق', phaseAfter:3},
    {k:'passed', t:'البيزنس عدّى المرتب', phaseAfter:3},
    {k:'left',   t:'سبت الوظيفة', phaseAfter:4},
    {k:'goal200',t:'٢٠٠ ألف دولار في السنة', phaseAfter:4},
    {k:'goal',   t:'الهدف', phaseAfter:5}
  ];
  var PHASES = ['','بحث عن شغل وبناء البيزنس','الوظيفة والبيزنس معاك','الوظيفة والفريق شغال','البيزنس فول تايم','وصلت'];
  var TRACKS = [['biz','البيزنس'],['brand','البراندينج'],['job','الوظيفة'],['learn','التعلم']];

  var state = clone(DEFAULT), charts = {}, dbDoc = null, saveTimer = null, writing = false, dirty = false;
  function clone(o){ return JSON.parse(JSON.stringify(o)); }
  function merge(base, over){ var r = clone(base); if(!over) return r;
    Object.keys(r).forEach(function(k){ if(over[k] && typeof over[k]==='object' && !Array.isArray(over[k])) r[k] = merge(r[k], over[k]); else if(over[k]!==undefined) r[k] = over[k]; }); return r; }
  function css(n){ return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function fmtK(v){ return v>=1000 ? (Math.round(v/100)/10).toLocaleString('ar-EG')+' مليون' : Math.round(v).toLocaleString('ar-EG')+' ألف'; }
  function fmtH(v){ var m={0:'صفر',0.5:'نص ساعة',1:'ساعة',1.5:'ساعة ونص',2:'ساعتين',2.5:'ساعتين ونص'}; return m[v]!==undefined?m[v]:v.toLocaleString('ar-EG')+' ساعات'; }
  function ar(n){ return Number(n).toLocaleString('ar-EG'); }
  function today(){ var d=new Date(); return d.toISOString().slice(0,10); }
  function monthOf(dateStr){ var s=state.settings; var a=new Date(s.startDate), b=new Date(dateStr);
    if(isNaN(a)||isNaN(b)) return 1; return Math.max(1, Math.floor((b-a)/(30.44*86400000))+1); }

  function model(){
    var s=state.settings, g=1+s.growthPct/100, salaryK=s.salaryUsd*s.egpPerUsd/1000;
    var goalK=s.goalYearlyUsd*s.egpPerUsd/12000, g200K=200000*s.egpPerUsd/12000;
    var rev=[], N=120; for(var m=1;m<=N;m++) rev.push(s.startRevenueK*Math.pow(g,m-1));
    function firstAtLeast(v, consecutive){ var run=0; for(var m=1;m<=N;m++){ if(rev[m-1]>=v){ run++; if(run>=(consecutive||1)) return m; } else run=0; } return null; }
    var mm={};
    mm.offer = Math.max(1, Math.round(s.offerMonth));
    mm.team = Math.max(mm.offer, firstAtLeast(s.expensesK,3)||N);
    mm.passed = Math.max(mm.team, firstAtLeast(salaryK)||N);
    mm.left = mm.passed+3;
    mm.goal200 = Math.max(mm.left, firstAtLeast(g200K)||N);
    mm.goal = Math.max(mm.goal200, firstAtLeast(goalK)||N);
    var cur = monthOf(today());
    var prev=0;
    MS.forEach(function(x){ var ms=state.milestones[x.k];
      if(ms.done && ms.date) mm[x.k]=monthOf(ms.date); else mm[x.k]=Math.max(mm[x.k], cur, prev);
      mm[x.k]=Math.max(mm[x.k], prev); prev=mm[x.k]; });
    var N2=Math.min(N, mm.goal+3);
    var phase=1; MS.forEach(function(x){ if(state.milestones[x.k].done) phase=Math.max(phase,x.phaseAfter); });
    if(phase<5 && cur>=mm.goal && state.milestones.goal.done) phase=5;
    function phaseAt(m){ if(m<mm.offer) return 1; if(m<mm.team) return 2; if(m<mm.left) return 3; return 4; }
    return {rev:rev.slice(0,N2), N:N2, mm:mm, salaryK:salaryK, goalK:goalK, cur:cur, phase:phase, phaseAt:phaseAt};
  }

  function destroy(id){ if(charts[id]){ charts[id].destroy(); delete charts[id]; } }
  function markerPlugin(M){
    return {id:'marks', beforeDatasetsDraw:function(c){
      var x=c.scales.x, ctx=c.ctx, top=c.chartArea.top, bot=c.chartArea.bottom;
      var p=M.phase; if(p>=1&&p<=4){ var a=p===1?1:p===2?M.mm.offer:p===3?M.mm.team:M.mm.left; var b=p===1?M.mm.offer-1:p===2?M.mm.team-1:p===3?M.mm.left-1:M.N;
        var x0=x.getPixelForValue(Math.max(1,a)), x1=x.getPixelForValue(Math.min(M.N,b)); ctx.save(); ctx.fillStyle=css('--accent-soft'); ctx.globalAlpha=.55; ctx.fillRect(Math.min(x0,x1),top,Math.abs(x1-x0),bot-top); ctx.restore(); }
    }, afterDraw:function(c){
      var x=c.scales.x, ctx=c.ctx, top=c.chartArea.top, bot=c.chartArea.bottom, muted=css('--muted');
      var i=0; MS.forEach(function(ms){ var m=M.mm[ms.k]; if(m>M.N) return; var px=x.getPixelForValue(m); var done=state.milestones[ms.k].done; var isGoal=ms.k==='goal';
        ctx.save(); ctx.strokeStyle=done?css('--done'):isGoal?css('--goal'):muted; ctx.setLineDash(done?[]:[3,3]); ctx.lineWidth=done?1.5:1; ctx.beginPath(); ctx.moveTo(px,top); ctx.lineTo(px,bot); ctx.stroke();
        ctx.fillStyle=done?css('--done'):isGoal?css('--goal'):muted; ctx.font='11px '+css('--font'); ctx.textAlign=isGoal?'right':'center'; ctx.direction='rtl';
        ctx.fillText((done?'✓ ':'')+ms.t.split('،')[0], isGoal?px-4:px, top-6-(i%2)*13); ctx.restore(); i++; });
      if(M.cur>=1 && M.cur<=M.N){ var cx=x.getPixelForValue(M.cur); ctx.save(); ctx.strokeStyle=css('--accent'); ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(cx,top); ctx.lineTo(cx,bot); ctx.stroke();
        ctx.fillStyle=css('--accent'); ctx.font='600 12px '+css('--font'); ctx.textAlign='center'; ctx.fillText('أنت هنا', cx, bot-6); ctx.restore(); }
    }};
  }
  function baseOpts(M, yScale, fmt){
    var muted=css('--muted'), grid=css('--line');
    return {responsive:true, maintainAspectRatio:false, animation:false, interaction:{mode:'index',intersect:false}, layout:{padding:{top:34}},
      plugins:{legend:{display:false}, tooltip:{rtl:true, textDirection:'rtl', callbacks:{title:function(c){ var m=+c[0].label; return 'شهر '+ar(m)+' · المرحلة '+ar(M.phaseAt(m)); }, label:function(c){ return c.parsed.y==null?null:c.dataset.label+': '+fmt(c.parsed.y); }}}},
      scales:{x:{grid:{display:false}, ticks:{color:muted, font:{family:css('--font'),size:11}, callback:function(v,i){ return (i+1)%6===0||i===0?ar(i+1):''; }}}, y:yScale}};
  }
  function line(l,d,c,dash){ return {label:l,data:d,borderColor:c,backgroundColor:c,borderWidth:2,borderDash:dash||[],pointRadius:0,pointHoverRadius:5,tension:.3,spanGaps:false}; }

  function renderCharts(M){
    var labels=[]; for(var i=1;i<=M.N;i++) labels.push(i);
    var s=state.settings, muted=css('--muted'), grid=css('--line');
    var job=labels.map(function(m){ return m>=M.mm.offer && m<M.mm.left ? M.salaryK : null; });
    var exp=labels.map(function(){ return s.expensesK; });
    var goal=labels.map(function(){ return M.goalK; });
    var top=Math.max(M.goalK, M.salaryK, s.expensesK)*1.6;
    destroy('income');
    charts.income=new Chart(document.getElementById('incomeChart'),{type:'line', plugins:[markerPlugin(M)],
      data:{labels:labels, datasets:[line('الوظيفة',job,css('--job')), line('البيزنس',M.rev.map(function(v){return Math.round(v*10)/10;}),css('--biz')), line('المصاريف',exp,muted,[6,4]), line('الهدف',goal,css('--goal'),[6,4])]},
      options:baseOpts(M,{type:'logarithmic',min:Math.max(1,Math.min(s.startRevenueK,s.expensesK)/1.5),max:top,grid:{color:grid},ticks:{color:muted,font:{family:css('--font'),size:11},callback:function(v){ var ok=[1,2,5,10,20,50,100,200,500,1000,2000,5000,10000]; return ok.indexOf(v)>=0?(v>=1000?ar(v/1000)+' مليون':ar(v)):''; }}}, fmtK)});
    var h=state.hours; function row(k){ return labels.map(function(m){ return h['p'+M.phaseAt(m)][k]; }); }
    destroy('hours');
    charts.hours=new Chart(document.getElementById('hoursChart'),{type:'line', plugins:[markerPlugin(M)],
      data:{labels:labels, datasets:[line('البيزنس',row('biz'),css('--biz')), line('البراندينج',row('brand'),css('--brand')), line('الوظيفة',row('job'),css('--job')), line('التعلم',row('learn'),css('--learn'),[2,3])]},
      options:baseOpts(M,{min:0,max:10,grid:{color:grid},ticks:{color:muted,stepSize:1,font:{family:css('--font'),size:11},callback:function(v){return ar(v);}}}, fmtH)});
  }

  function renderStatus(M){
    document.getElementById('phasePill').innerHTML='المرحلة <b>'+ar(Math.min(M.phase,4))+'</b> · '+PHASES[M.phase];
    document.getElementById('monthPill').textContent='شهر '+ar(M.cur)+' من الخطة';
    var next=null; for(var i=0;i<MS.length;i++){ if(!state.milestones[MS[i].k].done){ next=MS[i]; break; } }
    document.getElementById('nextPill').textContent = next ? 'الجاية: '+next.t.split('،')[0]+' · شهر '+ar(M.mm[next.k]) : 'كل المحطات خلصت';
    var yrs=Math.round(M.mm.goal/12*10)/10;
    document.getElementById('growthNote').textContent='بالنمو ده الهدف بييجي شهر '+ar(M.mm.goal)+' تقريبًا، يعني '+ar(yrs)+' سنة. كل ١٪ زيادة في النمو بتقرّبه كذا شهر.';
  }
  function renderMilestones(M){
    var ol=document.getElementById('msList'); ol.innerHTML='';
    var nextIdx=-1; for(var i=0;i<MS.length;i++){ if(!state.milestones[MS[i].k].done){ nextIdx=i; break; } }
    MS.forEach(function(x,i){ var ms=state.milestones[x.k]; var li=document.createElement('li'); li.className=(ms.done?'ok':'')+(i===nextIdx?' cur':'');
      var t=x.k==='goal' ? 'الهدف: '+ar(state.settings.goalYearlyUsd/1000)+' ألف دولار في السنة' : x.t;
      li.innerHTML='<input type="checkbox" id="ms_'+x.k+'"'+(ms.done?' checked':'')+'><label class="t" for="ms_'+x.k+'">'+t+'</label>'+
        (ms.done?'<input type="date" id="msd_'+x.k+'" value="'+ms.date+'">':'<span class="m">شهر '+ar(M.mm[x.k])+'</span>');
      ol.appendChild(li);
      li.querySelector('input[type=checkbox]').addEventListener('change',function(e){ ms.done=e.target.checked; ms.date=ms.done?(ms.date||today()):''; if(!ms.done){ for(var j=i+1;j<MS.length;j++){ state.milestones[MS[j].k].done=false; state.milestones[MS[j].k].date=''; } } changed(); });
      var d=li.querySelector('input[type=date]'); if(d) d.addEventListener('change',function(e){ ms.date=e.target.value; changed(); });
    });
  }
  function renderSettings(){
    Object.keys(state.settings).forEach(function(k){ var el=document.getElementById('s_'+k); if(el && document.activeElement!==el) el.value=state.settings[k]; });
  }
  function renderHoursTable(M){
    var tb=document.querySelector('#hoursTable tbody'); tb.innerHTML='';
    var names={p1:'١: '+PHASES[1], p2:'٢: '+PHASES[2], p3:'٣: '+PHASES[3], p4:'٤: '+PHASES[4]};
    ['p1','p2','p3','p4'].forEach(function(p,i){ var tr=document.createElement('tr'); if(M.phase===i+1) tr.className='cur';
      var sum=0; var html='<td>'+names[p]+'</td>';
      TRACKS.forEach(function(t){ var v=state.hours[p][t[0]]; sum+=v; html+='<td><input type="number" step="0.5" min="0" max="12" id="h_'+p+'_'+t[0]+'" value="'+v+'" aria-label="'+t[1]+'"></td>'; });
      html+='<td class="sum'+(Math.abs(sum-12)>0.01?' bad':'')+'">'+ar(Math.round(sum*2)/2)+(Math.abs(sum-12)>0.01?' ≠ ١٢':'')+'</td>';
      tr.innerHTML=html; tb.appendChild(tr);
      TRACKS.forEach(function(t){ tr.querySelector('#h_'+p+'_'+t[0]).addEventListener('change',function(e){ var v=Math.max(0,Math.min(12,Math.round(parseFloat(e.target.value||0)*2)/2)); state.hours[p][t[0]]=v; e.target.value=v; changed(); }); });
    });
  }
  function render(){ var M=model(); renderStatus(M); renderCharts(M); renderMilestones(M); renderSettings(); renderHoursTable(M); }

  Object.keys(DEFAULT.settings).forEach(function(k){ var el=document.getElementById('s_'+k); if(!el) return;
    el.addEventListener('change',function(){ var v=el.type==='date'?el.value:parseFloat(el.value); if(el.type!=='date'&&(isNaN(v)||v<0)) v=DEFAULT.settings[k]; if(el.type==='date'&&!v) v=DEFAULT.settings[k]; state.settings[k]=v; changed(); }); });
  Array.prototype.forEach.call(document.querySelectorAll('.btn.reset'),function(b){ b.addEventListener('click',function(){ var ms=clone(state.milestones); state=clone(DEFAULT); state.milestones=ms; changed(); setSave('رجعت الأرقام اللي اتفقنا عليها'); }); });

  function setSave(t){ document.getElementById('saveState').textContent=t; }
  function changed(){ render(); dirty=true; try{ localStorage.setItem('khatet',JSON.stringify(state)); }catch(e){}
    setSave('بيتحفظ…'); clearTimeout(saveTimer); saveTimer=setTimeout(flush,700); }

  /* Saved on the server, behind the same passkey as the rest of /time, so the
     plan reads the same on the phone and the laptop. localStorage is only the
     copy that paints before the server answers. */
  var API='/api/tasks?plan=state';
  function flush(){ if(writing||!dirty) return; writing=true; dirty=false; var body=clone(state);
    fetch(API,{method:'PUT',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(body)})
      .then(function(r){ if(!r.ok) throw new Error(r.status===401?'auth':'bad'); writing=false; setSave('اتحفظ'); if(dirty) flush(); })
      .catch(function(e){ writing=false; dirty=true; setSave(e.message==='auth'?'سجّل دخولك الأول عشان يتحفظ':'ما اتحفظش، هنجرّب تاني مع أول تغيير'); }); }

  try{ var saved=localStorage.getItem('khatet'); if(saved) state=merge(DEFAULT, JSON.parse(saved)); }catch(e){}
  render();
  window.replan=render; // the page around this one calls it when the theme changes

  fetch(API,{credentials:'same-origin'}).then(function(r){ if(!r.ok) throw new Error(r.status===401?'auth':'bad'); return r.json(); })
    .then(function(d){ if(d.state){ state=merge(DEFAULT,d.state); try{ localStorage.setItem('khatet',JSON.stringify(state)); }catch(e){} render(); setSave('اتحفظ'); }
      else { dirty=true; flush(); } })
    .catch(function(e){ setSave(e.message==='auth'?'سجّل دخولك الأول عشان يتحفظ':'محفوظ على الجهاز ده بس دلوقتي'); });
})();
</script>
</body></html>`;
