// usage: node snap.js file.pdf outdir page[,page...]
const fs=require("fs"),path=require("path");
(async()=>{
  const {createCanvas}=require("@napi-rs/canvas");
  const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
  const [,, file, out, list]=process.argv;
  fs.mkdirSync(out,{recursive:true});
  const doc=await pdfjs.getDocument({data:new Uint8Array(fs.readFileSync(file)),useSystemFonts:true,verbosity:0}).promise;
  console.log("pages",doc.numPages);
  const pages=(list||"1").split(",").map(Number);
  for(const n of pages){
    const page=await doc.getPage(n), vp=page.getViewport({scale:1.25});
    const canvas=createCanvas(Math.round(vp.width),Math.round(vp.height)), ctx=canvas.getContext("2d");
    ctx.fillStyle="#fff"; ctx.fillRect(0,0,canvas.width,canvas.height);
    await page.render({canvasContext:ctx,viewport:vp}).promise;
    fs.writeFileSync(path.join(out,`p${n}.png`),canvas.toBuffer("image/png"));
  }
})();
