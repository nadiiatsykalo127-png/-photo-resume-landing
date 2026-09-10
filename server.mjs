import express from "express";
import helmet from "helmet";
import multer from "multer";
import rateLimit from "express-rate-limit";
import sharp from "sharp";
import crypto from "node:crypto";
import path from "node:path";
import {fileURLToPath} from "node:url";
import fs from "node:fs/promises";
import {GoogleGenAI} from "@google/genai";
import {buildDocx,buildPdf} from "./resume-export.mjs";

const root=path.dirname(fileURLToPath(import.meta.url));
const app=express();
const port=Number(process.env.PORT||10000);
const baseUrl=(process.env.PUBLIC_BASE_URL||"http://localhost:10000").replace(/\/$/,"");
const dataDir=process.env.DATA_DIR||path.join(root,"data/private");
const monoPaymentMode=String(process.env.MONO_PAYMENT_MODE||"live").toLowerCase();
const getMonoToken=()=>monoPaymentMode==="test"?process.env.MONO_TEST_TOKEN:process.env.MONO_X_TOKEN;
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024},fileFilter:(_req,file,cb)=>cb(null,["image/jpeg","image/png","image/webp"].includes(file.mimetype))});
await fs.mkdir(dataDir,{recursive:true});
const metaPath=id=>path.join(dataDir,`${id}.json`);
const imagePath=(id,index)=>path.join(dataDir,`${id}-${index}.jpg`);
async function getJob(id){try{return JSON.parse(await fs.readFile(metaPath(id),"utf8"))}catch{return null}}
async function saveJob(id,job){await fs.writeFile(metaPath(id),JSON.stringify(job),{mode:0o600})}

app.set("trust proxy",1);
app.use(helmet({contentSecurityPolicy:false,crossOriginResourcePolicy:false}));
app.use(express.json({limit:"8mb",verify:(req,_res,buf)=>{req.rawBody=Buffer.from(buf)}}));
app.use("/api",rateLimit({windowMs:60_000,limit:30,standardHeaders:true,legacyHeaders:false}));
app.use("/assets",express.static(path.join(root,"public/assets"),{maxAge:"1d"}));
for(const image of ["before.jpg","after1.jpg","after2.jpg","after3.jpg","veteran-handshake.jpg"]){app.get(`/${image}`,(_req,res)=>res.sendFile(path.join(root,image)))}

app.get("/health",(_req,res)=>res.json({ok:true}));
app.get("/",(_req,res)=>res.redirect(302,"/career"));
app.get("/career",(_req,res)=>res.sendFile(path.join(root,"index.html")));
app.get("/career/photo",(_req,res)=>res.sendFile(path.join(root,"public/photo.html")));
app.get("/career/resume",(_req,res)=>res.sendFile(path.join(root,"public/resume.html")));
app.get("/career/oferta",(_req,res)=>res.sendFile(path.join(root,"oferta.html")));
app.get("/career/privacy",(_req,res)=>res.sendFile(path.join(root,"privacy.html")));

