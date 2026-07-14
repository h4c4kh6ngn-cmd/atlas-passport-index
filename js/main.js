/* ============ DATA LOADING ============ */
const EU = "E", SCH = "S", VWP = "V", CBI = "C";
const STATUS_TO_LETTER = { allowed: "J", restricted: "B", not_allowed: "N" };

function flagsToString(flags) {
  return (
    (flags.euMember ? EU : "") +
    (flags.schengenMember ? SCH : "") +
    (flags.usVisaWaiver ? VWP : "") +
    (flags.citizenshipByInvestment ? CBI : "")
  );
}

async function loadData() {
  const manifestRes = await fetch("data/manifest.json");
  if (!manifestRes.ok) throw new Error("Could not load data/manifest.json (" + manifestRes.status + ")");
  const manifest = await manifestRes.json();

  const records = await Promise.all(
    manifest.countries.map(async (iso3) => {
      const res = await fetch(`data/countries/${iso3}.json`);
      if (!res.ok) throw new Error(`Could not load data/countries/${iso3}.json (${res.status})`);
      return res.json();
    })
  );

  const D = records.map((r) => [
    r.name.en,
    r.iso2,
    r.iso3,
    r.passportIndex.score,
    r.region,
    flagsToString(r.flags),
    r.passportIndex.note || "",
  ]);

  const DN = {};
  const DNNOTE = {};
  for (const r of records) {
    DN[r.iso2] = STATUS_TO_LETTER[r.dualNationality.status] || "B";
    if (r.dualNationality.note) DNNOTE[r.iso2] = r.dualNationality.note;
  }

  return { D, DN, DNNOTE };
}

/* ============ MODEL ============ */
const TIERS=[
 {min:180,name:"Elite",c:"var(--t1)",desc:"Virtually unrestricted global mobility"},
 {min:140,name:"Strong",c:"var(--t2)",desc:"Excellent coverage with a few blind spots"},
 {min:100,name:"Moderate",c:"var(--t3)",desc:"Regionally strong, Western destinations often require a visa"},
 {min:60,name:"Limited",c:"var(--t4)",desc:"Visa required for most top destinations"},
 {min:40,name:"Weak",c:"var(--t5)",desc:"Travel almost always requires preparation"},
 {min:0,name:"Critical",c:"var(--t6)",desc:"The world's heaviest travel restrictions"}
];
const DND={
 J:"This country generally allows holding a second nationality. Ideal as a base or complement to a two-passport strategy.",
 B:"Allowed under conditions or via exceptions (e.g. marriage, birth, prior permission, or only with certain countries). The details decide everything — check the current law.",
 N:"Voluntarily acquiring another nationality generally means losing the original passport here. A second passport therefore requires a choice."
};
const DNL={J:"Allowed",B:"Restricted / exceptions",N:"Not allowed"};

const flagEmoji=iso2=>iso2==="XK"?"🏴":String.fromCodePoint(...[...iso2].map(c=>127397+c.charCodeAt(0)));

function init(D, DN, DNNOTE){
const P=D.map(d=>({name:d[0],c2:d[1],c3:d[2],score:d[3],region:d[4],f:d[5]||"",note:d[6]||""}));
P.sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name,"en"));
let rank=0,prev=null;
P.forEach(p=>{if(p.score!==prev){rank++;prev=p.score}p.rank=rank;});
P.forEach((p,i)=>{p.i=i;p.tier=TIERS.find(t=>p.score>=t.min);p.pct=Math.round(p.score/227*100);p.flag=flagEmoji(p.c2);});
const total=P.length,maxRank=rank;

