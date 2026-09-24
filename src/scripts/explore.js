// Explore: the same pieces drawn through five lenses (map, timeline, themes, methods, publications).
// Desktop gets one animated SVG; phones get lists, a vertical timeline and a bottom sheet.
import * as d3 from 'd3';
import { feature } from 'topojson-client';
import { timeDomain, tscale, yearTicks } from '../lib/timescale.js';

export async function initExplore(data) {
const FUTURE = { id: 'future', name: 'Future outlets', short: 'Future outlets' };
const OUTLETS = data.outlets;
const oName = id => (OUTLETS.find(o=>o.id===id)||FUTURE).name;
const oShort = id => (OUTLETS.find(o=>o.id===id)||FUTURE).short;
const PLACES = Object.fromEntries(Object.entries(data.places).map(([name,p])=>[name,{name,...p}]));
const PROJECTS = data.projects;
const THEMES = data.lists.themes, METHODS = data.lists.methods, ERAS = data.lists.eras;
const INTRO = data.intro;
// short field names keep the chart code compact
const R = data.pieces.map((p,i)=>({i, id:p.n, t:p.title, o:p.outlet, d:p.date, dp:p.datePrecision==='year'?'y':'', u:p.url,
  m:p.method, th:p.themes, pl:p.places, era:p.era, line:p.line, project:p.project, date:new Date(p.date+'T12:00:00')}));
const LANES = [...new Set(R.map(r=>r.o))];
const fmtFull = d3.timeFormat('%b %-d, %Y');
const fdate = r => r.dp==='y' ? String(r.date.getFullYear()) : fmtFull(r.date);
const fmtShort = d3.timeFormat('%b %Y');
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const DUR = RM ? 0 : 750;
const DOM = timeDomain(R.map(r=>r.date));
const YT = yearTicks(DOM);
function drawBreak(g,x,y0,y1){
  const m=(x.gap[0]+x.gap[1])/2;
  g.append('rect').attr('class','gapband').attr('x',x.gap[0]).attr('width',x.gap[1]-x.gap[0]).attr('y',y0).attr('height',y1-y0);
  [-3,3].forEach(o=>g.append('line').attr('class','brk').attr('x1',m+o-3).attr('x2',m+o+3).attr('y1',y1-6).attr('y2',y1+6));
}
const LAND = await fetch(data.base+'data/land-110m.json').then(r=>r.json());
const LANDF = feature(LAND, LAND.objects.land);

/* key */
const state = {lens:'map', sel:null, filter:null};
(function key(){
  const k = document.getElementById('key');
  OUTLETS.forEach(o=>{
    const b = document.createElement('button'); b.type='button'; b.setAttribute('aria-pressed','false');
    b.innerHTML = `<i class="dot f-${o.id}"></i>${o.name}`;
    b.onclick = ()=>setFilter({type:'outlet',value:o.id,label:o.name});
    b.dataset.o=o.id; k.appendChild(b);
  });
})();

/* ---------- main viz ---------- */
const W=1000, H=520;
const svg = d3.select('#viz');
const gBack = svg.append('g'), gCells = svg.append('g'), gDots = svg.append('g'), gFront = svg.append('g');
const RAD = 6.5;

const matches = r => {
  const f = state.filter; if(!f) return true;
  if(f.type==='outlet') return r.o===f.value;
  if(f.type==='theme') return r.th.includes(f.value);
  if(f.type==='method') return r.m===f.value;
  if(f.type==='place') return r.pl.includes(f.value);
  return true;
};

function dodge(items, xOf, step){ // vertical stacking for close dates
  const lv = [];
  items.forEach(it=>{
    const x = xOf(it); let k=0;
    while(lv[k]!==undefined && x - lv[k] < step) k++;
    lv[k]=x; it._lv = k;
  });
}

const LAYOUT = {
  timeline(){
    const x = tscale(DOM,150,975,.045,.3);
    const lanes = LANES;
    const laneY = d3.scalePoint(lanes,[210,470]).padding(.4);
    const pos = new Map();
    lanes.forEach(l=>{
      const items = R.filter(r=>r.o===l);
      dodge(items, r=>x(r.date), 14);
      items.forEach(r=>{const k=r._lv; const off = k===0?0:(k%2?-1:1)*Math.ceil(k/2)*14; pos.set(r.i,[x(r.date), laneY(l)+off]);});
    });
    // era bars span the pieces tagged with each era; an era with no pieces yet is drawn as 'next'
    let row = 0;
    const eras = ERAS.map(n=>{
      const rs = R.filter(r=>r.era===n);
      return rs.length ? {n, s:d3.extent(rs, r=>r.date), row:(row++)%2} : {n, s:[new Date(+R[R.length-1].date+40*864e5), DOM.end], row:(row++)%2, next:true};
    });
    const back = g=>{
      if(x.gap) drawBreak(g,x,112,H-24);
      g.selectAll('.gridline').data(YT).join('line').attr('class','gridline')
        .attr('x1',d=>x(d.d)).attr('x2',d=>x(d.d)).attr('y1',112).attr('y2',H-24);
      g.selectAll('.axis-lbl').data(YT).join('text').attr('class','axis-lbl')
        .attr('x',d=>x(d.d)+4).attr('y',H-8).text(d=>d.label);
      const e = g.selectAll('.era').data(eras).join('g').attr('class',d=>'era'+(d.next?' next':''));
      e.append('rect').attr('x',d=>x(d.s[0])-8).attr('width',d=>d.next?(W-4)-(x(d.s[0])-8):Math.max(x(d.s[1])-x(d.s[0])+16,124)).attr('y',d=>28+d.row*40).attr('height',28).attr('rx',2);
      e.append('text').attr('x',d=>x(d.s[0])).attr('y',d=>47+d.row*40).text(d=>d.n);
      g.append('text').attr('class','axis-lbl').attr('x',0).attr('y',20).text('ERAS');
      g.selectAll('.lane').data(lanes).join('text').attr('class','cat-lbl').attr('x',0).attr('y',d=>laneY(d)+4)
        .text(d=>oShort(d))
        .classed('on',d=>state.filter?.type==='outlet'&&state.filter.value===d)
        .on('click',(e,d)=>setFilter({type:'outlet',value:d,label:oName(d)}));
      g.selectAll('.lane-line').data(lanes).join('line').attr('class','gridline').attr('x1',120).attr('x2',W).attr('y1',d=>laneY(d)).attr('y2',d=>laneY(d)).style('stroke-dasharray','1 3');
    };
    return {pos, back, caption:'Each row is an outlet, and each dot is a piece placed by date. The bars above mark eras of the work.'+(DOM.gap?` The quiet stretch from ${DOM.gap.a.getFullYear()} to ${DOM.gap.b.getFullYear()} is compressed.`:'')};
  },

  themes(){
    const rowY = d3.scalePoint(THEMES,[70,H-40]);
    const colX = d3.scalePoint(R.map(r=>r.i),[210,975]);
    const pos = new Map(), cells=[];
    R.forEach(r=>{
      pos.set(r.i,[colX(r.i), rowY(r.th[0])]);
      r.th.slice(1).forEach(t=>cells.push({r, x:colX(r.i), y:rowY(t)}));
    });
    const years = d3.groups(R, r=>r.date.getFullYear()).map(([y,rs])=>({y, x:colX(rs[0].i)}));
    const back = g=>{
      g.selectAll('.gridline').data(THEMES).join('line').attr('class','gridline').attr('x1',200).attr('x2',W-10).attr('y1',d=>rowY(d)).attr('y2',d=>rowY(d));
      g.selectAll('.yr').data(years).join('line').attr('class','gridline').attr('x1',d=>d.x-10).attr('x2',d=>d.x-10).attr('y1',30).attr('y2',H-24);
      g.selectAll('.axis-lbl').data(years).join('text').attr('class','axis-lbl').attr('x',d=>d.x-6).attr('y',36).text(d=>d.y);
      g.selectAll('.cat-lbl').data(THEMES).join('text').attr('class','cat-lbl').attr('x',0).attr('y',d=>rowY(d)+4).text(d=>d)
        .classed('on',d=>state.filter?.type==='theme'&&state.filter.value===d)
        .on('click',(e,d)=>setFilter({type:'theme',value:d,label:d}));
      g.selectAll('.cnt').data(THEMES).join('text').attr('class','cnt').attr('x',160).attr('y',d=>rowY(d)+4).attr('text-anchor','end')
        .text(d=>R.filter(r=>r.th.includes(d)).length);
    };
    return {pos, cells, back, caption:'Rows are themes, columns are pieces in date order. A piece with three themes fills three rows.'};
  },

  map(){
    const proj = d3.geoNaturalEarth1().fitExtent([[10,6],[W-10,440]], {type:'MultiPoint',coordinates:[[-128,63],[48,63],[-128,-42],[48,-42]]});
    const inset = {x:24,y:258,w:230,h:170};
    const iproj = d3.geoMercator().fitExtent([[inset.x+14,inset.y+26],[inset.x+inset.w-14,inset.y+inset.h-12]], {type:'MultiPoint',coordinates:[[27.2,-13.7],[29.6,-16.1]]});
    const pxy = k => { const p = PLACES[k]; return p.inset ? iproj([p.lon,p.lat]) : proj([p.lon,p.lat]); };
    const byPrimary = d3.group(R.filter(r=>r.pl.length), r=>r.pl[0]);
    const pos = new Map();
    byPrimary.forEach((rs,k)=>{
      const [cx,cy] = pxy(k);
      rs.forEach((r,j)=>{ const rr = j===0?0:7.6*Math.sqrt(j), a=j*2.39996; pos.set(r.i,[cx+rr*Math.cos(a), cy+rr*Math.sin(a)]); });
    });
    const none = R.filter(r=>!r.pl.length);
    none.forEach((r,j)=>pos.set(r.i,[150+j*17, 486]));
    const counts = Object.keys(PLACES).map(k=>({k, n:R.filter(r=>r.pl.includes(k)).length, prim:(byPrimary.get(k)||[]).length})).filter(d=>d.n);
    const back = g=>{
      const path = d3.geoPath(proj);
      g.append('path').attr('class','grat').attr('d',path(d3.geoGraticule10()));
      g.append('path').attr('class','land').attr('d',path(LANDF));
      // Zambia inset
      const z = proj([28.4,-14.9]);
      g.append('path').attr('class','leader').attr('d',`M${inset.x+inset.w},${inset.y+inset.h/2} L${z[0]},${z[1]}`);
      g.append('circle').attr('cx',z[0]).attr('cy',z[1]).attr('r',9).attr('class','pl-ring').style('stroke-dasharray','2 2');
      g.append('rect').attr('class','inset-frame').attr('x',inset.x).attr('y',inset.y).attr('width',inset.w).attr('height',inset.h);
      g.append('clipPath').attr('id','ic').append('rect').attr('x',inset.x).attr('y',inset.y).attr('width',inset.w).attr('height',inset.h);
      g.append('path').attr('class','land').attr('clip-path','url(#ic)').attr('d',d3.geoPath(iproj)(LANDF));
      g.append('text').attr('class','axis-lbl').attr('x',inset.x+8).attr('y',inset.y+16).text('CENTRAL ZAMBIA');
      // place markers + labels
      const pg = g.selectAll('.pl').data(counts).join('g').attr('class','pl');
      pg.filter(d=>!d.prim).append('circle').attr('class','pl-ring').attr('r',5).attr('cx',d=>pxy(d.k)[0]).attr('cy',d=>pxy(d.k)[1]);
      pg.append('text').attr('class','pl-lbl')
        .classed('on',d=>state.filter?.type==='place'&&state.filter.value===d.k)
        .attr('x',d=>{const [x]=pxy(d.k), off = 10 + (d.prim>1?Math.sqrt(d.prim)*7.6:0); return PLACES[d.k].label==='l'?x-off:x+off;})
        .attr('text-anchor',d=>PLACES[d.k].label==='l'?'end':'start')
        .attr('y',d=>pxy(d.k)[1]+4)
        .text(d=>`${PLACES[d.k].name} ${d.n}`)
        .on('click',(e,d)=>setFilter({type:'place',value:d.k,label:PLACES[d.k].name}));
      g.append('line').attr('class','baseline').attr('x1',0).attr('x2',W).attr('y1',462).attr('y2',462);
      g.append('text').attr('class','cat-lbl').attr('x',0).attr('y',490).text('No one place').style('cursor','default');
      g.append('text').attr('class','cnt').attr('x',150+none.length*17+4).attr('y',490).text(none.length);
    };
    return {pos, back, caption:'Dots sit on the first place each piece is about. Rings mark places a piece also covers. Click a place name to list its stories.'};
  },

  methods(){ return columns(METHODS, r=>r.m, 'method', m=>m, 'Each column is a method. Empty columns are methods you plan to add.'); },
  outlets(){ return columns([...OUTLETS.map(o=>o.id),'future'], r=>r.o, 'outlet', oShort, 'Each column is an outlet. The dashed column holds space for new outlets.'); },
};

function columns(cats, key, ftype, label, caption){
  const cx = d3.scalePoint(cats,[60,W-60]).padding(.5);
  const PER=3, S=19, base=400;
  const pos = new Map();
  cats.forEach(c=>{
    R.filter(r=>key(r)===c).forEach((r,j)=>{
      const col=j%PER, row=Math.floor(j/PER);
      pos.set(r.i,[cx(c)-(PER-1)*S/2+col*S, base-row*S]);
    });
  });
  const back = g=>{
    g.append('line').attr('class','baseline').attr('x1',20).attr('x2',W-20).attr('y1',base+12).attr('y2',base+12);
    g.selectAll('.empty-slot').data(cats.filter(c=>!R.some(r=>key(r)===c))).join('rect').attr('class','empty-slot')
      .attr('x',c=>cx(c)-(PER*S)/2).attr('width',PER*S).attr('y',base-40).attr('height',48).attr('rx',2);
    const lbl = g.selectAll('.cat').data(cats).join('text').attr('class','cat-lbl').attr('text-anchor','middle')
      .attr('x',c=>cx(c)).attr('y',base+34);
    lbl.each(function(c){ // wrap to two lines
      const words = label(c).split(' '), t = d3.select(this);
      const lines = words.length>2 ? [words.slice(0,Math.ceil(words.length/2)).join(' '), words.slice(Math.ceil(words.length/2)).join(' ')] : [label(c)];
      lines.forEach((ln,i)=>t.append('tspan').attr('x',cx(c)).attr('dy',i?15:0).text(ln));
    });
    lbl.classed('on',c=>state.filter?.type===ftype&&state.filter.value===c)
      .on('click',(e,c)=>{ if(R.some(r=>key(r)===c)) setFilter({type:ftype,value:c,label:label(c)}); });
    g.selectAll('.cnt').data(cats).join('text').attr('class','cnt').attr('text-anchor','middle').attr('x',c=>cx(c)).attr('y',base+76)
      .text(c=>R.filter(r=>key(r)===c).length);
  };
  return {pos, back, caption};
}

let current;
function render(){
  const L = LAYOUT[state.lens]();
  current = L;
  document.getElementById('caption').textContent = L.caption;
  gBack.selectAll('*').remove();
  L.back(gBack);
  gBack.attr('opacity',0).transition().duration(DUR/2).delay(DUR/3).attr('opacity',1);

  gCells.selectAll('circle').data(L.cells||[], d=>d.r.i+'-'+d.y).join(
    enter=>enter.append('circle').attr('r',0).attr('cx',d=>d.x).attr('cy',d=>d.y).call(e=>e.transition().delay(DUR*.6).duration(DUR/2).attr('r',RAD-1.5)),
    update=>update, exit=>exit.remove()
  ).attr('class',d=>'cell f-'+d.r.o).classed('dim',d=>!matches(d.r));

  gDots.selectAll('circle').data(R, d=>d.i).join(enter=>enter.append('circle').attr('r',RAD).attr('cx',W/2).attr('cy',H/2)
      .on('mouseenter',(e,d)=>tipShow(e,d,document.getElementById('chart')))
      .on('mouseleave',tipHide)
      .on('click',(e,d)=>select(d.i)))
    .attr('class',d=>'rec f-'+d.o)
    .classed('sel',d=>d.i===state.sel).classed('dim',d=>!matches(d))
    .transition().duration(DUR).ease(d3.easeCubicInOut)
    .attr('cx',d=>L.pos.get(d.i)[0]).attr('cy',d=>L.pos.get(d.i)[1]);
  gDots.selectAll('circle').filter(d=>d.i===state.sel).raise();
  renderMobile();
}

/* ---------- phone layout for Explore ---------- */
const mq = matchMedia('(max-width:640px)');
const MCAP = {
  timeline:'Every piece in date order, newest at the bottom. Tap one to open it.',
  themes:'Tap a theme to see its pieces. A piece can sit under several themes.',
  map:'Where the pieces are set. Tap a place to see its stories.',
  methods:'Tap a method to see its pieces.',
  outlets:'Tap an outlet to see its pieces.',
};
const pieceBtn = r => `<li class="vt-item"><button type="button" class="mv-piece" data-i="${r.i}"><i class="dot f-${r.o}"></i><span>${r.t}<small>${oShort(r.o)} · ${fdate(r)} · ${r.m}</small></span></button></li>`;
function accordion(groups){
  return `<div class="acc">${groups.map(g=> g.items.length
    ? `<details><summary><span class="acc-l">${g.label}</span><span class="acc-n">${g.items.length}</span><span class="acc-dots">${g.items.map(r=>`<i class="f-${r.o}"></i>`).join('')}</span></summary>
        <ul class="mv-list">${g.items.map(pieceBtn).join('')}</ul></details>`
    : `<div class="empty-row"><span>${g.label}</span><span>planned</span></div>`).join('')}</div>`;
}
function renderMobile(){
  const host = document.getElementById('mview');
  document.querySelector('.explore').classList.toggle('lens-map', state.lens==='map');
  if(!mq.matches){ host.innerHTML=''; document.getElementById('caption').textContent = current?.caption||''; return; }
  document.getElementById('caption').textContent = MCAP[state.lens];
  let html='';
  if(state.lens==='timeline'){
    let yr=null, out=[]; const seen=new Set();
    R.forEach((r,k)=>{
      const y=r.date.getFullYear();
      if(DOM.gap && k>0 && R[k-1].date<DOM.gap.a && r.date>DOM.gap.b) out.push(`<li class="vt-gap">// ${R[k-1].date.getFullYear()} → ${y}</li>`);
      if(y!==yr){ out.push(`<li class="vt-year">${y}</li>`); yr=y; }
      if(r.era && !seen.has(r.era)){ out.push(`<li class="vt-era">${r.era}</li>`); seen.add(r.era); }
      out.push(pieceBtn(r));
    });
    ERAS.filter(n=>!R.some(r=>r.era===n)).forEach(n=>out.push(`<li class="vt-era next">${n}</li>`));
    html = `<ol class="vt">${out.join('')}</ol>`;
  } else if(state.lens==='themes'){
    html = accordion(THEMES.map(t=>({label:t, items:R.filter(r=>r.th.includes(t))})));
  } else if(state.lens==='methods'){
    html = accordion(METHODS.map(m=>({label:m, items:R.filter(r=>r.m===m)})));
  } else if(state.lens==='outlets'){
    html = accordion([...OUTLETS,FUTURE].map(o=>({label:oShort(o.id), items:R.filter(r=>r.o===o.id)})));
  } else if(state.lens==='map'){
    const ks = Object.keys(PLACES).map(k=>({label:PLACES[k].name, items:R.filter(r=>r.pl.includes(k))})).filter(g=>g.items.length).sort((a,b)=>b.items.length-a.items.length);
    html = accordion(ks.concat([{label:'No one place', items:R.filter(r=>!r.pl.length)}]));
  }
  host.innerHTML = html;
}
document.getElementById('mview').addEventListener('click', e=>{
  const b = e.target.closest('[data-i]'); if(b) openSheet(+b.dataset.i);
});
function openSheet(i){
  const r = R[i], sh = document.getElementById('sheet');
  state.sel = i; restyle();
  sh.innerHTML = `<div class="grab"></div>
    <div class="sh-top"><span>Record No. ${r.id} of ${R.length}</span><button type="button" id="shClose">Close</button></div>
    <h3>${r.t}</h3>
    <dl><dt>Outlet</dt><dd><i class="dot f-${r.o}"></i> ${oName(r.o)}</dd><dt>Date</dt><dd>${fdate(r)}</dd><dt>Method</dt><dd>${r.m}</dd>
      <dt>Themes</dt><dd>${r.th.join(', ')}</dd><dt>Places</dt><dd>${r.pl.map(k=>PLACES[k].name).join(', ')||'—'}</dd>
      ${r.project?`<dt>Project</dt><dd>${PROJECTS[r.project].name}</dd>`:''}</dl>
    ${r.line?`<p class="c-line">${r.line}</p>`:''}
    <a class="go" href="${r.u}" target="_blank" rel="noopener">${r.o==='film'?'Watch the film':'Read at '+oName(r.o)} ↗</a>`;
  sh.hidden=false; document.getElementById('sheetBg').hidden=false;
  document.getElementById('shClose').onclick=closeSheet; document.getElementById('shClose').focus();
}
function closeSheet(){ document.getElementById('sheet').hidden=true; document.getElementById('sheetBg').hidden=true; }
document.getElementById('sheetBg').onclick=closeSheet;
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeSheet(); });
mq.addEventListener('change', ()=>{ closeSheet(); renderMobile(); });

