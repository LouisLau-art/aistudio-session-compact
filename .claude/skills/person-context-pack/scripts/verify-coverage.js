import fs from "node:fs";

if (process.argv.length < 5) {
  console.error("Usage: bun verify-coverage.js <terms_comma_separated> <doc_path> <source_file_paths...>");
  process.exit(1);
}

const termsStr = process.argv[2];
const docPath = process.argv[3];
const files = process.argv.slice(4);

const terms = termsStr.split(",").map(t => t.trim()).filter(Boolean);
const text = fs.readFileSync(docPath, "utf8");
const missing = [];

for (const p of files) {
  if (!fs.existsSync(p)) {
    console.warn(`File not found: ${p}, skipping.`);
    continue;
  }
  const rows = fs.readFileSync(p, "utf8").trim().split(/\n/).map(row => JSON.parse(row));
  for (const r of rows) {
    if (r.role === "user" && terms.some(t => r.text.includes(t)) && !text.includes(r.id)) {
      missing.push(`${p}:${r.id}`);
    }
  }
}

console.log(`missing_ids=${missing.length}`);
if (missing.length > 0) {
  console.log("Missing turns detailed list:", missing);
}
