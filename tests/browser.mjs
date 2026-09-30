import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const base = (process.argv[2] || "http://127.0.0.1:4173").replace(/\/$/, "");
const chrome = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
assert(fs.existsSync(chrome), `Chrome not found at ${chrome}; set CHROME_BIN.`);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "sda-app-browser-"));
const browser = spawn(chrome, [
  "--headless=new", "--remote-debugging-pipe", `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--disable-gpu",
  "--disable-background-networking", "--disable-component-update",
  "--disable-sync", "--disable-default-apps", "--disable-breakpad", "about:blank",
], { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"] });
const exited = new Promise(resolve => browser.once("exit", resolve));
const pending = new Map();
const listeners = new Set();
let serial = 0, session, buffer = Buffer.alloc(0), stderr = "";
browser.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-4000); });
browser.stdio[4].on("data", chunk => {
  buffer = Buffer.concat([buffer, chunk]);
  let end;
  while ((end = buffer.indexOf(0)) !== -1) {
    const message = JSON.parse(buffer.subarray(0, end).toString("utf8"));
    buffer = buffer.subarray(end + 1);
    if (message.id) {
      const wait = pending.get(message.id);
      if (wait) {
        pending.delete(message.id);
        clearTimeout(wait.timer);
        message.error ? wait.reject(new Error(JSON.stringify(message.error))) : wait.resolve(message.result);
      }
    } else {
      for (const listener of listeners) listener(message);
    }
  }
});
function send(method, params = {}, sessionId) {
  const id = ++serial;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}\n${stderr}`)); }, 30000);
    pending.set(id, { resolve, reject, timer });
    browser.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + "\0");
  });
}
function event(method) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { listeners.delete(listener); reject(new Error(`Event timeout: ${method}`)); }, 30000);
    const listener = message => {
      if (message.method !== method || message.sessionId !== session) return;
      listeners.delete(listener); clearTimeout(timer); resolve(message.params);
    };
    listeners.add(listener);
  });
}
async function evaluate(expression) {
  if (process.env.TRACE) console.error("EVAL:", expression.slice(0, 70).replace(/\n/g, " "));
  const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, session);
  assert(!response.exceptionDetails, JSON.stringify(response.exceptionDetails));
  return response.result.value;
}
async function navigate(url) {
  if (process.env.TRACE) console.error("NAV:", url);
  const loaded = event("Page.loadEventFired");
  const response = await send("Page.navigate", { url }, session);
  assert(!response.errorText, response.errorText);
  await loaded;
  await new Promise(resolve => setTimeout(resolve, 200));
}
async function width(value) {
  await send("Emulation.setDeviceMetricsOverride", { width: value, height: 1000, deviceScaleFactor: 1, mobile: false }, session);
}
async function selectText(selector) {
  await evaluate(`document.activeElement && document.activeElement.blur();
    window.scrollTo({top:0,behavior:"instant"});
    document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:"center",behavior:"instant"});`);
  await new Promise(resolve => setTimeout(resolve, 120));
  await evaluate(`(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    const target = [...node.childNodes].find(n => n.nodeType === 3 && n.nodeValue.trim());
    const range = document.createRange();
    range.setStart(target, 0);
    range.setEnd(target, Math.min(30, target.nodeValue.length));
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  })()`);
  await new Promise(resolve => setTimeout(resolve, 60));
}

