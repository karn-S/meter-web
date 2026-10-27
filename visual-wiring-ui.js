const {WiringModel,colors,blocks,nodes,order}=VisualWiring;
const model=new WiringModel();
const $=id=>document.getElementById(id),scene=$('scene');
let drag=null,connectSide=null,notice='',currentView='all';
let electricalGraph=null,electricalView='connected';
const circuit=$('electrical-diagram');let electricalDrawing=null,circuitDrag=null;
const colorKeys=Object.keys(colors),blockById=Object.fromEntries(blocks.map(b=>[b.id,b]));
const areaLabel=a=>blockById[a]?.name||'มิเตอร์';
const wireHex=w=>w.shade||colors[w.color].hex;
const wireColorLabel=w=>w.shade&&w.shade.toLowerCase()!==colors[w.color].hex.toLowerCase()?`${colors[w.color].name} · ${w.shade.toUpperCase()}`:colors[w.color].name;
const wireCurrent=(w,phase=false)=>VisualElectrical.currentText(electricalGraph?.solution?.result.secondary.flows['wire:'+w.id],phase);
const terminalX=Object.fromEntries(Array.from({length:11},(_,i)=>[i+15,786+i*30]));
const areaCenter=a=>a==='meter'?[700,620]:[blockById[a].x+120,blockById[a].y+65];
const conduitEdges=[[[490,455],[660,455],[660,165],[490,165]],[[490,165],[335,165],[335,350],[305,350],[305,455],[160,455]],[[160,455],[18,455],[18,165],[160,165]],[[160,165],[300,165],[300,300],[700,300],[700,620]]];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function rounded(points){
 if(points.length<2)return '';let d=`M${points[0]}`;
 for(let i=1;i<points.length-1;i++){const a=points[i-1],b=points[i],c=points[i+1],ab=Math.hypot(b[0]-a[0],b[1]-a[1]),bc=Math.hypot(c[0]-b[0],c[1]-b[1]);if(!ab||!bc)continue;const r=Math.min(9,ab/2,bc/2);d+=` L${b[0]+(a[0]-b[0])*r/ab},${b[1]+(a[1]-b[1])*r/ab} Q${b} ${b[0]+(c[0]-b[0])*r/bc},${b[1]+(c[1]-b[1])*r/bc}`;}
 return d+` L${points.at(-1)}`;
}
function position(e){return e.node?[nodes[e.node].x,nodes[e.node].y]:[e.x,e.y];}
function visibleEnd(w,side){return drag?.id===w.id&&drag.side===side&&drag.moved?{...w[side],node:null,x:drag.x,y:drag.y,area:drag.area}:w[side];}
function autoRoutePoints(w){
 const a=visibleEnd(w,'a'),b=visibleEnd(w,'b'),start=position(a),finish=position(b);let i=order.indexOf(a.area),j=order.indexOf(b.area);
 const offset=(colorKeys.indexOf(w.color)-2.5)*4.3;
 if(i===j){const depth=a.area==='meter'?w.id==='jumper'?650:w.id==='bond'?595:555:Math.max(start[1],finish[1])+46;return [start,[start[0]-12,depth],[finish[0]+12,depth],finish];}
 let middle=[];
 for(let k=i;k!==j;k+=i<j?1:-1){const edge=conduitEdges[i<j?k:k-1].map(([x,y])=>[x+offset,y+offset]);middle.push(...(i<j?edge:[...edge].reverse()));}
 // Keep the conduit exit at the meter: removing it draws a diagonal outside the pipe.
 middle=middle.slice(a.area==='meter'?0:1,b.area==='meter'?undefined:-1);
 if(a.area==='meter')middle.unshift([start[0],620+offset]);else middle.unshift([start[0],areaCenter(a.area)[1]+offset]);
 if(b.area==='meter')middle.push([finish[0],620+offset]);else middle.push([finish[0],areaCenter(b.area)[1]+offset]);
 return [start,...middle,finish].filter((p,k,all)=>k===0||p[0]!==all[k-1][0]||p[1]!==all[k-1][1]);
}
function routePoints(w){
 const bends=drag?.id===w.id&&drag.bends?drag.bends:w.bends;
 return bends?[position(visibleEnd(w,'a')),...bends,position(visibleEnd(w,'b'))]:autoRoutePoints(w);
}
function bendHandles(w){
 if(w.bendHandles)return w.bendHandles;
 const count=routePoints(w).length-2,indices=[];
 if(w.a.area==='meter')for(let i=0;i<Math.min(3,count);i++)indices.push(i);
 if(w.b.area==='meter')for(let i=Math.max(0,count-3);i<count;i++)indices.push(i);
 return [...new Set(indices)];
}
function distanceInfo(points){const lengths=points.slice(1).map((p,i)=>Math.hypot(p[0]-points[i][0],p[1]-points[i][1]));return {lengths,total:lengths.reduce((a,b)=>a+b,0)};}
function cutAt(points,distance){let left=[points[0]],walked=0;const {lengths}=distanceInfo(points);for(let i=0;i<lengths.length;i++){if(walked+lengths[i]>=distance){const t=lengths[i]?(distance-walked)/lengths[i]:0,p=[points[i][0]+(points[i+1][0]-points[i][0])*t,points[i][1]+(points[i+1][1]-points[i][1])*t];return {left:[...left,p],right:[p,...points.slice(i+1)],point:p};}walked+=lengths[i];left.push(points[i+1]);}return {left:points,right:[points.at(-1)],point:points.at(-1)};}
function wireMarkup(w){const points=routePoints(w),length=distanceInfo(points).total,half=length/2;let paths=[points];if(w.states.mid==='off')paths=[cutAt(points,Math.max(0,half-13)).left,cutAt(points,Math.min(length,half+13)).right];const mid=cutAt(points,half).point;
 const status=w.states.mid==='normal'?'':`<circle cx="${mid[0]}" cy="${mid[1]}" r="15" fill="${w.states.mid==='off'?'#e8ede5':'#f5c56b88'}" stroke="#b17636" stroke-dasharray="3 3"/><text x="${mid[0]+19}" y="${mid[1]-11}" style="fill:#865521;font-size:11px">${w.states.mid==='off'?'ขาดระหว่างทาง':'หลวมระหว่างทาง'}</text>`;
 const description=w.name+' · A: '+endpointLabel(w.a)+' → B: '+endpointLabel(w.b)+' · I '+wireCurrent(w,true)+' RMS';
 return `<g data-wire="${w.id}" role="button" tabindex="0" aria-label="${esc(description)}" aria-pressed="${model.selected===w.id}" class="wire-group ${model.selected===w.id?'selected':''}"><title>${esc(description)}</title>${paths.map(p=>`<path class="wire wire-shadow" d="${rounded(p)}"/><path class="wire wire-color" stroke="${wireHex(w)}" d="${rounded(p)}"/><path class="wire hit" d="${rounded(p)}"/>`).join('')}${status}</g>`;
}
function drawBackground(){
 const pipes=conduitEdges.map(p=>`<path d="${rounded(p)}" fill="none" stroke="#25372e" stroke-width="43" stroke-linejoin="round"/><path d="${rounded(p)}" fill="none" stroke="#52634e" stroke-width="33" stroke-linejoin="round"/>`).join('');
 $('conduits').innerHTML=pipes+`<text x="490" y="286" class="small">ท่อเปิดให้เห็นสายที่ผู้ใช้เพิ่มและสายที่ต่ออยู่</text>`;
 $('blocks').innerHTML=blocks.map(b=>`<g><rect x="${b.x}" y="${b.y}" width="240" height="190" rx="9" fill="url(#box)" stroke="#8f9d87" filter="url(#shadow)"/><rect x="${b.x+7}" y="${b.y+7}" width="226" height="176" rx="5" fill="#ecede0" stroke="#b7c2ad"/><text x="${b.x+120}" y="${b.y+30}" text-anchor="middle" style="font-size:17px;font-weight:600">${b.name}</text><rect x="${b.x}" y="${b.y+43}" width="240" height="43" fill="#52634e"/><text x="${b.x+120}" y="${b.y+101}" text-anchor="middle" class="small">สายผ่านท่อ · ไม่เชื่อมกันที่จุดตัด</text><rect x="${b.x+37}" y="${b.y+110}" width="166" height="33" rx="4" fill="#5a6652"/><text x="${b.x+65}" y="${b.y+155}" text-anchor="middle">${b.left}</text><text x="${b.x+175}" y="${b.y+155}" text-anchor="middle">${b.right}</text><text x="${b.x+140}" y="${b.y+171}" class="small">E</text></g>`).join('');
 const labelColors={15:'#cc3840',16:'#f5f4e5',17:'#252a29',19:'#929992',21:'#26834f',22:'#ee862b',23:'#252a29'};
 $('terminals').innerHTML=Object.entries(terminalX).map(([n,x])=>`<g><rect x="${x-12}" y="321" width="24" height="48" rx="2" fill="#121d16" stroke="#515c4e"/>${nodes['m.'+n]?`<use href="#bolt" x="${x}" y="341"/>`:''}<rect x="${x-13}" y="371" width="26" height="16" fill="${labelColors[n]||'#d8dfd1'}"/><text x="${x}" y="383" text-anchor="middle" style="font-size:11px;fill:${[15,17,21,23].includes(+n)?'#fff':'#293b2d'}">${nodes['m.'+n]?n:'—'}</text></g>`).join('');
}
function drawScene(){
 const sorted=[...model.wires].sort((a,b)=>(a.id===model.selected)-(b.id===model.selected));$('wires').innerHTML=sorted.map(wireMarkup).join('');
 $('sockets').innerHTML=Object.values(nodes).map(n=>{const count=model.wires.reduce((sum,w)=>sum+(w.a.node===n.id)+(w.b.node===n.id),0),hover=drag?.target===n.id;return `<g class="socket" data-node="${n.id}" role="button" tabindex="0" aria-label="${n.label} (${count} ปลายสาย)"><title>${n.label} · ${count} ปลายสาย</title><circle class="socket-ring" cx="${n.x}" cy="${n.y}" r="${hover?15:11}" fill="${hover?'#f4ce78':'url(#metal)'}" stroke="${hover?'#c48b27':'#7a8972'}" stroke-width="${hover?4:1.5}"/><path d="M${n.x-5} ${n.y}h10M${n.x} ${n.y-5}v10" stroke="#61705d" stroke-width="2"/><circle cx="${n.x}" cy="${n.y}" r="14" fill="transparent"/>${count>1?`<text x="${n.x+(n.area==='meter'?0:13)}" y="${n.y-(n.area==='meter'?35:12)}" text-anchor="${n.area==='meter'?'middle':'start'}" class="socket-count" style="font-size:10px;fill:${n.area==='meter'?'#e8eee0':'#33463f'}">×${count}</text>`:''}</g>`;}).join('');
 const selected=model.get();let handles='';
 for(const w of model.wires)for(const side of ['a','b']){const e=visibleEnd(w,side),p=position(e);if(w.states[side]==='loose')handles+=`<circle cx="${p[0]}" cy="${p[1]}" r="15" fill="#f7c36766" stroke="#b98028"/>`;
  if(!e.node&&w!==selected)handles+=`<circle cx="${p[0]}" cy="${p[1]}" r="5" fill="${wireHex(w)}" stroke="#a87b3e"/>`;
 }
 if(selected)for(const side of ['a','b']){const e=visibleEnd(selected,side),p=position(e),dx=e.node?(side==='a'?-17:17):0,dy=e.node?29:0,x=p[0]+dx,y=p[1]+dy;handles+=`<g class="drag-handle" data-handle="${side}" role="button" tabindex="0" aria-label="ลากปลาย ${side.toUpperCase()} ของ ${esc(selected.name)}"><path d="M${p}L${x},${y}" stroke="#bd913b" stroke-width="1.5"/><circle cx="${x}" cy="${y}" r="13" fill="#fff5d8" stroke="#b98b32" stroke-width="2"/><text x="${x}" y="${y+4}" text-anchor="middle" style="font-size:12px;font-weight:700">${side.toUpperCase()}</text></g>`;}
 if(selected){const points=routePoints(selected);points.slice(1,-1).forEach((p,i)=>{if(!(drag?.id===selected.id&&drag.handles?drag.handles:bendHandles(selected)).includes(i))return;handles+=`<rect class="bend-handle" data-bend="${i}" x="${p[0]-6}" y="${p[1]-6}" width="12" height="12" rx="2" fill="#fff" stroke="#33463f" stroke-width="2"><title>ลากเพื่อจัดแนว / ปรับความยาวสาย</title></rect>`;});}
 $('endpoints').innerHTML=handles;
 $('wire-current-badge').innerHTML=selected?`<rect x="750" y="690" width="395" height="49" rx="7" fill="#f8faf5" stroke="#a7b8a4"/><text x="764" y="709" class="small">${esc(selected.id)} · กระแสสายที่เลือก (A→B)</text><text x="764" y="728" style="fill:#176357;font-size:14px;font-weight:600">I ${esc(wireCurrent(selected,true))} RMS</text>`:'';
}
function endpointLabel(e){return e.node?nodes[e.node].label:`ปลายลอย · ${areaLabel(e.area)}`;}
function render(){const w=model.get();$('wire-picker').innerHTML='<option value="">— เลือกสายบนภาพ —</option>'+model.wires.map(w=>`<option value="${w.id}">${esc(w.name)} · ${wireColorLabel(w)}</option>`).join('');$('wire-picker').value=model.selected||'';
 $('wire-name').textContent=w?w.name:'ยังไม่ได้เลือกสาย';$('wire-description').textContent=w?`สี${wireColorLabel(w)} · ${w.a.node&&w.b.node?'ต่อทั้งสองปลาย':'มีปลายสายลอย'}`:'เลือกสายจากภาพหรือรายการ';$('swatch').style.background=w?wireHex(w):'transparent';$('route').textContent=w?`A: ${endpointLabel(w.a)} → B: ${endpointLabel(w.b)}`:'—';
 $('point').options[0].textContent=w?`ปลาย A · ${endpointLabel(w.a)}`:'ปลาย A';$('point').options[2].textContent=w?`ปลาย B · ${endpointLabel(w.b)}`:'ปลาย B';
 $('related').textContent=w&&w.states.mid!=='normal'?'หากจะแยกสายเพิ่ม ให้คืนสถานะระหว่างทางเป็นต่อแน่นก่อน':'ลากวงกลมที่ปลายสาย หรือเลือกย้ายปลายแล้วคลิกขั้ว';
 document.querySelectorAll('[data-state]').forEach(b=>{const side=$('point').value;b.disabled=!w||(side!=='mid'&&b.dataset.state!=='off'&&!w[side].node&&!w[side].park);const active=!!w&&w.states[side]===b.dataset.state;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);});
 $('delete-wire').disabled=!w;$('connect-a').disabled=!w;$('connect-b').disabled=!w;for(const side of ['a','b'])$('connect-'+side).setAttribute('aria-pressed',connectSide===side);
 const previous=$('split-area').value,areas=w?model.areas(w).filter(a=>a!=='meter'):[];$('split-area').innerHTML=areas.map(a=>`<option value="${a}">${areaLabel(a)}</option>`).join('');if(areas.includes(previous))$('split-area').value=previous;$('split-wire').disabled=!w||!areas.length||w.states.mid!=='normal';
 $('undo').disabled=!model.history.length;$('status').textContent=notice||(connectSide?`คลิกขั้วที่ต้องการต่อปลาย ${connectSide.toUpperCase()} · Esc ยกเลิก`:w?`${w.name} · ลากวงกลม A / B ไปขั้วใดก็ได้ หรือกด Delete ลบ`:`${model.wires.length} เส้น · เลือกสายเพื่อทดลอง`);
 $('tools-selected').textContent=w?`${w.name} · A: ${endpointLabel(w.a)} → B: ${endpointLabel(w.b)}`:'เลือกสายจากภาพหรือวงจร';
 renderElectrical();
}
function renderElectrical(){
 try{
  const {s,f}=VisualResults.read(document);
  electricalGraph=VisualElectrical.fromWires(model.wires,s,f);
  const result=VectorLab.simulate(s,{...f,graph:electricalGraph}),normal=VectorLab.simulate(s,{graph:VisualElectrical.fromWires(new WiringModel().wires,s)});
  electricalGraph.solution={settings:s,presets:f,result,normal};
  VisualResults.render(document,electricalGraph,result,normal);
  VisualMatrix.render(document,electricalGraph);
  drawElectrical();const wires=electricalGraph.branches.filter(e=>e.kind==='wire');
  $('electrical-status').textContent=`${wires.length} branch สาย · ${electricalGraph.nodes.filter(n=>n.kind==='floating').length} ปลายลอย · ${wires.filter(e=>!e.conducting).length} เส้นขาดระหว่างทาง · ${wires.filter(e=>Object.values(e.states).includes('loose')).length} เส้นหลวม`;
  $('electrical-svg').disabled=$('electrical-json').disabled=false;
 }catch(err){electricalGraph=null;electricalDrawing=null;$('electrical-diagram').innerHTML='';$('electrical-status').textContent='คำนวณวงจรไม่ได้: '+err.message;VisualResults.clear(document,'คำนวณวงจรไม่ได้: '+err.message);VisualMatrix.clear(document,err.message);$('electrical-svg').disabled=$('electrical-json').disabled=true;}
 renderWireCurrents();drawScene();renderCircuitTools();
}
function renderWireCurrents(){
 $('wire-currents').innerHTML=electricalGraph?model.wires.map(w=>`<button class="wire-current-card" data-current-wire="${esc(w.id)}" aria-pressed="${w.id===model.selected}" title="${esc(w.name+' · A: '+endpointLabel(w.a)+' → B: '+endpointLabel(w.b)+' · I '+wireCurrent(w,true)+' RMS')}"><span class="wire-current-name"><i style="background:${wireHex(w)}"></i><span>${esc(w.id+' · '+w.name)}</span></span><span class="wire-current-value">${esc(wireCurrent(w))}</span><small>${esc(wireCurrent(w,true).includes(' ∠ ')?'∠ '+wireCurrent(w,true).split(' ∠ ')[1]+' · A→B':'มุมเฟสระบุไม่ได้')}</small></button>`).join('')||'<p>ไม่มีสายภายนอก</p>':'<p class="wire-current-empty">คำนวณกระแสไม่ได้ · ตรวจค่าพารามิเตอร์ด้านล่าง</p>';
 const w=model.get();$('wire-current').textContent=w?'I '+wireCurrent(w,true)+' RMS · A→B':'';
}
function drawElectrical(graph=electricalGraph){const d=VisualElectrical.schematic(graph,model.selected,electricalView,true);electricalDrawing=d;circuit.setAttribute('viewBox',`0 0 ${d.width} ${d.height}`);circuit.innerHTML=d.markup;}
function renderCircuitTools(){const w=model.get(),point=$('circuit-point').value||'a';$('circuit-selected').textContent=w?`${w.name} · A: ${endpointLabel(w.a)} → B: ${endpointLabel(w.b)} · I ${wireCurrent(w,true)} RMS`:'เลือกสายจากวงจรหรือภาพ';
 for(const side of ['a','b']){$('circuit-connect-'+side).disabled=!w||!electricalGraph||electricalView!=='connected';$('circuit-connect-'+side).setAttribute('aria-pressed',connectSide===side);}
 for(const state of ['normal','loose','off']){const b=$('circuit-state-'+state);b.disabled=!w||point!=='mid'&&state!=='off'&&!w[point].node&&!w[point].park;b.setAttribute('aria-pressed',!!w&&w.states[point]===state);}
 $('circuit-split').disabled=$('split-wire').disabled;$('circuit-delete').disabled=!w;$('circuit-auto-route').disabled=!w?.circuitBends;$('circuit-undo').disabled=!model.history.length;
 $('circuit-edit-status').textContent=notice||(connectSide?`คลิกขั้วในวงจรหรือภาพเพื่อต่อปลาย ${connectSide.toUpperCase()} · Esc ยกเลิก`:electricalView==='details'?'เลือกสายและแก้สถานะได้ · ใช้มุมมองเชื่อมโหนดเพื่อลากปลาย/จัดแนว':'ลาก A/B เปลี่ยนจุดต่อ · ลากสี่เหลี่ยมจัดแนว · Ctrl+Z ย้อนกลับ');
}
function select(id){model.selected=id;connectSide=null;notice='';render();}
$('wire-currents').onclick=e=>{const item=e.target.closest('[data-current-wire]');if(item){select(item.dataset.currentWire);$('wire-currents').querySelector?.('[data-current-wire="'+item.dataset.currentWire+'"]').focus({preventScroll:true});}};
function toSvg(e){const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(scene.getScreenCTM().inverse());return {x:p.x,y:p.y};}
function nearest(p){const scale=scene.getScreenCTM().a,radius=Math.max(16,20/scale);return Object.values(nodes).map(n=>({n,d:Math.hypot(n.x-p.x,n.y-p.y)})).sort((a,b)=>a.d-b.d).find(v=>v.d<=radius)?.n;}
function nearestArea(p){if(p.x>720)return 'meter';return blocks.map(b=>({id:b.id,d:Math.hypot(p.x-b.x-120,p.y-b.y-95)})).sort((a,b)=>a.d-b.d)[0].id;}
scene.setAttribute('tabindex','0');
scene.addEventListener('pointerdown',e=>{const bend=e.target.closest('[data-bend]');if(bend&&model.get()&&e.button===0){e.preventDefault();const p=toSvg(e);drag={id:model.selected,bend:Number(bend.dataset.bend),handles:bendHandles(model.get()),bends:routePoints(model.get()).slice(1,-1).map(p=>[...p]),pointer:e.pointerId,start:p,moved:false};connectSide=null;scene.setPointerCapture(e.pointerId);scene.classList.add('dragging');return;}const h=e.target.closest('[data-handle]');if(!h||!model.get()||e.button!==0)return;e.preventDefault();const p=toSvg(e);drag={id:model.selected,side:h.dataset.handle,pointer:e.pointerId,start:p,x:p.x,y:p.y,area:model.get()[h.dataset.handle].area,moved:false};connectSide=null;scene.setPointerCapture(e.pointerId);scene.classList.add('dragging');});
scene.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.pointer)return;const p=toSvg(e);if(Math.hypot(p.x-drag.start.x,p.y-drag.start.y)>3)drag.moved=true;if(drag.bends){drag.bends[drag.bend]=[p.x,p.y];drawScene();return;}const target=nearest(p);Object.assign(drag,{...p,area:target?.area||nearestArea(p),target:target?.id||null});drawScene();});
function cancelDrag(){if(drag&&scene.hasPointerCapture(drag.pointer))scene.releasePointerCapture(drag.pointer);if(circuitDrag&&circuit.hasPointerCapture(circuitDrag.pointer))circuit.releasePointerCapture(circuitDrag.pointer);drag=null;circuitDrag=null;scene.classList.remove('dragging');circuit.classList.remove('dragging');render();}
scene.addEventListener('pointerup',e=>{if(!drag||e.pointerId!==drag.pointer)return;const d=drag,p=toSvg(e),target=nearest(p);drag=null;scene.classList.remove('dragging');if(scene.hasPointerCapture(e.pointerId))scene.releasePointerCapture(e.pointerId);
 if(d.bends){if(d.moved){d.bends[d.bend]=[p.x,p.y];model.setBends(d.id,d.bends,d.handles);notice='จัดเส้นทางแล้ว · Ctrl+Z ย้อนกลับ';}render();scene.focus({preventScroll:true});return;}
 if(d.moved){model.move(d.id,d.side,target?.id||null,{...p,area:target?.area||nearestArea(p)});notice=target?`ต่อปลาย ${d.side.toUpperCase()} → ${target.label}`:'วางปลายสายลอย · ลากกลับไปขั้วเพื่อเชื่อมต่อ';}else{connectSide=d.side;notice='';}render();scene.focus({preventScroll:true});});
