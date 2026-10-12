/* 研记模拟卷版 · 浏览器本地优先 · 无账号、无服务器提交 */
(() => {
'use strict';
const DB_NAME = 'yanji-mock-standalone-v1', DB_KEY='snapshot';
const SUBJECTS=['数学一','数学二','数学三','专业课','英语一','英语二','政治'];
const SERIES=['历年真题','模拟卷','专项练习','自建题目'];
const TYPES=['单选题','多选题','填空题','解答题','证明题','其他'];
const LEVELS=['基础','中等','较难','压轴'];
const TABS=[['overview','⌂','总览'],['bank','▦','试题库'],['basket','▤','选题篮'],['auto','✦','智能组卷'],['papers','▣','我的试卷'],['exam','◷','限时模考'],['wrong','✎','错题本'],['stats','▥','学习统计'],['settings','⚙','备份与设置']];
const EMPTY=()=>({schema:1,questions:[],basket:[],papers:[],records:[],exam:null,preferences:{subject:'数学一',paperDuration:180}});
let data=EMPTY(),db=null,tab='overview',filter={text:'',subject:'全部',series:'全部',type:'全部',level:'全部',year:'全部',favorite:false},listPage=0,sort='recent',paperFocus='',recordFocus='',editingQuestion='',imageDraft='',notice='',noticeTimer=null,modalState='',saveTimer=null,writeQueue=Promise.resolve(),isReady=false,mediaQuery='';
const $=s=>document.querySelector(s);
const $$=s=>Array.from(document.querySelectorAll(s));
const uid=()=>Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const v=id=>document.getElementById(id)?.value??'';
const num=(x,fallback=0)=>Number.isFinite(+x)?Number(x):fallback;
const today=()=>new Date().toLocaleDateString('zh-CN');
const when=()=>new Date().toLocaleString('zh-CN',{hour12:false});
const fmtPct=(n,d)=>d?Math.round(n/d*100)+'%':'—';
const opt=(items,selected)=>items.map(x=>`<option value="${escape(x)}" ${String(x)===String(selected)?'selected':''}>${escape(x)}</option>`).join('');
const select=(label,id,items,selected)=>`<label class="field"><span class="field-label">${escape(label)}</span><select id="${id}">${opt(items,selected)}</select></label>`;
const input=(label,id,value='',type='text',extra='')=>`<label class="field"><span class="field-label">${escape(label)}</span><input id="${id}" type="${type}" value="${escape(value)}" ${extra}></label>`;
const area=(label,id,value='',rows=4)=>`<label class="field"><span class="field-label">${escape(label)}</span><textarea id="${id}" rows="${rows}">${escape(value)}</textarea></label>`;
const button=(label,action,id='',style='muted-btn',extra='')=>`<button type="button" class="btn ${style}" data-action="${action}" ${id!==''?`data-id="${escape(id)}"`:''} ${extra}>${label}</button>`;
const panel=(title,html)=>`<section class="panel"><h2>${title}</h2>${html}</section>`;
const pageHead=(title,subtitle,actions='')=>`<div class="page-head"><div><h1>${title}</h1><p>${subtitle}</p></div><div class="actions">${actions}</div></div>`;
const q=id=>data.questions.find(x=>x.id===id);
const p=id=>data.papers.find(x=>x.id===id);
const snapshot=it=>it?.question||q(it?.id);
const points=list=>list.reduce((s,it)=>s+num(it.points),0);
function math(txt){return String(txt||'').split(/(\$\$[\s\S]*?\$\$|\$(?:\\.|[^\n$])*?\$)/g).map(piece=>{
  const block=piece.startsWith('$$')&&piece.endsWith('$$'),inline=!block&&piece.startsWith('$')&&piece.endsWith('$');
  if((block||inline)&&window.katex){try{return window.katex.renderToString(piece.slice(block?2:1,block?-2:-1),{displayMode:block,throwOnError:false,trust:false,strict:'ignore'})}catch(err){}}
  return escape(piece);
 }).join('');}
function qTags(x){return [x.subject,x.series,x.year,x.source,x.chapter,x.level,...(x.tags||[])].filter(Boolean).map(s=>`<span class="chip">${escape(s)}</span>`).join('')}
function qStem(x,showOptions=true){return `<div class="stem">${math(x.stem)}</div>`+
 (x.image&&/^data:image\/(png|jpeg|webp|gif);base64,/i.test(x.image)?`<img class="q-img" alt="试题图片" src="${escape(x.image)}">`:'')+
 ((showOptions&&(x.type==='单选题'||x.type==='多选题'))?`<div class="choices">${(x.options||[]).map((t,i)=>t?`<div>${'ABCD'[i]}. ${math(t)}</div>`:'').join('')}</div>`:'');}
function answerBlock(x){return `<div class="answer"><h4>参考答案</h4><div class="stem">${math(x.answer||'（暂未填写答案）')}</div><hr class="divider"><h4>解题思路 / 解析</h4><div class="stem">${math(x.explanation||'（暂未填写解析）')}</div></div>`}
function qRow(x,index=0,mode='bank'){
 const inBasket=data.basket.includes(x.id),isFav=!!x.favorite;
 return `<article class="panel q-card"><div class="between"><span class="q-index">${index?`第 ${index} 题 · `:''}${escape(x.type)} · ${num(x.points)} 分</span><span class="small muted">${escape(x.updatedAt||'')}</span></div><div>${qTags(x)}</div>${qStem(x)}<div class="actions" style="margin-top:13px">
 ${button(inBasket?'✓ 已入题篮':'＋ 加入题篮','toggleBasket',x.id,inBasket?'neutral':'muted-btn')}
 ${button(isFav?'★ 已收藏':'☆ 收藏','toggleFavorite',x.id,'neutral')}
 ${button('查看解析','questionDetail',x.id,'neutral')}
 ${mode==='bank'?button('编辑','editQuestion',x.id,'neutral')+button('删除','deleteQuestion',x.id,'danger'):''}</div></article>`;
}
function alertBox(message,type='info'){notice=message;$('#alert').innerHTML=`<div class="notice ${type}">${escape(message)}</div>`;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{if($('#alert'))$('#alert').innerHTML='';notice=''},4500)}
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>r.result.createObjectStore('state');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function readDB(){return new Promise((resolve,reject)=>{const r=db.transaction('state').objectStore('state').get(DB_KEY);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function putDB(s){return new Promise((resolve,reject)=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(s,DB_KEY);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}
function save(ms=60){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{if(!db)return;const copy=JSON.parse(JSON.stringify(data));writeQueue=writeQueue.catch(()=>{}).then(()=>putDB(copy)).catch(e=>alertBox('浏览器保存失败，请立即导出备份：'+(e?.message||'存储不足'),'error'))},ms)}
function download(filename,content,contentType='application/json;charset=utf-8'){const blob=new Blob([content],{type:contentType}),link=document.createElement('a'),url=URL.createObjectURL(blob);link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),4000)}
function nav(to){tab=to;listPage=0;modalState='';closeModal();render();window.scrollTo(0,0)}
function render(){if(!isReady){$('#app').innerHTML=panel('载入中…','正在打开你的个人本地题库。');return}
 $('#nav').innerHTML=TABS.map(([id,icon,name])=>`<button class="nav-btn ${tab===id?'active':''}" data-action="nav" data-id="${id}"><span class="nav-icon">${icon}</span>${name}${id==='basket'&&data.basket.length?` <span class="pill">${data.basket.length}</span>`:''}</button>`).join('');
 $('#app').innerHTML=({overview:home,bank:bank,basket:basketPage,auto:autoPage,papers:papersPage,exam:examPage,wrong:wrongPage,stats:statsPage,settings:settingsPage}[tab]||home)();
 if(tab==='exam')tick();
}
function home(){const wrong=wrongInfo(),attempts=data.records.length,scoreSum=data.records.reduce((n,r)=>n+r.items.reduce((a,it)=>a+num(it.score),0),0),maxSum=data.records.reduce((n,r)=>n+points(r.items),0);
 return pageHead('今天也要稳步提分','把题目整理成卷，把每次模考转化为下一次进步。',button('＋ 新增试题','newQuestion','','')+button('开始组卷','nav','auto','muted-btn'))+
 `<div class="stat-grid"><div class="stat"><b>${data.questions.length}</b><small>已收录试题</small></div><div class="stat"><b>${data.papers.length}</b><small>我的套卷</small></div><div class="stat"><b>${attempts}</b><small>模考次数</small></div><div class="stat"><b>${fmtPct(scoreSum,maxSum)}</b><small>累计得分率</small></div></div>`+
 `<div class="banner"><b>独立项目 · 数据留在 Safari</b>　无需账号和服务器；首次使用请先录入或导入你拥有使用权的题目。网页自身不包含第三方收费题库数据。定期从「备份与设置」导出 JSON，以防清理浏览器数据。</div>`+
 `<div class="grid2">${panel('快速开始',`<p class="muted small">选题 → 组卷 → 导出 PDF → 限时答题 → 复盘错题。</p><div class="actions">${button('进入题库','nav','bank','')}${button('选题篮（'+data.basket.length+'）','nav','basket')}${button('智能组卷','nav','auto')}</div>`)}
 ${panel('最近模考',data.records.length?data.records.slice(-3).reverse().map(r=>`<div class="history-row"><div><b>${escape(r.title)}</b><div class="small muted">${escape(r.finishedAt)}</div></div>${button('查看结果','viewRecord',r.id,'neutral')}</div>`).join(''):'<div class="empty">暂无记录。完成一次模拟考试后，成绩将显示在这里。</div>')}</div>`+
 panel('错题追踪',`<div class="between"><div><strong>${wrong.size} 道</strong><span class="muted small">　曾在模考中失分</span></div>${button('进入错题本','nav','wrong')}</div>`);
}
function bankFilter(){let arr=data.questions.filter(x=>{
 const t=filter.text.trim().toLowerCase(),all=[x.stem,x.source,x.chapter,x.answer,x.explanation,x.year,...(x.tags||[])].join(' ').toLowerCase();
 return(!t||all.includes(t))&&(!filter.favorite||x.favorite)&&['subject','series','type','level','year'].every(k=>filter[k]==='全部'||String(x[k]||'')===filter[k]);
 });
 arr=arr.slice().sort((a,b)=>sort==='oldest'?(a.createdAt||'').localeCompare(b.createdAt||''):sort==='points'?num(b.points)-num(a.points):(b.updatedAt||'').localeCompare(a.updatedAt||''));return arr;
}
function bank(){const years=[...new Set(data.questions.map(x=>x.year).filter(Boolean))].sort().reverse(),list=bankFilter(),count=25,numberPages=Math.max(1,Math.ceil(list.length/count));listPage=Math.min(listPage,numberPages-1);
 return pageHead('试题库','分类筛选、知识点检索、答案解析、收藏与入篮。',button('＋ 新建试题','newQuestion','',''))+
 panel('筛选题目',`<form id="filterForm"><div class="grid3">${input('关键词（题干、年份、知识点等）','search',filter.text)}${select('科目','subject',['全部',...SUBJECTS],filter.subject)}${select('试题类别','series',['全部',...SERIES],filter.series)}${select('题型','type',['全部',...TYPES],filter.type)}${select('难度','level',['全部',...LEVELS],filter.level)}${select('年份','year',['全部',...years],filter.year)}</div><div class="between"><label class="small"><input id="favOnly" type="checkbox" ${filter.favorite?'checked':''}> 只看收藏</label><div class="actions"><button class="btn" type="submit">搜索筛选</button>${button('清除筛选','clearFilter','','neutral')}</div></div></form>`)+
 `<div class="between" style="margin-bottom:13px"><b>找到 ${list.length} 道题</b><label class="small muted">排序 <select id="sort" style="width:auto;min-height:32px;padding:5px"><option value="recent" ${sort==='recent'?'selected':''}>最近更新</option><option value="oldest" ${sort==='oldest'?'selected':''}>最早创建</option><option value="points" ${sort==='points'?'selected':''}>分值最高</option></select></label></div>`+
 (list.length?list.slice(listPage*count,(listPage+1)*count).map((x,i)=>qRow(x,listPage*count+i+1)).join(''):`<div class="panel empty">当前筛选没有试题。点击「新建试题」或到「备份与设置」导入题库 JSON / CSV。</div>`)+
 `<div class="pagination">${button('上一页','prevPage','','neutral',listPage<=0?'disabled':'')}<span class="small muted">第 ${listPage+1} / ${numberPages} 页</span>${button('下一页','nextPage','','neutral',listPage>=numberPages-1?'disabled':'')}</div>`;
}
function basketPage(){let x=data.basket.map(id=>q(id)).filter(Boolean),total=x.reduce((s,it)=>s+num(it.points),0);
 return pageHead('选题篮','手动选题并调整顺序，生成自己的试卷。',button('返回题库','nav','bank','muted-btn'))+
 panel('当前已选',`<div class="between"><div><b>${x.length} 道题 · ${total} 分</b><div class="small muted">试卷创建后，题篮会清空；原题库不受影响。</div></div>${button('清空题篮','clearBasket','','danger')}</div>`)+
 (x.length?x.map((it,i)=>`<article class="panel"><div class="between"><strong>${i+1}. ${escape(it.type)}　${num(it.points)} 分</strong><div class="actions">${button('↑','basketMove',`${i}:up`,'tiny neutral')}${button('↓','basketMove',`${i}:down`,'tiny neutral')}${button('移除','toggleBasket',it.id,'tiny danger')}</div></div><div>${qTags(it)}</div>${qStem(it)}</article>`).join(''):'<div class="panel empty">题篮还是空的。可以在「试题库」中选择题目。</div>')+
 (x.length?panel('创建试卷',`<form id="basketPaperForm"><div class="grid2">${input('试卷名称','basketTitle',`${data.preferences.subject} · 自选模拟卷 ${today()}`)}${input('考试时长（分钟）','basketDuration',data.preferences.paperDuration,'number','min="1" max="600"')}${select('纸张规格','basketSize',['A4','A3'],'A4')}${input('解答题预留作答空间（毫米）','basketBlank',35,'number','min="0" max="120"')}</div><button class="btn" type="submit">保存为独立试卷</button></form>`):'');
}
function autoPage(){let topicList=[...new Set(data.questions.flatMap(x=>[x.chapter,...(x.tags||[])].filter(Boolean)))].sort();
 return pageHead('智能组卷','按科目、来源、难度、章节、题型自动抽题，已有试卷与题库互不影响。')+
 panel('自动组卷条件',`<form id="autoForm"><div class="grid2">${input('新试卷名称','autoTitle',`${data.preferences.subject} · 智能模拟卷 ${today()}`)}${select('考试科目','autoSubject',SUBJECTS,data.preferences.subject)}${select('来源类别','autoSeries',['不限',...SERIES],'不限')}${select('难度','autoLevel',['不限',...LEVELS],'不限')}${select('知识点 / 章节','autoTopic',['不限',...topicList],'不限')}${select('抽题策略','autoStrategy',['随机抽题','优先未做','优先错题'],'随机抽题')}</div><div class="grid3">${input('单选题数量','autoSingle',10,'number','min="0" max="100"')}${input('多选题数量','autoMulti',0,'number','min="0" max="100"')}${input('填空题数量','autoBlankCount',6,'number','min="0" max="100"')}${input('解答题数量','autoSolve',6,'number','min="0" max="100"')}${input('证明题数量','autoProof',0,'number','min="0" max="100"')}${input('其他题数量','autoOther',0,'number','min="0" max="100"')}</div><div class="grid2">${input('考试时长（分钟）','autoDuration',180,'number','min="1" max="600"')}${select('纸张规格','autoSize',['A4','A3'],'A4')}${input('总分上限（留空不限）','autoMaxPoints','','number','min="1" max="1000" placeholder="如 150"')}</div><p class="small muted">数学一常见的题型数量已预设为 10 道选择、6 道填空、6 道解答；实际分值以你题库中的设置为准。只有满足数量要求时才生成完整试卷。</p><button type="submit" class="btn">开始智能组卷</button></form>`)+
 panel('题库容量',`<div class="grid3">${TYPES.map(t=>`<div class="stat"><b>${data.questions.filter(x=>x.type===t&&x.subject===data.preferences.subject).length}</b><small>${t}</small></div>`).join('')}</div><p class="foot">没有足量题目时可调小数量，或先导入有使用权的真题 / 模拟题。</p>`);
}
function papersPage(){const list=data.papers.slice().reverse();
 return pageHead('我的试卷','保留题目快照，可编辑排版、调换题序、导出 PDF 或开始限时模考。',button('从题篮组卷','nav','basket','muted-btn'))+
 (list.length?list.map(x=>`<article class="panel"><div class="between"><div><h2 style="margin-bottom:5px">${escape(x.title)}</h2><span class="small muted">${x.items.length} 道题 · ${points(x.items)} 分 · ${escape(x.size)} · ${x.duration} 分钟</span></div><span class="chip blue">${escape(x.subject||'自定义')}</span></div><p class="small muted">创建于 ${escape(x.createdAt)}</p><div class="actions">${button('预览','previewPaper',x.id)}${button('编辑试卷','editPaper',x.id,'neutral')}${button('打印 / 保存 PDF','printPaper',x.id,'neutral')}${button('开始模考','startExam',x.id,'')}${button('复制','duplicatePaper',x.id,'neutral')}${button('删除','deletePaper',x.id,'danger')}</div></article>`).join(''):'<div class="panel empty">还没有套卷。你可以从「选题篮」或「智能组卷」创建。</div>');
}
function examPage(){if(data.exam){const ex=data.exam,px=p(ex.paperId);if(!px)return panel('模考已中断',button('丢弃无效模考','discardExam','','danger'));
 const answered=px.items.filter(it=>String(ex.answers[it.id]||'').trim()).length;
 return `<div class="exam-bar"><div class="between"><div><strong>${escape(px.title)}</strong><div class="small muted">已答 ${answered} / ${px.items.length} 题 · ${points(px.items)} 分</div></div><div class="timer" id="timer">00:00:00</div></div><div class="progress-track"><div id="examProgress" class="progress-fill" style="width:${fmtPct(answered,px.items.length).replace('—','0%')}"></div></div></div>`+
 `<section class="panel answer-sheet"><div class="between"><b>答题卡</b><span class="small muted">点击题号快速定位 · 绿：已答 / 橙：标记</span></div><div class="answer-grid">${px.items.map((it,i)=>`<a href="#examItem${i}" class="answer-number ${String(ex.answers[it.id]||'').trim()?'done':''} ${ex.marked[it.id]?'flagged':''}" aria-label="定位第 ${i+1} 题">${i+1}</a>`).join('')}</div></section>`+
 px.items.map((it,i)=>{const x=snapshot(it);if(!x)return '';const ans=ex.answers[it.id]||'';const test=['单选题','多选题'].includes(x.type);return `<article class="panel" id="examItem${i}"><div class="between"><span class="q-index">第 ${i+1} 题　${escape(x.type)} · ${it.points} 分</span><label class="small"><input type="checkbox" class="markExam" data-id="${it.id}" ${ex.marked[it.id]?'checked':''}> 标记待检查</label></div>${qStem(x,!test)}${test?`<div style="margin-top:12px">${(x.options||[]).map((s,j)=>s?`<label class="exam-choice"><input type="${x.type==='多选题'?'checkbox':'radio'}" ${x.type==='单选题'?`name="answer_${escape(it.id)}"`:''} class="answerChoice" data-id="${it.id}" value="${'ABCD'[j]}" ${ans.includes('ABCD'[j])?'checked':''}><span>${'ABCD'[j]}. ${math(s)}</span></label>`:'').join('')}</div>`:`<label class="field" style="margin-top:14px"><span class="field-label">我的作答（支持公式 $...$）</span><textarea class="freeAnswer" data-id="${it.id}" placeholder="输入解答、关键步骤或最终答案">${escape(ans)}</textarea></label>`}</article>`}).join('')+
 panel('交卷',`<p class="muted small">选择题自动判分，填空和主观题可查看参考答案后手动评分。关闭 Safari 后可从本设备恢复模考；考试时间仍会继续计算。</p><div class="actions">${button('交卷并查看结果','finishExam','','')}${button('放弃本次模考','discardExam','','danger')}</div>`)
 }
 if(recordFocus){const r=data.records.find(x=>x.id===recordFocus);if(r)return resultView(r)}
 return pageHead('限时模拟考试','完整保留做题过程，客观题自动判分，主观题自主评分。')+panel('选择试卷开始',data.papers.length?data.papers.slice().reverse().map(px=>`<div class="history-row"><div><b>${escape(px.title)}</b><div class="small muted">${px.items.length} 题 · ${px.duration} 分钟 · 满分 ${points(px.items)}</div></div>${button('开始考试','startExam',px.id,'')}</div>`).join(''):'<div class="empty">没有可考试的试卷，请先从选题篮或智能组卷生成。</div>')+
 (data.records.length?`<hr class="divider"><h3>历史记录</h3>${data.records.slice().reverse().slice(0,12).map(r=>`<div class="history-row"><div><strong>${escape(r.title)}</strong><div class="small muted">${escape(r.finishedAt)}</div></div>${button('查看评分','viewRecord',r.id)}</div>`).join('')}`:'');
}
function resultView(r){const earned=r.items.reduce((s,x)=>s+num(x.score),0),maximum=points(r.items),px=p(r.paperId);
 return pageHead('模考复盘',`${r.finishedAt} · ${escape(r.title)}`,button('返回模考','closeRecord','','neutral'))+
 `<div class="stat-grid"><div class="stat"><b>${earned}</b><small>目前得分</small></div><div class="stat"><b>${maximum}</b><small>总分</small></div><div class="stat"><b>${fmtPct(earned,maximum)}</b><small>得分率</small></div><div class="stat"><b>${r.items.filter(x=>num(x.score)<num(x.points)).length}</b><small>失分题</small></div></div>`+
 panel('评分说明',`<p class="small muted">单选、多选题按标准答案完全匹配自动判分；填空与解答、证明题需自行在下方输入得分。修改分数后点击「保存本次评分」，错题本和统计会相应更新。</p>`)+
 `<form id="scoreForm" data-record="${r.id}">`+r.items.map((it,i)=>{const x=it.question||snapshot(it);if(!x)return '';const auto=it.auto;return `<article class="panel"><div class="between"><b>第 ${i+1} 题 · ${escape(x.type)} · 满分 ${it.points}</b><span class="chip">${auto?'客观题自动评分':'主观题自评'}</span></div>${qStem(x)}<div class="answer"><h4>我的作答</h4><div class="stem">${math(it.answer||'（未填写）')}</div></div>${answerBlock(x)}<div style="max-width:220px;margin-top:13px">${input('本题得分（0 ～ '+it.points+'）','score_'+i,it.score,'number',`min="0" max="${it.points}" step="0.5"`)}</div>${area('错因与改进要点（可选）','reason_'+i,it.reason||'',2)}</article>`}).join('')+`<div class="panel actions"><button type="submit" class="btn">保存本次评分</button>${px?button('重做该套卷','startExam',px.id,'muted-btn'):''}</div></form>`;
}
function wrongInfo(){const ids=new Map();for(const r of data.records){for(const it of r.items){if(num(it.score)<num(it.points)){let info=ids.get(it.id)||{id:it.id,count:0,last:null,question:it.question||q(it.id)};info.count++;info.last=r.finishedAt;if(it.reason)info.reason=it.reason;ids.set(it.id,info)}}}return {size:ids.size,items:[...ids.values()].sort((a,b)=>b.count-a.count)};}
function wrongPage(){const w=wrongInfo();return pageHead('错题本','根据每次实际得分自动归集，不手动复制题目。',button('组一套错题卷','wrongPaper','','muted-btn'))+
 `<div class="stat-grid"><div class="stat"><b>${w.size}</b><small>曾失分题</small></div><div class="stat"><b>${w.items.reduce((s,x)=>s+x.count,0)}</b><small>累计失分次数</small></div><div class="stat"><b>${data.questions.filter(x=>x.favorite).length}</b><small>收藏题</small></div><div class="stat"><b>${data.records.length}</b><small>模考记录</small></div></div>`+
 (w.items.length?w.items.map((it,i)=>{const x=q(it.id)||it.question;return x?`<article class="panel"><div class="between"><b>错题 ${i+1} · ${escape(x.type)}</b><span class="chip">失分 ${it.count} 次</span></div><div>${qTags(x)}</div>${qStem(x)}${it.reason?`<p class="small subtle"><b>上次错因：</b>${escape(it.reason)}</p>`:''}<div class="actions" style="margin-top:12px">${q(it.id)?button('加入题篮','toggleBasket',it.id):button('题库已删除','nothing','','neutral','disabled')}${button('答案解析','wrongDetail',it.id,'neutral')}</div></article>`:''}).join(''):'<div class="panel empty">还没有错题记录。模考后对主观题评分，失分题会自动出现在这里。</div>');
}
function statsPage(){const attempts=data.records,earned=attempts.reduce((s,r)=>s+r.items.reduce((a,it)=>a+num(it.score),0),0),max=attempts.reduce((s,r)=>s+points(r.items),0);const tagStats=new Map(),typeStats=new Map();for(const r of attempts)for(const it of r.items){const x=it.question||q(it.id);if(!x)continue;const fields=[['题型：'+x.type,typeStats],['知识点：'+(x.chapter||'未分类'),tagStats]];for(const [name,m] of fields){const a=m.get(name)||{n:0,score:0,max:0};a.n++;a.score+=num(it.score);a.max+=num(it.points);m.set(name,a)}}
 const breakdown=map=>[...map].sort((a,b)=>b[1].n-a[1].n).slice(0,15).map(([name,item])=>`<div class="list-row"><div class="between"><b class="small">${escape(name.replace(/^(题型|知识点)：/,''))}</b><span class="small muted">${item.n} 题 · ${fmtPct(item.score,item.max)}</span></div><div class="progress-track"><div class="progress-fill" style="width:${Math.min(100,item.max?item.score/item.max*100:0)}%"></div></div></div>`).join('')||'<p class="muted small">暂无足够数据</p>';
 return pageHead('学习统计','得分趋势、知识点弱项与每次模考记录。')+`<div class="stat-grid"><div class="stat"><b>${attempts.length}</b><small>完成考试</small></div><div class="stat"><b>${fmtPct(earned,max)}</b><small>平均得分率</small></div><div class="stat"><b>${attempts.reduce((s,r)=>s+r.items.length,0)}</b><small>累计答题</small></div><div class="stat"><b>${wrongInfo().size}</b><small>失分题数</small></div></div>`+
 `<div class="grid2">${panel('按题型',breakdown(typeStats))}${panel('按章节 / 知识点',breakdown(tagStats))}</div>`+
 panel('全部模考记录',attempts.length?attempts.slice().reverse().map(r=>`<div class="history-row"><div><b>${escape(r.title)}</b><div class="small muted">${escape(r.finishedAt)} · ${r.items.length} 道题</div></div><div class="actions"><b class="history-score">${r.items.reduce((s,it)=>s+num(it.score),0)} / ${points(r.items)}</b>${button('查看','viewRecord',r.id,'neutral')}${button('删除','deleteRecord',r.id,'tiny danger')}</div></div>`).join(''):'<div class="empty">暂无考试记录。</div>');
}
function settingsPage(){const s=JSON.stringify(data).length;
 return pageHead('备份与设置','所有题库、试卷和模考记录都只保存在当前 Safari 浏览器。')+
 panel('完整备份与恢复',`<p class="small muted">清除 Safari 网站数据、在不同的浏览器或主屏幕网页 App 之间切换，可能导致存储隔离或丢失。请定期把备份文件保存到「文件」App 或 iCloud Drive。</p><div class="actions">${button('⬇ 导出完整 JSON 备份','downloadBackup','','')}${button('⬇ 导出题库 JSON','downloadQuestions')}${button('⬇ 导出题库 CSV','downloadCsv')}</div><p class="foot">当前本地数据约 ${(s/1024).toFixed(1)} KB（未含浏览器数据库开销）。</p>`)+
 panel('导入试题',`<p class="small muted">支持 JSON 数组、题库导出文件、CSV 表格；LaTeX 公式以 $...$ 或 $$...$$ 输入。重复试题会按题干及来源跳过，第三方网站的付费题库不会被自动抓取。</p><label class="field"><span class="field-label">选择题库文件（.json / .csv）</span><input id="questionsUpload" type="file" accept=".json,.csv,application/json,text/csv"></label>${area('或粘贴 JSON 数组','jsonText','',5)}${button('导入粘贴的 JSON','importText','','muted-btn')}<p class="foot"><a href="./sample-questions.json" download="sample-questions.json">下载示例数据与字段格式</a>　${button('加载内置示例题','loadSample','','tiny neutral')}</p>`)+
 panel('恢复完整备份',`<p class="small muted">完整恢复会覆盖本项目当前题目、题篮、试卷及模考记录。请先下载一份当前备份。</p><label class="field"><span class="field-label">选择研记模拟卷版的完整备份 JSON</span><input id="backupUpload" type="file" accept=".json,application/json"></label>`)+
 panel('偏好与维护',`<div class="grid2">${select('默认考试科目','prefSubject',SUBJECTS,data.preferences.subject)}${input('默认考试时长（分钟）','prefDuration',data.preferences.paperDuration,'number','min="1" max="600"')}</div><div class="actions">${button('保存默认设置','savePreferences','','muted-btn')}${button('清空所有本地数据','clearAll','','danger')}</div>`)+
 `<div class="banner"><b>关于隐私与访问</b><br>此项目不要求注册，也不发送试题、答案或考试记录到任何服务器。通过 GitHub Pages 访问时，网页代码通常可以被公开访问，但个人题库数据不会上传到 GitHub。别把含私人数据的备份提交到公开仓库。LaTeX 排版库首次可能需要网络加载。</div>`;
}
function closeModal(){const el=$('#modal');el.hidden=true;el.className='';el.innerHTML='';editingQuestion='';imageDraft='';modalState=''}
function openModal(title,body,wide=false){const el=$('#modal');el.hidden=false;el.className='modal-layer';el.innerHTML=`<section class="modal-card" style="${wide?'width:min(900px,100%)':''}"><div class="modal-heading"><h2>${title}</h2>${button('关闭','closeModal','','neutral')}</div>${body}</section>`;}
function questionEditor(id=''){const x=id?q(id):null;editingQuestion=id||'new';imageDraft=x?.image||'';
 openModal(id?'编辑试题':'新建试题',`<form id="questionForm"><div class="grid2">${select('科目','qSubject',SUBJECTS,x?.subject||data.preferences.subject)}${select('类别','qSeries',SERIES,x?.series||'自建题目')}${select('题型','qType',TYPES,x?.type||'解答题')}${select('难度','qLevel',LEVELS,x?.level||'中等')}${input('年份','qYear',x?.year||'')}${input('来源 / 试卷名','qSource',x?.source||'')}${input('章节','qChapter',x?.chapter||'')}${input('分值','qPoints',x?.points??12,'number','min="0" max="150"')}</div>${input('知识点标签（用逗号分隔）','qTags',(x?.tags||[]).join(', '))}${area('题干（支持 $LaTeX$ 公式）','qStem',x?.stem||'',5)}<div class="grid2">${[0,1,2,3].map((i)=>input('选项 '+('ABCD'[i]),'qOpt'+i,x?.options?.[i]||'')).join('')}</div>${area('参考答案','qAnswer',x?.answer||'',3)}${area('完整解析 / 推导过程','qExplanation',x?.explanation||'',5)}<label class="field"><span class="field-label">题干图片（可选，小于 5MB，自动压缩）</span><input id="imageUpload" type="file" accept="image/*"></label><div class="actions">${imageDraft?'<span class="chip blue">已有配图</span>':''}${button('移除配图','removeImage','','neutral')}</div><p class="actions"><button type="submit" class="btn">保存试题</button>${button('取消','closeModal','','neutral')}</p></form>`,true);
}
function detail(id,kind='bank'){const x=q(id)||wrongInfo().items.find(t=>t.id===id)?.question;if(!x)return alertBox('试题不存在','error');modalState=kind+':'+id;openModal('试题与完整解析',`<div>${qTags(x)}</div>${qStem(x)}${answerBlock(x)}<p class="actions">${q(id)?button(data.basket.includes(id)?'移出题篮':'加入题篮','toggleBasket',id,'muted-btn'):''}${q(id)?button('编辑题目','editQuestion',id,'neutral'):''}</p>`,true)}
function cleanQuestion(x){if(!x||typeof x.stem!=='string'||!x.stem.trim())return null;
 return {id:typeof x.id==='string'&&x.id?x.id:uid(),subject:SUBJECTS.includes(x.subject)?x.subject:data.preferences.subject,series:SERIES.includes(x.series)?x.series:'自建题目',year:String(x.year??''),source:String(x.source??''),chapter:String(x.chapter??''),type:TYPES.includes(x.type)?x.type:'解答题',level:LEVELS.includes(x.level)?x.level:'中等',tags:Array.isArray(x.tags)?x.tags.map(String).slice(0,50):typeof x.tags==='string'?x.tags.split(/[,，、]/).map(t=>t.trim()).filter(Boolean).slice(0,50):[],points:Math.min(150,Math.max(0,num(x.points,12))),stem:x.stem.slice(0,100000),options:Array.isArray(x.options)?x.options.slice(0,4).map(y=>String(y??'')):[String(x.A??''),String(x.B??''),String(x.C??''),String(x.D??'')],answer:String(x.answer??''),explanation:String(x.explanation??''),favorite:!!x.favorite,image:typeof x.image==='string'&&/^data:image\/(png|jpeg|webp|gif);base64,/i.test(x.image)?x.image:'',createdAt:x.createdAt||when(),updatedAt:when()};
}
function makePaper(title,selected,{size='A4',duration=180,blank=35,subject='自定义'}={}){
 return {id:uid(),title:title.trim()||'未命名模拟卷',items:selected.map(x=>({id:x.id,points:num(x.points),question:JSON.parse(JSON.stringify(x))})),size,duration:Math.min(600,Math.max(1,num(duration,180))),blank:Math.min(120,Math.max(0,num(blank,35))),subject,printAnswers:false,createdAt:when(),updatedAt:when()};
}
function paperEditor(id){const x=p(id);if(!x)return;paperFocus=id;openModal('编辑试卷与排版',`<form id="paperForm" data-paper="${escape(id)}"><div class="grid2">${input('试卷名称','paperTitle',x.title)}${select('纸张规格','paperSize',['A4','A3'],x.size)}${input('考试时长 / 分钟','paperDuration',x.duration,'number','min="1" max="600"')}${input('主观题答题空间 / mm','paperBlank',x.blank,'number','min="0" max="120"')}</div><label class="field"><input id="paperAnswers" type="checkbox" ${x.printAnswers?'checked':''}> 在打印稿末尾附参考答案与解析</label><p class="actions"><button type="submit" class="btn">保存设置与分值</button>${button('预览','previewPaper',id)}</p><hr class="divider"><h3>试题顺序、分值与移除</h3>${x.items.map((it,i)=>{let y=snapshot(it);return y?`<div class="list-row"><div class="between"><div><b>第 ${i+1} 题 · ${escape(y.type)}</b><div class="small muted">${escape(y.chapter||y.source||'题目')}</div></div><div class="actions">${button('↑','paperMove',`${i}:up`,'tiny neutral')}${button('↓','paperMove',`${i}:down`,'tiny neutral')}${button('删除','paperRemove',String(i),'tiny danger')}</div></div><label class="field" style="max-width:150px"><span class="field-label">分值</span><input class="paperPoints" data-index="${i}" type="number" min="0" max="150" value="${it.points}"></label></div>`:''}).join('')}</form>`,true)}
function syncPaperForm(){const px=p(paperFocus);if(!px)return;const titleEl=$('#paperTitle');if(!titleEl)return;px.title=v('paperTitle').trim()||px.title;px.size=v('paperSize');px.duration=Math.max(1,Math.min(600,num(v('paperDuration'),180)));px.blank=Math.max(0,Math.min(120,num(v('paperBlank'),35)));px.printAnswers=!!$('#paperAnswers')?.checked;$$('.paperPoints').forEach(el=>{const it=px.items[Number(el.dataset.index)];if(it)it.points=Math.min(150,Math.max(0,num(el.value)))});px.updatedAt=when();save();}
function previewPaper(id){const x=p(id);if(!x)return;openModal('预览 · '+escape(x.title),`<div class="between"><b>${x.items.length} 题 · ${points(x.items)} 分 · ${x.duration} 分钟</b>${button('打印 / PDF','printPaper',x.id,'')}</div><hr class="divider">${x.items.map((it,i)=>{const y=snapshot(it);return y?`<div class="list-row"><b>${i+1}. （${it.points} 分）${escape(y.type)}</b>${qStem(y)}</div>`:''}).join('')}`,true)}
function doPrint(id){const x=p(id);if(!x)return;const print=$('#printArea');const sheet=x.items.map((it,i)=>{const y=snapshot(it);if(!y)return '';const isSubjective=!['单选题','多选题'].includes(y.type);return `<section class="print-q"><strong>${i+1}. （${it.points} 分）</strong>${qStem(y)}${isSubjective&&x.blank?`<div class="print-blank" style="height:${x.blank}mm"></div>`:''}</section>`}).join('');
 print.innerHTML=`<div class="print-sheet"><h1 class="print-title">${escape(x.title)}</h1><div class="print-meta">考试时间：${x.duration} 分钟　　满分：${points(x.items)} 分<br>姓名：_______________　　日期：_______________　　得分：_______________</div>${sheet}${x.printAnswers?`<section class="print-answer"><h2>参考答案与解析</h2>${x.items.map((it,i)=>{const y=snapshot(it);return y?`<div class="print-q"><b>${i+1}. </b>${answerBlock(y)}</div>`:''}).join('')}</section>`:''}</div>`;
 let style=$('#paperCss');if(!style){style=document.createElement('style');style.id='paperCss';document.head.appendChild(style)}style.textContent=`@media print{@page{size:${x.size} portrait;margin:15mm}}`;
 setTimeout(()=>window.print(),250);
}
function makeExam(id){const px=p(id);if(!px||!px.items.length)return alertBox('试卷中没有题目','error');if(data.exam&&!confirm('当前还有未交卷的模考。确定舍弃并开始新的一次？'))return;data.exam={paperId:id,startedAt:Date.now(),answers:{},marked:{}};recordFocus='';save();nav('exam')}
function saveAnswer(id,ans){if(!data.exam)return;data.exam.answers[id]=ans;save(350);const px=p(data.exam.paperId);if(px){let filled=px.items.filter(it=>String(data.exam.answers[it.id]||'').trim()).length;const bar=$('#examProgress');if(bar)bar.style.width=fmtPct(filled,px.items.length).replace('—','0%');const index=px.items.findIndex(it=>it.id===id);const tile=index>=0?document.querySelectorAll('.answer-number')[index]:null;if(tile)tile.classList.toggle('done',String(ans||'').trim().length>0)}}
function tick(){if(!data.exam)return;const px=p(data.exam.paperId);if(!px)return;const remain=Math.max(0,Math.ceil((px.duration*60_000-(Date.now()-data.exam.startedAt))/1000));const el=$('#timer');if(el)el.textContent=[Math.floor(remain/3600),Math.floor(remain%3600/60),remain%60].map(n=>String(n).padStart(2,'0')).join(':');if(remain===0){finishExam(true)}}
function normalizeChoice(s){return String(s||'').toUpperCase().replace(/[^ABCD]/g,'').split('').sort().filter((x,i,a)=>i===0||x!==a[i-1]).join('')}
function finishExam(expired=false){const ex=data.exam;if(!ex)return;const px=p(ex.paperId);if(!px){data.exam=null;save();return}if(!expired&&!confirm('确定交卷吗？你可以在交卷后查看答案并给主观题评分。'))return;
 const items=px.items.map(it=>{const x=snapshot(it),a=String(ex.answers[it.id]||'');const auto=!!x&&['单选题','多选题'].includes(x.type);const score=auto&&normalizeChoice(a)&&normalizeChoice(a)===normalizeChoice(x.answer)?it.points:0;return {id:it.id,question:JSON.parse(JSON.stringify(x)),answer:a,points:it.points,auto,score,marked:!!ex.marked[it.id]}});
 const r={id:uid(),paperId:px.id,title:px.title,startedAt:ex.startedAt,finishedAt:when(),expired,items};data.records.push(r);data.exam=null;recordFocus=r.id;save();nav('exam');alertBox(expired?'考试时间已到，系统自动交卷。':'交卷成功，请对主观题自主评分。')}
function cleanImported(payload){const list=Array.isArray(payload)?payload:Array.isArray(payload?.questions)?payload.questions:null;if(!list)throw Error('题库文件需要是试题 JSON 数组，或包含 questions 数组的对象');
 const known=new Set(data.questions.map(x=>(x.stem.trim()+'|'+x.subject+'|'+x.source).toLowerCase()));let added=0,skipped=0;for(const raw of list){const x=cleanQuestion(raw);if(!x){skipped++;continue}const key=(x.stem.trim()+'|'+x.subject+'|'+x.source).toLowerCase();if(known.has(key)){skipped++;continue}x.id=uid();data.questions.push(x);known.add(key);added++}save();render();alertBox(`导入成功：新增 ${added} 道，跳过 ${skipped} 道重复或无效试题`)}
function parseCsv(txt){const rows=[],r=[],s=String(txt).replace(/^\uFEFF/,'');let val='',quoted=false;for(let i=0;i<s.length;i++){const c=s[i];if(c==='"'){if(quoted&&s[i+1]==='"'){val+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){r.push(val);val=''}else if((c==='\r'||c==='\n')&&!quoted){if(c==='\r'&&s[i+1]==='\n')i++;r.push(val);if(r.some(t=>t!==''))rows.push(r.splice(0));else r.length=0;val=''}else val+=c}r.push(val);if(r.some(t=>t!==''))rows.push(r);
 const head=(rows.shift()||[]).map(t=>t.trim());if(!head.some(s=>['stem','题干','题目'].includes(s)))throw Error('CSV 需包含 stem / 题干 / 题目 列');const aliases={'题目':'stem','题干':'stem','试题':'stem','科目':'subject','类别':'series','年份':'year','来源':'source','章节':'chapter','题型':'type','难度':'level','分值':'points','解析':'explanation','解答':'explanation','答案':'answer','标签':'tags','选项A':'A','选项B':'B','选项C':'C','选项D':'D'};
 return rows.map(row=>{const x={};head.forEach((h,i)=>x[aliases[h]||h]=row[i]||'');return x})}
function csvExport(){const columns=['subject','series','year','source','chapter','type','level','points','stem','A','B','C','D','answer','explanation','tags'];const cn=['科目','类别','年份','来源','章节','题型','难度','分值','题干','选项A','选项B','选项C','选项D','答案','解析','标签'];const quote=s=>'"'+String(s??'').replace(/"/g,'""')+'"';const lines=[cn.map(quote).join(',')];for(const x of data.questions)lines.push(columns.map((field)=>quote(field==='tags'?(x.tags||[]).join(','):field.length===1&&/[ABCD]/.test(field)?x.options?.['ABCD'.indexOf(field)]:x[field])).join(','));return '\uFEFF'+lines.join('\r\n')}
function backup(){download('研记模拟卷版_完整备份_'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify({kind:'yanji.mock.backup.v1',exportedAt:new Date().toISOString(),data},null,2))}
function restore(raw){const obj=JSON.parse(raw);if(obj?.kind!=='yanji.mock.backup.v1'||!obj?.data||!Array.isArray(obj.data.questions)||!Array.isArray(obj.data.papers)||!Array.isArray(obj.data.records))throw Error('不是本项目的有效完整备份文件');if(!confirm('危险操作：完整备份将覆盖当前所有题目、试卷、考试记录。请先导出现在的数据。是否继续？'))return;if(!confirm('最后确认：确实覆盖当前本地数据吗？'))return;data={...EMPTY(),...obj.data};data.preferences={...EMPTY().preferences,...obj.data.preferences};save(0);recordFocus='';nav('overview');alertBox('完整备份已恢复');}
async function compressImage(file){if(file.size>5*1024*1024)throw Error('图片不能大于 5MB');return await new Promise((resolve,reject)=>{const rd=new FileReader();rd.onerror=()=>reject(new Error('图片读取失败'));rd.onload=()=>{const im=new Image();im.onerror=()=>reject(new Error('图片格式不支持'));im.onload=()=>{try{const max=1500,scale=Math.min(1,max/Math.max(im.naturalWidth,im.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(im.naturalWidth*scale));canvas.height=Math.max(1,Math.round(im.naturalHeight*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(im,0,0,canvas.width,canvas.height);resolve(canvas.toDataURL('image/jpeg',.82))}catch(e){reject(e)}};im.src=String(rd.result)};rd.readAsDataURL(file)})}
function addWrongPaper(){const all=wrongInfo().items.map(it=>q(it.id)||it.question).filter(Boolean);if(!all.length)return alertBox('错题本为空');const title='错题专项重练 · '+today(),px=makePaper(title,all,{subject:data.preferences.subject});data.papers.push(px);save();nav('papers');alertBox('已生成错题专项卷（'+all.length+' 道）')}
function smartPaper(form){const selected=[],needs={'单选题':num(v('autoSingle')),'多选题':num(v('autoMulti')),'填空题':num(v('autoBlankCount')),'解答题':num(v('autoSolve')),'证明题':num(v('autoProof')),'其他':num(v('autoOther'))};const subject=v('autoSubject'),series=v('autoSeries'),level=v('autoLevel'),topic=v('autoTopic'),strategy=v('autoStrategy');const used=new Set(data.records.flatMap(r=>r.items.map(it=>it.id)));const misses=[];const limit=v('autoMaxPoints').trim()?Math.max(1,num(v('autoMaxPoints'),1000)):Infinity;let sum=0;
 for(const [type,amount0] of Object.entries(needs)){const amount=Math.max(0,Math.min(100,Math.floor(amount0)));if(!amount)continue;
 let list=data.questions.filter(x=>x.subject===subject&&x.type===type&&(series==='不限'||x.series===series)&&(level==='不限'||x.level===level)&&(topic==='不限'||x.chapter===topic||(x.tags||[]).includes(topic)));
 for(let i=list.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[list[i],list[j]]=[list[j],list[i]]}
 if(strategy==='优先未做')list.sort((a,b)=>Number(used.has(a.id))-Number(used.has(b.id)));
 if(strategy==='优先错题'){const ids=new Set(wrongInfo().items.map(it=>it.id));list.sort((a,b)=>Number(ids.has(b.id))-Number(ids.has(a.id)))}
 const chosen=[];for(const item of list){if(chosen.length>=amount)break;const score=num(item.points);if(sum+score<=limit){chosen.push(item);sum+=score}}if(chosen.length<amount)misses.push(`${type}：需要 ${amount}，符合条件且不超过总分上限的只有 ${chosen.length}`);selected.push(...chosen);}
 if(misses.length){alertBox('当前筛选条件下试题不足：'+misses.join('；')+'。请减少数量或导入更多题目。','warn');return}if(!selected.length)return alertBox('请至少选择 1 道题','warn');
 const px=makePaper(v('autoTitle'),selected,{size:v('autoSize'),duration:num(v('autoDuration'),180),subject});data.papers.push(px);data.preferences.subject=subject;save();nav('papers');alertBox(`智能组卷完成：${selected.length} 题，共 ${points(px.items)} 分`);
}
function handleAction(action,id){switch(action){
 case 'nav':recordFocus='';nav(id);break;
 case 'newQuestion':questionEditor();break;
 case 'editQuestion':questionEditor(id);break;
 case 'closeModal':closeModal();break;
 case 'questionDetail':detail(id);break;
 case 'wrongDetail':detail(id,'wrong');break;
 case 'toggleBasket':if(data.basket.includes(id))data.basket=data.basket.filter(x=>x!==id);else if(q(id))data.basket.push(id);save();if($('#modal')&&!$('#modal').hidden&&modalState){detail(id)}else render();break;
 case 'toggleFavorite':{const x=q(id);if(x)x.favorite=!x.favorite;save();render();break}
 case 'deleteQuestion':if(confirm('删除此题？已创建试卷中的题目快照不会被删除。')){data.questions=data.questions.filter(x=>x.id!==id);data.basket=data.basket.filter(t=>t!==id);save();render()}break;
 case 'removeImage':imageDraft='';alertBox('已移除待保存的图片，请点击保存试题确认');break;
 case 'basketMove':{const [i,d]=id.split(':'),a=Number(i),b=a+(d==='up'?-1:1);if(b>=0&&b<data.basket.length){[data.basket[a],data.basket[b]]=[data.basket[b],data.basket[a]];save();render()}break}
 case 'clearBasket':if(data.basket.length&&confirm('确定清空临时选题篮吗？')){data.basket=[];save();render()}break;
 case 'prevPage':listPage=Math.max(0,listPage-1);render();break;
 case 'nextPage':listPage++;render();break;
 case 'clearFilter':filter={text:'',subject:'全部',series:'全部',type:'全部',level:'全部',year:'全部',favorite:false};listPage=0;render();break;
 case 'previewPaper':syncPaperForm();previewPaper(id);break;
 case 'editPaper':paperEditor(id);break;
 case 'printPaper':doPrint(id);break;
 case 'paperMove':{syncPaperForm();const [i,dir]=id.split(':'),x=p(paperFocus);const a=Number(i),b=a+(dir==='up'?-1:1);if(x&&b>=0&&b<x.items.length)[x.items[a],x.items[b]]=[x.items[b],x.items[a]];save();paperEditor(paperFocus);break}
 case 'paperRemove':{syncPaperForm();const x=p(paperFocus);if(x&&confirm('从此试卷移除这道题？')){x.items.splice(Number(id),1);save();paperEditor(paperFocus)}break}
 case 'duplicatePaper':{const x=p(id);if(x){const copy=JSON.parse(JSON.stringify(x));copy.id=uid();copy.title+='（副本）';copy.createdAt=when();data.papers.push(copy);save();render();alertBox('试卷副本已创建')}break}
 case 'deletePaper':if(confirm('删除此套试卷？历史模考记录仍会保留。')){data.papers=data.papers.filter(x=>x.id!==id);if(data.exam?.paperId===id){data.exam=null}save();render()}break;
 case 'startExam':closeModal();makeExam(id);break;
 case 'finishExam':finishExam();break;
 case 'discardExam':if(confirm('舍弃未交卷的全部作答？')){data.exam=null;save();render()}break;
 case 'viewRecord':recordFocus=id;nav('exam');break;
 case 'closeRecord':recordFocus='';render();break;
 case 'deleteRecord':if(confirm('删除这次考试记录？错题统计会随之变化。')){data.records=data.records.filter(x=>x.id!==id);save();render()}break;
 case 'wrongPaper':addWrongPaper();break;
 case 'downloadBackup':backup();break;
 case 'downloadQuestions':download('研记模拟卷版_试题库.json',JSON.stringify({kind:'yanji.mock.questions.v1',questions:data.questions},null,2));break;
 case 'downloadCsv':download('研记模拟卷版_试题库.csv',csvExport(),'text/csv;charset=utf-8');break;
 case 'importText':try{cleanImported(JSON.parse(v('jsonText')))}catch(err){alertBox('导入失败：'+err.message,'error')}break;
 case 'savePreferences':data.preferences.subject=v('prefSubject');data.preferences.paperDuration=Math.max(1,Math.min(600,num(v('prefDuration'),180)));save();render();alertBox('默认设置已保存');break;
 case 'clearAll':if(confirm('删除本项目全部本地数据？这个操作不能撤销，请确认已有备份。')&&confirm('最后确认：清除题库、所有试卷及成绩？')){data=EMPTY();save(0);nav('overview');alertBox('数据已清空')}break;
 case 'loadSample':fetch('./sample-questions.json').then(r=>{if(!r.ok)throw Error('文件不可用');return r.json()}).then(cleanImported).catch(err=>alertBox('示例题读取失败：'+err.message,'error'));break;
 case 'nothing':break;
 default:break;
}}
function handleSubmit(e){const form=e.target;if(!['filterForm','questionForm','basketPaperForm','autoForm','paperForm','scoreForm'].includes(form.id))return;e.preventDefault();try{
 if(form.id==='filterForm'){filter={text:v('search'),subject:v('subject'),series:v('series'),type:v('type'),level:v('level'),year:v('year'),favorite:!!$('#favOnly')?.checked};listPage=0;render()}
 if(form.id==='questionForm'){const old=q(editingQuestion),x=cleanQuestion({id:old?.id||uid(),subject:v('qSubject'),series:v('qSeries'),type:v('qType'),level:v('qLevel'),year:v('qYear'),source:v('qSource'),chapter:v('qChapter'),points:v('qPoints'),tags:v('qTags').split(/[,，、]/).map(s=>s.trim()).filter(Boolean),stem:v('qStem'),options:[0,1,2,3].map(i=>v('qOpt'+i)),answer:v('qAnswer'),explanation:v('qExplanation'),image:imageDraft,createdAt:old?.createdAt,favorite:old?.favorite});if(!x)throw Error('题干不能为空');if(old)Object.assign(old,x);else data.questions.push(x);save();closeModal();render();alertBox('试题保存成功')}
 if(form.id==='basketPaperForm'){let selected=data.basket.map(q).filter(Boolean);if(!selected.length)throw Error('题篮不能为空');const px=makePaper(v('basketTitle'),selected,{size:v('basketSize'),duration:num(v('basketDuration'),180),blank:num(v('basketBlank'),35),subject:selected[0].subject});data.papers.push(px);data.basket=[];save();nav('papers');alertBox('新试卷已创建，可编辑或打印')}
 if(form.id==='autoForm')smartPaper(form);
 if(form.id==='paperForm'){syncPaperForm();closeModal();render();alertBox('试卷排版与分值已保存')}
 if(form.id==='scoreForm'){const r=data.records.find(x=>x.id===form.dataset.record);if(!r)return;r.items.forEach((it,i)=>{it.score=Math.max(0,Math.min(num(it.points),num(v('score_'+i))));it.reason=v('reason_'+i).slice(0,4000)});save();render();alertBox('评分已保存；错题本与统计同步更新')}
 }catch(err){alertBox('操作失败：'+err.message,'error')}}
function onChange(e){const el=e.target;try{
 if(el.id==='sort'){sort=el.value;render()}
 if(el.id==='imageUpload'&&el.files?.[0]){compressImage(el.files[0]).then(encoded=>{imageDraft=encoded;alertBox('图片压缩完成，请点击「保存试题」')}).catch(err=>alertBox(err.message,'error'))}
 if(el.id==='questionsUpload'&&el.files?.[0]){const file=el.files[0];file.text().then(t=>cleanImported(file.name.toLowerCase().endsWith('.csv')?parseCsv(t):JSON.parse(t))).catch(err=>alertBox('导入失败：'+err.message,'error'));el.value=''}
 if(el.id==='backupUpload'&&el.files?.[0]){el.files[0].text().then(restore).catch(err=>alertBox('备份恢复失败：'+err.message,'error'));el.value=''}
 if(el.classList.contains('answerChoice')&&data.exam){const id=el.dataset.id,px=p(data.exam.paperId),it=px?.items.find(x=>x.id===id),x=snapshot(it);if(x?.type==='多选题'){const checked=$$('.answerChoice').filter(node=>node.dataset.id===id&&node.checked).map(node=>node.value).join('');saveAnswer(id,checked)}else saveAnswer(id,el.value)}
 if(el.classList.contains('markExam')&&data.exam){data.exam.marked[el.dataset.id]=!!el.checked;const px=p(data.exam.paperId),index=px?.items.findIndex(it=>it.id===el.dataset.id);if(index>=0)document.querySelectorAll('.answer-number')[index]?.classList.toggle('flagged',!!el.checked);save()}
 }catch(err){alertBox(err.message,'error')}}
document.addEventListener('click',e=>{const t=e.target.closest('[data-action]');if(!t)return;handleAction(t.dataset.action,t.dataset.id||'')});
document.addEventListener('submit',handleSubmit);
document.addEventListener('change',onChange);
document.addEventListener('input',e=>{const el=e.target;if(el.classList.contains('freeAnswer')&&data.exam)saveAnswer(el.dataset.id,el.value)});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#modal').hidden)closeModal()});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&saveTimer){clearTimeout(saveTimer);save(0)}});
window.addEventListener('pagehide',()=>{if(saveTimer){clearTimeout(saveTimer);save(0)}});
setInterval(()=>{if(tab==='exam'&&data.exam)tick()},1000);
window.addEventListener('yanji-katex-ready',()=>{if(isReady && !data.exam){render();if(modalState){const id=modalState.split(':').slice(1).join(':');if(id)detail(id,modalState.split(':')[0])}}});
(async()=>{try{db=await openDB();const stored=await readDB();if(stored&&typeof stored==='object'){data={...EMPTY(),...stored};for(const name of ['questions','basket','papers','records'])if(!Array.isArray(data[name]))data[name]=[];data.preferences={...EMPTY().preferences,...(data.preferences||{})}}isReady=true;render();if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});}catch(err){isReady=true;render();alertBox('无法开启本地存储，请确认 Safari 未禁止网站数据：'+err.message,'error')}})();
})();