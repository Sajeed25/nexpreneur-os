// Builds the manual: concatenates parts/*.html, builds the contents page, prints with Edge, then fills in real page numbers.
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const dir = __dirname;
const EDGE = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(fs.existsSync);
const OUT = process.argv[2] || path.join(dir, "manual.pdf");

const parts = fs.readdirSync(path.join(dir, "parts")).filter((f) => f.endsWith(".html")).sort();
const body = parts.map((f) => fs.readFileSync(path.join(dir, "parts", f), "utf8")).join("\n");

// collect chapters (h1.chapter) and sections (h2) in order
const heads = [];
const re = /<h(1|2)([^>]*)id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g;
let m;
while ((m = re.exec(body))) {
  const level = m[1] === "1" ? "ch" : "sec";
  if (level === "ch" && !/class="chapter"/.test(m[2] + m[0])) continue;
  const text = m[4].replace(/<span class="num">[\s\S]*?<\/span>/, "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&middot;/g, "·").replace(/&rsquo;/g, "’").trim();
  const num = (m[4].match(/<span class="num">([\s\S]*?)<\/span>/) || [])[1];
  heads.push({ id: m[3], level, text, num: num ? num.replace(/<[^>]+>/g, "").trim() : "" });
}

function html(pages) {
  const toc = heads.map((h) => {
    const pg = pages[h.id] ?? "";
    const label = h.level === "ch" ? `${h.num ? h.num.replace(/^Chapter\s*/i, "") + "&nbsp;&nbsp;" : ""}${h.text}` : h.text;
    return `<div class="toc-${h.level}"><a href="#${h.id}">${label}</a><span class="dots"></span><span class="pg">${pg}</span></div>`;
  }).join("\n");
  const css = fs.readFileSync(path.join(dir, "style.css"), "utf8");
  return fs.readFileSync(path.join(dir, "head.html"), "utf8").replace("/*CSS*/", css).replace("<!--TOC-->", toc).replace("<!--BODY-->", body);
}

function render(pages) {
  fs.writeFileSync(path.join(dir, "manual.html"), html(pages));
  const url = "file:///" + path.join(dir, "manual.html").replace(/\\/g, "/");
  execFileSync(EDGE, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--virtual-time-budget=20000", `--print-to-pdf=${OUT}`, url], { stdio: "ignore", timeout: 180000 });
}

async function pageMap() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(fs.readFileSync(OUT));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, verbosity: 0 }).promise;
  const texts = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const t = await (await doc.getPage(i)).getTextContent();
    texts.push(t.items.map((x) => x.str).join("").replace(/\s+/g, ""));
  }
  const start = texts.findIndex((t) => t.includes("SECTIONSTART"));
  const squash = (s) => s.replace(/\s+/g, "");
  const map = {};
  const norm = (s) => s.replace(/\s+/g, " ").trim();
  let from = Math.max(0, start);
  for (const h of heads) {
    for (let i = from; i < texts.length; i++) {
      const needle = squash(h.level === "ch" && h.num ? `${h.num.toUpperCase()} ${h.text}` : h.text);
      if (texts[i].includes(needle)) { map[h.id] = i + 1; from = i; break; }
    }
  }
  return { map, total: doc.numPages, start: start + 1 };
}

(async () => {
  let pages = {};
  render(pages);
  for (let pass = 1; pass <= 3; pass++) {
    const { map, total, start } = await pageMap();
    const same = JSON.stringify(map) === JSON.stringify(pages);
    console.log(`pass ${pass}: ${total} pages, body starts p.${start}, ${Object.keys(map).length}/${heads.length} headings located`);
    if (same) break;
    pages = map;
    render(pages);
  }
  const missing = heads.filter((h) => !pages[h.id]).map((h) => h.text);
  if (missing.length) console.log("NOT LOCATED:", missing.join(" | "));
  console.log("wrote", OUT);
})();