/* ============ ADVANTAGES ENGINE ============ */
function build(p){
  const adv=[],neg=[];
  if(p.rank===1)adv.push(["World's number one","No other passport opens more borders. For the holder, that means: book and go, almost anywhere."]);
  if(p.f.includes(EU))adv.push(["EU citizenship","Unrestricted right to live, work, study, and start a business in all 27 EU member states — no permit needed. Economic value that goes far beyond travel."]);
  if(p.f.includes(SCH))adv.push(["Schengen Area","Move freely across 29 European countries without passport control."]);
  if(p.f.includes(VWP))adv.push(["US without a visa (ESTA)","Member of the US Visa Waiver Program: up to 90 days in the US with just an online authorization costing around $21."]);
  if(p.f.includes(CBI))adv.push(["Obtainable via investment","This passport has an official citizenship-by-investment program — relevant for anyone seeking a second nationality."]);
  if(p.score>=180)adv.push(["Business spontaneity","A meeting tomorrow in Tokyo, New York, or Dubai? With "+p.pct+"% of all destinations visa-free, that's just booking a flight, not a procedure."]);
  else if(p.score>=140)adv.push(["Broad coverage","Access to "+p.score+" destinations ("+p.pct+"% of the world) — most tourist and business routes are open."]);
  else if(p.score>=100)adv.push(["Regional strength","Generally free travel within its own region; "+p.score+" destinations worldwide without a visa arranged in advance."]);
  else adv.push(["Basic mobility","Access to "+p.score+" destinations, mostly within its own region and via visa-on-arrival arrangements."]);
  if(p.rank<=Math.ceil(maxRank*0.1))adv.push(["Top 10% worldwide","Rank "+p.rank+" of "+maxRank+" — this passport is among the world's absolute elite and is an asset in its own right."]);
  // negatives
  if(!p.f.includes(VWP)&&p.score<180)neg.push(["United States","No ESTA access: a US visit requires a B1/B2 visa with an interview and wait times."]);
  if(!p.f.includes(SCH)&&!p.f.includes(EU)&&p.score<140)neg.push(["Europe","The Schengen Area requires a visa in advance — often the biggest practical hurdle for holders of this passport."]);
  if(p.score<100)neg.push(["Planning required","Most top economies require a visa application weeks to months in advance; spontaneous international travel is barely possible."]);
  if(p.score<40)neg.push(["Heaviest category","This passport falls in the world's lowest mobility class; even transit visas are regularly an obstacle."]);
  if(p.score>=140&&p.score<180&&!p.f.includes(EU))neg.push(["Net disadvantage vs. the top","The gap with tier Elite ("+(192-p.score)+" destinations) is mainly in Asia and a handful of Western destinations."]);
  return{adv,neg};
}
/* ============ HERO STATS ============ */
const topScore=P[0].score, bottomScore=P[P.length-1].score;
document.getElementById("statsRow").innerHTML =
  '<div class="stat"><b>'+topScore+'</b><span>Highest score</span></div>'
 +'<div class="stat"><b>'+bottomScore+'</b><span>Lowest score</span></div>'
 +'<div class="stat"><b>'+(topScore-bottomScore)+'</b><span>Mobility gap</span></div>'
 +'<div class="stat"><b>'+maxRank+'</b><span>Rank positions</span></div>';
document.getElementById("spec-first").textContent = "No. 1 — "+P[0].name.toUpperCase();
document.getElementById("spec-last").textContent = "No. "+total+" — "+P[P.length-1].name.toUpperCase();

/* ============ SPECTRUM ============ */
const spec=document.getElementById("spectrum"),tip=document.getElementById("spec-tip");
P.forEach(p=>{
  const b=document.createElement("div");b.className="bar";
  b.style.height=(p.score/topScore*100)+"%";
  b.style.background=p.tier.c;b.style.opacity=.85;
  b.addEventListener("mouseenter",()=>tip.textContent="No."+p.rank+"  "+p.flag+" "+p.name.toUpperCase()+" — "+p.score+" destinations");
  b.addEventListener("click",()=>openD(p.i));
  spec.appendChild(b);
});
const mrzTxt=P.slice(0,26).map(p=>"P<"+p.c3+"<<"+p.name.toUpperCase().replace(/[^A-Z]/g,"<")+"<<"+p.score).join("<<<");
document.getElementById("mrzline").textContent=mrzTxt+"<<<"+mrzTxt;

