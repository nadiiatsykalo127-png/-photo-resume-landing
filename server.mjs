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

const root=path.dirname(fileURLToPath(import.meta.url));
const app=express();
const port=Number(process.env.PORT||10000);
const baseUrl=(process.env.PUBLIC_BASE_URL||"http://localhost:10000").replace(/\/$/,"");
const dataDir=process.env.DATA_DIR||path.join(root,"data/private");
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024},fileFilter:(_req,file,cb)=>cb(null,["image/jpeg","image/png","image/webp"].includes(file.mimetype))});
await fs.mkdir(dataDir,{recursive:true});
const metaPath=id=>path.join(dataDir,`${id}.json`);
const imagePath=(id,index)=>path.join(dataDir,`${id}-${index}.jpg`);
async function getJob(id){try{return JSON.parse(await fs.readFile(metaPath(id),"utf8"))}catch{return null}}
async function saveJob(id,job){await fs.writeFile(metaPath(id),JSON.stringify(job),{mode:0o600})}

app.set("trust proxy",1);
app.use(helmet({contentSecurityPolicy:false,crossOriginResourcePolicy:false}));
app.use(express.json({limit:"1mb",verify:(req,_res,buf)=>{req.rawBody=Buffer.from(buf)}}));
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
  const prompt="Create a realistic professional resume headshot from this exact person. Preserve identity, facial proportions, skin tone, expression and hair. Remove glasses, hats and distracting jewelry only when present. Light blue clean studio background, soft even lighting, white business shirt, centered head and shoulders, vertical 3:4 composition. Do not add text, logos or decorative elements.";
  const clean=[];
  for(let i=0;i<3;i++){
   const result=await ai.interactions.create({model:process.env.GEMINI_IMAGE_MODEL||"gemini-3.1-flash-image",input:[{type:"text",text:`${prompt} Create variation ${i+1} with subtly different professional lighting.`},{type:"image",mime_type:req.file.mimetype,data:req.file.buffer.toString("base64")}],response_modalities:["image"],generation_config:{image_config:{aspect_ratio:"3:4",image_size:"1K"}}});
   const output=result.outputs?.find(item=>item.type==="image"&&item.data);
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
  if(!process.env.MONO_X_TOKEN)return res.status(503).json({error:"Автоматична оплата буде доступна після активації Monobank API."});
  job.selected=index;
  const reference=`photo:${jobId}`;
  const mono=await fetch("https://api.monobank.ua/api/merchant/invoice/create",{method:"POST",headers:{"content-type":"application/json","X-Token":process.env.MONO_X_TOKEN},body:JSON.stringify({amount:4900,ccy:980,merchantPaymInfo:{reference,destination:"Фото для резюме без водяного знака",basketOrder:[{name:"Фото для резюме",qty:1,sum:4900,unit:"шт.",code:"career-photo"}]},redirectUrl:`${baseUrl}/career/photo?order=${jobId}`,webHookUrl:`${baseUrl}/api/payment/webhook`})});
  const body=await mono.json();if(!mono.ok)throw new Error(body.errText||"Monobank не створив рахунок");job.invoiceId=body.invoiceId;await saveJob(jobId,job);res.json({pageUrl:body.pageUrl});
 }catch(error){next(error)}
});

let monoPublicKey=null;
async function getMonoPublicKey(){if(monoPublicKey)return monoPublicKey;const response=await fetch("https://api.monobank.ua/api/merchant/pubkey",{headers:{"X-Token":process.env.MONO_X_TOKEN}});if(!response.ok)throw new Error("Не вдалося отримати ключ Monobank");const {key}=await response.json();monoPublicKey=Buffer.from(key,"base64").toString("utf8");return monoPublicKey}
app.post("/api/payment/webhook",async(req,res,next)=>{try{const signature=req.get("X-Sign");if(!signature||!req.rawBody)return res.sendStatus(401);const publicKey=await getMonoPublicKey();const valid=crypto.verify("sha256",req.rawBody,publicKey,Buffer.from(signature,"base64"));if(!valid)return res.sendStatus(401);const {invoiceId,status}=req.body||{};if(status==="success"){const files=await fs.readdir(dataDir);for(const file of files.filter(name=>name.endsWith(".json"))){const id=file.slice(0,-5),job=await getJob(id);if(job?.invoiceId===invoiceId){job.paid=true;await saveJob(id,job);break}}}res.sendStatus(200)}catch(error){next(error)}});
app.get("/api/payment/status/:jobId",async(req,res)=>{const job=await getJob(req.params.jobId);res.json({paid:Boolean(job?.paid),downloadUrl:job?.paid?`/api/photo/download/${req.params.jobId}`:null})});
app.get("/api/photo/download/:jobId",async(req,res,next)=>{try{const job=await getJob(req.params.jobId);if(!job?.paid||job.selected===null)return res.sendStatus(403);const file=imagePath(req.params.jobId,job.selected);res.download(file,"resume-photo.jpg",async error=>{if(!error){await Promise.allSettled([0,1,2].map(index=>fs.unlink(imagePath(req.params.jobId,index))));await fs.unlink(metaPath(req.params.jobId)).catch(()=>{})}else next(error)})}catch(error){next(error)}});

