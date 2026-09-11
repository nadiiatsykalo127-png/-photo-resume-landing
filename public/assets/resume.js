const $ = id => document.getElementById(id);
const fresh = () => ({profile:"civilian",mode:"basic",template:"stylish",photo:"",name:"",englishGivenName:"",englishSurname:"",role:"",email:"",phone:"",city:"",linkedin:"",summary:"",skills:"",education:"",vacancy:"",languages:[newLanguage()],experience:[newExperience()]});
function newExperience(){return {id:crypto.randomUUID(),kind:"civilian",position:"",company:"",city:"",start:"",end:"",current:false,duties:""}}
function newLanguage(){return {id:crypto.randomUUID(),language:"",level:""}}
let state=fresh();
let englishCv=null;
try{const saved=JSON.parse(localStorage.getItem("careerResumeDraftV2"));if(saved)state={...state,...saved,photo:"",languages:Array.isArray(saved.languages)&&saved.languages.length?saved.languages:state.languages,experience:Array.isArray(saved.experience)&&saved.experience.length?saved.experience:state.experience}}catch{}

const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const cleanItem=value=>String(value||"").trim().replace(/^\s*[•●▪◦-]\s*/,"").trim();
const lines=value=>String(value||"").split(/\n|,/).map(cleanItem).filter(Boolean);
const lowerInitial=value=>{const text=String(value||"");if(text.length>3&&text===text.toLocaleUpperCase("uk-UA"))return text.toLocaleLowerCase("uk-UA");return text?text[0].toLocaleLowerCase("uk-UA")+text.slice(1):text};
const normalizeCity=value=>String(value||"").replace(/Днепр|Киев/giu,match=>({днепр:"Дніпро",киев:"Київ"}[match.toLocaleLowerCase("uk-UA")]||match));
function naturalSkills(value){const items=lines(value);if(!items.length)return"";return items.map((item,index)=>index?lowerInitial(item):item[0].toLocaleUpperCase("uk-UA")+item.slice(1)).join(", ").replace(/[.;,\s]+$/,"")+"."}
function save(){try{localStorage.setItem("careerResumeDraftV2",JSON.stringify({...state,photo:""}))}catch{}renderPreview()}
function bindField(id,key){$(id).value=state[key]||"";$(id).addEventListener("input",e=>{state[key]=e.target.value;save()})}
function bindDutyBullets(textarea,item){
  textarea.addEventListener("focus",()=>{if(!textarea.value){textarea.value="• ";item.duties=textarea.value;save();textarea.setSelectionRange(2,2)}});
  textarea.addEventListener("keydown",event=>{
    if(event.key!=="Enter"||event.shiftKey)return;
    event.preventDefault();const start=textarea.selectionStart,end=textarea.selectionEnd,before=textarea.value.slice(0,start),after=textarea.value.slice(end);
    const current=before.slice(before.lastIndexOf("\n")+1).trim(),insertion=current==="•"?"\n":"\n• ";textarea.value=before+insertion+after;
    const caret=start+insertion.length;textarea.setSelectionRange(caret,caret);item.duties=textarea.value;save();
  });
}

document.querySelectorAll(".profile").forEach(button=>button.addEventListener("click",()=>{
  state.profile=button.dataset.type;
  $("profiles").hidden=true;$("builder").classList.add("active");
  $("builderTitle").textContent={civilian:"Цивільне резюме",civilian_military:"Цивільний + військовий досвід",medical:"Резюме медичного працівника"}[state.profile];
  if(state.profile==="civilian_military"&&!state.experience.some(x=>x.kind==="military"))state.experience.push({...newExperience(),kind:"military"});
  renderExperiences();save();window.scrollTo({top:0,behavior:"smooth"});
}));

["name","englishGivenName","englishSurname","role","email","phone","city","linkedin","summary","skills","education","vacancy"].forEach(id=>bindField(id,id));

document.querySelectorAll("[data-mode]").forEach(btn=>btn.addEventListener("click",()=>{state.mode=btn.dataset.mode;document.querySelectorAll("[data-mode]").forEach(x=>x.classList.toggle("active",x===btn));$("vacancySection").hidden=state.mode!=="vacancy";save()}));
document.querySelectorAll("[data-template]").forEach(btn=>btn.addEventListener("click",()=>{state.template=btn.dataset.template;document.querySelectorAll("[data-template]").forEach(x=>x.classList.toggle("active",x===btn));$("paper").className=`paper ${state.template}`;save()}));

