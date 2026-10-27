/* The electrical view is derived from the user's wires, never from their colors or coordinates. */
(function(root){
const defaults={contactR:0.001,cableR:0.1,looseR:20,bondR:0.001,iBurdenR:0.02,iBurdenB:0.02,vBurdenR:1000000,vBurdenB:1000000,ptWinding:0.05,ctExcR:1000000,ctExcX:0,earthR:10,earthPoleCT:true,earthPolePT:true,earthMeterCT:true,earthMeterPT:true,earthCabinet:true,earthE:false};
const pins=['ctr.X1','ctr.X2','ctb.X1','ctb.X2','ptr.X1','ptr.X2','ptb.X1','ptb.X2'];
const terminals=[15,16,17,19,21,22,23];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const copy=v=>JSON.parse(JSON.stringify(v));
function label(id){
 if(id==='cabinet.PE')return 'ตู้มิเตอร์ PE';
 if(id.startsWith('m.'))return 'M '+id.slice(2);
 const parts=id.split('.'),names={ctr:'CT R',ctb:'CT B',ptr:'PT R',ptb:'PT B'};
 return names[parts[0]]?names[parts[0]]+' '+parts[1]:id;
}
function fromWires(wires,settings={},faults={}){
 const s={...defaults,...settings},nodes={},branches=[],ids=new Set();
 for(const k of Object.keys(defaults))if(typeof defaults[k]==='number'&&(!Number.isFinite(s[k])||s[k]<0))throw Error('ค่าพารามิเตอร์ '+k+' ไม่ถูกต้อง');
 const node=(id,kind='terminal',name=label(id))=>nodes[id]||(nodes[id]={id,kind,label:name});
 for(const id of [...pins,...['ctr','ctb','ptr','ptb'].map(b=>b+'.E'),...terminals.map(n=>'m.'+n),'cabinet.PE'])node(id);
 const terminalIds=new Set(Object.keys(nodes));
 for(const w of wires){
  if(!w.id||ids.has(w.id))throw Error('รหัสสายซ้ำหรือไม่มีรหัส');ids.add(w.id);
  if(w.shade&&!/^#[0-9a-f]{6}$/i.test(w.shade))throw Error('เฉดสีสายไม่ถูกต้อง: '+w.id);
  for(const p of ['a','mid','b'])if(!['normal','loose','off'].includes(w.states[p]))throw Error('สถานะสายไม่ถูกต้อง: '+w.id);
  const ends={};
  for(const side of ['a','b']){
   const e=w[side];if(e.node&&!terminalIds.has(e.node))throw Error('ไม่รู้จักขั้ว '+e.node);
   if(e.node&&w.states[side]==='off')throw Error('ปลายสายถอดยังอ้างขั้วที่ต่ออยู่: '+w.id);
   ends[side]=e.node||'float:'+w.id+':'+side;
   node(ends[side],e.node?'terminal':'floating',e.node?label(e.node):w.id+' '+side.toUpperCase()+' (ลอย)');
  }
  // R is an explicit per-wire assumption. SVG length and bends are not a length measurement.
  const profile=w.resistanceProfile||(['ci-link','cv-link'].includes(w.id)?'common-link':['jumper','bond'].includes(w.id)?'link':'field'),factor=w.resistanceScale??1;
  if(!Number.isFinite(factor)||factor<=0)throw Error('สัดส่วน R สายไม่ถูกต้อง: '+w.id);
  const preset=profile==='common-link'?{a:0,mid:0,b:0}:profile==='link'?{a:0,mid:s.bondR,b:0}:{a:profile==='added'?s.contactR:0,mid:s.cableR,b:s.contactR};
  const r=Object.fromEntries(Object.entries({...preset,...w.resistance}).map(([k,v])=>[k,v*factor]));
  for(const value of Object.values(r))if(!Number.isFinite(value)||value<0)throw Error('R สายไม่ถูกต้อง: '+w.id);
  const resistance=r.a+r.mid+r.b+['a','mid','b'].filter(p=>w.states[p]==='loose').length*s.looseR;
  branches.push({id:'wire:'+w.id,kind:'wire',wireId:w.id,originId:w.originId||w.id,name:w.name,a:ends.a,b:ends.b,resistance,conducting:w.states.mid!=='off',states:copy(w.states),parts:r,
   endpoints:{a:w.a.node,b:w.b.node},color:w.color,shade:w.shade||null,...(w.circuitBends||w.a.circuit||w.b.circuit?{drawing:{bends:w.circuitBends?copy(w.circuitBends):undefined,a:w.a.circuit,b:w.b.circuit}}:{})});
 }
 for(const [id,a,b,value]of [['burden-ir','m.15','m.17',s.iBurdenR],['burden-ib','m.21','m.23',s.iBurdenB],['burden-vr','m.16','m.19',s.vBurdenR],['burden-vb','m.22','m.19',s.vBurdenB]])branches.push({id,kind:'resistor',a,b,resistance:value,conducting:true});
 for(const pin of pins){const coil='coil:'+pin;node(coil,'internal','ขดลวด '+label(pin));branches.push({id:'post:'+pin,kind:'contact',a:coil,b:pin,resistance:s.contactR,conducting:true});}
 for(const [block,phase]of [['ctr','R'],['ctb','B']]){
  branches.push({id:block+':source',kind:'current-source',a:'coil:'+block+'.X1',b:'coil:'+block+'.X2',phase,value:'I '+phase+' / CT',conducting:false});
  branches.push({id:block+':excitation',kind:'impedance',a:'coil:'+block+'.X1',b:'coil:'+block+'.X2',resistance:s.ctExcR,reactance:s.ctExcX,conducting:true});
 }
 for(const [block,phase]of [['ptr','R'],['ptb','B']]){
  const internal=block+':winding';node(internal,'internal',block+' winding');
  branches.push({id:block+':source',kind:'voltage-source',a:internal,b:'coil:'+block+'.X2',phase,value:'U '+phase+'Y / PT',conducting:true});
  branches.push({id:block+':winding',kind:'resistor',a:'coil:'+block+'.X1',b:internal,resistance:s.ptWinding,conducting:true});
 }
 node('earth:common','earth','Earth ร่วม');
 if(s.earthCabinet)branches.push({id:'earthCabinet',kind:'earth',name:'กราวด์ตู้มิเตอร์ PE',a:'cabinet.PE',b:'earth:common',resistance:s.earthR,conducting:true});
 for(const [key,pin]of [['PoleCT','ctb.X2'],['PolePT','ptb.X2'],['MeterCT','m.17'],['MeterPT','m.19']])if(s['earth'+key])branches.push({id:'earth'+key,kind:'earth',name:'Earth '+key,a:pin,b:'earth:common',resistance:s.earthR,conducting:true});
 if(s.earthE)for(const block of ['ctr','ctb','ptr','ptb'])branches.push({id:'earthE:'+block,kind:'earth',name:'Earth E '+block,a:block+'.E',b:'earth:common',resistance:s.earthR,conducting:true});
 for(const [phase,block]of [['R','ctr'],['B','ctb']])if(faults['ct'+phase]){
  const place=faults['bypass'+phase]||'pole',a=place==='meter'?'m.'+(phase==='R'?15:21):(place==='source'?'coil:':'')+block+'.X1',b=place==='meter'?'m.'+(phase==='R'?17:23):(place==='source'?'coil:':'')+block+'.X2';
  branches.push({id:'bypass'+phase,kind:'bypass',name:'Bypass CT '+phase+' / '+place,a,b,resistance:s.bondR,conducting:true});
 }
 const standard={ir:['ctr.X1','m.15'],vr:['ptr.X1','m.16'],ci:['ctb.X2','m.17'],'ci-link':['ctr.X2','ctb.X2'],cv:['ptb.X2','m.19'],'cv-link':['ptr.X2','ptb.X2'],ib:['ctb.X1','m.21'],vb:['ptb.X1','m.22'],jumper:['m.17','m.23'],bond:['m.17','m.19']},labels=[];
 for(const [id,ends]of Object.entries(standard)){const w=wires.find(w=>w.id===id);if(!w)labels.push('ไม่มีสาย '+id);else if(w.a.node!==ends[0]||w.b.node!==ends[1]||Object.values(w.states).some(v=>v!=='normal')||(w.resistanceScale??1)!==1)labels.push('แก้สาย '+w.name);}
 for(const w of wires)if(!standard[w.id])labels.push('สายเพิ่ม/แยก '+w.name);
 return {version:2,nodes:Object.values(nodes),branches,settings:s,faults:labels};
}
function resistanceText(r){return r>=1000000?(r/1000000).toLocaleString('en-US',{maximumFractionDigits:6})+' MΩ':r>=1000?(r/1000).toLocaleString('en-US',{maximumFractionDigits:6})+' kΩ':r.toLocaleString('en-US',{maximumFractionDigits:6})+' Ω';}
function currentText(z,phase=false){
 if(z===undefined)return '— (คำนวณไม่ได้)';
 if(z===null)return '— (กระแสไม่เป็นค่าเดียว)';
 // Ignore sub-0.1 µA numerical residue in dangling CT branches; this is display precision only.
 const raw=Math.hypot(z.re,z.im),amps=raw<1e-7?0:Number(raw.toPrecision(5)),scale=amps===0||amps>=1?1:amps>=.001?1000:1000000,unit=scale===1?'A':scale===1000?'mA':'µA';
 const magnitude=(amps*scale).toLocaleString('en-US',{maximumSignificantDigits:5})+' '+unit;
 const angle=amps===0?'—':(Math.atan2(z.im,z.re)*180/Math.PI).toLocaleString('en-US',{maximumFractionDigits:2})+'°';
 return magnitude+(phase?' ∠ '+angle:'');
}
function schematic(graph,selected=null,view='connected',interactive=false){
 const wires=graph.branches.filter(e=>e.kind==='wire'),floatingWires=wires.filter(e=>!e.endpoints.a||!e.endpoints.b),extra=graph.branches.filter(e=>['earth','bypass'].includes(e.kind)),baseHeight=view==='details'?Math.max(940,170+wires.length*88):Math.max(940,970+floatingWires.length*72),height=baseHeight+78+Math.ceil(extra.length/2)*91,h=[];
 const nodeById=Object.fromEntries(graph.nodes.map(n=>[n.id,n])),positions={},routes={};
 const text=(x,y,t,extra='')=>`<text x="${x}" y="${y}" ${extra}>${esc(t)}</text>`;
 const line=(x1,y1,x2,y2,extra='')=>`<path d="M${x1} ${y1}L${x2} ${y2}" fill="none" stroke="#43566b" stroke-width="1.8" ${extra}/>`;
 const resistor=(x1,y,x2,name)=>{const mid=(x1+x2)/2;return line(x1,y,mid-18,y)+`<rect x="${mid-18}" y="${y-7}" width="36" height="14" fill="white" stroke="#43566b" stroke-width="1.8"/>`+line(mid+18,y,x2,y)+text(mid,y-13,name,'text-anchor="middle" class="value"');};
 const verticalR=(x,y1,y2,name)=>{const mid=(y1+y2)/2;return line(x,y1,x,mid-17)+`<rect x="${x-7}" y="${mid-17}" width="14" height="34" fill="white" stroke="#43566b" stroke-width="1.8"/>`+line(x,mid+17,x,y2)+text(x+14,mid+4,name,'class="value"');};
 const port=(x,y,id,anchor='middle')=>{const n=nodeById[id];return `<circle cx="${x}" cy="${y}" r="4" fill="${n.kind==='floating'?'white':'#43566b'}" stroke="#43566b" stroke-width="1.5"/>`+text(x,y+22,n.label,`text-anchor="${anchor}" class="net ${n.kind==='floating'?'floating':''}"`);};
 h.push(`<rect width="1320" height="${height}" fill="#f7fafc"/><style>.electrical-schematic text{font-family:Tahoma,Arial,sans-serif;font-size:12px;fill:#263b50}.electrical-schematic .heading{font-size:17px;font-weight:bold}.electrical-schematic .sub{font-size:11px;fill:#687d8f}.electrical-schematic .net{font-size:11px;font-weight:bold}.electrical-schematic .value{font-size:10px;fill:#526a7b}.electrical-schematic .floating{fill:#b46b1f}.electrical-schematic .circuit-wire{cursor:pointer}.electrical-schematic .circuit-wire:focus{outline:none}.electrical-schematic .circuit-wire:focus-visible .branch-bg{stroke:#254d48;stroke-width:2}</style>`);
 h.push(text(24,32,'วงจรไฟฟ้าจากการต่อสายปัจจุบัน','class="heading"'),text(24,55,(view==='details'?'ป้ายโหนดชื่อเดียวกันต่อถึงกันทางไฟฟ้า':'จุดทึบ = จุดต่อเดียวกัน • เส้นตัดที่ไม่มีจุดทึบไม่เชื่อมกัน')+' • วงกลมโปร่ง = ปลายลอย • '+(graph.settings.earthE?'E ต่อ earth ผ่าน R':'E แต่ละบล็อกเป็นขั้วอิสระ'),'class="sub"'));
 if(graph.solution)h.push(text(24,70,'I = secondary AC RMS · มุมเฟสอ้างอิง A→B ของ branch · 0 A รวมค่าที่ต่ำกว่า 0.1 µA','class="value"'));
 h.push(`<rect x="16" y="76" width="275" height="${height-100}" rx="12" fill="#edf2f7"/><rect x="305" y="76" width="710" height="${height-100}" rx="12" fill="white" stroke="#d5e0e7"/><rect x="1030" y="76" width="274" height="${height-100}" rx="12" fill="#edf2f7"/>`);
 h.push(text(32,103,'CT / PT equivalent','class="heading"'),text(322,103,view==='details'?'สายจริงแต่ละเส้น = หนึ่ง branch':'ต่อสายตามโหนดจริง · คลิกเส้นเพื่อเลือกสาย','class="heading"'),text(1046,103,'Meter burdens','class="heading"'));
 for(const [i,b]of ['ctr','ctb','ptr','ptb'].entries()){
  const top=146+i*180,bottom=top+84,left=80,right=223,center=(top+bottom)/2,ct=b.startsWith('ct');
  h.push(text(32,top-20,label(b+'.X1').split(' X1')[0],'font-weight="bold"'));
  h.push(line(left,top,right,top),line(left,bottom,right,bottom),line(left,top,left,center-19),line(left,center+19,left,bottom),`<circle cx="${left}" cy="${center}" r="19" fill="white" stroke="#43566b" stroke-width="1.8"/>`);
  if(ct){h.push(line(left,center+10,left,center-10),`<path d="M${left-5} ${center-3}L${left} ${center-11}L${left+5} ${center-3}" fill="none" stroke="#43566b" stroke-width="1.8"/>`,verticalR(157,top,bottom,'Zexc'),`<circle cx="157" cy="${top}" r="3" fill="#43566b"/><circle cx="157" cy="${bottom}" r="3" fill="#43566b"/>`);}
  else{h.push(`<path d="M65 ${center}q7 -13 15 0t15 0" fill="none" stroke="#43566b" stroke-width="1.7"/>`);h.push(`<rect x="136" y="${top-7}" width="36" height="14" fill="white" stroke="#43566b" stroke-width="1.8"/>`,text(154,top-25,'R winding','text-anchor="middle" class="value"'));}
  for(const y of [top,bottom])h.push(`<rect x="187" y="${y-5}" width="18" height="10" fill="white" stroke="#43566b"/>`,text(196,y-10,resistanceText(graph.settings.contactR),'text-anchor="middle" class="value"'));
  h.push(text(41,center+35,ct?'I / CT':'U / PT','class="value"'),port(right,top,b+'.X1','end'),port(right,bottom,b+'.X2','end'));
  h.push(port(223,bottom+41,b+'.E','end'));
 }
 h.push(text(32,892,'CT: Norton + excitation R+jX','class="sub"'),text(32,911,'PT: voltage source + winding R','class="sub"'));
 const pinY={15:157,17:241,21:337,23:421,16:517,19:601,22:697},px=1060;
 for(const n of [15,17,21,23,16,19,22])h.push(port(px,pinY[n],'m.'+n,'start'));
 for(const [a,b,x,name,value]of [[15,17,1170,'I R',graph.settings.iBurdenR],[21,23,1170,'I B',graph.settings.iBurdenB],[16,19,1170,'V R',graph.settings.vBurdenR],[22,19,1250,'V B',graph.settings.vBurdenB]]){
  h.push(line(px,pinY[a],x,pinY[a]),line(px,pinY[b],x,pinY[b]),verticalR(x,Math.min(pinY[a],pinY[b]),Math.max(pinY[a],pinY[b]),name),text(1100,Math.max(pinY[a],pinY[b])+51,name+': '+resistanceText(value),'class="sub"'));
 }
 h.push(text(1047,814,'17 / 23 ไม่ได้รวมกันภายใน','class="sub"'),text(1047,835,'17 / 19 ไม่ได้ bond อัตโนมัติ','class="sub"'),text(1047,856,'ต้องมีสายเชื่อมจากภาพเท่านั้น','class="sub"'));
 h.push(port(px,910,'cabinet.PE','start'),text(1047,879,'กราวด์ตู้มิเตอร์ · PE','class="net"'));
 if(graph.settings.earthCabinet)h.push(resistor(px,910,1200,resistanceText(graph.settings.earthR)),line(1200,910,1200,930),line(1183,930,1217,930),line(1188,937,1212,937),line(1194,944,1206,944));else h.push(text(1110,903,'PE ลอย · earth ปิด','class="floating"'));
 if(view==='details')for(const [i,e]of wires.entries()){
  const y=161+i*88,chosen=e.wireId===selected;
  const renderPart=(side,x1,x2)=>{
   const detached=side!=='mid'&&!e.endpoints[side],state=detached?'detached':e.states[side],mid=(x1+x2)/2;
   if(state==='off')return line(x1,y,mid-12,y)+line(mid+12,y,x2,y)+line(mid-12,y,mid+10,y-16)+text(mid,y-24,'ขาด','text-anchor="middle" class="value"');
   if(detached)return line(x1,y,x2,y)+text(mid,y-13,'ปลายลอย','text-anchor="middle" class="value"');
   return resistor(x1,y,x2,resistanceText(e.parts[side]+(state==='loose'?graph.settings.looseR:0)))+(state==='loose'?text(mid,y+24,'หลวม','text-anchor="middle" class="floating"'):'');
  };
  h.push(`<g class="circuit-wire" data-electrical-wire="${esc(e.wireId)}" role="button" tabindex="0" aria-label="${esc(e.name+' · '+nodeById[e.a].label+' → '+nodeById[e.b].label)}" aria-pressed="${chosen}"><rect class="branch-bg" x="315" y="${y-40}" width="690" height="79" rx="7" fill="${chosen?'#e7f0eb':'#f9fbfd'}" stroke="${chosen?'#9db8ad':'#edf2f5'}"/>`);
  h.push(text(330,y-24,e.wireId+' · '+e.name,'font-weight="bold"'),port(380,y,e.a),port(940,y,e.b));
  h.push(renderPart('a',380,520),renderPart('mid',520,800),renderPart('b',800,940));
  const flow=graph.solution?.result.secondary.flows[e.id];
  h.push(text(660,y+29,'RΣ '+resistanceText(e.resistance)+(e.conducting?'':' · เปิดวงจรระหว่างทาง')+(graph.solution?' · I '+currentText(flow,true)+' RMS':''),'text-anchor="middle" class="value" data-current-branch="'+esc(e.id)+'"'),'</g>');
 }
 else{
  for(const [i,b]of ['ctr','ctb','ptr','ptb'].entries()){positions[b+'.X1']=[223,146+i*180];positions[b+'.X2']=[223,230+i*180];positions[b+'.E']=[223,271+i*180];}
  for(const n of terminals)positions['m.'+n]=[px,pinY[n]];
  positions['cabinet.PE']=[px,910];
  for(const [i,e]of floatingWires.entries())for(const side of ['a','b'])if(!e.endpoints[side])positions[e[side]]=[side==='a'?420:860,930+i*72];
  for(const e of wires)for(const side of ['a','b'])if(!e.endpoints[side]&&e.drawing?.[side])positions[e[side]]=e.drawing[side];
  const wireHex=e=>e.shade||({red:'#cc3840',white:'#f5f4e5',black:'#252a29',gray:'#929992',green:'#26834f',orange:'#ee862b'})[e.color]||'#43566b';
  const path=(points,e,hit=false)=>{const d='M'+points.map(p=>p.join(' ')).join(' L');return hit?`<path d="${d}" fill="none" stroke="transparent" stroke-width="16"/>`:`<path d="${d}" fill="none" stroke="#778896" stroke-width="${e.wireId===selected?5.5:4}"/><path d="${d}" fill="none" stroke="${wireHex(e)}" stroke-width="${e.wireId===selected?3.5:2}"/>`;};
  const ordered=wires,labelLevels={left:[],right:[]};
  for(const e of ordered){
   const a=positions[e.a],b=positions[e.b],i=wires.indexOf(e);let points,center,vertical;
   if(a[0]===b[0]){
    // Common links and meter jumpers use real branches beside their terminal bank.
    const x=a[0]<400?320+(i%3)*18:990-(i%3)*20;
    let cy=a[1]+48;
    if(a[1]!==b[1]){
     const levels=wires.flatMap(w=>[positions[w.a][1],positions[w.b][1]]),bank=a[0]<400?'left':'right';let best=-Infinity;
     for(let k=10;k<=90;k++){const y=a[1]+(b[1]-a[1])*k/100,clearance=Math.min(...levels.map(v=>Math.abs(v-y)),...labelLevels[bank].map(v=>Math.abs(v-y)-30));if(clearance>best){best=clearance;cy=y;}}
     labelLevels[bank].push(cy);
    }
    points=a[1]===b[1]?[a,[x,a[1]],[x,a[1]+96],[a[0]+50,a[1]+96],[a[0]+50,b[1]],b]:[a,[x,a[1]],[x,b[1]],b];center=[x,cy];vertical=true;
   }else{
    const elbow=b[0]+(a[0]<b[0]?-90:90),cx=(a[0]+elbow)/2;
    points=[a,[elbow,a[1]],[elbow,b[1]],b];center=[cx,a[1]];vertical=false;
   }
   const manual=Array.isArray(e.drawing?.bends);let rotation=0;
   if(manual){points=[a,...e.drawing.bends,b];let longest=-1,segment=0;for(let k=0;k<points.length-1;k++){const length=Math.hypot(points[k+1][0]-points[k][0],points[k+1][1]-points[k][1]);if(length>longest){longest=length;segment=k;}}const p=points[segment],q=points[segment+1];center=[(p[0]+q[0])/2,(p[1]+q[1])/2];rotation=Math.atan2(q[1]-p[1],q[0]-p[0]);vertical=false;routes[e.wireId]={points,segment};}
   else routes[e.wireId]={points};
   const [cx,cy]=center,gap=manual?Math.min(20,Math.max(0,Math.hypot(points[routes[e.wireId].segment+1][0]-points[routes[e.wireId].segment][0],points[routes[e.wireId].segment+1][1]-points[routes[e.wireId].segment][1])/3)):20;
   // Draw two paths separated by the resistor or open-switch symbol.
   let before,after;
   if(manual){const k=routes[e.wireId].segment,dx=Math.cos(rotation)*gap,dy=Math.sin(rotation)*gap;before=[...points.slice(0,k+1),[cx-dx,cy-dy]];after=[[cx+dx,cy+dy],...points.slice(k+1)];}
   else if(vertical){const direction=points[2][1]>=a[1]?1:-1;before=[points[0],points[1],[cx,cy-gap*direction]];after=[[cx,cy+gap*direction],...points.slice(2)];}
   else{const direction=a[0]<b[0]?1:-1;before=[a,[cx-gap*direction,cy]];after=[[cx+gap*direction,cy],...points.slice(1)];}
   const current=graph.solution?' · I '+currentText(graph.solution.result.secondary.flows[e.id],true)+' RMS (A→B)':'';
   h.push(`<g class="circuit-wire" data-electrical-wire="${esc(e.wireId)}" role="button" tabindex="0" aria-label="${esc(e.name+' · '+nodeById[e.a].label+' → '+nodeById[e.b].label+current)}" aria-pressed="${e.wireId===selected}"><title>${esc(e.name+' · '+nodeById[e.a].label+' → '+nodeById[e.b].label+' · RΣ '+resistanceText(e.resistance)+current)}</title>`,path(before,e),path(after,e));
   if(manual)h.push(`<g transform="rotate(${rotation*180/Math.PI} ${cx} ${cy})">`);
   if(e.conducting){h.push(`<rect class="branch-bg" x="${cx-(vertical?7:gap)}" y="${cy-(vertical?20:7)}" width="${vertical?14:gap*2}" height="${vertical?40:14}" fill="${e.wireId===selected?'#e7f0eb':'white'}" stroke="#43566b" stroke-width="${e.wireId===selected?2.5:1.5}"/>`);}
   else h.push(vertical?line(cx,cy-gap,cx+17,cy+10):line(cx-gap,cy,cx+gap/2,cy-17));
   if(manual)h.push('</g>');
   const rightLabel=vertical&&a[0]>1000,tx=vertical?(rightLabel?cx-12:cx+12):cx,ty=vertical?cy-5:cy-22,anchor=vertical?(rightLabel?'end':'start'):'middle',currentY=vertical?ty+29:cy+25;
   h.push(text(tx,ty,e.wireId,`text-anchor="${anchor}" font-weight="bold"`),text(tx,ty+14,e.conducting?resistanceText(e.resistance):'เปิดวงจรระหว่างทาง',`text-anchor="${anchor}" class="${e.conducting?'value':'floating'}"`));
   if(graph.solution)h.push(text(tx,currentY,'I '+currentText(graph.solution.result.secondary.flows[e.id]),`text-anchor="${anchor}" class="value" style="fill:#176357;font-weight:bold" data-current-branch="${esc(e.id)}"`));
   if(Object.values(e.states).includes('loose'))h.push(text(tx,graph.solution?currentY+15:ty+29,'หลวม',`text-anchor="${anchor}" class="floating"`));
   h.push(path(points,e,true),'</g>');
  }
  // Draw junction dots last, so a crossing wire cannot visually erase a real connection.
  for(const n of graph.nodes)if(positions[n.id]){const [x,y]=positions[n.id];h.push(`<circle cx="${x}" cy="${y}" r="4" fill="${n.kind==='floating'?'white':'#43566b'}" stroke="#43566b" stroke-width="1.5"/>`);if(n.kind==='floating')h.push(text(x,y+22,n.label,'text-anchor="middle" class="net floating"'));}
  if(interactive){
   for(const n of graph.nodes)if(n.kind==='terminal'&&positions[n.id]){const [x,y]=positions[n.id];h.push(`<g class="circuit-port" data-electrical-node="${esc(n.id)}" role="button" tabindex="0" aria-label="ต่อสายที่ ${esc(n.label)}"><title>${esc(n.label)}</title><circle cx="${x}" cy="${y}" r="13" fill="transparent" stroke="#8fa6b7" stroke-width="1"/><circle cx="${x}" cy="${y}" r="4" fill="#43566b"/></g>`);}
   const e=wires.find(w=>w.wireId===selected),route=routes[selected];
   if(e&&route){for(const side of ['a','b']){const p=positions[e[side]],x=p[0]+(side==='a'?-18:18),y=p[1]+28;h.push(`<g data-circuit-handle="${side}" class="circuit-handle" role="button" tabindex="0" aria-label="ปลาย ${side.toUpperCase()} ในวงจรของ ${esc(e.name)}">${line(p[0],p[1],x,y)}<circle cx="${x}" cy="${y}" r="13" fill="#fff5d8" stroke="#b98b32" stroke-width="2"/>${text(x,y+4,side.toUpperCase(),'text-anchor="middle"')}</g>`);}
    route.points.slice(1,-1).forEach(([x,y],i)=>h.push(`<rect data-circuit-bend="${i}" class="circuit-bend" x="${x-6}" y="${y-6}" width="12" height="12" rx="2" fill="white" stroke="#33463f" stroke-width="2"><title>ลากจัดแนวสายในวงจร</title></rect>`));}
   h.push('<g id="electrical-edit-preview"></g>');
  }
 }
 if(!wires.length)h.push(text(660,180,'ไม่มีสายภายนอกเชื่อมขั้ว','text-anchor="middle"'));
 h.push(`<rect x="16" y="${baseHeight}" width="1288" height="${height-baseHeight-12}" rx="10" fill="white" stroke="#d5e0e7"/>`,text(32,baseHeight+29,'Earth / bypass ที่ใช้คำนวณ · ป้ายขั้วตรงกับผังด้านบน','class="heading"'));
 if(!extra.length)h.push(text(32,baseHeight+55,'ไม่มีทาง earth หรือ bypass ที่เปิดใช้งาน','class="sub"'));
 for(const [i,e]of extra.entries()){
  const x=42+(i%2)*640,y=baseHeight+69+Math.floor(i/2)*91;
  h.push(text(x,y-15,e.name,'font-weight="bold"'),resistor(x+210,y,x+380,resistanceText(e.resistance)),text(x,y+20,nodeById[e.a].label,'class="net"'),text(x+390,y+20,nodeById[e.b].label,'class="net"'),line(x+5,y,x+210,y),line(x+380,y,x+610,y),`<circle cx="${x+5}" cy="${y}" r="4" fill="#43566b"/><circle cx="${x+610}" cy="${y}" r="4" fill="#43566b"/>`);
  if(graph.solution)h.push(text(x+295,y+38,'I '+currentText(graph.solution.result.secondary.flows[e.id],true)+' RMS','text-anchor="middle" class="value" data-current-branch="'+esc(e.id)+'"'));
 }
 return {markup:h.join(''),width:1320,height,wiringHeight:baseHeight,positions,routes};
}
function svg(graph,selected=null,view='connected'){const d=schematic(graph,selected,view);return `<svg class="electrical-schematic" xmlns="http://www.w3.org/2000/svg" width="${d.width}" height="${d.height}" viewBox="0 0 ${d.width} ${d.height}" role="img" aria-label="วงจรไฟฟ้าจากสายที่ผู้ใช้ต่อ"><desc>${esc(JSON.stringify(graph))}</desc>${d.markup}</svg>`;}
const api={fromWires,schematic,svg,defaults,currentText};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.VisualElectrical=api;
})(globalThis);