app.post("/api/resume/assist",async(req,res,next)=>{try{
  if(!process.env.GEMINI_API_KEY)return res.status(503).json({error:"AI-підказки будуть доступні після підключення ключа."});
  const {profile="civilian",action="summary",data={},vacancy="",experience={}}=req.body||{};
  const clip=(value,max=4000)=>String(value??"").slice(0,max);
  const facts={role:clip(data.role,150),summary:clip(data.summary,1500),skills:clip(data.skills,1500),education:clip(data.education,1500),experience:(Array.isArray(data.experience)?data.experience:[]).slice(0,10).map(item=>({kind:clip(item.kind,30),position:clip(item.position,150),company:clip(item.company,150),city:clip(item.city,100),start:clip(item.start,50),end:clip(item.end,50),duties:clip(item.duties,1500)}))};
  const selected={kind:clip(experience.kind,30),position:clip(experience.position,150),company:clip(experience.company,150),duties:clip(experience.duties,1500)};
  const formats={summary:'{"summary":"2–4 concise sentences"}',skills:'{"hardSkills":["..."],"softSkills":["..."]}',functions:'{"functions":["5–7 concise responsibility or achievement statements"]}',adapt:'{"summary":"adapted summary","skills":["6–10 relevant skills"]}'};
  if(!formats[action])return res.status(400).json({error:"Невідома дія AI."});
  const instructions={summary:"Write a concise professional About Me section based only on supplied facts and desired role.",skills:"Suggest relevant hard and soft skills. Do not claim certifications, tools or abilities unsupported by the facts; generic role-relevant suggestions are allowed and must be easy to edit.",functions:"Suggest typical, truthful-sounding responsibility formulations for the supplied position. Phrase them as editable suggestions; do not invent numbers, employers, awards, ranks or operations.",adapt:"Adapt emphasis to the vacancy using only supplied facts. Do not invent experience or qualifications."};
  const prompt=`You are a careful Ukrainian career editor. Respond in Ukrainian and return ONLY valid JSON in this exact shape: ${formats[action]}. ${instructions[action]} The user will review and edit every suggestion. Profile: ${clip(profile,40)}. Candidate facts: ${JSON.stringify(facts)}. Selected experience: ${JSON.stringify(selected)}. Vacancy: ${clip(vacancy,6000)||"not supplied"}. For military experience, respectfully translate duties into civilian competencies without disclosing sensitive details. For medical experience, preserve accurate terminology.`;
  const ai=new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY});
  const result=await ai.models.generateContent({model:process.env.GEMINI_TEXT_MODEL||"gemini-3.7-flash",contents:prompt,config:{responseMimeType:"application/json"}});
  const raw=String(result.text||"").replace(/^```json\s*/i,"").replace(/\s*```$/,"");
  let parsed;try{parsed=JSON.parse(raw)}catch{return res.status(502).json({error:"AI повернув незрозумілу відповідь. Спробуйте ще раз."})}
  res.json(parsed);
}catch(error){next(error)}});

setInterval(async()=>{const cutoff=Date.now()-24*60*60*1000;for(const file of (await fs.readdir(dataDir)).filter(name=>name.endsWith(".json"))){const id=file.slice(0,-5),job=await getJob(id);if(job?.createdAt<cutoff){await Promise.allSettled([0,1,2].map(index=>fs.unlink(imagePath(id,index))));await fs.unlink(metaPath(id)).catch(()=>{})}}},60*60*1000).unref();
app.use((error,_req,res,_next)=>{console.error(error);res.status(500).json({error:"Виникла технічна помилка. Спробуйте ще раз пізніше."})});
app.listen(port,"0.0.0.0",()=>console.log(`AI career service listening on ${port}`));
