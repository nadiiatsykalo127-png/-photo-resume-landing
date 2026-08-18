const $ = id => document.getElementById(id);
const fresh = () => ({profile:"civilian",mode:"basic",template:"stylish",photo:"",name:"",role:"",email:"",phone:"",city:"",linkedin:"",summary:"",skills:"",education:"",vacancy:"",experience:[newExperience()]});
function newExperience(){return {id:crypto.randomUUID(),kind:"civilian",position:"",company:"",city:"",start:"",end:"",current:false,duties:""}}
let state=fresh();
try{const saved=JSON.parse(localStorage.getItem("careerResumeDraftV2"));if(saved)state={...state,...saved,photo:"",experience:Array.isArray(saved.experience)&&saved.experience.length?saved.experience:state.experience}}catch{}

const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const lines=value=>String(value||"").split(/\n|,/).map(v=>v.trim()).filter(Boolean);
function save(){try{localStorage.setItem("careerResumeDraftV2",JSON.stringify({...state,photo:""}))}catch{}renderPreview()}
function bindField(id,key){$(id).value=state[key]||"";$(id).addEventListener("input",e=>{state[key]=e.target.value;save()})}

document.querySelectorAll(".profile").forEach(button=>button.addEventListener("click",()=>{
  state.profile=button.dataset.type;
  $("profiles").hidden=true;$("builder").classList.add("active");
  $("builderTitle").textContent={civilian:"Цивільне резюме",civilian_military:"Цивільний + військовий досвід",medical:"Резюме медичного працівника"}[state.profile];
  if(state.profile==="civilian_military"&&!state.experience.some(x=>x.kind==="military"))state.experience.push({...newExperience(),kind:"military"});
  renderExperiences();save();window.scrollTo({top:0,behavior:"smooth"});
}));

["name","role","email","phone","city","linkedin","summary","skills","education","vacancy"].forEach(id=>bindField(id,id));

document.querySelectorAll("[data-mode]").forEach(btn=>btn.addEventListener("click",()=>{state.mode=btn.dataset.mode;document.querySelectorAll("[data-mode]").forEach(x=>x.classList.toggle("active",x===btn));$("vacancySection").hidden=state.mode!=="vacancy";save()}));
document.querySelectorAll("[data-template]").forEach(btn=>btn.addEventListener("click",()=>{state.template=btn.dataset.template;document.querySelectorAll("[data-template]").forEach(x=>x.classList.toggle("active",x===btn));$("paper").className=`paper ${state.template}`;save()}));

function renderExperiences(){
  $("experienceList").innerHTML=state.experience.map((item,index)=>`<article class="experience-card" data-id="${esc(item.id)}">
    <div class="experience-top"><b>Досвід ${index+1}</b><button class="remove-entry" data-remove="${esc(item.id)}" ${state.experience.length===1?"hidden":""}>Видалити</button></div>
    ${state.profile==="civilian_military"?`<div class="kind-toggle"><button data-kind="civilian" class="${item.kind!=="military"?"active":""}">Цивільний</button><button data-kind="military" class="${item.kind==="military"?"active":""}">Військовий</button></div>`:""}
    <div class="form"><div class="field full focus-field"><label>Посада / роль</label><input data-exp="position" value="${esc(item.position)}" placeholder="Наприклад: менеджер, бойовий медик"></div>
    <div class="field"><label>Компанія / підрозділ</label><input data-exp="company" value="${esc(item.company)}"></div><div class="field"><label>Місто</label><input data-exp="city" value="${esc(item.city)}"></div>
    <div class="field"><label>Початок</label><input data-exp="start" value="${esc(item.start)}" placeholder="01.2022"></div><div class="field"><label>Завершення</label><input data-exp="end" value="${esc(item.end)}" placeholder="дотепер"></div></div>
    <div class="ai-block"><div class="ai-heading"><label>Обов’язки та досягнення</label><button class="mini-ai" data-functions="${esc(item.id)}">✦ Запропонувати за посадою</button></div><textarea data-exp="duties" placeholder="AI запропонує варіанти, які ви зможете змінити">${esc(item.duties)}</textarea></div>
  </article>`).join("");
  document.querySelectorAll(".experience-card").forEach(card=>{
    const item=state.experience.find(x=>x.id===card.dataset.id);
    card.querySelectorAll("[data-exp]").forEach(el=>el.addEventListener("input",e=>{item[e.target.dataset.exp]=e.target.value;save()}));
    card.querySelectorAll("[data-kind]").forEach(el=>el.addEventListener("click",()=>{item.kind=el.dataset.kind;renderExperiences();save()}));
  });
  document.querySelectorAll("[data-remove]").forEach(el=>el.addEventListener("click",()=>{state.experience=state.experience.filter(x=>x.id!==el.dataset.remove);renderExperiences();save()}));
  document.querySelectorAll("[data-functions]").forEach(el=>el.addEventListener("click",()=>generateFunctions(el.dataset.functions,el)));
}
$("addExperience").addEventListener("click",()=>{state.experience.push(newExperience());renderExperiences();save()});

