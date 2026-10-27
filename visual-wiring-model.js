/* User wiring state. Geometry and color never determine electrical connections. */
(function(root){
const colors={red:{name:'แดง',hex:'#cc3840'},white:{name:'ขาว',hex:'#f5f4e5'},black:{name:'ดำ',hex:'#252a29'},gray:{name:'เทา',hex:'#929992'},green:{name:'เขียว',hex:'#26834f'},orange:{name:'ส้ม',hex:'#ee862b'}};
const blocks=[{id:'ptb',x:40,y:100,name:'PT · B–Y',left:'X1',right:'X2'},{id:'ptr',x:370,y:100,name:'PT · R–Y',left:'X2',right:'X1'},{id:'ctb',x:40,y:390,name:'CT · B',left:'X1',right:'X2'},{id:'ctr',x:370,y:390,name:'CT · R',left:'X2',right:'X1'}];
const order=['ctr','ptr','ctb','ptb','meter'];
const nodes={};
for(const b of blocks){for(const [pin,dx] of [[b.left,65],[b.right,175],['E',120]])nodes[`${b.id}.${pin}`]={id:`${b.id}.${pin}`,area:b.id,x:b.x+dx,y:b.y+(pin==='E'?166:126),label:`${b.name} / ${pin}`};}
for(const n of [15,16,17,19,21,22,23])nodes[`m.${n}`]={id:`m.${n}`,area:'meter',x:786+(n-15)*30,y:398,label:`มิเตอร์ / ${n}`};
nodes['cabinet.PE']={id:'cabinet.PE',area:'meter',x:1110,y:520,label:'ตู้มิเตอร์ / PE (กราวด์)'};
const clone=v=>JSON.parse(JSON.stringify(v));
const end=node=>({node,park:node,area:nodes[node].area,x:nodes[node].x,y:nodes[node].y});
function normal(){return [
 ['ir','CT R → มิเตอร์','red','ctr.X1','m.15'],['vr','PT R → มิเตอร์','white','ptr.X1','m.16'],
 ['ci','Common CT → มิเตอร์','black','ctb.X2','m.17'],['ci-link','Common CT ระหว่างบล็อก','black','ctr.X2','ctb.X2'],
 ['cv','Common PT → มิเตอร์','gray','ptb.X2','m.19'],['cv-link','Common PT ระหว่างบล็อก','gray','ptr.X2','ptb.X2'],
 ['ib','CT B → มิเตอร์','green','ctb.X1','m.21'],['vb','PT B → มิเตอร์','orange','ptb.X1','m.22'],
 ['jumper','Jumper 17–23','black','m.17','m.23'],['bond','Bond 17–19','black','m.17','m.19']
 ].map(([id,name,color,a,b])=>({id,name,color,originId:id,resistanceProfile:['ci-link','cv-link'].includes(id)?'common-link':['jumper','bond'].includes(id)?'link':'field',resistanceScale:1,a:end(a),b:end(b),states:{a:'normal',mid:'normal',b:'normal'}}));}
class WiringModel{
 constructor(){this.wires=normal();this.selected='ir';this.history=[];this.serial=0;}
 get(id=this.selected){return this.wires.find(w=>w.id===id);}
 save(){this.history.push(clone({wires:this.wires,selected:this.selected,serial:this.serial}));}
 undo(){if(!this.history.length)return false;Object.assign(this,this.history.pop());return true;}
 reset(){this.save();this.wires=normal();this.selected='ir';}
 setBends(id,bends,handles){const w=this.get(id);if(!w||!Array.isArray(bends)||!bends.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)))return false;if(JSON.stringify(w.bends)===JSON.stringify(bends))return false;this.save();w.bends=clone(bends);if(handles)w.bendHandles=[...handles];return true;}
 setCircuitBends(id,bends){const w=this.get(id);if(!w||bends!==null&&(!Array.isArray(bends)||!bends.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite))))return false;if(JSON.stringify(w.circuitBends??null)===JSON.stringify(bends))return false;this.save();if(bends===null)delete w.circuitBends;else w.circuitBends=clone(bends);return true;}
 move(id,side,node,position){const w=this.get(id);if(!w||!['a','b'].includes(side)||node&&!nodes[node])return false;this.save();
  w[side]=node?end(node):{...w[side],node:null,x:position.x,y:position.y,area:position.area||w[side].area,...(position.circuit?{circuit:clone(position.circuit)}:{})};w.states[side]=node?'normal':'off';this.selected=id;return true;}
 setState(id,point,state){const w=this.get(id);if(!w||!['a','mid','b'].includes(point)||!['normal','loose','off'].includes(state)||w.states[point]===state)return false;
  if(point!=='mid'&&state!=='off'&&!w[point].node&&!w[point].park)return false;
  this.save();w.states[point]=state;if(point!=='mid'){const e=w[point];if(state==='off'){if(e.node){const n=nodes[e.node];Object.assign(e,{park:e.node,node:null,x:n.x+(point==='a'?-18:18),y:n.y+38});}}else if(!e.node)w[point]=end(e.park);}return true;}
 remove(id=this.selected){if(!this.get(id))return false;this.save();this.wires=this.wires.filter(w=>w.id!==id);this.selected=null;return true;}
 add(color,area,shade){if(!colors[color]||!order.includes(area)||shade&&!/^#[0-9a-f]{6}$/i.test(shade))return false;this.save();const b=blocks.find(b=>b.id===area);const x=b?b.x+60:850,y=b?b.y+200:570;
  const id=`new-${++this.serial}`;this.wires.push({id,name:`สายเพิ่ม ${this.serial}`,color,shade:shade||colors[color].hex,originId:id,resistanceProfile:'added',resistanceScale:1,a:{node:null,park:null,area,x,y},b:{node:null,park:null,area,x:x+100,y},states:{a:'off',mid:'normal',b:'off'}});this.selected=id;return id;}
 split(id,area,position){const w=this.get(id);if(!w||w.states.mid!=='normal'||!this.areas(w).includes(area)||area==='meter')return false;this.save();
  const loose=dx=>({node:null,park:null,area,x:position.x+dx,y:position.y+20});const right=clone(w);right.id=`split-${++this.serial}`;right.name=`${w.name} · ช่วง B`;right.a=loose(14);right.states.a='off';
  // No confirmed SVG-to-metre scale: allocate half the original R to each new segment.
  // Reconnecting both cut ends to one screw restores the original series R; loose R is per contact.
  w.resistanceScale=right.resistanceScale=(w.resistanceScale??1)/2;
  // A split changes the route's endpoints; regenerate circuit geometry for both new branches.
  delete w.circuitBends;delete right.circuitBends;
  if(w.bends){const points=[[w.a.x,w.a.y],...w.bends,[w.b.x,w.b.y]];let best=Infinity,index=0;for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((position.x-a[0])*dx+(position.y-a[1])*dy)/(dx*dx+dy*dy||1))),d=Math.hypot(position.x-a[0]-t*dx,position.y-a[1]-t*dy);if(d<best){best=d;index=i;}}if(w.bendHandles){right.bendHandles=w.bendHandles.filter(i=>i>=index).map(i=>i-index);w.bendHandles=w.bendHandles.filter(i=>i<index);}right.bends=w.bends.slice(index);w.bends=w.bends.slice(0,index);}
  w.name+=' · ช่วง A';w.b=loose(-14);w.states.b='off';this.wires.splice(this.wires.indexOf(w)+1,0,right);this.selected=id;return right.id;}
 areas(w){return ['jumper','bond'].includes(w.id)?['meter']:[...order];}
}
const api={WiringModel,colors,blocks,nodes,order};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.VisualWiring=api;
})(globalThis);
