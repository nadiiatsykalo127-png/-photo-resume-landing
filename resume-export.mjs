import fsSync from "node:fs";
import path from "node:path";
import {
  AlignmentType, BorderStyle, Document, Footer, ImageRun, LevelFormat,
  Packer, PageNumber, Paragraph, ShadingType, Table, TableCell, TableRow,
  TextRun, VerticalAlign, WidthType
} from "docx";
import PDFDocument from "pdfkit";
import sharp from "sharp";

const BLUE="3155E8", DARK="1C2B45", MUTED="667089", PALE="EAF0FF", WHITE="FFFFFF";
const clip=(value,max=6000)=>String(value??"").trim().slice(0,max);
const cleanBullet=value=>clip(value,1600).replace(/^\s*[•●▪◦-]\s*/,"").replace(/\s+/g," ").trim();
const splitLines=value=>clip(value).split(/\n|,/).map(cleanBullet).filter(Boolean);
const lowerInitial=value=>{
  const text=clip(value);
  if(text.length>3&&text===text.toLocaleUpperCase("uk-UA"))return text.toLocaleLowerCase("uk-UA");
  return text?text[0].toLocaleLowerCase("uk-UA")+text.slice(1):text;
};
const naturalSkills=value=>{
  const items=Array.isArray(value)?value.map(cleanBullet).filter(Boolean):splitLines(value);
  if(!items.length)return "";
  const normalized=items.map((item,index)=>index?lowerInitial(item):item[0]?.toLocaleUpperCase("uk-UA")+item.slice(1));
  return normalized.join(", ").replace(/[.;,\s]+$/,"")+".";
};
const duties=value=>clip(value).split("\n").map(cleanBullet).filter(Boolean);
const contactLine=data=>[data.email,data.phone,data.city,data.linkedin].map(x=>clip(x,300)).filter(Boolean).join(" • ");

function normalize(input={}){
  return {
    profile:clip(input.profile,40), template:input.template==="standard"?"standard":"stylish",
    name:clip(input.name,150), role:clip(input.role,180), email:clip(input.email,200),
    phone:clip(input.phone,100), city:clip(input.city,120), linkedin:clip(input.linkedin,350),
    summary:clip(input.summary,3000), education:clip(input.education,3000),
    skills:naturalSkills(input.skills), photo:clip(input.photo,8_000_000),
    experience:(Array.isArray(input.experience)?input.experience:[]).slice(0,12).map(item=>({
      kind:item?.kind==="military"?"military":"civilian", position:clip(item?.position,180),
      company:clip(item?.company,180), city:clip(item?.city,120), start:clip(item?.start,50),
      end:clip(item?.end,50), duties:duties(item?.duties)
    })).filter(item=>item.position||item.company||item.duties.length)
  };
}

function photoBuffer(dataUri){
  const match=/^data:image\/(?:png|jpe?g|webp);base64,(.+)$/i.exec(dataUri||"");
  return match?Buffer.from(match[1],"base64"):null;
}
async function resumePhoto(dataUri,width=300,height=400){
  const input=photoBuffer(dataUri);if(!input)return null;
  return sharp(input).rotate().resize(width,height,{fit:"contain",background:{r:255,g:255,b:255,alpha:0}}).png().toBuffer();
}

const docRun=(text,options={})=>new TextRun({text,font:"Arial",color:options.color||DARK,size:options.size||20,bold:Boolean(options.bold),italics:Boolean(options.italics)});
const emptyBorders={top:{style:BorderStyle.NONE},bottom:{style:BorderStyle.NONE},left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE},insideHorizontal:{style:BorderStyle.NONE},insideVertical:{style:BorderStyle.NONE}};
function docHeading(text){return new Paragraph({children:[docRun(text.toLocaleUpperCase("uk-UA"),{size:20,bold:true,color:BLUE})],spacing:{before:260,after:90},border:{bottom:{style:BorderStyle.SINGLE,size:5,color:"D9E1EE",space:5}},keepNext:true});}
function docBody(text,options={}){return new Paragraph({children:[docRun(text,{size:20,bold:options.bold,color:options.color||DARK})],spacing:{before:options.before??0,after:options.after??80,line:290},keepNext:Boolean(options.keepNext)});}