function restyle(){
  gDots.selectAll('circle').classed('sel',d=>d.i===state.sel).classed('dim',d=>!matches(d));
  gCells.selectAll('circle').classed('dim',d=>!matches(d.r));
  gDots.selectAll('circle').filter(d=>d.i===state.sel).raise();
  gBack.selectAll('.cat-lbl,.pl-lbl').classed('on',function(d){
    const f=state.filter; if(!f) return false;
    const v = d && d.k ? d.k : d; return v===f.value;
  });
  document.querySelectorAll('#key button').forEach(b=>b.setAttribute('aria-pressed', String(state.filter?.type==='outlet'&&state.filter.value===b.dataset.o)));
  panel(); table();
}

function select(i){ state.sel = state.sel===i ? null : i; restyle(); }
function setFilter(f){
  const same = state.filter && state.filter.type===f.type && state.filter.value===f.value;
  state.filter = same ? null : f; restyle();
}

/* tooltip */
const tip = document.getElementById('tip');
function tipShow(e,d,host){
  const box = host.getBoundingClientRect();
  tip.innerHTML = `<span class="t">${d.t}</span>${oName(d.o)} · ${fdate(d)}`;
  if(tip.parentElement!==host) host.appendChild(tip);
  host.style.position='relative';
  let x = e.clientX-box.left+12, y = e.clientY-box.top+12;
  if(x>box.width-270) x = e.clientX-box.left-270;
  tip.style.left=x+'px'; tip.style.top=y+'px'; tip.style.opacity=1;
}
function tipHide(){ tip.style.opacity=0; }

