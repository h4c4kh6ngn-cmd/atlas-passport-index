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
  if (!manifestRes.ok) throw new Error("Kon data/manifest.json niet laden (" + manifestRes.status + ")");
  const manifest = await manifestRes.json();

  const records = await Promise.all(
    manifest.countries.map(async (iso3) => {
      const res = await fetch(`data/countries/${iso3}.json`);
      if (!res.ok) throw new Error(`Kon data/countries/${iso3}.json niet laden (${res.status})`);
      return res.json();
    })
  );

  const D = records.map((r) => [
    r.name.nl,
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
 {min:180,name:"Elite",c:"var(--t1)",desc:"Vrijwel onbeperkte wereldwijde mobiliteit"},
 {min:140,name:"Sterk",c:"var(--t2)",desc:"Uitstekende dekking met enkele blinde vlekken"},
 {min:100,name:"Midden",c:"var(--t3)",desc:"Regionaal sterk, westerse bestemmingen vaak visumplichtig"},
 {min:60,name:"Beperkt",c:"var(--t4)",desc:"Visum vereist voor de meeste toplocaties"},
 {min:40,name:"Zwak",c:"var(--t5)",desc:"Reizen vergt vrijwel altijd voorbereiding"},
 {min:0,name:"Kritiek",c:"var(--t6)",desc:"Zwaarste reisbeperkingen ter wereld"}
];
const DND={
 J:"Dit land staat het houden van een tweede nationaliteit in de regel toe. Ideaal als basis of aanvulling in een tweepaspoorten-strategie.",
 B:"Toegestaan onder voorwaarden of via uitzonderingen (bv. huwelijk, geboorte, toestemming vooraf, of alleen met bepaalde landen). De details bepalen alles — controleer de actuele wet.",
 N:"Vrijwillig een andere nationaliteit aannemen leidt hier in de regel tot verlies van het oorspronkelijke paspoort. Een tweede paspoort vereist dus een keuze."
};
const DNL={J:"Toegestaan",B:"Beperkt / uitzonderingen",N:"Niet toegestaan"};

const flagEmoji=iso2=>iso2==="XK"?"🏴":String.fromCodePoint(...[...iso2].map(c=>127397+c.charCodeAt(0)));

function init(D, DN, DNNOTE){
const P=D.map(d=>({name:d[0],c2:d[1],c3:d[2],score:d[3],region:d[4],f:d[5]||"",note:d[6]||""}));
P.sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name,"nl"));
let rank=0,prev=null;
P.forEach(p=>{if(p.score!==prev){rank++;prev=p.score}p.rank=rank;});
P.forEach((p,i)=>{p.i=i;p.tier=TIERS.find(t=>p.score>=t.min);p.pct=Math.round(p.score/227*100);p.flag=flagEmoji(p.c2);});
const total=P.length,maxRank=rank;

/* ============ ADVANTAGES ENGINE ============ */
function build(p){
  const adv=[],neg=[];
  if(p.rank===1)adv.push(["Nummer één van de wereld","Geen enkel ander paspoort opent meer grenzen. Voor de houder betekent dit: boeken en vertrekken, vrijwel overal."]);
  if(p.f.includes(EU))adv.push(["EU-burgerschap","Onbeperkt wonen, werken, studeren en ondernemen in alle 27 EU-lidstaten — geen vergunning nodig. Economische waarde die ver voorbij reizen gaat."]);
  if(p.f.includes(SCH))adv.push(["Schengenzone","Grenzeloos bewegen door 29 Europese landen zonder paspoortcontrole."]);
  if(p.f.includes(VWP))adv.push(["VS zonder visum (ESTA)","Lid van het Amerikaanse Visa Waiver Program: tot 90 dagen naar de VS met alleen een online autorisatie van ± $21."]);
  if(p.f.includes(CBI))adv.push(["Verkrijgbaar via investering","Dit paspoort kent een officieel citizenship-by-investment programma — relevant voor wie een tweede nationaliteit zoekt."]);
  if(p.score>=180)adv.push(["Zakelijke spontaniteit","Morgen een meeting in Tokio, New York of Dubai? Met "+p.pct+"% van alle bestemmingen visumvrij is dat een vlucht boeken, geen procedure."]);
  else if(p.score>=140)adv.push(["Brede dekking","Toegang tot "+p.score+" bestemmingen ("+p.pct+"% van de wereld) — de meeste toeristische en zakelijke routes liggen open."]);
  else if(p.score>=100)adv.push(["Regionale kracht","Binnen de eigen regio doorgaans vrij reizen; "+p.score+" bestemmingen wereldwijd zonder visum vooraf."]);
  else adv.push(["Basis-mobiliteit","Toegang tot "+p.score+" bestemmingen, veelal in de eigen regio en via visa-on-arrival-regelingen."]);
  if(p.rank<=Math.ceil(maxRank*0.1))adv.push(["Top 10% wereldwijd","Rang "+p.rank+" van "+maxRank+" — dit paspoort behoort tot de absolute wereldtop en is een asset op zich."]);
  // negatives
  if(!p.f.includes(VWP)&&p.score<180)neg.push(["Verenigde Staten","Geen ESTA-toegang: een VS-bezoek vereist een B1/B2-visum met interview en wachttijden."]);
  if(!p.f.includes(SCH)&&!p.f.includes(EU)&&p.score<140)neg.push(["Europa","De Schengenzone vereist een visum vooraf — vaak de grootste praktische drempel voor houders van dit paspoort."]);
  if(p.score<100)neg.push(["Planning vereist","De meeste top-economieën vereisen een visumaanvraag weken tot maanden vooraf; spontaan internationaal reizen is nauwelijks mogelijk."]);
  if(p.score<40)neg.push(["Zwaarste categorie","Dit paspoort valt in de laagste mobiliteitsklasse ter wereld; ook transitvisa vormen regelmatig een obstakel."]);
  if(p.score>=140&&p.score<180&&!p.f.includes(EU))neg.push(["Netto-nadeel t.o.v. de top","De kloof met tier Elite ("+(192-p.score)+" bestemmingen) zit vooral in Azië en enkele westerse bestemmingen."]);
  return{adv,neg};
}
/* ============ HERO STATS ============ */
const topScore=P[0].score, bottomScore=P[P.length-1].score;
document.getElementById("statsRow").innerHTML =
  '<div class="stat"><b>'+topScore+'</b><span>Hoogste score</span></div>'
 +'<div class="stat"><b>'+bottomScore+'</b><span>Laagste score</span></div>'
 +'<div class="stat"><b>'+(topScore-bottomScore)+'</b><span>Mobiliteitskloof</span></div>'
 +'<div class="stat"><b>'+maxRank+'</b><span>Rangposities</span></div>';
