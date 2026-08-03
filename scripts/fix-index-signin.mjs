import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const htmlPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "index.html");
let html = fs.readFileSync(htmlPath, "utf8");

html = html.replace(
  /onclick="go\('pricing'\)">Sign In/g,
  `onclick="go('login')">Sign In`
);

if (!html.includes(`go('login');closeMob()`)) {
  html = html.replace(
    `<a class="btn btn-primary" style="margin:16px 0;text-align:center" href="javascript:void(0)" onclick="go('signup');closeMob()">`,
    `<a class="mob-link" href="javascript:void(0)" onclick="go('login');closeMob()">Sign In</a>\n  <a class="btn btn-primary" style="margin:16px 0;text-align:center" href="javascript:void(0)" onclick="go('signup');closeMob()">`
  );
}

fs.writeFileSync(htmlPath, html, "utf8");
console.log("[fix-index-signin] Updated Sign In links in index.html");