app.post("/api/photo/generate",rateLimit({windowMs:10*60_000,limit:2,standardHeaders:true,legacyHeaders:false}),upload.single("photo"),async(req,res,next)=>{
 try{
  if(!req.file)return res.status(400).json({error:"Оберіть фото у форматі JPG, PNG або WEBP."});
  if(!process.env.GEMINI_API_KEY)return res.status(503).json({error:"Генерація буде доступна після підключення ключа AI."});
  const ai=new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY});
  const jobId=crypto.randomUUID();
  const prompt="Create a realistic professional resume headshot from this exact person. Preserve identity, facial proportions, skin tone, expression and hair. Remove glasses, hats and distracting jewelry only when present. Light blue clean studio background, soft even lighting, centered head and shoulders, vertical 3:4 composition. Dress the person in a plain white button-down business shirt only. No jacket, no blazer, no cardigan, no vest, no tie, and no dark outerwear. All three variations must use the same plain white shirt. Do not add text, logos or decorative elements.";
  const clean=[];
  for(let i=0;i<3;i++){
   const result=await ai.interactions.create({model:process.env.GEMINI_IMAGE_MODEL||"gemini-3.1-flash-image",input:[{type:"text",text:`${prompt} Create variation ${i+1} with subtly different professional lighting.`},{type:"image",mime_type:req.file.mimetype,data:req.file.buffer.toString("base64")}],response_format:{type:"image",mime_type:"image/jpeg",aspect_ratio:"3:4",image_size:"1K"}});
   const output=result.output_image;
   if(!output?.data)throw new Error("AI did not return an image");
   clean.push(await sharp(Buffer.from(output.data,"base64")).resize(900,1200,{fit:"cover"}).jpeg({quality:94}).toBuffer());
  }
  const watermark=Buffer.from(`<svg width="900" height="1200"><style>.t{fill:white;font-size:46px;font-family:Arial;font-weight:700;opacity:.64}</style><g transform="rotate(-28 450 600)">${Array.from({length:8},(_,row)=>Array.from({length:3},(_,col)=>`<text class="t" x="${-80+col*410}" y="${180+row*170}">AI ДЛЯ КАР’ЄРИ</text>`).join("")).join("")}</g></svg>`);
  const previews=[];
  for(let i=0;i<clean.length;i++){const preview=await sharp(clean[i]).resize(900,1200,{fit:"cover"}).composite([{input:watermark,blend:"over"}]).jpeg({quality:78}).toBuffer();previews.push({id:String(i),data:`data:image/jpeg;base64,${preview.toString("base64")}`})}
  await Promise.all(clean.map((buffer,index)=>fs.writeFile(imagePath(jobId,index),buffer,{mode:0o600})));
  await saveJob(jobId,{selected:null,paid:false,createdAt:Date.now(),invoiceId:null});
  res.json({jobId,previews});
 }catch(error){next(error)}
});

app.post("/api/payment/create",async(req,res,next)=>{
 try{
  const {jobId,selectedId}=req.body||{};const job=await getJob(jobId);const index=Number(selectedId);
  if(!job||!Number.isInteger(index)||index<0||index>2)return res.status(404).json({error:"Результат не знайдено або термін зберігання минув."});
  if(job.paid)return res.json({paid:true,downloadUrl:`/api/photo/download/${jobId}`});
  if(job.invoiceId)return res.status(409).json({error:"Рахунок уже створено. Завершіть оплату у відкритому вікні або дочекайтеся оновлення статусу."});
  const monoToken=getMonoToken();
  if(!monoToken)return res.status(503).json({error:monoPaymentMode==="test"?"Тестовий токен Monobank не налаштований.":"Автоматична оплата буде доступна після активації Monobank API."});
  job.selected=index;
  const reference=`photo:${jobId}`;
  const mono=await fetch("https://api.monobank.ua/api/merchant/invoice/create",{method:"POST",headers:{"content-type":"application/json","X-Token":monoToken},body:JSON.stringify({amount:4900,ccy:980,merchantPaymInfo:{reference,destination:"Фото для резюме без водяного знака",basketOrder:[{name:"Фото для резюме",qty:1,sum:4900,unit:"шт.",code:"career-photo"}]},redirectUrl:`${baseUrl}/career/photo?order=${jobId}`,webHookUrl:`${baseUrl}/api/payment/webhook`})});
  const body=await mono.json();if(!mono.ok)throw new Error(body.errText||"Monobank не створив рахунок");job.invoiceId=body.invoiceId;await saveJob(jobId,job);res.json({pageUrl:body.pageUrl});
 }catch(error){next(error)}
});