document.getElementById("spec-first").textContent = "№ 1 — "+P[0].name.toUpperCase();
document.getElementById("spec-last").textContent = "№ "+total+" — "+P[P.length-1].name.toUpperCase();

/* ============ SPECTRUM ============ */
const spec=document.getElementById("spectrum"),tip=document.getElementById("spec-tip");
P.forEach(p=>{
  const b=document.createElement("div");b.className="bar";
  b.style.height=(p.score/topScore*100)+"%";
  b.style.background=p.tier.c;b.style.opacity=.85;
  b.addEventListener("mouseenter",()=>tip.textContent="№"+p.rank+"  "+p.flag+" "+p.name.toUpperCase()+" — "+p.score+" bestemmingen");
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
  if(sortSel.value==="az")out=[...out].sort((a,b)=>a.name.localeCompare(b.name,"nl"));
  return out;
}
function render(){
  const f=filtered(),show=expanded||q.value||regionSel.value||activeTier?f:f.slice(0,20);
  list.innerHTML="";
  show.forEach(p=>{
    const r=document.createElement("button");r.className="row";r.style.setProperty("--tc",p.tier.c);
    r.innerHTML='<span class="rk">№ <b>'+p.rank+'</b></span><span class="flag">'+p.flag+'</span><span class="nm">'+p.name+'<small>'+p.region+' · '+p.tier.name+'</small></span><span class="meter"><i style="width:'+(p.score/topScore*100)+'%"></i></span><span class="sc">'+p.score+'<small>BESTEMM.</small></span>';
    r.onclick=()=>openD(p.i);
    list.appendChild(r);
  });
  morebtn.style.display=(show.length<f.length)?"block":"none";
  countnote.textContent=show.length+" van "+total+" paspoorten getoond";
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
  const mrz2=(p.c3+String(p.score)+"<POWERINDEX<2026<RANG<"+String(p.rank).padStart(3,"0")+"<".repeat(44)).slice(0,44);
  dos.innerHTML='<div class="d-inner">'
   +'<button class="d-close" onclick="closeD()" aria-label="Sluiten">✕</button>'
   +'<div class="d-top"><div class="crest"><span>'+p.flag+'</span></div>'
   +'<div class="d-title"><h3>'+p.name+'</h3><div class="mono">PASPOORT · '+p.c3+' · '+p.region.toUpperCase()+'</div></div>'
   +'<div class="d-stamp" style="--sc:'+p.tier.c+'">Tier · '+p.tier.name+'</div></div>'
   +'<div class="d-grid"><div class="d-cell"><span>Wereldrang</span><b>№ '+p.rank+'</b></div>'
   +'<div class="d-cell"><span>Visumvrij</span><b>'+p.score+'</b></div>'
   +'<div class="d-cell"><span>Werelddekking</span><b>'+p.pct+'%</b></div></div>'
   +'<div class="d-cov"><div class="lbl"><span>MOBILITEITSBEREIK</span><span>'+p.score+' / 227 bestemmingen</span></div><div class="bar"><i style="width:0" id="covbar"></i></div></div>'
   +(p.note?'<p class="d-note">'+p.note+'</p>':'')
   +'<p class="d-sec-t">Voordelen</p>'+adv.map(a=>'<div class="adv"><b>'+a[0]+'</b><p>'+a[1]+'</p></div>').join("")
   +(neg.length?'<p class="d-sec-t">Beperkingen</p>'+neg.map(a=>'<div class="adv neg"><b>'+a[0]+'</b><p>'+a[1]+'</p></div>').join(""):"")
   +'<div class="adv" style="border-color:var(--steel);background:rgba(143,163,191,.06)"><b>Tier '+p.tier.name+' — '+p.tier.desc+'</b><p>Vergelijkbare paspoorten: '+P.filter(x=>x.rank===p.rank&&x.i!==p.i).slice(0,4).map(x=>x.flag+" "+x.name).join(", ")+(P.filter(x=>x.rank===p.rank).length===1?"geen — deze rang wordt niet gedeeld":"")+'</p></div>'
   +'<p class="d-sec-t">Dubbele nationaliteit</p><div class="adv" style="border-color:'+(DN[p.c2]==="J"?"#7FA86B":DN[p.c2]==="B"?"var(--gold)":"var(--t5)")+'"><b>'+DNL[DN[p.c2]]+'</b><p>'+(DNNOTE[p.c2]||DND[DN[p.c2]])+'</p></div>'
   +'<button class="d-cta" onclick="toast(\'Demo — hier komt je affiliate/checkout-link\')">Regel je visum of upgrade-advies →</button>'
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
P.forEach((p,i)=>{[cA,cB].forEach(s=>{const o=document.createElement("option");o.value=i;o.textContent=p.flag+"  "+p.name+" (№"+p.rank+")";s.appendChild(o.cloneNode(true));});});
cA.value=P.findIndex(p=>p.c2==="NL");cB.value=P.findIndex(p=>p.c2==="US");
function cmp(){
  const a=P[cA.value],b=P[cB.value];
  const rows=[
   ["Wereldrang","№ "+a.rank,"№ "+b.rank,a.rank<b.rank?0:a.rank>b.rank?1:-1],
   ["Visumvrije bestemmingen",a.score,b.score,a.score>b.score?0:a.score<b.score?1:-1],
   ["Werelddekking",a.pct+"%",b.pct+"%",a.pct>b.pct?0:a.pct<b.pct?1:-1],
   ["Tier",a.tier.name,b.tier.name,-1],
   ["EU-burgerschap",a.f.includes(EU)?"Ja":"Nee",b.f.includes(EU)?"Ja":"Nee",a.f.includes(EU)&&!b.f.includes(EU)?0:!a.f.includes(EU)&&b.f.includes(EU)?1:-1],
   ["VS zonder visum (ESTA)",a.f.includes(VWP)?"Ja":"Nee",b.f.includes(VWP)?"Ja":"Nee",a.f.includes(VWP)&&!b.f.includes(VWP)?0:!a.f.includes(VWP)&&b.f.includes(VWP)?1:-1],
   ["Schengen zonder visum",a.f.includes(SCH)||a.f.includes(EU)||a.score>=140?"Ja":"Visum nodig",b.f.includes(SCH)||b.f.includes(EU)||b.score>=140?"Ja":"Visum nodig",-1]
  ];
  const diff=Math.abs(a.score-b.score),lead=a.score>=b.score?a:b;
  cOut.innerHTML=rows.map(r=>'<div class="cmp-row"><span class="val'+(r[3]===0?" win":"")+'">'+r[1]+'</span><span class="c-lbl">'+r[0]+'</span><span class="val'+(r[3]===1?" win":"")+'">'+r[2]+'</span></div>').join("")
  +'<p style="margin-top:20px;font-size:14px;color:var(--ivory-dim);text-align:center;font-style:italic;font-family:Fraunces,serif">'+(diff===0?"Perfect gelijkspel: beide paspoorten openen evenveel deuren.":lead.flag+" "+lead.name+" opent "+diff+" bestemmingen méér — "+(diff>80?"een verschil van een compleet werelddeel.":diff>30?"een substantieel mobiliteitsvoordeel.":"een beperkt maar reëel verschil."))+'</p>';
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
           .slice().sort((a,b)=>a.name.localeCompare(b.name,"nl"));
  dnGrid.innerHTML="";
  f.forEach(p=>{
    const b=document.createElement("button");b.className="dn-item";
    b.innerHTML='<span class="dot st-'+DN[p.c2]+'"></span>'+p.flag+" "+p.name+'<small>№'+p.rank+'</small>';
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
    box.textContent="Kon de paspoortdata niet laden: "+err.message+". Draai de site via een lokale server (bv. npx serve) — fetch() werkt niet bij het openen van het bestand direct in de browser (file://).";
  });