export async function buildDocx(raw){
  const data=normalize(raw),photo=await resumePhoto(data.photo,300,400),stylish=data.template==="stylish";
  const headerText=[];
  headerText.push(new Paragraph({children:[docRun(data.name||"Резюме",{size:34,bold:true,color:stylish?WHITE:DARK})],spacing:{after:80},keepNext:true}));
  if(data.role)headerText.push(new Paragraph({children:[docRun(`Мета: ${data.role}`,{size:22,bold:true,color:stylish?"EAF3FF":BLUE})],spacing:{after:80},keepNext:true}));
  const contact=contactLine(data);if(contact)headerText.push(new Paragraph({children:[docRun(contact,{size:17,color:stylish?WHITE:MUTED})],spacing:{after:0}}));
  const cells=[];
  if(photo)cells.push(new TableCell({width:{size:1450,type:WidthType.DXA},verticalAlign:VerticalAlign.CENTER,borders:emptyBorders,shading:stylish?{fill:"246B96",type:ShadingType.CLEAR}:undefined,margins:{top:180,bottom:180,left:180,right:140},children:[new Paragraph({alignment:AlignmentType.CENTER,children:[new ImageRun({data:photo,transformation:{width:70,height:93},type:"png"})]})]}));
  cells.push(new TableCell({width:{size:photo?7550:9000,type:WidthType.DXA},verticalAlign:VerticalAlign.CENTER,borders:emptyBorders,shading:stylish?{fill:"246B96",type:ShadingType.CLEAR}:undefined,margins:{top:220,bottom:220,left:photo?120:240,right:240},children:headerText}));
  const children=[new Table({width:{size:9000,type:WidthType.DXA},columnWidths:photo?[1450,7550]:[9000],borders:emptyBorders,rows:[new TableRow({children:cells,cantSplit:true})]})];
  if(data.summary){children.push(docHeading("Про себе"),docBody(data.summary));}
  if(data.experience.length){
    children.push(docHeading("Досвід роботи"));
    for(const item of data.experience){
      children.push(docBody(item.position||"Досвід",{bold:true,before:90,after:30,keepNext:true}));
      const place=[item.company,item.city].filter(Boolean).join(", ");if(place)children.push(docBody(place,{color:MUTED,after:20,keepNext:true}));
      const dates=[item.start,item.end].filter(Boolean).join(" — ");if(dates)children.push(docBody(dates,{color:MUTED,after:45,keepNext:Boolean(item.duties.length)}));
      for(const duty of item.duties)children.push(new Paragraph({text:duty,numbering:{reference:"resume-bullets",level:0},spacing:{after:45,line:280},widowControl:true}));
      children.push(new Paragraph({children:[docRun("")],spacing:{after:40,line:120}}));
    }
  }
  if(data.education){children.push(docHeading("Освіта"));for(const line of clip(data.education).split("\n").filter(Boolean))children.push(docBody(line));}
  if(data.skills){children.push(docHeading("Навички"),docBody(data.skills));}
  const doc=new Document({
    creator:"nadinartdigital.com.ua",title:"Резюме",description:"Резюме, створене на nadinartdigital.com.ua",
    numbering:{config:[{reference:"resume-bullets",levels:[{level:0,format:LevelFormat.BULLET,text:"•",alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:360,hanging:220}},run:{font:"Arial",size:20,color:DARK}}}]}]},
    styles:{default:{document:{run:{font:"Arial",size:20,color:DARK},paragraph:{spacing:{after:80,line:290}}}}},
    sections:[{properties:{page:{size:{width:11906,height:16838},margin:{top:720,right:900,bottom:720,left:900,header:360,footer:360}}},footers:{default:new Footer({children:[new Paragraph({alignment:AlignmentType.RIGHT,children:[docRun("",{size:16,color:MUTED}),new TextRun({children:[PageNumber.CURRENT],font:"Arial",size:16,color:MUTED})]})]})},children}]
  });
  return Packer.toBuffer(doc);
}