let monoPublicKey=null;
async function getMonoPublicKey(){if(monoPublicKey)return monoPublicKey;const monoToken=getMonoToken();if(!monoToken)throw new Error("Monobank token is not configured");const response=await fetch("https://api.monobank.ua/api/merchant/pubkey",{headers:{"X-Token":monoToken}});if(!response.ok)throw new Error("Не вдалося отримати ключ Monobank");const {key}=await response.json();monoPublicKey=Buffer.from(key,"base64").toString("utf8");return monoPublicKey}
app.post("/api/payment/webhook",async(req,res,next)=>{try{const signature=req.get("X-Sign");if(!signature||!req.rawBody)return res.sendStatus(401);const publicKey=await getMonoPublicKey();const valid=crypto.verify("sha256",req.rawBody,publicKey,Buffer.from(signature,"base64"));if(!valid)return res.sendStatus(401);const {invoiceId,status}=req.body||{};if(status==="success"){const files=await fs.readdir(dataDir);for(const file of files.filter(name=>name.endsWith(".json"))){const id=file.slice(0,-5),job=await getJob(id);if(job?.invoiceId===invoiceId){job.paid=true;await saveJob(id,job);break}}}res.sendStatus(200)}catch(error){next(error)}});
app.get("/api/payment/status/:jobId",async(req,res)=>{const job=await getJob(req.params.jobId);res.json({paid:Boolean(job?.paid),downloadUrl:job?.paid?`/api/photo/download/${req.params.jobId}`:null})});
app.get("/api/photo/download/:jobId",async(req,res,next)=>{try{const job=await getJob(req.params.jobId);if(!job?.paid||job.selected===null)return res.sendStatus(403);const file=imagePath(req.params.jobId,job.selected);res.download(file,"resume-photo.jpg",async error=>{if(!error){await Promise.allSettled([0,1,2].map(index=>fs.unlink(imagePath(req.params.jobId,index))));await fs.unlink(metaPath(req.params.jobId)).catch(()=>{})}else next(error)})}catch(error){next(error)}});