/* ============ RANKING LIST ============ */
const list=document.getElementById("ranklist"),q=document.getElementById("q"),
regionSel=document.getElementById("regionSel"),sortSel=document.getElementById("sortSel"),
chips=document.getElementById("chips"),morebtn=document.getElementById("morebtn"),countnote=document.getElementById("countnote");
[...new Set(P.map(p=>p.region))].sort().forEach(r=>{const o=document.createElement("option");o.value=r;o.textContent=r;regionSel.appendChild(o);});
let activeTier=null,expanded=false;
TIERS.forEach(t=>{
  const c=document.createElement("button");c.className="chip";c.textContent=t.name+" · "+(t.min===0?"< 40":t.min+"+");
  c.onclick=()=>{activeTier=activeTier===t?null:t;[...chips.children].forEach(x=>x.classList.remove("on"));if(activeTier)c.classList.add("on");expanded=true;render();};
  chips.appendChild(c);
});
function filtered(){
  let out=P.filter(p=>(!q.value||p.name.toLowerCase().includes(q.value.toLowerCase()))&&(!regionSel.value||p.region===regionSel.value)&&(!activeTier||p.tier===activeTier));
  if(sortSel.value==="az")out=[...out].sort((a,b)=>a.name.localeCompare(b.name,"en"));
  return out;
}
function render(){
  const f=filtered(),show=expanded||q.value||regionSel.value||activeTier?f:f.slice(0,20);
  list.innerHTML="";
  show.forEach(p=>{
    const r=document.createElement("button");r.className="row";r.style.setProperty("--tc",p.tier.c);
    r.innerHTML='<span class="rk">No. <b>'+p.rank+'</b></span><span class="flag">'+p.flag+'</span><span class="nm">'+p.name+'<small>'+p.region+' · '+p.tier.name+'</small></span><span class="meter"><i style="width:'+(p.score/topScore*100)+'%"></i></span><span class="sc">'+p.score+'<small>DEST.</small></span>';
    r.onclick=()=>openD(p.i);
    list.appendChild(r);
  });
  morebtn.style.display=(show.length<f.length)?"block":"none";
  countnote.textContent=show.length+" of "+total+" passports shown";
}
morebtn.onclick=()=>{expanded=true;render();};
[q,regionSel,sortSel].forEach(el=>el.addEventListener("input",render));
render();