const resumeProfileTitles={civilian:"Цивільне резюме",civilian_military:"Цивільний + військовий досвід",medical:"Резюме медичного працівника"};
function setDocumentView(view){
  const english=view==="english";
  $("builder").classList.toggle("document-english",english);
  document.querySelectorAll("[data-document]").forEach(button=>button.classList.toggle("active",button.dataset.document===view));
  $("builderTitle").textContent=english?"CV англійською":resumeProfileTitles[state.profile];
  if(english)$("englishCvStatus").hidden=true;
}
document.querySelectorAll("[data-document]").forEach(button=>button.addEventListener("click",()=>{
  setDocumentView(button.dataset.document);
  window.scrollTo({top:0,behavior:"smooth"});
}));

function renderLanguages(){
  const levels=["Native","C2 — Proficient","C1 — Advanced","B2 — Upper-Intermediate","B1 — Intermediate","A2 — Elementary","A1 — Beginner"];
  $("languageList").innerHTML=state.languages.map(item=>`<div class="language-row" data-language-id="${esc(item.id)}"><input data-language-field="language" value="${esc(item.language)}" placeholder="Наприклад: English"><select data-language-field="level"><option value="">Оберіть рівень</option>${levels.map(level=>`<option value="${esc(level)}" ${item.level===level?"selected":""}>${esc(level)}</option>`).join("")}</select><button type="button" class="remove-entry" data-remove-language="${esc(item.id)}" ${state.languages.length===1?"hidden":""}>Видалити</button></div>`).join("");
  document.querySelectorAll("[data-language-id]").forEach(row=>{const item=state.languages.find(x=>x.id===row.dataset.languageId);row.querySelectorAll("[data-language-field]").forEach(el=>el.addEventListener("input",event=>{item[event.target.dataset.languageField]=event.target.value;$("confirmEnglishWarnings").checked=false;save()}))});
  document.querySelectorAll("[data-remove-language]").forEach(button=>button.addEventListener("click",()=>{state.languages=state.languages.filter(x=>x.id!==button.dataset.removeLanguage);if(!state.languages.length)state.languages=[newLanguage()];renderLanguages();save()}));
}
$("addLanguage").addEventListener("click",()=>{state.languages.push(newLanguage());renderLanguages();save()});