/* side panel */
function panel(){
  const p = document.getElementById('panel');
  const f = state.filter;
  const chip = f ? `<div><span class="chip">${f.label}<button type="button" aria-label="Clear filter" id="clr">×</button></span></div>` : '';
  if(state.sel!==null){
    const r = R[state.sel];
    p.innerHTML = `${chip}<div class="ph">Record No. ${r.id} of ${R.length}</div>
      <h3>${r.t}</h3>
      <dl>
        <dt>Outlet</dt><dd><i class="dot f-${r.o}"></i> ${oName(r.o)}</dd>
        <dt>Date</dt><dd>${fdate(r)}</dd>
        <dt>Method</dt><dd>${r.m}</dd>
        <dt>Themes</dt><dd>${r.th.join(', ')}</dd>
        <dt>Places</dt><dd>${r.pl.map(k=>PLACES[k].name).join(', ')||'—'}</dd>
        ${r.project?`<dt>Project</dt><dd>${PROJECTS[r.project].name}</dd>`:''}
        ${r.project&&PROJECTS[r.project].credit&&r.o==='film'?`<dt>Credit</dt><dd>${PROJECTS[r.project].credit}</dd>`:''}
      </dl>
      ${r.line?`<p class="c-line">${r.line}</p>`:''}
      <a class="go" href="${r.u}" target="_blank" rel="noopener">${r.o==='film'?'Watch the film':'Read at '+oName(r.o)} ↗</a>`;
  } else if(f){
    const rs = R.filter(matches);
    p.innerHTML = `${chip}<div class="ph">${rs.length} piece${rs.length===1?'':'s'}</div>
      <ul>${rs.map(r=>`<li><button type="button" data-i="${r.i}"><i class="dot f-${r.o}"></i><span>${r.t} <span style="font:400 11px var(--mono);color:var(--muted)">${fmtShort(r.date)}</span></span></button></li>`).join('')}</ul>`;
    p.querySelectorAll('li button').forEach(b=>b.onclick=()=>select(+b.dataset.i));
  } else {
    p.innerHTML = `<div class="ph">Record</div><p class="empty">Hover a dot to see its title. Click it to open the record here. Click a label to filter.</p>
      ${INTRO?`<p class="intro">${INTRO}</p>`:''}`;
  }
  const c = document.getElementById('clr'); if(c) c.onclick=()=>{state.filter=null;restyle();};
}

function table(){
  const tb = document.getElementById('tbody');
  tb.innerHTML = R.filter(matches).map(r=>`<tr class="${r.i===state.sel?'sel':''}"><td class="id">${r.id}</td><td class="dt">${r.dp==='y'?r.d.slice(0,4):r.d}</td>
    <td class="ti"><button type="button" data-i="${r.i}">${r.t}</button></td><td><i class="dot f-${r.o}"></i> ${oName(r.o)}</td><td>${r.m}</td></tr>`).join('');
  tb.querySelectorAll('button').forEach(b=>b.onclick=()=>select(+b.dataset.i));
}

/* lens switching */
document.querySelectorAll('.lens-bar button').forEach(b=>b.onclick=()=>{
  state.lens=b.dataset.lens;
  document.querySelectorAll('.lens-bar button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
  tipHide(); render();
});

render(); panel(); table();
}
