/* Field diagnosis: rank wiring/ratio hypotheses that explain values measured at the meter. No DOM dependencies.
   Method: enumerate single and paired faults on the legacy secondary topology, solve each with superposition
   (unit balanced CT currents + nominal PT voltages), fit load angle and scales, then score against the field values. */
(function(root){
const E=typeof module!=='undefined'&&module.exports?require('./vector-engine.js'):root.VectorLab;
const {C,abs,angle,add,mul,scale,sub,polar,secondary,defaultSettings,defaultTopology,poleDefault,sourceNames,terminalNames}=E;
const wires=['red','green','black','white','orange','gray'];
const wireThai={red:'แดง',green:'เขียว',black:'ดำ',white:'ขาว',orange:'ส้ม',gray:'เทา'};
const wrap=d=>((d+540)%360)-180;

// Each move changes one thing. A hypothesis is up to two moves on different slots.
// area = where the change sits, so an area the user has verified can be left out of the search.
function moves(){
 const list=[],add_=(slot,label,apply,area=(slot.match(/^(pole|cable|meter)/)||[])[1]||'source')=>list.push({slot,label,apply,area});
 for(let k=0;k<8;k++){
  for(let d=0;d<6;d++)if(d!==poleDefault[k])add_('pole'+k,`บนเสา ${sourceNames[k]} ต่อเข้าสาย${wireThai[wires[d]]} (ปกติ${wireThai[wires[poleDefault[k]]]})`,h=>{h.t.pole[k].dest=d;});
  add_('pole'+k,`บนเสา ${sourceNames[k]} หลุด/ขาด`,h=>{h.t.pole[k].status='open';});
 }
 // The CT common (CT R X2 + CT B X2) and PT common (PT R X2 + PT B X2) are one jumper each on the pole.
 for(const [pins,name,normal]of [[[1,3],'common CT (X2 ของ CT R/B)',2],[[5,7],'common PT (X2 ของ PT R/B)',5]])for(let d=0;d<6;d++)if(d!==normal)
  add_(pins.map(k=>'pole'+k).join('|'),`บนเสา ${name} ต่อเข้าสาย${wireThai[wires[d]]} (ปกติ${wireThai[wires[normal]]})`,h=>{pins.forEach(k=>h.t.pole[k].dest=d);});
 for(let a=0;a<8;a++)for(let b=a+1;b<8;b++)if(poleDefault[a]!==poleDefault[b])add_('pole'+a+'|pole'+b,`บนเสา สลับ ${sourceNames[a]} กับ ${sourceNames[b]}`,h=>{h.t.pole[a].dest=poleDefault[b];h.t.pole[b].dest=poleDefault[a];});
 for(let k=0;k<6;k++){
  add_('cable'+k,`สาย${wireThai[wires[k]]}ขาดระหว่างทาง`,h=>{h.t.cable[k].status='open';});
  add_('cable'+k,`สาย${wireThai[wires[k]]}หลวม (เพิ่ม R)`,h=>{h.t.cable[k].status='loose';});
  add_('meter'+k,`หน้ามิเตอร์ สาย${wireThai[wires[k]]}หลุด/ไม่ได้ต่อ`,h=>{h.t.meter[k].status='open';});
  for(let d=0;d<7;d++)if(d!==k)add_('meter'+k,`หน้ามิเตอร์ สาย${wireThai[wires[k]]}ต่อเข้าขั้ว ${terminalNames[d]} (ปกติ ${terminalNames[k]})`,h=>{h.t.meter[k].dest=d;});
 }
 for(let a=0;a<6;a++)for(let b=a+1;b<6;b++)add_('meter'+a+'|meter'+b,`หน้ามิเตอร์ สลับสาย${wireThai[wires[a]]}กับสาย${wireThai[wires[b]]}`,h=>{h.t.meter[a].dest=b;h.t.meter[b].dest=a;});
 add_('bond','bond 17–19 หน้ามิเตอร์หลุด',h=>{h.t.bond=false;},'meter');
 add_('poleBond','มี bond ดำ–เทา เพิ่มบนเสา',h=>{h.t.poleBond=true;});
 add_('jumper','jumper 17–23 หลุด',h=>{h.t.returnJumper=false;},'meter');
 for(const [key,label]of [['revR','CT R กลับขั้ว'],['revB','CT B กลับขั้ว'],['revPTR','PT R กลับขั้ว'],['revPTB','PT B กลับขั้ว']])add_(key,label,h=>{h.f[key]=true;});
 for(const [k,key]of [['R','ctR'],['B','ctB']])for(const pos of ['source','pole','meter'])add_(key,`CT ${k} ถูก bypass/ลัดวงจรที่${({source:'ขั้ว CT',pole:'บนเสา',meter:'หน้ามิเตอร์'})[pos]}`,h=>{h.f[key]=true;h.f['bypass'+k]=pos;},pos==='source'?'source':pos);
 add_('sequence','ลำดับเฟส primary กลับ (RBY)',h=>{h.sequence='RBY';});
 return list;
}
function conflicts(a,b){const sa=a.slot.split('|'),sb=b.slot.split('|');return sa.some(x=>sb.includes(x));}

// meter (optional) = the wiring seen at the meter: {rows:[{dest,status}×6], bond, returnJumper}; it replaces the default.
function hypothesisState(s,chosen,meter){
 const h={t:defaultTopology(s),f:{},sequence:'RYB'};
 if(meter){meter.rows.forEach((r,k)=>Object.assign(h.t.meter[k],r));h.t.bond=meter.bond;h.t.returnJumper=meter.returnJumper;}
 for(const m of chosen)m.apply(h);
 h.f.topology=h.t;return h;
}
// Responses of every measured quantity to unit balanced CT currents (pf=1) and to unit PT voltages.
function responses(s,h){
 const sig=h.sequence==='RYB'?1:-1,V=[polar(1,0),C(),polar(1,60*sig)],center=scale(add(V[0],V[2]),1/3),VN=V.map(v=>sub(v,center));
 const Iu=[polar(1,angle(VN[0])),C(),polar(1,angle(VN[2]))],zero=[C(),C(),C()];
 const run=(I,U)=>secondary(s,I,U,h.f);
 const a=run(Iu,zero),b=run(zero,V);
 const comp=new Map();a.components.forEach((part,k)=>part.forEach(n=>comp.set(n,k)));
 return {a,b,comp};
}
const wireCurrent=(sol,k)=>sol.flows['cable'+k]||C();
// A voltage point is either a wire end at the meter (red…gray) or a meter terminal number ('15','16','17','19','21','22','23').
const terminals=terminalNames.map(t=>t.split(' ')[0]);
const node=p=>wires.includes(p)?14+wires.indexOf(p):terminals.includes(String(p))?20+terminals.indexOf(String(p)):(()=>{throw Error('จุดวัดไม่รู้จัก: '+p);})();
const pointThai=p=>wires.includes(p)?wireThai[p]:'ขั้ว '+p;
const voltage=(sol,x,y)=>sub(sol.v[x],sol.v[y]);

function evaluate(field,r,phi,kI,kV){
 const c=polar(kI,-phi),pred=(fa,fb)=>add(mul(fa,c),scale(fb,kV));
 const rows=[];let score=0;
 for(const m of field.currents){const k=wires.indexOf(m.wire),I=pred(wireCurrent(r.a,k),wireCurrent(r.b,k));
  const tol=0.03*m.A+0.02,e=(abs(I)-m.A)/tol;score+=e*e;rows.push({what:`I ${wireThai[m.wire]}`,meas:m.A,pred:abs(I),unit:'A',e});
  if(m.pf!=null&&m.ref){const x=node(m.ref[0]),y=node(m.ref[1]),U=pred(voltage(r.a,x,y),voltage(r.b,x,y));
   // pf<0 means the current is more than 90° from the voltage (power flowing backwards through that element).
   const base=Math.acos(Math.min(1,Math.abs(m.pf)))*180/Math.PI,meas=(m.pf<0?180-base:base)*(m.type==='lead'?-1:1);
   let e2,predDeg=null;if(abs(I)<1e-3*Math.max(m.A,0.01)||abs(U)<1e-6)e2=3;else{predDeg=wrap(angle(U)-angle(I));e2=wrap(predDeg-meas)/3;}
   score+=e2*e2;rows.push({what:`มุม I ${wireThai[m.wire]} เทียบ V ${pointThai(m.ref[0])}–${pointThai(m.ref[1])}`,meas:wrap(meas),pred:predDeg,unit:'°',e:e2});}
 }
 for(const m of field.voltages){const x=node(m.a),y=node(m.b);let e,p=null;
  if(r.comp.get(x)!==r.comp.get(y))e=3;else{p=abs(pred(voltage(r.a,x,y),voltage(r.b,x,y)));e=(p-m.V)/(0.03*m.V+1);}
  score+=e*e;rows.push({what:`V ${pointThai(m.a)}–${pointThai(m.b)}`,meas:m.V,pred:p,unit:'V',e});}
 return {score,rows};
}
// Fit load angle (import power, |phi|<90) and the current/voltage scales. Scales fit by magnitude least squares.
function fit(field,r){
 const ls=(meas,pred)=>{let n=0,d=0;meas.forEach((m,i)=>{n+=m*pred[i];d+=pred[i]*pred[i];});return d>1e-20?n/d:0;};
 const kV=field.voltages.length?ls(field.voltages.map(m=>m.V),field.voltages.map(m=>{const x=node(m.a),y=node(m.b);return r.comp.get(x)===r.comp.get(y)?abs(voltage(r.b,x,y)):0;})):1;
 const cur=field.currents.map(m=>abs(wireCurrent(r.a,wires.indexOf(m.wire))));
 const kI=ls(field.currents.map(m=>m.A),cur);
 let best=null;const tryPhi=phi=>{const ev=evaluate(field,r,phi,kI,kV);if(!best||ev.score<best.score)best={...ev,phi,kI,kV};};
 for(let phi=-88;phi<=88;phi+=4)tryPhi(phi);
 for(let step of [1,0.25]){const p0=best.phi;for(let phi=p0-4*step;phi<=p0+4*step;phi+=step)if(Math.abs(phi)<90)tryPhi(phi);}
 return best;
}

// Earth points are not known for sure: CT/PT common on the pole and terminals 17/19 at the meter, each earthed or not.
// options.earth = {PoleCT,PolePT,MeterCT,MeterPT} with true/false for what was seen on site; missing = unknown.
// With zero or one earth point no current can flow through earth, so all of those combinations are one case.
const earthKeys=['PoleCT','PolePT','MeterCT','MeterPT'];
const earthThai={PoleCT:'common CT บนเสา',PolePT:'common PT บนเสา',MeterCT:'ขั้ว 17 มิเตอร์',MeterPT:'ขั้ว 19 มิเตอร์'};
function earthCombos(known={}){
 const all=[];for(let m=0;m<16;m++){const c={};earthKeys.forEach((k,n)=>c[k]=!!(m&(1<<n)));if(earthKeys.every(k=>known[k]==null||known[k]===c[k]))all.push(c);}
 const on=c=>earthKeys.filter(k=>c[k]).length,open=all.filter(c=>on(c)<=1).sort((a,b)=>on(a)-on(b));
 return [...(open.length?[open[0]]:[]),...all.filter(c=>on(c)>=2)];
}
const earthLabel=c=>{const on=earthKeys.filter(k=>c[k]);return on.length>=2?'earth ที่ '+on.map(k=>earthThai[k]).join(' + '):'ไม่มีทางกระแสผ่าน earth (ไม่มีหรือมีจุดเดียว)';};
const earthSettings=c=>Object.fromEntries(earthKeys.map(k=>['earth'+k,c[k]]));
// First pass uses the typical earth cases: none, pole side only, meter side only, both sides; the best hypotheses then try every case.
const typical=c=>{const on=earthKeys.filter(k=>c[k]);return on.length<=1||['PoleCT,PolePT','MeterCT,MeterPT','PoleCT,PolePT,MeterCT,MeterPT'].includes(on.join());};
function scoreHypothesis(field,base,chosen,penalty,meter,combos,prev=null){
 let best=prev;const fits=prev?[...prev.earthFits]:[];
 for(const earth of combos){const s={...base,...earthSettings(earth)};let r;try{r=responses(s,hypothesisState(s,chosen,meter));}catch(e){continue;}
  const b=fit(field,r);fits.push({earth,score:b.score});if(!best||b.score<best.score)best={faults:chosen.map(m=>m.label),moves:chosen,earth:earthLabel(earth),earthCase:earth,score:b.score,total:b.score+penalty*chosen.length,phi:b.phi,kI:b.kI,kV:b.kV,rows:b.rows};}
 if(best)best.earthFits=fits;
 return best;
}
// verified = areas ('pole','cable','meter') the user checked on site; their moves are left out of the search.
function hypothesisList(pairs,verified=[]){
 const list=moves().filter(m=>!verified.includes(m.area)),out=[[]];list.forEach(m=>out.push([m]));
 if(pairs)for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++)if(!conflicts(list[i],list[j]))out.push([list[i],list[j]]);
 return out;
}
function finish(field,results,top,base,meter,earthCount){
 results.sort((x,y)=>x.total-y.total);
 const best=results.slice(0,top);
 for(const h of best){
  // Wiring of this hypothesis, for drawing.
  const st=hypothesisState(base,h.moves,meter);
  h.state={pole:st.t.pole.map(r=>({dest:r.dest,status:r.status})),cable:st.t.cable.map(r=>({status:r.status})),meter:st.t.meter.map(r=>({dest:r.dest,status:r.status})),bond:st.t.bond,poleBond:st.t.poleBond,returnJumper:st.t.returnJumper,flags:Object.fromEntries(Object.entries(st.f).filter(([k])=>k!=='topology')),sequence:st.sequence,earth:h.earthCase};
  delete h.moves;
  // Every earth case that fits as well as the best one: the readings cannot tell these apart.
  h.earthAlso=h.earthFits.filter(f=>f.score<=h.score+0.5).map(f=>earthLabel(f.earth));delete h.earthFits;
  h.loadPF=Math.cos(h.phi*Math.PI/180);
  // Ratio check: the fitted scales are the secondary current/voltage per unit of the balanced model.
  if(field.primaryCurrent>0&&h.kI>0)h.impliedCT=field.primaryCurrent/h.kI;
  if(field.primaryVoltage>0&&h.kV>0)h.impliedPT=field.primaryVoltage/h.kV;
  if(h.impliedCT&&field.ctRatio)h.ctError=h.impliedCT/field.ctRatio-1;
  if(h.impliedPT&&field.ptRatio)h.ptError=h.impliedPT/field.ptRatio-1;
  // Measured/predicted per CT wire: a gap between red and green points at unequal CT ratios or an unbalanced load.
  const ratio=w=>{const r=h.rows.find(x=>x.what==='I '+wireThai[w]);return r&&r.pred>1e-6?r.meas/r.pred:null;};
  h.currentRatio={R:ratio('red'),B:ratio('green')};
 }
 const normal=results.find(r=>!r.faults.length);if(normal){delete normal.moves;delete normal.earthFits;}
 return {top:best,count:results.length,earthCases:earthCount,normal};
}
const settingsFor=options=>({...defaultSettings(),ct:1,pt:1,voltage:1,current:1,...(options.settings||{})});
const verifiedFor=options=>[...new Set([...(options.verified||[]),...(options.meter?['meter']:[])])];
// The search as a sequence of small steps, shared by the Node and browser versions.
function* search(field,options){
 const base=settingsFor(options),penalty=options.penalty??6,list=hypothesisList(options.pairs??true,verifiedFor(options));
 const combos=earthCombos(options.earth),first=combos.length<=4?combos:combos.filter(typical),rest=combos.filter(c=>!first.includes(c)),results=[];
 for(let i=0;i<list.length;i++){const h=scoreHypothesis(field,base,list[i],penalty,options.meter,first);if(h)results.push(h);if(i%300===0)yield i/list.length*0.9;}
 if(rest.length){results.sort((x,y)=>x.total-y.total);const refine=results.slice(0,options.refine??300);const normal=results.find(r=>!r.faults.length);if(normal&&!refine.includes(normal))refine.push(normal);
  for(let i=0;i<refine.length;i++){Object.assign(refine[i],scoreHypothesis(field,base,refine[i].moves,penalty,options.meter,rest,{...refine[i]}));if(i%50===0)yield 0.9+i/refine.length*0.1;}}
 return finish(field,results,options.top??10,base,options.meter,combos.length);
}
function diagnose(field,options={}){const it=search(field,options);let r;while(!(r=it.next()).done);return r.value;}
// Browser version: runs the same steps with pauses so the page stays responsive.
function diagnoseAsync(field,options={},onProgress=()=>{}){
 const it=search(field,options);
 return new Promise((resolve,reject)=>{const step=()=>{try{const t=Date.now();let r;do{r=it.next();}while(!r.done&&Date.now()-t<40);if(r.done)resolve(r.value);else{onProgress(r.value);setTimeout(step,0);}}catch(e){reject(e);}};step();});
}
const countHypotheses=(options={})=>hypothesisList(options.pairs??true,verifiedFor(options)).length;
const api={diagnose,diagnoseAsync,countHypotheses,earthCombos,earthKeys,earthThai,moves,wires,wireThai,terminals};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FieldDiagnosis=api;
})(typeof window!=='undefined'?window:globalThis);
