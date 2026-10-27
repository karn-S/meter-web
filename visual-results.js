/* Calculation controls and presentation for the editable wire graph. */
(function(root){
const V=root.VectorLab,esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const numbers=[['voltage','แรงดันสาย ULL (V)',400],['current','กระแสสาย (A)',10],['pf','PF',.8],['ctPrimary','CT primary (A)',5],['ctSecondary','CT secondary (A)',5],['ptPrimary','PT primary (V)',400],['ptSecondary','PT secondary (V)',400],['ir','IR manual (A)',10],['ib','IB manual (A)',10],['angleR','มุม IR เทียบ VRN (°)',-36.86989765],['angleB','มุม IB เทียบ VBN (°)',-36.86989765]];
const parameters=[['contactR','จุดต่อ (Ω)',.001],['cableR','สายตั้งต้น (Ω)',.1],['looseR','หลวมเพิ่ม/จุด (Ω)',20],['bondR','Jumper / bond / bypass (Ω)',.001],['iBurdenR','Burden IR (Ω)',.02],['iBurdenB','Burden IB (Ω)',.02],['vBurdenR','Burden VR (Ω)',1e6],['vBurdenB','Burden VB (Ω)',1e6],['ptWinding','PT winding (Ω)',.05],['ctExcR','CT excitation R (Ω)',1e6],['ctExcX','CT excitation X (Ω)',0],['ctLimit','เกณฑ์เตือน CT (V)',50],['earthR','Earth แต่ละทาง (Ω)',10]];
const selects=[['connection','โหลด',[['Y','Y'],['Delta','Delta']]],['sequence','ลำดับเฟส',[['RYB','RYB'],['RBY','RBY']]],['reactive','Reactive',[['lag','Lag'],['lead','Lead']]],['currentMode','กำหนดกระแส',[['balanced','สมดุลจาก I / PF'],['manual','IR / IB และมุม']]],['bypassR','ตำแหน่ง bypass R',[['pole','ขั้วบล็อก'],['source','ขดลวด CT'],['meter','หน้ามิเตอร์']]],['bypassB','ตำแหน่ง bypass B',[['pole','ขั้วบล็อก'],['source','ขดลวด CT'],['meter','หน้ามิเตอร์']]]];
const flags=[['lineR','Primary R ขาด'],['lineY','Primary Y ขาด'],['lineB','Primary B ขาด'],['revR','CT R กลับขั้ว'],['revB','CT B กลับขั้ว'],['revPTR','PT R กลับขั้ว'],['revPTB','PT B กลับขั้ว'],['ctR','Bypass CT R'],['ctB','Bypass CT B']];
const earth=[['earthPoleCT','Earth common CT ที่บล็อก',true],['earthPolePT','Earth common PT ที่บล็อก',true],['earthMeterCT','Earth 17 หน้ามิเตอร์',true],['earthMeterPT','Earth 19 หน้ามิเตอร์',true],['earthCabinet','PE ตู้มิเตอร์ต่อ earth ผ่าน R',true],['earthE','ต่อ E ทั้ง 4 บล็อกลง earth',false]];
const fmt=(n,d=4)=>Number.isFinite(n)?(Math.abs(n)<.5*10**(-d)?0:n).toLocaleString('en-US',{maximumFractionDigits:d}):'—';
const phasor=(z,unit)=>z?fmt(V.abs(z),6)+' '+unit+' ∠ '+(V.angle(z)===null?'—':fmt(V.angle(z),3)+'°'):'—';
function setup(doc,onchange){
 const $=id=>doc.getElementById(id),numeric=list=>list.map(([id,name,value])=>`<label>${name}<input id="calc-${id}" type="number" step="any" value="${value}"></label>`).join('');
 $('calculation-inputs').innerHTML=numeric(numbers)+selects.slice(0,4).map(([id,name,opts])=>`<label>${name}<select id="calc-${id}">${opts.map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select></label>`).join('');
 $('calculation-parameters').innerHTML=numeric(parameters)+earth.map(([id,name,checked])=>`<label class="check"><input type="checkbox" id="calc-${id}" ${checked?'checked':''}>${name}</label>`).join('');
 $('calculation-faults').innerHTML=flags.map(([id,name])=>`<label class="check"><input type="checkbox" id="calc-${id}">${name}</label>`).join('')+selects.slice(4).map(([id,name,opts])=>`<label>${name}<select id="calc-${id}">${opts.map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select></label>`).join('');
 for(const [id,,value]of [...numbers,...parameters]){$('calc-'+id).value=value;$('calc-'+id).oninput=$('calc-'+id).onchange=onchange;}
 for(const [id,,opts]of selects){$('calc-'+id).value=opts[0][0];$('calc-'+id).onchange=onchange;}
 for(const [id,,checked]of [...flags,...earth]){$('calc-'+id).checked=!!checked;$('calc-'+id).onchange=onchange;}
}
function read(doc){
 const $=id=>doc.getElementById('calc-'+id),s=V.defaultSettings(),f={};
 for(const [id]of [...numbers,...parameters]){const raw=String($(id).value).trim(),v=Number(raw);if(!raw||!Number.isFinite(v))throw Error('กรอก '+id+' เป็นตัวเลข');s[id]=v;}
 for(const key of ['voltage','ctPrimary','ctSecondary','ptPrimary','ptSecondary','iBurdenR','iBurdenB','vBurdenR','vBurdenB','ctExcR','ctLimit'])if(s[key]<=0)throw Error(key+' ต้องมากกว่า 0');
 for(const key of ['current','ir','ib',...parameters.map(p=>p[0])])if(s[key]<0)throw Error(key+' ต้องไม่ติดลบ');
 if(s.pf<0||s.pf>1)throw Error('PF ต้องอยู่ระหว่าง 0 ถึง 1');
 s.ct=s.ctPrimary/s.ctSecondary;s.pt=s.ptPrimary/s.ptSecondary;
 for(const [id]of selects)if(id.startsWith('bypass'))f[id]=$(id).value;else s[id]=$(id).value;
 for(const [id]of flags)f[id]=$(id).checked;for(const [id]of earth)s[id]=$(id).checked;
 return {s,f};
}
const wideVectorHeight=550;
function vectors(r,normal,mode='meter'){
 const primary=mode==='primary',secondary=mode==='secondary';
 const secondaryI=s=>[s.is[0],V.scale(V.add(s.is[0],s.is[1]),-1),s.is[1]];
 const u=primary?r.sourceU:secondary?r.secondary.us:r.U,i=primary?r.I:secondary?secondaryI(r.secondary):[r.MI[0],r.inferredIY,r.MI[1]],nu=primary?normal.sourceU:secondary?normal.secondary.us:normal.U,ni=primary?normal.I:secondary?secondaryI(normal.secondary):[normal.MI[0],normal.inferredIY,normal.MI[1]],colors=['#c23d4b','#488a5c','#387dc3'],h=[];
 const width=secondary?430:640,height=secondary?680:wideVectorHeight,x=215,y=285,radius=145;
 h.push(`<rect width="${width}" height="${height}" fill="#fff"/>`);
 const voltageColors=primary?[colors[0],colors[2],'#8b67b6']:[colors[0],colors[2]];
 const scaleText=(n,unit)=>Number(n.toPrecision(3)).toLocaleString('en-US',{maximumSignificantDigits:3})+' '+unit;
 const range=(values,baseline,rings)=>{
  const largest=Math.max(...[...values,...baseline].map(V.abs)),max=largest<1e-9?0:largest; // Same zero threshold as phasor phase.
  return {step:max/rings,max,rings,radius:radius*rings/3};
 };
 const ur=range(u,nu,3),ir=range(i,ni,2),groups=[{values:u,baseline:nu,scale:ur,unit:'V',kind:'voltage',palette:voltageColors,names:primary?['URY','UBY','URB']:secondary?['U RY · 16−19','U BY · 22−19']:['U RY มิเตอร์','U BY มิเตอร์'],short:primary?['URY','UBY','URB']:['U RY','U BY']},{values:i,baseline:ni,scale:ir,unit:'A',kind:'current',palette:[colors[0],'#000000',colors[2]],names:secondary?['IR · 15→17','IY อนุมาน','IB · 21→23']:['IR',primary?'IY':'IY อนุมาน','IB'],short:['IR','IY','IB']}];
 h.push(`<text x="24" y="28" style="fill:#263e34;font-size:16px">${primary?'Primary ที่แหล่งจ่าย':secondary?'Secondary ที่ขั้วมิเตอร์':'มิเตอร์ · คูณ CT / PT แล้ว'}</text>`);
 for(const [k,g]of groups.entries()){const left=k?(secondary?222:330):16,boxWidth=secondary?192:294;h.push(`<rect x="${left}" y="42" width="${boxWidth}" height="54" rx="7" fill="${k?'#f0f4e9':'#edf4fa'}"/><text x="${left+10}" y="63" style="fill:${k?'#637b29':'#356887'};font-size:${secondary?15:14}px;font-weight:bold">${k?'กระแส':'แรงดัน'}: ${esc(scaleText(g.scale.step,g.unit))} / วง</text><text x="${left+10}" y="83" style="fill:#687d72;font-size:12px">max ${esc(scaleText(g.scale.max,g.unit))} · ${k?'วงรองนอก':'วงนอกสุด'}</text>`);}
 h.push(`<g data-vector-plot="combined"><rect x="12" y="106" width="${width-24}" height="365" rx="10" fill="#fbfdfb" stroke="#dce5df"/>`);
 for(let k=1;k<=3;k++){const rr=radius*k/3;h.push(`<circle cx="${x}" cy="${y}" r="${rr}" fill="none" stroke="${k===3?'#9ab5c7':k===2?'#adbd8b':'#dfe7e2'}" stroke-width="${k===1?1:1.5}"/><text x="${x-rr}" y="${y+18}" text-anchor="middle" style="fill:#356887;font-size:11px${k===3?';font-weight:bold':''}">${esc(scaleText(ur.step*k,'V'))}${k===3?' max':''}</text>`);if(k<=ir.rings)h.push(`<text x="${x+rr}" y="${y+18}" text-anchor="middle" style="fill:#637b29;font-size:11px${k===2?';font-weight:bold':''}">${esc(scaleText(ir.step*k,'A'))}${k===2?' max':''}</text>`);}
 h.push(`<path d="M${x-radius-25} ${y}H${x+radius+25}M${x} ${y-radius-25}V${y+radius+25}" stroke="#cbd9d1"/><text x="${x+radius+29}" y="${y+4}" style="fill:#819287;font-size:11px">0°</text><text x="${x}" y="${y-radius-12}" text-anchor="middle" style="fill:#819287;font-size:11px">90°</text>`);
 const draw=(g,z,k,dashed)=>{
  const factor=g.scale.max?g.scale.radius/g.scale.max:0,ex=x+z.re*factor,ey=y-z.im*factor,a=Math.atan2(ey-y,ex-x),arrow=8,color=g.palette[k];
  h.push(`<g data-vector-series="${dashed?'normal':'actual'}" data-vector-name="${esc(g.short[k])}"><title>${esc(g.names[k]+': '+phasor(z,g.unit)+(dashed?' · ต่อปกติ':' · ปัจจุบัน'))}</title><path d="M${x} ${y}L${ex} ${ey}" stroke="${color}" stroke-width="${dashed?1.5:g.unit==='V'?2.7:2.2}" ${dashed||g.kind==='current'&&k===1?'stroke-dasharray="5 4"':''} ${dashed?'opacity=".5"':''} fill="none"/>`);
  if(!dashed&&V.abs(z)>1e-8){h.push(`<path d="M${ex-arrow*Math.cos(a-.4)} ${ey-arrow*Math.sin(a-.4)}L${ex} ${ey}L${ex-arrow*Math.cos(a+.4)} ${ey-arrow*Math.sin(a+.4)}Z" fill="${color}"/>`);h.push(`<text x="${ex+13*Math.cos(a)}" y="${ey+13*Math.sin(a)+4}" text-anchor="${Math.cos(a)<-.2?'end':'start'}" style="fill:${color};font-size:13px;font-weight:bold;paint-order:stroke;stroke:white;stroke-width:3px">${esc(g.short[k])}</text>`);}
  h.push('</g>');
 };
 for(const g of groups)g.baseline.forEach((z,k)=>draw(g,z,k,true));
 let index=0;
 for(const g of groups){h.push(`<g data-vector-kind="${g.kind}" data-vector-unit="${g.unit}" data-vector-max="${g.scale.max}" data-vector-center="${x},${y}" data-vector-radius="${g.scale.radius}">`);g.values.forEach((z,k)=>draw(g,z,k,false));h.push('</g>');
  g.values.forEach((z,k)=>{const n=index++,lx=secondary?24+n%2*210:410,ly=secondary?515+Math.floor(n/2)*55:155+n*52;h.push(`<text x="${lx}" y="${ly}" style="fill:${g.palette[k]};font-size:${secondary?16:14}px">${esc(g.names[k])}</text><text x="${lx}" y="${ly+20}" style="fill:#4b6158;font-size:${secondary?15:13}px">${esc(phasor(z,g.unit))}</text>`);});
 }
 h.push(`<circle cx="${x}" cy="${y}" r="3" fill="#263e34"/></g><text x="24" y="494" style="fill:#687d72;font-size:12px">max V / A = ค่ามากสุดที่แสดง · RMS</text>`);
 h.push(`<text x="24" y="${height-12}" style="fill:#687d72;font-size:11px">เส้นเข้ม = ปัจจุบัน · เส้นจาง = ต่อปกติ · IY เส้นประดำ</text>`);
 return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${secondary?'เวกเตอร์ Secondary ที่ขั้วมิเตอร์':primary?'เวกเตอร์ Primary ที่แหล่งจ่าย':'เวกเตอร์มิเตอร์คูณอัตราทดแล้ว'}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="font-family:Tahoma,Arial,sans-serif">${h.join('')}</svg>`;
}
function metrics(r){return [['P primary',fmt(r.truePower.re/1000)+' kW'],['Q primary',fmt(r.truePower.im/1000)+' kvar'],['SΣ primary',fmt(r.sp/1000)+' kVA'],['PF primary',fmt(r.pf,6)],['W1 มิเตอร์',fmt(r.E[0].re/1000)+' kW'],['W2 มิเตอร์',fmt(r.E[1].re/1000)+' kW'],['P มิเตอร์',fmt(r.mp.re/1000)+' kW'],['Q มิเตอร์ · Im(S)',fmt(r.mp.im/1000)+' kvar'],['SΣ มิเตอร์',fmt(r.ms/1000)+' kVA'],['PF มิเตอร์',fmt(r.mpf,6)],['P error',Math.abs(r.truePower.re)>1e-8?fmt((r.mp.re-r.truePower.re)/r.truePower.re*100,5)+' %':'—']];}
function render(doc,graph,r,normal){
 const $=id=>doc.getElementById(id),sec=r.secondary;
 $('meter-display').textContent=fmt(r.mp.re/1000,3);$('meter-display-label').textContent='kW · ค่ามิเตอร์คูณ CT / PT แล้ว';
 $('calculation-metrics').innerHTML=metrics(r).map(([k,v])=>`<div><span>${k}</span><strong>${v}</strong></div>`).join('');
 $('calculation-vectors').innerHTML=vectors(r,normal,'primary')+vectors(r,normal);
 $('meter-vectors').innerHTML=vectors(r,normal,'secondary');
 $('calculation-diagnostics').textContent=`${r.faults.length?r.faults.join(' · '):'การต่อปกติ'} | KCL residual ${sec.diagnostics.kcl.toExponential(2)} A | Secondary power residual ${V.abs(sec.diagnostics.power).toExponential(2)} VA | ${sec.components.length} กลุ่มศักย์อ้างอิง`;
 $('calculation-warnings').innerHTML=r.warnings.map(w=>'<li>'+esc(w)+'</li>').join('');
 const nodes=Object.fromEntries(graph.nodes.map(n=>[n.id,n.label]));
 $('secondary-flows').innerHTML=graph.branches.map(e=>{const i=sec.flows[e.id],same=sec.componentOf[e.a]===sec.componentOf[e.b],u=same?V.sub(sec.v[sec.index[e.a]],sec.v[sec.index[e.b]]):null;return `<tr><td>${esc(e.name||e.id)}</td><td>${esc(nodes[e.a]+' → '+nodes[e.b])}</td><td>${e.kind.endsWith('source')?'แหล่งจ่าย':!e.conducting?'เปิด':fmt(e.resistance,6)+(e.kind==='impedance'?' + j'+fmt(e.reactance,6):'')+' Ω'}</td><td>${esc(root.VisualElectrical.currentText(i,true))}</td><td>${u?phasor(u,'V'):'— (ลอยแยกวงจร)'}</td></tr>`;}).join('');
 $('calculation-state').textContent='คำนวณจากสายปัจจุบันแล้ว';$('calculation-state').className='calculation-ok';
}
function clear(doc,message){for(const id of ['calculation-metrics','calculation-vectors','secondary-flows','calculation-warnings','calculation-diagnostics'])doc.getElementById(id).innerHTML='';doc.getElementById('meter-vectors').innerHTML='<div class="meter-vector-empty">คำนวณเวกเตอร์ไม่ได้ · '+esc(message)+'</div>';doc.getElementById('meter-display').textContent='—';doc.getElementById('meter-display-label').textContent='คำนวณไม่ได้';doc.getElementById('calculation-state').textContent=message;doc.getElementById('calculation-state').className='calculation-error';}
function report(graph,selected,view){
 const d=root.VisualElectrical.schematic(graph,selected,view),r=graph.solution.result,n=graph.solution.normal;
 const notes=[`KCL residual ${r.secondary.diagnostics.kcl.toExponential(2)} A · Secondary power residual ${V.abs(r.secondary.diagnostics.power).toExponential(2)} VA`,...r.warnings,'CT excitation เป็นโมเดลเชิงเส้น · ความยาวภาพไม่กำหนด R · IY มิเตอร์เป็นค่าอนุมาน'],notesY=d.height+200+wideVectorHeight+36,height=notesY+20+notes.length*28;
 return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="วงจรไฟฟ้าและผลคำนวณจากสายปัจจุบัน" width="1320" height="${height}" viewBox="0 0 1320 ${height}"><metadata>${esc(JSON.stringify(graph))}</metadata><g class="electrical-schematic">${d.markup}</g><rect y="${d.height}" width="1320" height="${height-d.height}" fill="white"/><g transform="translate(0 ${d.height+36})" font-family="Tahoma,Arial" font-size="16">${metrics(r).map(([k,v],i)=>`<text x="${24+i%4*326}" y="${Math.floor(i/4)*50}">${esc(k+': '+v)}</text>`).join('')}</g><g transform="translate(0 ${d.height+200})">${vectors(r,n,'primary')}</g><g transform="translate(660 ${d.height+200})">${vectors(r,n)}</g>${notes.map((t,i)=>`<text x="24" y="${notesY+i*28}" font-family="Tahoma,Arial" font-size="12">${esc(t)}</text>`).join('')}</svg>`;
}
root.VisualResults={setup,read,render,clear,report,vectors};
})(globalThis);