/* ============ DOSSIER ============ */
const overlay=document.getElementById("overlay"),dos=document.getElementById("dossier");
let cur=0;
function openD(i){
  cur=i;const p=P[i],{adv,neg}=build(p);
  const mrz1=("P<"+p.c3+p.name.toUpperCase().replace(/[^A-Z]/g,"<")+"<".repeat(44)).slice(0,44);
  const mrz2=(p.c3+String(p.score)+"<POWERINDEX<2026<RANK<"+String(p.rank).padStart(3,"0")+"<".repeat(44)).slice(0,44);
  dos.innerHTML='<div class="d-inner">'
   +'<button class="d-close" onclick="closeD()" aria-label="Close">✕</button>'
   +'<div class="d-top"><div class="crest"><span>'+p.flag+'</span></div>'
   +'<div class="d-title"><h3>'+p.name+'</h3><div class="mono">PASSPORT · '+p.c3+' · '+p.region.toUpperCase()+'</div></div>'
   +'<div class="d-stamp" style="--sc:'+p.tier.c+'">Tier · '+p.tier.name+'</div></div>'
   +'<div class="d-grid"><div class="d-cell"><span>World rank</span><b>No. '+p.rank+'</b></div>'
   +'<div class="d-cell"><span>Visa-free</span><b>'+p.score+'</b></div>'
   +'<div class="d-cell"><span>World coverage</span><b>'+p.pct+'%</b></div></div>'
   +'<div class="d-cov"><div class="lbl"><span>MOBILITY RANGE</span><span>'+p.score+' / 227 destinations</span></div><div class="bar"><i style="width:0" id="covbar"></i></div></div>'
   +(p.note?'<p class="d-note">'+p.note+'</p>':'')
   +'<p class="d-sec-t">Advantages</p>'+adv.map(a=>'<div class="adv"><b>'+a[0]+'</b><p>'+a[1]+'</p></div>').join("")
   +(neg.length?'<p class="d-sec-t">Limitations</p>'+neg.map(a=>'<div class="adv neg"><b>'+a[0]+'</b><p>'+a[1]+'</p></div>').join(""):"")
   +'<div class="adv" style="border-color:var(--steel);background:rgba(143,163,191,.06)"><b>Tier '+p.tier.name+' — '+p.tier.desc+'</b><p>Comparable passports: '+P.filter(x=>x.rank===p.rank&&x.i!==p.i).slice(0,4).map(x=>x.flag+" "+x.name).join(", ")+(P.filter(x=>x.rank===p.rank).length===1?"none — this rank is not shared":"")+'</p></div>'
   +'<p class="d-sec-t">Dual nationality</p><div class="adv" style="border-color:'+(DN[p.c2]==="J"?"#7FA86B":DN[p.c2]==="B"?"var(--gold)":"var(--t5)")+'"><b>'+DNL[DN[p.c2]]+'</b><p>'+(DNNOTE[p.c2]||DND[DN[p.c2]])+'</p></div>'
   +'<button class="d-cta" onclick="toast(\'Demo — your affiliate/checkout link goes here\')">Arrange your visa or upgrade advice →</button>'
   +'<div class="d-nav"><button onclick="step(-1)">← '+(P[i-1]?P[i-1].flag+" "+P[i-1].name:"")+'</button><button onclick="step(1)">'+(P[i+1]?P[i+1].flag+" "+P[i+1].name+" →":"")+'</button></div>'
   +'<div class="d-mrz">'+mrz1+"<br>"+mrz2+'</div></div>';
  overlay.classList.add("open");dos.classList.add("open");
  document.body.style.overflow="hidden";
  requestAnimationFrame(()=>requestAnimationFrame(()=>{const cb=document.getElementById("covbar");if(cb)cb.style.width=p.pct+"%";}));
}
function step(d){const n=cur+d;if(P[n])openD(n);}
function closeD(){overlay.classList.remove("open");dos.classList.remove("open");document.body.style.overflow="";}
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeD();if(dos.classList.contains("open")){if(e.key==="ArrowRight")step(1);if(e.key==="ArrowLeft")step(-1);}});
window.closeD=closeD;