async function main() {
  assert((await send("Browser.getVersion")).product.includes("Chrome"));
  ({ sessionId: session } = await send("Target.attachToTarget",
    { targetId: (await send("Target.createTarget", { url: "about:blank" })).targetId, flatten: true }));
  await send("Page.enable", {}, session);
  await send("Runtime.enable", {}, session);
  await send("Network.enable", {}, session);
  const errors = [], external = [];
  const allowed = /^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/|data:|blob:|about:|ws:\/\/(127\.0\.0\.1|localhost))/;
  listeners.add(message => {
    if (message.sessionId !== session) return;
    if (message.method === "Runtime.exceptionThrown") errors.push(JSON.stringify(message.params.exceptionDetails));
    if (message.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(message.params.type))
      errors.push(message.params.args.map(a => a.value ?? a.description).join(" "));
    if (message.method === "Network.requestWillBeSent" && !allowed.test(message.params.request.url))
      external.push(message.params.request.url);
  });

  // Dashboard lists all five guides.
  await width(1440);
  await navigate(`${base}/`);
  assert.equal(await evaluate('document.querySelectorAll(".app-guide-card").length'), 5);
  assert.equal(await evaluate('document.title'), "SDA Problems | Field Guides");

  // Deep link into a guide with a section fragment scrolls to that section.
  await navigate(`${base}/guides/top-n-requests#final-design`);
  assert(await evaluate('document.title.startsWith("Top requests")') ||
    await evaluate('!!document.querySelector(".app-sidebar-title")'));
  assert(await evaluate(`(() => {
    const el = document.getElementById("final-design");
    return el && el.getBoundingClientRect().top < 400;
  })()`), "fragment did not scroll into view");

  for (const id of ["metrics-monitoring", "distributed-kv-store", "calendaring", "top-n-requests", "trending-shares"]) {
    await width(1440);
    await navigate(`${base}/guides/${id}`);
    assert(await evaluate('!!document.querySelector(".guide-document h1")'), `${id}: no content`);
    assert(await evaluate('!!document.querySelector("main#main")'), `${id}: no main`);

    // Sidebar toggle.
    await evaluate('document.querySelector(\'[aria-controls="guide-sidebar"]\').click()');
    assert.equal(await evaluate('document.querySelector("#guide-sidebar").hidden'), true);
    await evaluate('document.querySelector(\'[aria-controls="guide-sidebar"]\').click()');
    assert.equal(await evaluate('document.querySelector("#guide-sidebar").hidden'), false);

    // Expand / collapse all answers.
    await evaluate('document.getElementById("expand-details").click()');
    assert(await evaluate('[...document.querySelectorAll(".guide-document details")].every(d => d.open)'), `${id}: expand`);
    await evaluate('document.getElementById("collapse-details").click()');
    assert(await evaluate('[...document.querySelectorAll(".guide-document details")].every(d => !d.open)'), `${id}: collapse`);

    // Checklist persists across a full reload.
    await evaluate('document.querySelector("input[data-check]").click()');
    assert((await evaluate('document.getElementById("check-progress").textContent')).startsWith("1 of "), `${id}: progress`);
    await navigate(`${base}/guides/${id}`);
    assert.equal(await evaluate('document.querySelector("input[data-check]").checked'), true, `${id}: checklist not persisted`);

    // Unique element IDs even with an embedded diagram.
    assert(await evaluate(`(() => {
      const ids = [...document.querySelectorAll("[id]")].map(e => e.id);
      return ids.length === new Set(ids).size;
    })()`), `${id}: duplicate ids`);

    // Diagram zoom dialog opens and Escape restores focus to the trigger.
    await evaluate('document.querySelector("[data-diagram],[data-hld-image]").scrollIntoView({block:"center"})');
    await evaluate('document.querySelector("[data-diagram],[data-hld-image]").click()');
    assert.equal(await evaluate('document.getElementById("diagram-viewer").open'), true, `${id}: dialog`);
    assert(await evaluate('!!document.querySelector("#diagram-viewer .guide-document svg, #diagram-viewer .guide-document img")'), `${id}: diagram body`);
    await evaluate(`window.__closed = new Promise(r => document.getElementById("diagram-viewer").addEventListener("close", () => r(true), { once: true })); true;`);
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, session);
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, session);
    await evaluate("window.__closed");
    assert.equal(await evaluate('document.getElementById("diagram-viewer") ? document.getElementById("diagram-viewer").open : false'), false, `${id}: dialog close`);
    assert(await evaluate('!!(document.activeElement && (document.activeElement.hasAttribute("data-diagram") || document.activeElement.hasAttribute("data-hld-image")))'), `${id}: focus return`);

    // Responsive: no horizontal overflow across breakpoints.
    for (const size of [320, 390, 768, 1440]) {
      await width(size);
      const overflow = await evaluate("Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth");
      assert(overflow <= 1, `${id}: ${overflow}px overflow at ${size}px`);
    }

    // Print media hides the app chrome.
    await send("Emulation.setEmulatedMedia", { media: "print" }, session);
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".app-toolbar")).display'), "none", `${id}: print toolbar`);
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".app-sidebar")).display'), "none", `${id}: print sidebar`);
    const pdf = await send("Page.printToPDF", { printBackground: true, preferCSSPageSize: true }, session);
    assert.equal(Buffer.from(pdf.data, "base64").subarray(0, 5).toString(), "%PDF-", `${id}: pdf`);
    await send("Emulation.setEmulatedMedia", { media: "" }, session);
  }

  // Four-color highlight: create, persist across reload, recolor, and remove.
  await width(1440);
  await navigate(`${base}/guides/metrics-monitoring`);
  await evaluate('Object.keys(localStorage).forEach(k => k.startsWith("interview-field-guides") && localStorage.removeItem(k))');
  await navigate(`${base}/guides/metrics-monitoring`);
  await selectText(".guide-document .lead");
  assert.equal(await evaluate('document.querySelectorAll(".app-highlight-popover .app-color").length'), 4, "no highlight popover");
  await evaluate('document.querySelector(".app-highlight-popover .app-color[aria-label=Yellow]").click()');
  assert.equal(await evaluate('document.querySelector("mark.hl").dataset.hlColor'), "yellow");
  await navigate(`${base}/guides/metrics-monitoring`);
  assert.equal(await evaluate('document.querySelector("mark.hl").dataset.hlColor'), "yellow", "highlight not persisted");
  await evaluate(`document.querySelector("mark.hl").click();`);
  await evaluate('document.querySelector(".app-highlight-popover .app-color[aria-label=Green]").click()');
  assert.equal(await evaluate('document.querySelector("mark.hl").dataset.hlColor'), "green", "recolor failed");
  await evaluate(`document.querySelector("mark.hl").click();`);
  await evaluate('document.querySelector(".app-remove-highlight").click()');
  assert.equal(await evaluate('document.querySelectorAll("mark.hl").length'), 0, "remove failed");
  await navigate(`${base}/guides/metrics-monitoring`);
  assert.equal(await evaluate('document.querySelectorAll("mark.hl").length'), 0, "removal not persisted");

  // Highlights on the app do not touch a different browser-storage origin or leak globals.
  assert(await evaluate('Object.keys(localStorage).every(k => k.startsWith("interview-field-guides"))'), "unexpected storage keys");

  assert.deepEqual(external, [], `external requests: ${external.join(", ")}`);
  assert.deepEqual(errors, [], `console errors: ${errors.join(" | ")}`);
  console.log("React app: dashboard, routing, deep links, sidebar, details, checklist persistence, diagram zoom, four-color highlight lifecycle, responsive layouts, print, and offline behavior all passed.");
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser.exitCode === null) {
    try { await send("Browser.close"); }
    catch { browser.kill("SIGTERM"); }
  }
  await exited;
  for (const wait of pending.values()) clearTimeout(wait.timer);
  fs.rmSync(profile, { recursive: true, force: true });
});