app.post("/api/resume/assist",async(req,res,next)=>{try{
  if(!process.env.GEMINI_API_KEY)return res.status(503).json({error:"AI-підказки будуть доступні після підключення ключа."});
  const {profile="civilian",action="summary",data={},vacancy="",experience={}}=req.body||{};
  const clip=(value,max=4000)=>String(value??"").slice(0,max);
  const facts={role:clip(data.role,150),city:clip(data.city,120),summary:clip(data.summary,1500),skills:clip(data.skills,1500),education:clip(data.education,1500),experience:(Array.isArray(data.experience)?data.experience:[]).slice(0,10).map(item=>({id:clip(item.id,80),kind:clip(item.kind,30),position:clip(item.position,150),company:clip(item.company,150),city:clip(item.city,100),start:clip(item.start,50),end:clip(item.end,50),duties:clip(item.duties,1500)}))};
  const selected={kind:clip(experience.kind,30),position:clip(experience.position,150),company:clip(experience.company,150),duties:clip(experience.duties,1500)};
  const formats={summary:'{"summary":"2–4 concise first-person sentences"}',skills:'{"hardSkills":["..."],"softSkills":["..."]}',functions:'{"functions":["5–7 concise responsibility or achievement statements"]}',adapt:'{"summary":"adapted first-person summary","skills":["6–9 relevant skills"],"experience":[{"id":"original experience id","functions":["3–6 vacancy-relevant statements"]}]}',proofread:'{"role":"corrected desired role","city":"corrected city name in Ukrainian","summary":"corrected first-person summary","skills":"corrected skills text","education":"corrected education text","experience":[{"id":"original experience id","position":"corrected position title","duties":"corrected duties preserving line breaks"}]}'};
  if(!formats[action])return res.status(400).json({error:"Невідома дія AI."});
  const instructions={summary:"Write a concise professional About Me section in the candidate's first person based only on supplied facts and desired role.",skills:"Suggest only 6–9 genuinely relevant skills. Avoid a generic pile of clichés. Do not claim certifications, tools or abilities unsupported by the facts.",functions:"Suggest typical, truthful responsibility formulations for the supplied position. Phrase them as editable suggestions; do not invent numbers, employers, awards, ranks or operations.",adapt:"Adapt the whole resume to the vacancy: summary, skills, and duties for every experience item. Keep company, role and dates unchanged. Reorder, omit or rephrase duties to emphasize relevant facts, but never invent experience, achievements, numbers or tools. Return every experience item using its original id.",proofread:"Proofread the supplied Ukrainian resume. Correct spelling, punctuation, grammar, word agreement and obvious typing errors only. Normalize city names to their standard Ukrainian spelling (for example, "Днепр" to "Дніпро"). Preserve every fact, number, proper name, employer, role, date and the meaning. Do not add, remove, embellish or adapt content. Keep the summary in the first person and preserve duty line breaks and bullet structure. Return every experience item using its original id."};
  const prompt=`You are a careful Ukrainian career editor. Respond in grammatically correct Ukrainian and return ONLY valid JSON in this exact shape: ${formats[action]}. ${instructions[action]} Write the About Me section strictly in first person (for example: "організовую", "володію", "дотримуюся"), never as an outside description ("організовує", "володіє"). Proofread grammar before answering. The user will review and edit every suggestion. Profile: ${clip(profile,40)}. Candidate facts: ${JSON.stringify(facts)}. Selected experience: ${JSON.stringify(selected)}. Vacancy: ${clip(vacancy,6000)||"not supplied"}. For military experience, use the Ukrainian veteran-employment principle of translating actual functions into understandable civilian competencies. Treat the military title only as a clue, rely on the user's stated facts, do not disclose unit numbers, locations, operations, weapons details or other sensitive information. For medical experience, preserve accurate terminology and never invent procedures or certifications.`;
  const ai=new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY});
  const models=[process.env.GEMINI_TEXT_MODEL,"gemini-3.7-flash","gemini-3.6-flash","gemini-2.5-flash"].filter((model,index,list)=>model&&list.indexOf(model)===index);
  let result,lastError;
  for(const model of models){
    try{
      result=await ai.models.generateContent({model,contents:prompt,config:{responseMimeType:"application/json"}});
      break;
    }catch(error){
      lastError=error;
      const status=Number(error?.status||error?.error?.code||0);
      if(![429,500,503].includes(status))throw error;
      console.warn(`Resume AI model ${model} unavailable (${status}); trying fallback.`);
    }
  }
  if(!result){
    console.error(lastError);
    return res.status(503).json({error:"AI зараз перевантажений. Будь ласка, спробуйте ще раз за кілька хвилин."});
  }
  const raw=String(result.text||"").replace(/^```json\s*/i,"").replace(/\s*```$/,"");
  let parsed;try{parsed=JSON.parse(raw)}catch{return res.status(502).json({error:"AI повернув незрозумілу відповідь. Спробуйте ще раз."})}
  res.json(parsed);
}catch(error){next(error)}});

app.post("/api/resume/pdf",async(req,res,next)=>{try{
  const buffer=await buildPdf(req.body||{});
  res.set({"Content-Type":"application/pdf","Content-Disposition":'attachment; filename="nadinartdigital.com.ua.pdf"',"Cache-Control":"no-store"}).send(buffer);
}catch(error){next(error)}});

app.post("/api/resume/docx",async(req,res,next)=>{try{
  const buffer=await buildDocx(req.body||{});
  res.set({"Content-Type":"application/vnd.openxmlformats-officedocument.wordprocessingml.document","Content-Disposition":'attachment; filename="nadinartdigital.com.ua.docx"',"Cache-Control":"no-store"}).send(buffer);
}catch(error){next(error)}});

setInterval(async()=>{const cutoff=Date.now()-24*60*60*1000;for(const file of (await fs.readdir(dataDir)).filter(name=>name.endsWith(".json"))){const id=file.slice(0,-5),job=await getJob(id);if(job?.createdAt<cutoff){await Promise.allSettled([0,1,2].map(index=>fs.unlink(imagePath(id,index))));await fs.unlink(metaPath(id)).catch(()=>{})}}},60*60*1000).unref();
app.use((error,_req,res,_next)=>{console.error(error);res.status(500).json({error:"Виникла технічна помилка. Спробуйте ще раз пізніше."})});
app.listen(port,"0.0.0.0",()=>console.log(`AI career service listening on ${port}`));