/* ============ COMPARE ============ */
const cA=document.getElementById("cmpA"),cB=document.getElementById("cmpB"),cOut=document.getElementById("cmpOut");
P.forEach((p,i)=>{[cA,cB].forEach(s=>{const o=document.createElement("option");o.value=i;o.textContent=p.flag+"  "+p.name+" (No."+p.rank+")";s.appendChild(o.cloneNode(true));});});
cA.value=P.findIndex(p=>p.c2==="NL");cB.value=P.findIndex(p=>p.c2==="US");
function cmp(){
  const a=P[cA.value],b=P[cB.value];
  const rows=[
   ["World rank","No. "+a.rank,"No. "+b.rank,a.rank<b.rank?0:a.rank>b.rank?1:-1],
   ["Visa-free destinations",a.score,b.score,a.score>b.score?0:a.score<b.score?1:-1],
   ["World coverage",a.pct+"%",b.pct+"%",a.pct>b.pct?0:a.pct<b.pct?1:-1],
   ["Tier",a.tier.name,b.tier.name,-1],
   ["EU citizenship",a.f.includes(EU)?"Yes":"No",b.f.includes(EU)?"Yes":"No",a.f.includes(EU)&&!b.f.includes(EU)?0:!a.f.includes(EU)&&b.f.includes(EU)?1:-1],
   ["US without a visa (ESTA)",a.f.includes(VWP)?"Yes":"No",b.f.includes(VWP)?"Yes":"No",a.f.includes(VWP)&&!b.f.includes(VWP)?0:!a.f.includes(VWP)&&b.f.includes(VWP)?1:-1],
   ["Schengen without a visa",a.f.includes(SCH)||a.f.includes(EU)||a.score>=140?"Yes":"Visa required",b.f.includes(SCH)||b.f.includes(EU)||b.score>=140?"Yes":"Visa required",-1]
  ];
  const diff=Math.abs(a.score-b.score),lead=a.score>=b.score?a:b;
  cOut.innerHTML=rows.map(r=>'<div class="cmp-row"><span class="val'+(r[3]===0?" win":"")+'">'+r[1]+'</span><span class="c-lbl">'+r[0]+'</span><span class="val'+(r[3]===1?" win":"")+'">'+r[2]+'</span></div>').join("")
  +'<p style="margin-top:20px;font-size:14px;color:var(--ivory-dim);text-align:center;font-style:italic;font-family:Fraunces,serif">'+(diff===0?"Perfect tie: both passports open the same number of doors.":lead.flag+" "+lead.name+" opens "+diff+" more destinations — "+(diff>80?"a difference of an entire continent.":diff>30?"a substantial mobility advantage.":"a modest but real difference."))+'</p>';
}
[cA,cB].forEach(s=>s.addEventListener("change",cmp));cmp();

/* ============ DUAL NATIONALITY DB ============ */
const dnGrid=document.getElementById("dnGrid"),dnQ=document.getElementById("dnQ"),dnChips=document.getElementById("dnChips");
let dnF=null;
["J","B","N"].forEach(s=>{
  const n=P.filter(p=>DN[p.c2]===s).length;
  const c=document.createElement("button");c.className="dn-chip";
  c.innerHTML='<span class="dot st-'+s+'"></span>'+DNL[s]+' <b>'+n+'</b>';
  c.onclick=()=>{dnF=dnF===s?null:s;[...dnChips.children].forEach(x=>x.classList.remove("on"));if(dnF)c.classList.add("on");dnRender();};
  dnChips.appendChild(c);
});
function dnRender(){
  const f=P.filter(p=>(!dnQ.value||p.name.toLowerCase().includes(dnQ.value.toLowerCase()))&&(!dnF||DN[p.c2]===dnF))
           .slice().sort((a,b)=>a.name.localeCompare(b.name,"en"));
  dnGrid.innerHTML="";
  f.forEach(p=>{
    const b=document.createElement("button");b.className="dn-item";
    b.innerHTML='<span class="dot st-'+DN[p.c2]+'"></span>'+p.flag+" "+p.name+'<small>No.'+p.rank+'</small>';
    b.onclick=()=>openD(p.i);
    dnGrid.appendChild(b);
  });
}
dnQ.addEventListener("input",dnRender);
dnRender();

document.getElementById("loading").style.display="none";
document.getElementById("app-ranking").style.display="";
}

/* ============ TOAST ============ */
function toast(msg){const t=document.getElementById("toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2600);}
window.toast=toast;

/* ============ BOOTSTRAP ============ */
loadData()
  .then(({D,DN,DNNOTE})=>init(D,DN,DNNOTE))
  .catch(err=>{
    console.error(err);
    document.getElementById("loading").style.display="none";
    const box=document.getElementById("loaderror");
    box.style.display="block";
    box.textContent="Could not load the passport data: "+err.message+". Serve the site via a local server (e.g. npx serve) — fetch() doesn't work when opening the file directly in the browser (file://).";
  });