function renderExperiences(){
  $("experienceList").innerHTML=state.experience.map((item,index)=>`<article class="experience-card" data-id="${esc(item.id)}">
    <div class="experience-top"><b>Досвід ${index+1}</b><button class="remove-entry" data-remove="${esc(item.id)}" ${state.experience.length===1?"hidden":""}>Видалити</button></div>
    ${state.profile==="civilian_military"?`<div class="kind-toggle"><button data-kind="civilian" class="${item.kind!=="military"?"active":""}">Цивільний</button><button data-kind="military" class="${item.kind==="military"?"active":""}">Військовий</button></div>`:""}
    <div class="form"><div class="field full focus-field"><label>${item.kind==="military"?"Військова посада / роль":"Посада / роль"}</label><input data-exp="position" value="${esc(item.position)}" placeholder="Наприклад: менеджер, бойовий медик"></div>
    <div class="field"><label>${item.kind==="military"?"Рід військ":"Компанія / підрозділ"}</label><input data-exp="company" value="${esc(item.company)}"></div><div class="field"><label>${item.kind==="military"?"Звання":"Місто"}</label><input data-exp="city" value="${esc(item.city)}"></div>
    <div class="field"><label>Початок</label><input data-exp="start" value="${esc(item.start)}" placeholder="01.2022"></div><div class="field"><label>Завершення</label><input data-exp="end" value="${esc(item.end)}" placeholder="дотепер"></div></div>
    <div class="ai-block"><div class="ai-heading"><label>Обов’язки та досягнення</label><button class="mini-ai" data-functions="${esc(item.id)}">✦ Запропонувати за посадою</button></div><textarea data-exp="duties" placeholder="AI запропонує варіанти, які ви зможете змінити">${esc(item.duties)}</textarea>${item.kind==="military"?'<p class="small military-note">Не вказуйте номер частини, місце служби, операції чи інші чутливі дані. AI перекладе фактичний досвід цивільною мовою за українськими ветеранськими методиками.</p>':""}</div>
  </article>`).join("");
  document.querySelectorAll(".experience-card").forEach(card=>{
    const item=state.experience.find(x=>x.id===card.dataset.id);
    card.querySelectorAll("[data-exp]").forEach(el=>el.addEventListener("input",e=>{item[e.target.dataset.exp]=e.target.value;save()}));
    bindDutyBullets(card.querySelector('[data-exp="duties"]'),item);
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
  $("paper").className=`paper ${state.template}`;$("pName").textContent=state.name||"Ваше ім’я";$("pRole").textContent=state.role?`Мета: ${state.role}`:"Мета: бажана посада";
  $("pContact").textContent=[state.email,state.phone,state.city,state.linkedin].filter(Boolean).join(" • ")||"email • телефон • місто";
  previewText("pSummary",state.summary,"AI допоможе сформулювати цей розділ");previewText("pEducation",state.education,"Заповніть освіту");
  const skills=naturalSkills(state.skills);$("pSkills").className=skills?"":"empty";$("pSkills").textContent=skills||"AI допоможе скласти перелік";
  const filled=state.experience.filter(x=>x.position||x.company||x.duties);$("pExperience").className=filled.length?"":"empty";$("pExperience").innerHTML=filled.length?filled.map(x=>`<div class="paper-job"><b>${esc(x.position||"Посада")}</b><span>${esc([x.company,x.city].filter(Boolean).join(", "))}</span><small>${esc([x.start,x.end].filter(Boolean).join(" — "))}</small><p>${esc(x.duties).replace(/\n/g,"<br>")}</p></div>`).join(""):"Додайте посаду або місце роботи";
  const photo=$("pPhoto");photo.hidden=!state.photo;$("pPhotoImage").src=state.photo||"";
}
function previewText(id,value,placeholder){const el=$(id);el.className=value?"":"empty";el.textContent=value||placeholder}
function showStatus(message,error=false){const el=$("aiStatus");el.hidden=false;el.textContent=message;el.className=`status ${error?"error":""}`}
async function askAI(action,extra={},button){
  if(action!=="proofread"&&!state.role)throw new Error("Спочатку вкажіть бажану посаду.");
  if(action==="proofread"&&![state.role,state.city,state.summary,state.skills,state.education,...state.experience.flatMap(x=>[x.position,x.duties])].some(value=>String(value||"").trim()))throw new Error("Спочатку заповніть хоча б один текстовий розділ.");
  if(action==="adapt"&&!state.vacancy.trim())throw new Error("Спочатку вставте текст вакансії.");
  const old=button?.textContent;if(button){button.disabled=true;button.textContent="Зачекайте…"}showStatus("AI готує варіант. Ви зможете його відредагувати.");
  try{const payload={profile:state.profile,action,data:{name:state.name,englishGivenName:state.englishGivenName,englishSurname:state.englishSurname,role:state.role,email:state.email,phone:state.phone,city:state.city,linkedin:state.linkedin,summary:state.summary,skills:state.skills,education:state.education,languages:state.languages.filter(x=>x.language||x.level),experience:state.experience.map(({photo,...x})=>x)},vacancy:state.vacancy,...extra};const response=await fetch("/api/resume/assist",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});const result=await response.json();if(!response.ok)throw new Error(result.error||"AI тимчасово недоступний.");showStatus("Готово. Перевірте й відредагуйте пропозицію.");return result}finally{if(button){button.disabled=false;button.textContent=old}}}
async function run(action,button,apply){try{apply(await askAI(action,{},button));save()}catch(error){showStatus(error.message,true)}}
$("generateSummary").addEventListener("click",()=>run("summary",$("generateSummary"),result=>{$("summary").value=state.summary=result.summary||""}));
$("generateSkills").addEventListener("click",()=>run("skills",$("generateSkills"),result=>{$("skills").value=state.skills=[...(result.hardSkills||[]),...(result.softSkills||[])].join("\n")}));
async function generateFunctions(id,button){const item=state.experience.find(x=>x.id===id);try{const result=await askAI("functions",{experience:item},button);item.duties=(result.functions||[]).map(x=>`• ${x}`).join("\n");renderExperiences();save()}catch(error){showStatus(error.message,true)}}
$("adaptVacancy").addEventListener("click",()=>run("adapt",$("adaptVacancy"),result=>{
  if(result.summary)$("summary").value=state.summary=result.summary;
  if(result.skills?.length)$("skills").value=state.skills=result.skills.join("\n");
  if(Array.isArray(result.experience)){for(const suggestion of result.experience){const item=state.experience.find(x=>x.id===suggestion.id);if(item&&Array.isArray(suggestion.functions))item.duties=suggestion.functions.map(x=>`• ${cleanItem(x)}`).join("\n")}renderExperiences()}
}));

$("proofread").addEventListener("click",()=>run("proofread",$("proofread"),result=>{
  if(typeof result.role==="string")$("role").value=state.role=result.role;
  $("city").value=state.city=normalizeCity(typeof result.city==="string"?result.city:state.city);
  if(typeof result.summary==="string")$("summary").value=state.summary=result.summary;
  if(typeof result.skills==="string")$("skills").value=state.skills=result.skills;
  if(typeof result.education==="string")$("education").value=state.education=result.education;
  if(Array.isArray(result.experience)){for(const corrected of result.experience){const item=state.experience.find(x=>x.id===corrected.id);if(!item)continue;if(typeof corrected.position==="string")item.position=corrected.position;if(typeof corrected.city==="string")item.city=corrected.city;if(typeof corrected.duties==="string")item.duties=corrected.duties;item.city=normalizeCity(item.city)}renderExperiences()}
  showStatus("Орфографію перевірено. Перегляньте виправлення перед завантаженням.");
}));

function markRequired(id,invalid){const element=$(id);if(element)element.closest(".field")?.classList.toggle("field-invalid",invalid)}
function validateEnglishCv(){
  document.querySelectorAll(".experience-card").forEach(card=>card.classList.remove("card-invalid"));
  const errors=[];
  const required=[
    ["englishGivenName",!state.englishGivenName.trim()||/[А-Яа-яІіЇїЄєҐґ]/.test(state.englishGivenName),"Вкажіть ім’я латиницею як у полі Given names."],
    ["englishSurname",!state.englishSurname.trim()||/[А-Яа-яІіЇїЄєҐґ]/.test(state.englishSurname),"Вкажіть прізвище латиницею як у полі Surname."],
    ["role",!state.role.trim(),"Вкажіть бажану посаду."],
    ["email",!state.email.trim()||!$("email").checkValidity(),"Вкажіть коректний email."],
    ["phone",!/^\+[\d\s()\-]{8,}$/.test(state.phone.trim()),"Вкажіть телефон у міжнародному форматі, наприклад +380 99 000 00 00."]
  ];
  for(const [id,invalid,message] of required){markRequired(id,invalid);if(invalid)errors.push(message)}
  const used=state.experience.filter(item=>[item.position,item.company,item.start,item.end,item.duties].some(value=>String(value||"").trim()));
  if(!used.length)errors.push("Додайте хоча б один блок досвіду роботи.");
  for(const item of used){
    const missing=[];if(!item.position.trim())missing.push("посаду");if(!item.company.trim())missing.push("компанію або Various Companies");if(!item.start.trim())missing.push("початок");if(!item.end.trim())missing.push("завершення або дотепер");if(!cleanItem(item.duties))missing.push("обов’язки");
    if(missing.length){errors.push(`Досвід роботи: заповніть ${missing.join(", ")}.`);document.querySelector(`.experience-card[data-id="${CSS.escape(item.id)}"]`)?.classList.add("card-invalid")}
  }
  const languageErrors=state.languages.filter(x=>(x.language&&!x.level)||(!x.language&&x.level));
  if(languageErrors.length)errors.push("Для кожної доданої мови вкажіть і назву, і рівень.");
  const box=$("englishRequiredErrors");box.hidden=!errors.length;box.innerHTML=errors.length?`<b>Заповніть обов’язкові дані:</b><ul>${errors.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`:"";
  const warnings=[];if(!state.linkedin.trim())warnings.push("Не вказано LinkedIn.");if(!state.photo)warnings.push("Не додано фотографію — версія без фото все одно буде доступна.");if(!state.education.trim())warnings.push("Не заповнено освіту.");if(!state.languages.some(x=>x.language&&x.level))warnings.push("Не додано жодної мови.");if(used.length===1)warnings.push("Вказано одне місце роботи. За потреби додайте або об’єднайте попередній релевантний досвід.");
  const warningBox=$("englishWarnings");warningBox.hidden=!warnings.length;warningBox.innerHTML=warnings.length?`<b>Перевірте необов’язкові дані:</b><ul>${warnings.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`:"";
  $("englishWarningConfirmRow").hidden=!warnings.length;
  return {valid:!errors.length,warnings};
}
$("generateEnglishCv").addEventListener("click",async()=>{
  const button=$("generateEnglishCv");
  try{
    const check=validateEnglishCv();if(!check.valid)throw new Error("Заповніть поля, підсвічені червоним.");
    if(check.warnings.length&&!$("confirmEnglishWarnings").checked)throw new Error("Перегляньте жовті попередження та підтвердьте продовження.");
    englishCv=await askAI("english_cv",{},button);
    if(!englishCv||typeof englishCv!=="object")throw new Error("Не вдалося створити English CV.");
    if(Array.isArray(englishCv.languages)&&englishCv.languages.length){state.languages=englishCv.languages.filter(x=>x?.language&&x?.level).map(x=>({...newLanguage(),language:x.language,level:x.level}));renderLanguages();save()}
    $("englishCvStatus").hidden=false;$("englishCvStatus").className="status";$("englishCvStatus").textContent="English CV створено. Завантажте файли та перевірте переклад.";
    $("englishCvDownloads").hidden=false;
    $("englishPdfPhoto").hidden=!state.photo;$("englishDocPhoto").hidden=!state.photo;
  }catch(error){$("englishCvStatus").hidden=false;$("englishCvStatus").textContent=error.message;$("englishCvStatus").className="status error"}
});

async function downloadEnglishCv(format,withPhoto,button){
  if(!englishCv)return showStatus("Спочатку створіть тестове CV англійською.",true);
  const old=button.textContent;button.disabled=true;button.textContent="Готуємо…";
  try{
    const payload={...englishCv,profile:state.profile,template:state.template,language:"en",photo:withPhoto?state.photo:""};
    const response=await fetch(`/api/resume/${format}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    if(!response.ok){let message="Не вдалося створити файл.";try{message=(await response.json()).error||message}catch{}throw new Error(message)}
    const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download=`english-cv-${withPhoto?"with-photo":"without-photo"}.${format}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    showStatus("English CV завантажено. Перевірте текст і оформлення.");
  }catch(error){showStatus(error.message,true)}finally{button.disabled=false;button.textContent=old}
}
$("englishPdfPhoto").addEventListener("click",()=>downloadEnglishCv("pdf",true,$("englishPdfPhoto")));
$("englishDocPhoto").addEventListener("click",()=>downloadEnglishCv("docx",true,$("englishDocPhoto")));
$("englishPdfNoPhoto").addEventListener("click",()=>downloadEnglishCv("pdf",false,$("englishPdfNoPhoto")));
$("englishDocNoPhoto").addEventListener("click",()=>downloadEnglishCv("docx",false,$("englishDocNoPhoto")));

async function downloadResume(format,button){
  const old=button.textContent;button.disabled=true;button.textContent="Готуємо…";showStatus(`Створюємо ${format.toUpperCase()} з вашим оформленням.`);
  try{const response=await fetch(`/api/resume/${format}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(state)});if(!response.ok){let message="Не вдалося створити файл.";try{message=(await response.json()).error||message}catch{}throw new Error(message)}const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`nadinartdigital.com.ua.${format}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);showStatus("Файл готовий. Перевірте папку завантажень.")}
  catch(error){showStatus(error.message,true)}finally{button.disabled=false;button.textContent=old}
}
$("pdf").addEventListener("click",()=>downloadResume("pdf",$("pdf")));
$("doc").addEventListener("click",()=>downloadResume("docx",$("doc")));
$("clear").addEventListener("click",()=>{if(!confirm("Очистити всі дані резюме?"))return;state=fresh();localStorage.removeItem("careerResumeDraftV2");location.reload()});

document.querySelector(`[data-mode="${state.mode}"]`)?.click();
document.querySelector(`[data-template="${state.template}"]`)?.click();
renderExperiences();renderLanguages();renderPhoto();renderPreview();

const entryParams=new URLSearchParams(window.location.search);
const requestedProfile=entryParams.get("profile");
const requestedDocument=entryParams.get("document");
const validProfiles=["civilian","civilian_military","medical"];
if(validProfiles.includes(requestedProfile)){
  document.querySelector(`.profile[data-type="${requestedProfile}"]`)?.click();
}else if(requestedDocument==="english"){
  document.querySelector('.profile[data-type="civilian"]')?.click();
  document.querySelector('[data-document="english"]')?.click();
}
