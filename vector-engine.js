/* Shared primary and secondary circuit engine; no DOM dependencies. */
(function(root){
const C=(re=0,im=0)=>({re,im}),add=(a,b)=>C(a.re+b.re,a.im+b.im),sub=(a,b)=>C(a.re-b.re,a.im-b.im),mul=(a,b)=>C(a.re*b.re-a.im*b.im,a.re*b.im+a.im*b.re),conj=a=>C(a.re,-a.im),abs=a=>Math.hypot(a.re,a.im),scale=(a,k)=>C(a.re*k,a.im*k),div=(a,b)=>{const n=b.re*b.re+b.im*b.im;return n<1e-28?C():C((a.re*b.re+a.im*b.im)/n,(a.im*b.re-a.re*b.im)/n)},polar=(r,d)=>C(r*Math.cos(d*Math.PI/180),r*Math.sin(d*Math.PI/180)),angle=a=>abs(a)<1e-9?null:Math.atan2(a.im,a.re)*180/Math.PI,sum=a=>a.reduce(add,C());
const ph=['R','Y','B'];
function solveLinear(A,b){ // Small complex nodal solver with partial pivoting.
 const n=b.length; A=A.map(r=>r.map(z=>C(z.re,z.im)));b=b.map(z=>C(z.re,z.im));
 for(let k=0;k<n;k++){let p=k;for(let j=k+1;j<n;j++)if(abs(A[j][k])>abs(A[p][k]))p=j;if(abs(A[p][k])<1e-14)throw Error('Singular network');[A[p],A[k]]=[A[k],A[p]];[b[p],b[k]]=[b[k],b[p]];
 for(let j=k+1;j<n;j++){const f=div(A[j][k],A[k][k]);for(let i=k;i<n;i++)A[j][i]=sub(A[j][i],mul(f,A[k][i]));b[j]=sub(b[j],mul(f,b[k]));}}
 const x=Array(n).fill(null);for(let k=n-1;k>=0;k--){let v=b[k];for(let j=k+1;j<n;j++)v=sub(v,mul(A[k][j],x[j]));x[k]=div(v,A[k][k]);}return x;
}
// Each disconnected component gets its own potential reference. No hidden earth leakage.
function nodal(count,edges,injections=[],known={}){
 const adj=Array.from({length:count},()=>[]);
 for(const e of edges)if(abs(e.y)>1e-20){adj[e.a].push(e.b);adj[e.b].push(e.a);}
 const refs={...known},visited=new Set(),components=[];
 for(let n=0;n<count;n++)if(!visited.has(n)){const part=[],queue=[n];visited.add(n);while(queue.length){const k=queue.pop();part.push(k);for(const j of adj[k])if(!visited.has(j)){visited.add(j);queue.push(j);}}components.push(part);if(!part.some(k=>refs[k]!==undefined))refs[part[0]]=C();}
 const free=Array.from({length:count},(_,i)=>i).filter(i=>refs[i]===undefined),index=new Map(free.map((k,i)=>[k,i]));
 const A=free.map(()=>free.map(()=>C())),b=free.map(k=>injections[k]||C()),v=Array.from({length:count},()=>C());
 for(const k in refs)v[+k]=refs[k];
 for(const e of edges){if(abs(e.y)<1e-20)continue;for(const [a,d]of [[e.a,e.b],[e.b,e.a]]){const r=index.get(a);if(r===undefined)continue;A[r][r]=add(A[r][r],e.y);if(refs[d]!==undefined)b[r]=add(b[r],mul(e.y,refs[d]));else A[r][index.get(d)]=sub(A[r][index.get(d)],e.y);}}
 if(free.length){const x=solveLinear(A,b);free.forEach((k,i)=>v[k]=x[i]);}
 return {v,components};
}
const wireNames=['แดง · I R','เขียว · I B','ดำ · common CT','ขาว · V R','ส้ม · V B','เทา/ขาวคาดดำ · common PT'];
const wireColors=['#ed4055','#39ce79','#101010','#ffffff','#ff932d','#adb5bf'];
const poleDefault=[0,2,1,2,3,5,4,5],meterDefault=[0,1,2,3,4,5];
const terminalNames=['15 · I R+','21 · I B+','17 · I R−','16 · V R','22 · V B','19 · common PT','23 · I B−'];
const sourceNames=['CT R X1','CT R X2','CT B X1','CT B X2','PT R X1','PT R X2','PT B X1','PT B X2'];
function defaultTopology(s={}){return {pole:poleDefault.map(dest=>({dest,status:'normal',r:s.contactR??0.001})),cable:wireNames.map((_,dest)=>({dest,status:'normal',r:s.cableR??0.1})),meter:meterDefault.map(dest=>({dest,status:'normal',r:s.contactR??0.001})),bond:true,poleBond:false,returnJumper:true,extra:[]};}
function defaultSettings(){return {voltage:400,current:10,pf:0.8,ct:1,pt:1,connection:'Y',sequence:'RYB',reactive:'lag',currentMode:'balanced',ir:10,ib:10,angleR:-36.86989765,angleB:-36.86989765,contactR:0.001,cableR:0.1,looseR:20,iBurdenR:0.02,iBurdenB:0.02,vBurdenR:1000000,vBurdenB:1000000,ptWinding:0.05,ctExcR:1000000,ctExcX:0,ctLimit:50,bondR:0.001,earthR:10,earthPoleCT:true,earthPolePT:true,earthMeterCT:true,earthMeterPT:true};}
function graphSecondary(s,I,V,f){
 const graph=f.graph,nodeIds=graph.nodes.map(n=>n.id),index=Object.fromEntries(nodeIds.map((id,i)=>[id,i])),count=nodeIds.length;
 if(new Set(nodeIds).size!==count)throw Error('โหนดวงจรซ้ำ');
 const parent=nodeIds.map((_,i)=>i),find=i=>parent[i]===i?i:(parent[i]=find(parent[i])),join=(a,b)=>{parent[find(a)]=find(b);};
 const ids=new Set(),edges=graph.branches.map(e=>{
  if(ids.has(e.id)||index[e.a]===undefined||index[e.b]===undefined)throw Error('branch/โหนดไม่ถูกต้อง: '+e.id);ids.add(e.id);
  const q={...e,a:index[e.a],b:index[e.b]};
  if(['current-source','voltage-source'].includes(e.kind))return q;
  if(!Number.isFinite(e.resistance)||e.resistance<0||!Number.isFinite(e.reactance??0))throw Error('impedance ไม่ถูกต้อง: '+e.id);
  if(e.conducting){q.ideal=e.resistance===0&&(e.reactance??0)===0;if(q.ideal)join(q.a,q.b);else q.y=div(C(1),C(e.resistance,e.reactance||0));}
  return q;
 });
 const roots=[...new Set(nodeIds.map((_,i)=>find(i)))],compact=new Map(roots.map((k,i)=>[k,i])),at=i=>compact.get(find(i)),n=roots.length;
 const inj=Array.from({length:n},()=>C()),voltageSources=[],adj=Array.from({length:n},()=>[]);
 for(const e of edges){
  e.ca=at(e.a);e.cb=at(e.b);
  if(e.kind==='current-source'){e.source=scale(I[e.phase==='R'?0:2],(f[e.phase==='R'?'revR':'revB']?-1:1)/s.ct);inj[e.ca]=add(inj[e.ca],e.source);inj[e.cb]=sub(inj[e.cb],e.source);}
  if(e.kind==='voltage-source'){e.source=scale(sub(V[e.phase==='R'?0:2],V[1]),(f[e.phase==='R'?'revPTR':'revPTB']?-1:1)/s.pt);voltageSources.push(e);}
  if(e.y||e.kind==='voltage-source'){adj[e.ca].push(e.cb);adj[e.cb].push(e.ca);}
 }
 const refs=new Set(),seen=new Set(),parts=[];
 if(index['earth:common']!==undefined)refs.add(at(index['earth:common']));
 for(let k=0;k<n;k++)if(!seen.has(k)){const part=[],queue=[k];seen.add(k);while(queue.length){const a=queue.pop();part.push(a);for(const b of adj[a])if(!seen.has(b)){seen.add(b);queue.push(b);}}parts.push(part);if(!part.some(a=>refs.has(a)))refs.add(part[0]);}
 const free=roots.map((_,i)=>i).filter(i=>!refs.has(i)),row=new Map(free.map((k,i)=>[k,i])),size=free.length+voltageSources.length;
 const A=Array.from({length:size},()=>Array.from({length:size},()=>C())),rhs=Array.from({length:size},()=>C());
 free.forEach((k,i)=>rhs[i]=inj[k]);
 const stamp=(a,b,z)=>{if(a!==undefined&&b!==undefined)A[a][b]=add(A[a][b],z);};
 for(const e of edges)if(e.y){const a=row.get(e.ca),b=row.get(e.cb);stamp(a,a,e.y);stamp(b,b,e.y);stamp(a,b,scale(e.y,-1));stamp(b,a,scale(e.y,-1));}
 voltageSources.forEach((e,k)=>{const r=free.length+k,a=row.get(e.ca),b=row.get(e.cb);stamp(a,r,C(1));stamp(b,r,C(-1));stamp(r,a,C(1));stamp(r,b,C(-1));rhs[r]=e.source;});
 const x=size?solveLinear(A,rhs):[],cv=Array.from({length:n},()=>C());free.forEach((k,i)=>cv[k]=x[i]);
 const v=nodeIds.map((_,i)=>cv[at(i)]),flows={};
 for(const e of edges){if(e.kind==='current-source')flows[e.id]=scale(e.source,-1);else if(e.kind==='voltage-source')flows[e.id]=x[free.length+voltageSources.indexOf(e)];else if(e.y)flows[e.id]=mul(sub(v[e.a],v[e.b]),e.y);else if(!e.ideal)flows[e.id]=C();}
 // Recover a zero-ohm bridge current from KCL on one side. A cycle has no unique branch current.
 const idealEdges=edges.filter(e=>e.ideal),idealAdj=Array.from({length:count},()=>[]),warnings=[];
 for(const e of idealEdges){idealAdj[e.a].push(e);idealAdj[e.b].push(e);}
 for(const edge of idealEdges){const side=new Set([edge.a]),queue=[edge.a];while(queue.length){const k=queue.pop();for(const e of idealAdj[k])if(e!==edge){const j=e.a===k?e.b:e.a;if(!side.has(j)){side.add(j);queue.push(j);}}}
  if(side.has(edge.b)){flows[edge.id]=null;warnings.push(edge.id+': ทางขนาน R=0 ทำให้กระแสรายเส้นไม่เป็นค่าเดียว');continue;}
  let outgoing=C();for(const e of edges)if(!e.ideal&&flows[e.id]){if(side.has(e.a))outgoing=add(outgoing,flows[e.id]);if(side.has(e.b))outgoing=sub(outgoing,flows[e.id]);}flows[edge.id]=scale(outgoing,-1);
 }
 const components=parts.map(part=>nodeIds.map((_,i)=>i).filter(i=>part.includes(at(i)))),componentOf={};components.forEach((part,k)=>part.forEach(i=>componentOf[nodeIds[i]]=k));
 const delta=(a,b)=>sub(v[index[a]],v[index[b]]),current=id=>flows[id]||C(),us=[delta('m.16','m.19'),delta('m.22','m.19')],is=[current('burden-ir'),current('burden-ib')],ctVoltage=[delta('coil:ctr.X1','coil:ctr.X2'),delta('coil:ctb.X1','coil:ctb.X2')];
 for(const [k,b]of ['ctr','ctb'].entries()){const expected=abs(I[k===0?0:2])/s.ct;if(expected>1e-8&&abs(current(b+':excitation'))>expected*.01||abs(ctVoltage[k])>s.ctLimit)warnings.push('CT '+(k===0?'R':'B')+': ผลขึ้นกับ excitation เชิงเส้น / วงจรอาจเปิดหรือ burden สูง ไม่ใช่การทำนาย CT อิ่มตัวหรือแรงดันจริง');}
 const residual=Array.from({length:n},()=>C());let power=C(),powerScale=0,currentScale=0;
 for(const e of edges)if(!e.ideal&&flows[e.id]){const i=flows[e.id];residual[e.ca]=add(residual[e.ca],i);residual[e.cb]=sub(residual[e.cb],i);const p=mul(sub(v[e.a],v[e.b]),conj(i));power=add(power,p);powerScale+=abs(p);currentScale=Math.max(currentScale,abs(i));}
 if(v.some(z=>!Number.isFinite(z.re)||!Number.isFinite(z.im))||Object.values(flows).some(z=>z&&(!Number.isFinite(z.re)||!Number.isFinite(z.im))))throw Error('ผลคำนวณไม่เป็นจำนวนจำกัด');
 const diagnostics={kcl:Math.max(0,...residual.map(abs)),kclRelative:Math.max(0,...residual.map(abs))/Math.max(1,currentScale),power,powerRelative:abs(power)/Math.max(1,powerScale)};
 if(diagnostics.kclRelative>1e-5||diagnostics.powerRelative>1e-5)throw Error('ความแม่นยำเชิงตัวเลขไม่เพียงพอสำหรับค่า impedance ชุดนี้');
 const unknowns=[...free.map(k=>({kind:'voltage',unit:'V',nodes:nodeIds.filter((_,i)=>at(i)===k)})),...voltageSources.map(e=>({kind:'source-current',unit:'A',branch:e.id}))];
 const mna={A,rhs,x,unknowns,referenceNodes:nodeIds.filter((_,i)=>refs.has(at(i))),nodeRows:Object.fromEntries(nodeIds.map((id,i)=>[id,row.get(at(i))??null])),voltageSourceRows:Object.fromEntries(voltageSources.map((e,k)=>[e.id,free.length+k]))};
 return {us,is,v,nodeIds,index,ctVoltage,edges,actual:{wire:edges.filter(e=>e.kind==='wire'),pole:[],cable:[],meter:[]},components,componentOf,warnings,flows,diagnostics,mna};
}
function secondary(s,I,V,f){
 if(f.graph)return graphSecondary(s,I,V,f);
 const t=f.topology||defaultTopology(s),edges=[],inj=Array.from({length:28},()=>C());
 const resistor=(id,a,b,r)=>{const e={id,a,b,y:C(1/Math.max(0.00001,r))};edges.push(e);return e;};
 const source=(a,b,i)=>{inj[a]=add(inj[a],i);inj[b]=sub(inj[b],i);};
 const excitation=div(C(1),C(s.ctExcR,s.ctExcX));
 for(let k=0;k<2;k++){const a=k*2,b=a+1;edges.push({id:'exc'+k,a,b,y:excitation});source(a,b,scale(I[k===0?0:2],(f[k===0?'revR':'revB']?-1:1)/s.ct));}
 const ptU=[sub(V[0],V[1]),sub(V[2],V[1])];
 for(let k=0;k<2;k++){const a=4+k*2,b=a+1;resistor('pt'+k,a,b,s.ptWinding);source(a,b,scale(ptU[k],(f[k===0?'revPTR':'revPTB']?-1:1)/(s.pt*s.ptWinding)));}
 const actual={pole:[],cable:[],meter:[]};
 for(const stage of ['pole','cable','meter'])t[stage].forEach((row,k)=>{const q={...row};
  if(stage==='meter'){if(f.vR&&k===3||f.vB&&k===4||f.vY&&k===5)q.status='open';if(f.swapV&&(k===3||k===4))q.dest=k===3?4:3;}
  const a=stage==='pole'?k:stage==='cable'?8+k:14+k,b=(stage==='pole'?8:stage==='cable'?14:20)+q.dest;
  const e={id:stage+k,a,b,status:q.status,r:q.r+(q.status==='loose'?s.looseR:0),wire:stage==='pole'?poleDefault[k]:k};
  if(q.status!=='open')Object.assign(e,resistor(e.id,a,b,e.r));actual[stage].push(e);
 });
 if(t.returnJumper)resistor('returnJumper',22,26,s.bondR);
 if(t.bond)resistor('bond',22,25,s.bondR);
 if(t.poleBond)resistor('poleBond',10,13,s.bondR);
 for(const [name,node]of [['PoleCT',10],['PolePT',13],['MeterCT',22],['MeterPT',25]])if(s['earth'+name])resistor('earth'+name,node,27,s.earthR);
 for(const [k,key]of [[0,'ctR'],[1,'ctB']])if(f[key]){const pos=f['bypass'+(k===0?'R':'B')]||'pole';const ends=pos==='source'?[k*2,k*2+1]:pos==='meter'?[20+k,k===0?22:26]:[8+k,10];resistor('bypass'+k,...ends,s.bondR);}
 t.extra.forEach((e,k)=>{if(e.enabled&&e.a!==e.b)resistor('extra'+k,e.a,e.b,e.r);});
 let v;const flow=e=>e.y?mul(sub(v[e.a],v[e.b]),e.y):C();
 const currentById=id=>{const e=edges.find(e=>e.id===id);return e?flow(e):C();};
 // Add meter burdens before the final solve (kept separate for diagnostics).
 resistor('iR',20,22,s.iBurdenR);resistor('iB',21,26,s.iBurdenB);resistor('vR',23,25,s.vBurdenR);resistor('vB',24,25,s.vBurdenB);
 const solved=nodal(28,edges,inj,{27:C()});v=solved.v;
 const us=[sub(v[23],v[25]),sub(v[24],v[25])],is=[currentById('iR'),currentById('iB')],ctVoltage=[sub(v[0],v[1]),sub(v[2],v[3])];
 const warnings=[];for(let k=0;k<2;k++){const excitationI=currentById('exc'+k),expected=abs(I[k===0?0:2])/s.ct;if(expected>1e-8&&abs(excitationI)>expected*0.01||abs(ctVoltage[k])>s.ctLimit)warnings.push('CT '+(k===0?'R':'B')+': ผลขึ้นกับ excitation เชิงเส้น / วงจรอาจเปิดหรือ burden สูง ไม่ใช่การทำนาย CT อิ่มตัวหรือแรงดันจริง');}
 return {us,is,v,ctVoltage,edges,actual,components:solved.components,warnings,flows:Object.fromEntries(edges.map(e=>[e.id,flow(e)])),topology:t};
}
function topologyFaults(f,s){const labels=[],names={lineR:'Primary R ขาด',lineY:'Primary Y ขาด',lineB:'Primary B ขาด',vR:'ขาว V R หลุดหน้ามิเตอร์',vY:'เทา common PT หลุดหน้ามิเตอร์',vB:'ส้ม V B หลุดหน้ามิเตอร์',ctR:'Bypass CT R',ctB:'Bypass CT B',revR:'CT R กลับขั้ว',revB:'CT B กลับขั้ว',revPTR:'PT R กลับขั้ว',revPTB:'PT B กลับขั้ว',swapV:'สลับ V R/B หน้ามิเตอร์'};for(const [k,v]of Object.entries(f))if(v===true)labels.push(names[k]||k);const t=f.topology;if(t){for(const stage of ['pole','cable','meter'])t[stage].forEach((r,k)=>{const standard=stage==='pole'?poleDefault[k]:stage==='cable'?k:meterDefault[k];if(r.status!=='normal'||r.dest!==standard)labels.push(({pole:'บนเสา',cable:'ระหว่างทาง',meter:'หน้ามิเตอร์'})[stage]+' '+(stage==='pole'?sourceNames[k]:wireNames[k])+': '+({normal:'ต่อ',open:'ขาด',loose:'หลวม'})[r.status]+(r.dest!==standard?' → '+(stage==='meter'?terminalNames[r.dest]:wireNames[r.dest]):''));});if(!t.bond)labels.push('bond หน้ามิเตอร์หลุด');if(t.poleBond)labels.push('bond เพิ่มบนเสา');if(!t.returnJumper)labels.push('jumper 17–23 หลุด');t.extra.forEach((e,k)=>{if(e.enabled)labels.push('สายเชื่อมเพิ่ม '+(k+1));});}if(f.graph)labels.push(...(f.graph.faults||[]));return labels;}
function simulate(input,f={}){
 const s={...defaultSettings(),...input},sig=s.sequence==='RYB'?1:-1,V=[polar(s.voltage,0),C(),polar(s.voltage,60*sig)],center=scale(sum(V),1/3),VN=V.map(v=>sub(v,center));
 const phi=Math.acos(s.pf)*180/Math.PI*(s.reactive==='lag'?-1:1);
 let nominal=s.currentMode==='manual'?[polar(s.ir,angle(VN[0])+s.angleR),C(),polar(s.ib,angle(VN[2])+s.angleB)]:VN.map(v=>polar(s.current,angle(v)+phi));
 nominal[1]=scale(add(nominal[0],nominal[2]),-1);
 // A specified current operating point does not uniquely define a load after a line opens.
 // Y: choose the initial star potential equal to source virtual neutral.
 // Delta: choose branch currents with zero circulating component.
 const pairs=s.connection==='Y'?[[0,3],[1,3],[2,3]]:[[0,1],[1,2],[2,0]],branchI=s.connection==='Y'?nominal:[scale(sub(nominal[0],nominal[1]),1/3),scale(sub(nominal[1],nominal[2]),1/3),scale(sub(nominal[2],nominal[0]),1/3)];
 const edges=pairs.map(([a,b],k)=>({a,b,y:div(branchI[k],s.connection==='Y'?VN[a]:sub(V[a],V[b]))}));
 const known={};ph.forEach((p,i)=>{if(!f['line'+p])known[i]=V[i];});
 const L=nodal(s.connection==='Y'?4:3,edges,[],known).v,I=[C(),C(),C()];let branchPower=[];
 for(const e of edges){const u=sub(L[e.a],L[e.b]),i=mul(u,e.y);I[e.a]=add(I[e.a],i);if(e.b<3)I[e.b]=sub(I[e.b],i);branchPower.push(mul(u,conj(i)));}
 ph.forEach((p,i)=>{if(f['line'+p]||abs(I[i])<1e-9)I[i]=C();});
 const truePower=sum(V.map((v,i)=>mul(v,conj(I[i])))),sec=secondary(s,I,V,f),U=sec.us.map(v=>scale(v,s.pt)),MI=sec.is.map(i=>scale(i,s.ct)),E=U.map((u,i)=>mul(u,conj(MI[i]))),mp=sum(E),sp=abs(truePower),ms=abs(mp);
 const balanced=nominal.every((i,k)=>abs(sub(i,polar(abs(nominal[0]),angle(nominal[0])+(k===1?-120*sig:k===2?120*sig:0))))<1e-7*Math.max(1,abs(nominal[0]))),faults=topologyFaults(f,s);
 const warnings=[...sec.warnings];if(edges.some(e=>e.y.re<-1e-9))warnings.push('ค่ากระแส/มุมนี้ให้โหลดเทียบเท่าบางแขนงจ่ายพลังงานกลับ ไม่ใช่โหลด passive ทุกแขนง');
 return {V,L,I,nominal,U,MI,E,truePower,branchPower,mp,sp,ms,pf:sp>1e-8?truePower.re/sp:null,mpf:ms>1e-8?mp.re/ms:null,sourceU:[sub(V[0],V[1]),sub(V[2],V[1]),sub(V[0],V[2])],loadU:[sub(L[0],L[1]),sub(L[2],L[1]),sub(L[0],L[2])],inferredIY:scale(add(MI[0],MI[1]),-1),secondary:sec,faults,warnings,balanced};
}
const api={simulate,secondary,graphSecondary,defaultSettings,defaultTopology,nodal,C,abs,angle,add,sub,mul,conj,polar,scale,div,sum,ph,wireNames,wireColors,poleDefault,meterDefault,terminalNames,sourceNames};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.VectorLab=api;
})(typeof window!=='undefined'?window:globalThis);
