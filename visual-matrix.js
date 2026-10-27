/* Show the actual secondary MNA system; never reconstruct a second solver. */
(function(root){
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=n=>n===0?'0':Number(n.toPrecision(6)).toString();
const complex=z=>z.im===0?num(z.re):z.re===0?num(z.im)+'j':num(z.re)+(z.im<0?' − ':' + ')+num(Math.abs(z.im))+'j';
const nonzero=z=>z.re!==0||z.im!==0;
const name=u=>u.kind==='voltage'?'V('+u.nodes.join(' = ')+')':'I('+u.branch+' A→B)';
const cell=(z,cls='')=>`<td class="${cls} ${nonzero(z)?'':'zero'}" title="${esc(z.re+' + j('+z.im+')')}">${esc(complex(z))}</td>`;
function equation(m,k){
 const terms=m.A[k].flatMap((z,i)=>nonzero(z)?['('+complex(z)+') · x'+(i+1)]:[]);
 return terms.join(' + ')+' = '+complex(m.rhs[k])+' '+(m.unknowns[k].kind==='voltage'?'A':'V');
}
function markup(graph){
 const r=graph.solution.result,m=r.secondary.mna,s=graph.solution.settings,n=m.x.length;
 const variables=m.unknowns.map((u,i)=>`<tr><th scope="row">x${i+1}</th><td>${esc(name(u))}</td>${cell(m.x[i],'solution')}<td>${u.unit}</td></tr>`).join('');
 const matrix=m.A.map((row,k)=>`<tr><th scope="row">${k+1} · ${m.unknowns[k].kind==='voltage'?'KCL':'PT'}</th>${row.map(z=>cell(z)).join('')}${cell(m.rhs[k],'rhs')}${cell(m.x[k],'solution')}</tr>`).join('');
 const nodes=m.referenceNodes.join(', ');
 const solvedEdges=new Map(r.secondary.edges.map(e=>[e.id,e]));
 const stamps=graph.branches.map(e=>{
  const solved=solvedEdges.get(e.id);
  const a=m.nodeRows[e.a],b=m.nodeRows[e.b],label=k=>k===null?'reference':'x'+(k+1);let contribution;
  if(e.kind==='current-source')contribution='Isrc='+complex(solved.source)+' A; b[a] += Isrc; b[b] −= Isrc (X2 → X1)';
  else if(e.kind==='voltage-source')contribution='constraint แถว '+(m.voltageSourceRows[e.id]+1)+': Va − Vb = '+complex(solved.source)+' V';
  else if(!e.conducting)contribution='เปิดวงจร · ไม่ stamp admittance';
  else if(e.resistance===0&&(e.reactance??0)===0)contribution='รวมโหนด Va = Vb ก่อนสร้างเมทริกซ์';
  else contribution='Y='+complex(solved.y)+' S · Gaa/Gbb += Y; Gab/Gba −= Y';
  return `<tr><th scope="row">${esc(e.id)}</th><td>${esc(e.a+' → '+e.b)}</td><td>${esc(label(a)+' / '+label(b))}</td><td>${esc(contribution)}</td></tr>`;
 }).join('');
 return `<div class="matrix-body">${r.warnings.length?'<ul class="calculation-warnings">'+r.warnings.map(w=>'<li>'+esc(w)+'</li>').join('')+'</ul>':''}<div class="matrix-formula">[ G   B ] [ v   ]   [ Iinject ]
[ Bᵀ  0 ] [ Ipt ] = [ Ept     ]</div><p>${n} unknowns · kCT=${esc(num(s.ct))} · kPT=${esc(num(s.pt))} · ตารางเป็น A และ b ก่อน elimination; x เป็นคำตอบจาก solveLinear() ชุดเดียวกับมิเตอร์</p><p>Reference 0 V: ${esc(nodes)} · กลุ่มลอยใช้ reference แยก ไม่ได้ต่อ earth เพิ่ม</p><h3>1. ตัวแปร x และคำตอบ secondary</h3><div class="matrix-scroll"><table class="matrix-table"><thead><tr><th>ตัวแปร</th><th>โหนด / แหล่งจ่าย</th><th>คำตอบ complex RMS</th><th>หน่วย</th></tr></thead><tbody>${variables}</tbody></table></div><h3>2. เมทริกซ์ตัวเลข A · x = b</h3><p>G มีหน่วย S; B เป็นสัมประสิทธิ์ ±1 · b แถว KCL เป็น A / แถว PT เป็น V · แสดง 6 significant digits; ชี้ค่าเพื่อดูค่าดิบ</p><div class="matrix-scroll" tabindex="0" role="region" aria-label="ตารางเมทริกซ์ A b x"><table class="matrix-table"><thead><tr><th>สมการ</th>${m.x.map((_,i)=>'<th>x'+(i+1)+'</th>').join('')}<th>b</th><th>x คำตอบ</th></tr></thead><tbody>${matrix}</tbody></table></div><label for="matrix-row">เลือกสมการรายแถว</label><select id="matrix-row">${m.x.map((_,i)=>`<option value="${i}">แถว ${i+1} · ${esc(name(m.unknowns[i]))}</option>`).join('')}</select><div id="matrix-equation" class="matrix-equation"></div><h3>3. แต่ละ branch เข้าเมทริกซ์อย่างไร</h3><p>a/b ในสูตรหมายถึงแถวโหนด A/B ของ branch; ขา reference ไม่สร้างแถวหรือคอลัมน์</p><div class="matrix-scroll"><table class="matrix-table"><thead><tr><th>Branch</th><th>A → B</th><th>ตัวแปร A / B</th><th>ส่วนที่เพิ่มในระบบสมการ</th></tr></thead><tbody>${stamps}</tbody></table></div><h3>4. อ่านค่ามิเตอร์จากคำตอบ</h3><div class="matrix-equation">U1s = V(m.16) − V(m.19) = ${esc(complex(r.secondary.us[0]))} V
U2s = V(m.22) − V(m.19) = ${esc(complex(r.secondary.us[1]))} V
I1s = I(burden-ir) = ${esc(complex(r.secondary.is[0]))} A
I2s = I(burden-ib) = ${esc(complex(r.secondary.is[1]))} A
S = (kPT·U1s)·conj(kCT·I1s) + (kPT·U2s)·conj(kCT·I2s)
S = ${esc(complex(r.mp))} VA
P = Re(S) = ${esc(num(r.mp.re))} W
Q = Im(S) = ${esc(num(r.mp.im))} var</div><p class="matrix-source-note">KCL relative residual ${esc(num(r.secondary.diagnostics.kclRelative))} · power relative residual ${esc(num(r.secondary.diagnostics.powerRelative))} · กระแสสาย ideal ที่อยู่ในวงรอบอาจไม่เป็นค่าเดียว ดูคำเตือนและตาราง branch ในวงจร</p></div>`;
}
function render(doc,graph){
 const holder=doc.getElementById('matrix-results'),previous=doc.getElementById('matrix-row')?.value||'0';
 holder.innerHTML=markup(graph);
 const select=doc.getElementById('matrix-row'),m=graph.solution.result.secondary.mna;
 select.value=String(Math.min(Number(previous)||0,m.x.length-1));
 const update=()=>{const k=Number(select.value);let ax={re:0,im:0};m.A[k].forEach((z,i)=>{const x=m.x[i];ax.re+=z.re*x.re-z.im*x.im;ax.im+=z.re*x.im+z.im*x.re;});doc.getElementById('matrix-equation').textContent=equation(m,k)+'\nแทนคำตอบ x: A·x = '+complex(ax)+'\nb = '+complex(m.rhs[k])+'\nresidual = '+complex({re:ax.re-m.rhs[k].re,im:ax.im-m.rhs[k].im});};
 select.onchange=update;update();
}
function clear(doc,message){doc.getElementById('matrix-results').innerHTML='<p class="matrix-body calculation-error">'+esc(message)+' · ไม่มีผลเมทริกซ์ปัจจุบัน</p>';}
function showTab(doc,tab){
 const matrix=tab==='matrix';
 doc.getElementById(matrix?'matrix-circuit-slot':'electrical-home').appendChild(doc.getElementById('electrical-panel'));
 for(const key of ['wiring','matrix']){const button=doc.getElementById('tab-'+key),active=tab===key;doc.getElementById('workspace-'+key).hidden=!active;button.setAttribute('aria-selected',active);button.setAttribute('tabindex',active?'0':'-1');button.classList.toggle('active',active);}
}
root.VisualMatrix={render,clear,showTab,markup,equation};
})(globalThis);