scene.addEventListener('pointercancel',cancelDrag);
scene.addEventListener('click',e=>{const h=e.target.closest('[data-handle],[data-bend]');if(h)return;const n=e.target.closest('[data-node]');if(n){if(connectSide&&model.get()){model.move(model.selected,connectSide,n.dataset.node);notice=`ต่อปลาย ${connectSide.toUpperCase()} → ${nodes[n.dataset.node].label}`;connectSide=null;render();}else{notice=`${nodes[n.dataset.node].label} · เลือกสายแล้วลากปลาย หรือใช้ปุ่มย้ายปลาย A / B`;render();}return;}const w=e.target.closest('[data-wire]');if(w)select(w.dataset.wire);});
scene.addEventListener('keydown',e=>{if(e.key!=='Enter'&&e.key!==' ')return;const w=e.target.closest('[data-wire]'),h=e.target.closest('[data-handle]'),n=e.target.closest('[data-node]');if(!w&&!h&&!n)return;e.preventDefault();if(w){select(w.dataset.wire);scene.focus({preventScroll:true});}else if(h){connectSide=h.dataset.handle;notice='';render();scene.focus({preventScroll:true});}else if(n&&connectSide){model.move(model.selected,connectSide,n.dataset.node);connectSide=null;render();scene.focus({preventScroll:true});}});
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&!e.altKey&&e.key.toLowerCase()==='z'&&!e.repeat&&!$('reference').open&&!e.target.closest('input,select,textarea,[contenteditable]:not([contenteditable="false"])')){e.preventDefault();undo();return;}if(e.key==='Escape'){if(drag||circuitDrag)cancelDrag();connectSide=null;notice='';render();return;}if(e.key==='Delete'&&!e.repeat&&!$('reference').open&&!e.target.closest('input,select,textarea,[contenteditable="true"]')){e.preventDefault();removeSelected();}});
function removeSelected(){if(drag||circuitDrag)cancelDrag();if(model.remove()){connectSide=null;notice='ลบสายแล้ว · กดย้อนกลับเพื่อคืนสายพร้อมจุดต่อเดิม';render();}}
$('delete-wire').onclick=removeSelected;$('wire-picker').onchange=()=>select($('wire-picker').value||null);$('point').onchange=()=>{$('circuit-point').value=$('point').value;notice='';render();};
document.querySelectorAll('[data-state]').forEach(b=>b.onclick=()=>{if(model.get()){model.setState(model.selected,$('point').value,b.dataset.state);notice='';render();}});
for(const side of ['a','b'])$('connect-'+side).onclick=()=>{connectSide=connectSide===side?null:side;notice='';render();};
function undo(){if(drag||circuitDrag){cancelDrag();return;}const changed=model.undo();connectSide=null;notice=changed?'ย้อนกลับแล้ว':'ไม่มีรายการให้ย้อนกลับ';render();}
$('undo').onclick=undo;$('reset').onclick=()=>{if(drag||circuitDrag)cancelDrag();model.reset();connectSide=null;notice='คืนการต่อปกติแล้ว';render();};
$('new-color').innerHTML=colorKeys.map(k=>`<option value="${k}">สี${colors[k].name}</option>`).join('');$('new-shade').value=colors[$('new-color').value].hex;$('new-color').onchange=()=>$('new-shade').value=colors[$('new-color').value].hex;$('new-area').innerHTML=[...blocks.map(b=>b.id),'meter'].map(a=>`<option value="${a}">${areaLabel(a)}</option>`).join('');
$('add-wire').onclick=()=>{model.add($('new-color').value,$('new-area').value,$('new-shade').value);connectSide=null;notice=`เพิ่มสายเฉด ${$('new-shade').value.toUpperCase()} · ลาก A และ B ไปยังขั้วที่ต้องการ`;render();};
$('split-wire').onclick=()=>{const w=model.get(),area=$('split-area').value;if(!w||!area)return;const p=areaCenter(area);model.split(w.id,area,{x:p[0],y:p[1]+(colorKeys.indexOf(w.color)-2.5)*4.3});notice='แยกเป็น 2 เส้นแล้ว · แต่ละเส้นเลือกและลากปลายได้อิสระ';connectSide=null;render();};
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{currentView=b.dataset.view;const views={all:'0 0 1180 760',block:'0 75 685 565',meter:'665 95 495 640'};scene.setAttribute('viewBox',views[currentView]);scene.style.width=currentView==='all'?'100%':currentView==='block'?'min(100%, 1100px)':'min(100%, 740px)';scene.style.minWidth=currentView==='meter'?'495px':'740px';scene.style.margin='auto';document.querySelectorAll('[data-view]').forEach(t=>{t.classList.toggle('active',t===b);t.setAttribute('aria-pressed',t===b);});});
function reference(src,title){$('reference-image').src=src;$('reference-image').alt=title;$('reference-title').textContent=title;$('reference').showModal();}
document.querySelectorAll('[data-image]').forEach(b=>b.onclick=()=>reference(b.dataset.image,b.dataset.title));$('show-real').onclick=()=>reference('Meter_circuit_real.jpg','รูปอ้างอิง · ขั้วต่อมิเตอร์จริง');$('close-dialog').onclick=()=>$('reference').close();$('reference').onclick=e=>{if(e.target===$('reference'))$('reference').close();};
function workspaceTab(tab){if(drag||circuitDrag)cancelDrag();connectSide=null;VisualMatrix.showTab(document,tab);renderCircuitTools();}
for(const tab of ['wiring','matrix']){const button=$('tab-'+tab);button.onclick=()=>workspaceTab(tab);button.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?'wiring':e.key==='End'?'matrix':tab==='matrix'?'wiring':'matrix';workspaceTab(next);$('tab-'+next).focus();});}
$('show-electrical').onclick=()=>{workspaceTab('wiring');$('electrical-panel').scrollIntoView({behavior:'smooth',block:'start'});};
$('show-results').onclick=()=>{workspaceTab('wiring');$('calculation-panel').scrollIntoView({behavior:'smooth',block:'start'});};
for(const view of ['connected','details'])$('electrical-'+view).onclick=()=>{electricalView=view;for(const k of ['connected','details'])$('electrical-'+k).setAttribute('aria-pressed',k===view);renderElectrical();};
function selectElectrical(e){if(e.target.closest('[data-circuit-bend]'))return;const handle=e.target.closest('[data-circuit-handle]');if(handle){connectSide=handle.dataset.circuitHandle;notice='';render();return;}const port=e.target.closest('[data-electrical-node]');if(port){const id=port.dataset.electricalNode;if(connectSide&&model.get()){model.move(model.selected,connectSide,id);notice=`ต่อปลาย ${connectSide.toUpperCase()} → ${nodes[id].label}`;connectSide=null;render();}return;}const wire=e.target.closest('[data-electrical-wire]');if(wire)select(wire.dataset.electricalWire);}
$('electrical-diagram').addEventListener('click',selectElectrical);
$('electrical-diagram').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.closest('[data-electrical-wire],[data-circuit-handle],[data-electrical-node]')){e.preventDefault();selectElectrical(e);circuit.focus({preventScroll:true});}});
for(const side of ['a','b'])$('circuit-connect-'+side).onclick=()=>$('connect-'+side).onclick();
$('circuit-point').value='a';$('circuit-point').onchange=()=>{$('point').value=$('circuit-point').value;notice='';render();};
for(const state of ['normal','loose','off'])$('circuit-state-'+state).onclick=()=>{if(model.get()){model.setState(model.selected,$('circuit-point').value,state);connectSide=null;notice='';render();}};
$('circuit-split').onclick=()=>$('split-wire').onclick();$('circuit-delete').onclick=removeSelected;$('circuit-undo').onclick=undo;$('circuit-auto-route').onclick=()=>{if(model.setCircuitBends(model.selected,null)){notice='คืนแนววงจรแล้ว';render();}};
circuit.setAttribute('tabindex','0');
function toCircuit(e){const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(circuit.getScreenCTM().inverse());return {x:Math.max(24,Math.min(1296,p.x)),y:Math.max(120,Math.min((electricalDrawing?.wiringHeight||970)-26,p.y))};}
function nearestCircuit(p){const radius=Math.max(16,20/Math.abs(circuit.getScreenCTM().a));return Object.entries(electricalDrawing.positions).filter(([id])=>nodes[id]).map(([id,[x,y]])=>({id,d:Math.hypot(x-p.x,y-p.y)})).sort((a,b)=>a.d-b.d).find(n=>n.d<=radius);}
circuit.addEventListener('pointerdown',e=>{if(e.button!==0||drag||!model.get()||!electricalDrawing||electricalView!=='connected')return;const bend=e.target.closest('[data-circuit-bend]'),handle=e.target.closest('[data-circuit-handle]');if(!bend&&!handle)return;e.preventDefault();const p=toCircuit(e);circuitDrag={id:model.selected,pointer:e.pointerId,start:p,moved:false,...(bend?{bend:Number(bend.dataset.circuitBend),bends:electricalDrawing.routes[model.selected].points.slice(1,-1).map(p=>[...p])}:{side:handle.dataset.circuitHandle})};connectSide=null;circuit.setPointerCapture(e.pointerId);circuit.classList.add('dragging');});
circuit.addEventListener('pointermove',e=>{const d=circuitDrag;if(!d||e.pointerId!==d.pointer)return;const p=toCircuit(e);if(Math.hypot(p.x-d.start.x,p.y-d.start.y)>3)d.moved=true;if(d.bends){d.bends[d.bend]=[p.x,p.y];drawElectrical({...electricalGraph,branches:electricalGraph.branches.map(w=>w.wireId===d.id?{...w,drawing:{...w.drawing,bends:d.bends}}:w)});}else{const w=electricalGraph.branches.find(w=>w.wireId===d.id),a=electricalDrawing.positions[w[d.side]],target=nearestCircuit(p);$('electrical-edit-preview').innerHTML=`<path d="M${a}L${p.x} ${p.y}" fill="none" stroke="#b98b32" stroke-width="3" stroke-dasharray="6 4"/><circle cx="${p.x}" cy="${p.y}" r="13" fill="#fff5d8" stroke="${target?'#26834f':'#b98b32'}" stroke-width="3"/>`;}});
circuit.addEventListener('pointerup',e=>{const d=circuitDrag;if(!d||e.pointerId!==d.pointer)return;const p=toCircuit(e),target=nearestCircuit(p);circuitDrag=null;circuit.classList.remove('dragging');if(circuit.hasPointerCapture(e.pointerId))circuit.releasePointerCapture(e.pointerId);
 if(d.moved){if(d.bends){d.bends[d.bend]=[p.x,p.y];model.setCircuitBends(d.id,d.bends);notice='จัดแนววงจรแล้ว · จุดต่อและ R คงเดิม';}else{const w=model.get(d.id),old=nodes[w[d.side].node]||w[d.side];model.move(d.id,d.side,target?.id||null,{x:Math.min(1150,old.x+24),y:Math.min(690,old.y+35),area:old.area,circuit:[p.x,p.y]});notice=target?`ต่อจากวงจร → ${nodes[target.id].label}`:'ถอดปลายสายจากวงจรแล้ว · ภาพและเวกเตอร์อัปเดตตาม';}}else if(d.side){connectSide=d.side;notice='';}render();circuit.focus({preventScroll:true});});
circuit.addEventListener('pointercancel',cancelDrag);
function downloadElectrical(format){
 if(!electricalGraph)return;
 const data=format==='svg'?VisualResults.report(electricalGraph,model.selected,electricalView):JSON.stringify(electricalGraph,null,2),blob=new Blob([data],{type:format==='svg'?'image/svg+xml;charset=utf-8':'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='3P3W_electrical.'+format;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('electrical-svg').onclick=()=>downloadElectrical('svg');$('electrical-json').onclick=()=>downloadElectrical('json');
VisualResults.setup(document,renderElectrical);
drawBackground();render();