const fontCandidates={regular:[path.join(process.cwd(),"public/assets/fonts/DejaVuSans.ttf"),"/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"],bold:[path.join(process.cwd(),"public/assets/fonts/DejaVuSans-Bold.ttf"),"/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]};
const findFont=kind=>fontCandidates[kind].find(file=>fsSync.existsSync(file));
function collectPdf(build){return new Promise((resolve,reject)=>{const chunks=[];build.on("data",chunk=>chunks.push(chunk));build.on("end",()=>resolve(Buffer.concat(chunks)));build.on("error",reject)});}
function pdfSection(doc,title){if(doc.y>doc.page.height-120)doc.addPage();doc.moveDown(.55).font("ResumeBold").fontSize(10).fillColor(`#${BLUE}`).text(title.toLocaleUpperCase("uk-UA"),{characterSpacing:1.2});doc.moveDown(.25).strokeColor("#D9E1EE").lineWidth(.6).moveTo(doc.page.margins.left,doc.y).lineTo(doc.page.width-doc.page.margins.right,doc.y).stroke();doc.moveDown(.55);}
function ensurePdf(doc,height){if(doc.y+height>doc.page.height-doc.page.margins.bottom-18)doc.addPage();}

export async function buildPdf(raw){
  const data=normalize(raw),photo=await resumePhoto(data.photo,300,400),stylish=data.template==="stylish";
  const regular=findFont("regular"),bold=findFont("bold");if(!regular||!bold)throw new Error("PDF fonts are unavailable");
  const doc=new PDFDocument({size:"A4",margins:{top:42,right:48,bottom:42,left:48},info:{Title:"Резюме",Author:"nadinartdigital.com.ua"}});
  doc.registerFont("Resume",regular).registerFont("ResumeBold",bold);
  const output=collectPdf(doc);
  const left=doc.page.margins.left,width=doc.page.width-left-doc.page.margins.right;
  const headerY=doc.y,headerH=photo?132:112;
  if(stylish)doc.save().fillColor("#246B96").rect(left,headerY,width,headerH).fill().restore();
  let textX=left+(photo?112:24),textY=headerY+23;
  if(photo){doc.save().roundedRect(left+28,headerY+17,70,98,5).clip().image(photo,left+28,headerY+17,{width:70,height:98}).restore();}
  doc.font("ResumeBold").fontSize(23).fillColor(stylish?"#FFFFFF":`#${DARK}`).text(data.name||"Резюме",textX,textY,{width:width-(textX-left)-22});
  let y=doc.y+4;if(data.role){doc.font("ResumeBold").fontSize(11.5).fillColor(stylish?"#EAF3FF":`#${BLUE}`).text(`Мета: ${data.role}`,textX,y,{width:width-(textX-left)-22});y=doc.y+6;}
  const contact=contactLine(data);if(contact)doc.font("Resume").fontSize(8.2).fillColor(stylish?"#FFFFFF":`#${MUTED}`).text(contact,textX,y,{width:width-(textX-left)-22,lineGap:1});
  doc.y=headerY+headerH+(stylish?8:0);if(!stylish)doc.strokeColor(`#${BLUE}`).lineWidth(2.2).moveTo(left,doc.y).lineTo(left+width,doc.y).stroke();
  if(data.summary){pdfSection(doc,"Про себе");doc.font("Resume").fontSize(9.4).fillColor(`#${DARK}`).text(data.summary,{width,lineGap:3});}
  if(data.experience.length){
    pdfSection(doc,"Досвід роботи");
    for(const item of data.experience){
      ensurePdf(doc,50);doc.font("ResumeBold").fontSize(9.7).fillColor(`#${DARK}`).text(item.position||"Досвід",{width});
      const place=[item.company,item.city].filter(Boolean).join(", ");if(place)doc.font("Resume").fontSize(8.7).fillColor(`#${MUTED}`).text(place,{width});
      const dates=[item.start,item.end].filter(Boolean).join(" — ");if(dates)doc.font("Resume").fontSize(8.2).fillColor("#8791A5").text(dates,{width});
      doc.moveDown(.25);
      for(const duty of item.duties){const h=doc.heightOfString(duty,{width:width-16,lineGap:2})+4;ensurePdf(doc,h);const bulletY=doc.y;doc.font("Resume").fontSize(8.8).fillColor(`#${DARK}`).text("•",left,bulletY,{width:12,lineBreak:false});doc.text(duty,left+14,bulletY,{width:width-14,lineGap:2});doc.moveDown(.12);}
      doc.moveDown(.25);
    }
  }
  if(data.education){pdfSection(doc,"Освіта");doc.font("Resume").fontSize(9.2).fillColor(`#${DARK}`).text(data.education,{width,lineGap:3});}
  if(data.skills){pdfSection(doc,"Навички");doc.font("Resume").fontSize(9.2).fillColor(`#${DARK}`).text(data.skills,{width,lineGap:3});}
  doc.end();return output;
}