$("resumePhoto").addEventListener("change",event=>{const file=event.target.files[0];if(!file)return;if(file.size>5*1024*1024){showStatus("Фото має бути до 5 МБ.",true);return}const reader=new FileReader();reader.onload=()=>{state.photo=reader.result;renderPhoto();renderPreview()};reader.readAsDataURL(file)});
$("removePhoto").addEventListener("click",()=>{state.photo="";$("resumePhoto").value="";renderPhoto();renderPreview()});
function renderPhoto(){const thumb=$("photoThumb");if(state.photo){thumb.style.backgroundImage=`url(${state.photo})`;thumb.textContent="";$("photoLabel").textContent="Змінити фото";$("removePhoto").hidden=false}else{thumb.style.backgroundImage="";thumb.textContent="＋";$("photoLabel").textContent="Завантажити фото";$("removePhoto").hidden=true}}

function renderPreview(){
  $("paper").className=`paper ${state.template}`;$("pName").textContent=state.name||"Ваше ім’я";$("pRole").textContent=state.role||"Бажана посада";
  $("pContact").textContent=[state.email,state.phone,state.city,state.linkedin].filter(Boolean).join(" • ")||"email • телефон • місто";
  previewText("pSummary",state.summary,"AI допоможе сформулювати цей розділ");previewText("pEducation",state.education,"Заповніть освіту");
  const skillItems=lines(state.skills);$("pSkills").className=skillItems.length?"skill-list":"empty";$("pSkills").innerHTML=skillItems.length?skillItems.map(x=>`<span>${esc(x)}</span>`).join(""):"AI допоможе скласти перелік";
  const filled=state.experience.filter(x=>x.position||x.company||x.duties);$("pExperience").className=filled.length?"":"empty";$("pExperience").innerHTML=filled.length?filled.map(x=>`<div class="paper-job"><b>${esc(x.position||"Посада")}</b><span>${esc([x.company,x.city].filter(Boolean).join(", "))}</span><small>${esc([x.start,x.end].filter(Boolean).join(" — "))}</small><p>${esc(x.duties).replace(/\n/g,"<br>")}</p></div>`).join(""):"Додайте посаду або місце роботи";
  const photo=$("pPhoto");photo.hidden=!state.photo;photo.style.backgroundImage=state.photo?`url(${state.photo})`:"";
}
function previewText(id,value,placeholder){const el=$(id);el.className=value?"":"empty";el.textContent=value||placeholder}
function showStatus(message,error=false){const el=$("aiStatus");el.hidden=false;el.textContent=message;el.className=`status ${error?"error":""}`}
async function askAI(action,extra={},button){
  if(!state.role&&action!=="adapt")throw new Error("Спочатку вкажіть бажану посаду.");
  const old=button?.textContent;if(button){button.disabled=true;button.textContent="Зачекайте…"}showStatus("AI готує варіант. Ви зможете його відредагувати.");
  try{const payload={profile:state.profile,action,data:{role:state.role,summary:state.summary,skills:state.skills,education:state.education,experience:state.experience.map(({photo,...x})=>x)},vacancy:state.vacancy,...extra};const response=await fetch("/api/resume/assist",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});const result=await response.json();if(!response.ok)throw new Error(result.error||"AI тимчасово недоступний.");showStatus("Готово. Перевірте й відредагуйте пропозицію.");return result}finally{if(button){button.disabled=false;button.textContent=old}}}
async function run(action,button,apply){try{apply(await askAI(action,{},button));save()}catch(error){showStatus(error.message,true)}}
$("generateSummary").addEventListener("click",()=>run("summary",$("generateSummary"),result=>{$("summary").value=state.summary=result.summary||""}));
$("generateSkills").addEventListener("click",()=>run("skills",$("generateSkills"),result=>{$("skills").value=state.skills=[...(result.hardSkills||[]),...(result.softSkills||[])].join("\n")}));
async function generateFunctions(id,button){const item=state.experience.find(x=>x.id===id);try{const result=await askAI("functions",{experience:item},button);item.duties=(result.functions||[]).map(x=>`• ${x}`).join("\n");renderExperiences();save()}catch(error){showStatus(error.message,true)}}
$("adaptVacancy").addEventListener("click",()=>run("adapt",$("adaptVacancy"),result=>{if(result.summary)$('summary').value=state.summary=result.summary;if(result.skills?.length)$('skills').value=state.skills=result.skills.join("\n")}));

$("pdf").addEventListener("click",()=>window.print());
$("doc").addEventListener("click",()=>{const html=`<!doctype html><meta charset="utf-8"><style>body{font-family:Arial;color:#23304a;max-width:760px;margin:40px auto;line-height:1.5}h1{color:#3155e8}h3{border-bottom:1px solid #ccd4e5;padding-bottom:5px}</style>${$("paper").outerHTML}`;const url=URL.createObjectURL(new Blob([html],{type:"application/msword"}));const a=document.createElement("a");a.href=url;a.download="resume.doc";a.click();URL.revokeObjectURL(url)});
$("clear").addEventListener("click",()=>{if(!confirm("Очистити всі дані резюме?"))return;state=fresh();localStorage.removeItem("careerResumeDraftV2");location.reload()});

document.querySelector(`[data-mode="${state.mode}"]`)?.click();document.querySelector(`[data-template="${state.template}"]`)?.click();renderExperiences();renderPhoto();renderPreview();
