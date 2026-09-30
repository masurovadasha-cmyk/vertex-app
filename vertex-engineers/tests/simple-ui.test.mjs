import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,"..");
const html=fs.readFileSync(path.join(root,"ui/app/index.html"),"utf8");
const css=fs.readFileSync(path.join(root,"ui/app/engineers.css"),"utf8");
const js=fs.readFileSync(path.join(root,"ui/app/engineers.js"),"utf8");
test("simple Engineers UI exposes exactly six top-level work areas",()=>{
 for(const x of ["Dashboard","Projects","Equipment","Service","Team","Documents"])assert.match(js,new RegExp('"'+x+'"'));
 assert.doesNotMatch(js,/["']Construction["']\s*\]/);
});
test("UI keeps approved VERTEX Engineers palette",()=>{
 for(const color of ["#15181c","#d5b98c","#f4f0e8"])assert.ok(css.toLowerCase().includes(color));
});
test("preview does not pretend staging persistence is live",()=>{
 assert.match(js,/verified staging identity/);
 assert.match(js,/mode:"preview"/);
 assert.match(js,/staging scope/);
});
test("shell is self-contained and uses no private VISION runtime imports",()=>{
 assert.match(html,/engineers\.js/);
 assert.match(html,/engineers\.css/);
 assert.doesNotMatch(js,/vision\//i);
});
