// Dependency-free Edge/Chrome CDP acceptance against the synthetic harness.
// Run from client: npm run test:chat-browser. Does not start Flask or contact Neon/AI.
import { createServer } from 'vite'
import { spawn } from 'node:child_process'
import { readFile, mkdtemp, writeFile, rm, realpath, mkdir, readdir, copyFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const root = fileURLToPath(new URL('..', import.meta.url))
const executable = process.env.STEP_J_BROWSER || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync)
if (!executable) throw Error('Set STEP_J_BROWSER to an installed Edge/Chrome executable.')
const profile = await mkdtemp(path.join(tmpdir(), 'lucie-step-j-browser-'))
const fixture = await readFile(new URL('../../docs/fixtures/step_j_v1.json', import.meta.url), 'utf8')
let browser, ws, server
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
try {
  server = await createServer({ root, server: { host: '127.0.0.1', port: 0, strictPort: false, proxy: {} }, plugins: [{ name: 'step-j-browser-fixture', enforce: 'pre',
    resolveId(id) { if (id === 'virtual:step-j-fixtures') return '\0step-j-fixtures' },
    load(id) {
      if (id === '\0step-j-fixtures') return `export default ${fixture}`
      if (id.replaceAll('\\', '/').endsWith('/src/lib/api.js')) return `export const workspaceApi = { send: (...args) => window.__stepJ.api.send(...args), getWorkspace: (...args) => window.__stepJ.api.getWorkspace(...args) }; export { apiErrorMessage } from './authenticatedApi.js';`
    },
    configureServer(vite) { vite.middlewares.use('/__step_j__', async (_req, res) => {
      res.setHeader('Content-Type', 'text/html'); res.end(await vite.transformIndexHtml('/__step_j__', '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/chatBrowserHarness.js"></script></body></html>'))
    }) },
  }] })
  await server.listen()
  const port = server.httpServer.address().port
  browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
  let endpoint
  for (let i = 0; i < 100; i++) { try { endpoint = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break } catch { await sleep(100) } }
  if (!endpoint) throw Error('Browser CDP did not start')
  const tabs = await (await fetch(`http://127.0.0.1:${endpoint}/json/list`)).json()
  ws = new WebSocket(tabs.find((tab) => tab.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }) })
  let next = 0; const pending = new Map(), errors = []
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id) { const item = pending.get(message.id); pending.delete(message.id); if (message.error) item?.reject(Error(message.error.message)); else item?.resolve(message.result) }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text)
  })
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++next; const timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timed out: ${method}`)) }, 20000)
    pending.set(id, { resolve: (result) => { clearTimeout(timer); resolve(result) }, reject: (error) => { clearTimeout(timer); reject(error) } })
    ws.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => {
    const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
    return result.result.value
  }
  const wait = async (expression, label = expression) => { for (let i = 0; i < 160; i++) { if (await evaluate(`!!(${expression})`)) return; await sleep(100) } throw Error(`Timed out: ${label}`) }
  const reload = async () => {
    const previous = await evaluate('performance.timeOrigin')
    await cdp('Page.reload')
    await wait(`performance.timeOrigin !== ${previous} && window.__stepJ && (document.body.innerText.includes('Persona:') || document.body.innerText.includes('Select persona'))`, 'new document after reload')
  }
  const click = async (label, exact = true) => {
    const expression = `[...document.querySelectorAll('button')].find(b => ${exact ? `b.textContent.trim() === ${JSON.stringify(label)}` : `b.textContent.includes(${JSON.stringify(label)})`} && !b.disabled)`
    await wait(expression, `button ${label}`); await evaluate(`${expression}.click()`)
  }
  const input = async (selector, value) => evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event('input', { bubbles: true })); })()`)
  const text = () => evaluate('document.body.innerText')
  const posts = () => evaluate(`window.__stepJ.db.calls.filter(c => c.method === 'POST').length`)
  await cdp('Runtime.enable'); await cdp('Page.enable')
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/__step_j__` })
  await wait(`document.body.innerText.includes('Select persona')`)
  const legacyKey = `lucent_chats:v2:${encodeURIComponent(JSON.stringify(['account-a', 'workspace-a']))}`
  const legacyBytes = JSON.stringify({ chats: [{ id: 'local-history', title: 'Synthetic local history', messages: [{ id: 'local-message', role: 'assistant', type: 'text', text: 'Preserved local-only text' }] }] })
  await evaluate(`localStorage.setItem(${JSON.stringify(legacyKey)}, ${JSON.stringify(legacyBytes)}); localStorage.setItem('lucent_chats', 'unscoped legacy bytes')`)
  await reload()
  const choosePersona = async () => { await click('Select persona'); await click('Use this persona') }
  const newChat = async () => { await click('+ New Chat'); await choosePersona() }
  await evaluate(`window.__stepJ.openConfiguration()`)
  await wait(`document.querySelector('select[aria-label="Professional to Casual"]')`)
  await evaluate(`(() => { const e = document.querySelector('select[aria-label="Professional to Casual"]'); e.value='2'; e.dispatchEvent(new Event('change', {bubbles:true})); })()`)
  await click('Save brand profile'); await wait(`window.__stepJ.db.brand.tone.professional === 2`)
  assert.equal(await evaluate(`window.__stepJ.db.brand.tone.custom`), 'Preserve tone')
  await click('Edit'); await input('textarea[aria-label="Audience needs"]', 'Document education\nClear next steps')
  await input('textarea[aria-label="Pain points"]', 'Confusing documentation')
  await click('Save persona'); await wait(`window.__stepJ.db.personas[0].audience_profile.needs?.length === 2`)
  assert.equal(await evaluate(`window.__stepJ.db.personas[0].audience_profile.custom.preserve`), true)
  await click('Back to chat')
  await choosePersona()
  assert.equal(await evaluate(`!!document.querySelector('select[aria-label="Generation persona"]')`), false)
  await click('Brand Summary'); await wait(`document.querySelector('dialog[open]')`); await click('Close')
  await click('💡 Content Creation'); const suggestions = await evaluate(`[...document.querySelectorAll('footer button')].map(b=>b.textContent).join('|')`); await click('↻ More'); assert.notEqual(await evaluate(`[...document.querySelectorAll('footer button')].map(b=>b.textContent).join('|')`), suggestions)
  await evaluate(`window.__stepJ.holdReply = true`)
  await input('textarea', 'Synthetic first request'); await click('Send')
  await wait(`typeof window.__stepJ.releaseReply === 'function'`)
  await input('textarea', 'Unsent next message stays intact')
  await evaluate(`window.__stepJ.releaseReply()`)
  await wait(`document.body.innerText.includes('Synthetic supplemental disclosure.')`)
  assert.equal(await evaluate(`document.querySelector('textarea').value`), 'Unsent next message stays intact')
  await click('Make it shorter'); await wait(`document.body.innerText.includes('Shortened synthetic text.')`)
  await wait(`document.body.innerText.includes('Previous versions (1)')`)
  const beforeReload = await posts(); await reload()
  await wait(`document.body.innerText.includes('Shortened synthetic text.')`); assert.equal(await posts(), beforeReload)
  await click('Clear / Archive'); await click('Archive and start new'); await choosePersona(); await click('Archive')
  await click('Synthetic education audience', false); await click('Restore'); await click('Conversations')
  assert.match(await text(), /Shortened synthetic text/)
  await newChat(); await evaluate(`window.__stepJ.mode = 'posts'`)
  await input('textarea', 'Synthetic posts'); await click('Send'); await wait(`document.body.innerText.includes('Generate social image')`)
  await click('Generate social image', false); await wait(`document.body.innerText.includes('Download PNG')`)
  const imageCalls = await posts(); await reload(); await wait(`document.body.innerText.includes('Download PNG')`); assert.equal(await posts(), imageCalls)
  // Exercise the actual local PNG exporter, not a screenshot of its scaled preview.
  const downloads = path.join(profile, 'downloads'); await mkdir(downloads)
  await cdp('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads })
  await click('Download PNG', false)
  let exported
  for (let i = 0; i < 160; i++) {
    exported = (await readdir(downloads)).find((name) => name.endsWith('.png'))
    if (exported) break
    await sleep(100)
  }
  assert.ok(exported, 'Native PNG export should finish')
  const png = await readFile(path.join(downloads, exported))
  assert.equal(png.readUInt32BE(16), 1080); assert.equal(png.readUInt32BE(20), 1080)
  const nativeImage = path.join(process.env.STEP_J_SCREENSHOT_DIR || tmpdir(), 'step-j7-native-image.png')
  await copyFile(path.join(downloads, exported), nativeImage)
  console.log(`Native PNG export: 1080 x 1080; ${nativeImage}`)
  await click('↻ Regenerate'); await wait(`document.body.innerText.includes('Previous image versions')`)
  const screenshotDir = process.env.STEP_J_SCREENSHOT_DIR || tmpdir()
  const desktop = await cdp('Page.captureScreenshot', { format: 'png' })
  await writeFile(path.join(screenshotDir, 'step-j4-desktop.png'), Buffer.from(desktop.data, 'base64'))
  await newChat(); await evaluate(`window.__stepJ.mode = 'campaign'`)
  await input('textarea', 'Synthetic campaign'); await click('Send'); await wait(`document.body.innerText.includes('Content Calendar')`)
  await click('Content Calendar', false); await click('Generate video script', false)
  await wait(`document.body.innerText.includes('Have questions about documents?')`)
  const videoCalls = await posts(); await reload(); await wait(`document.body.innerText.includes('Content Calendar')`)
  await click('Content Calendar', false); await wait(`document.body.innerText.includes('Have questions about documents?')`); assert.equal(await posts(), videoCalls)
  await click('Regenerate video'); await wait(`document.body.innerText.includes('Previous video versions')`)
  await newChat(); await evaluate(`window.__stepJ.mode = 'clarification'`)
  await input('textarea', 'Synthetic clarification'); await click('Send'); await wait(`document.body.innerText.includes('Which platform?')`)
  await click('Instagram', false); await click('Continue'); await wait(`document.body.innerText.includes('Answers submitted')`)
  await reload(); await wait(`document.body.innerText.includes('Answers submitted')`)
  assert.match(await text(), /Which platform\?: Instagram/)
  await newChat(); await evaluate(`window.__stepJ.mode = 'lost'`)
  await input('textarea', 'Synthetic lost response'); await click('Send')
  await wait(`Object.values(window.__stepJ.db.sessions).some(s => s.owner === 'account-a') && Object.values(window.__stepJ.db.results).length > 0`)
  // Wait for this committed response, then reload while only the client reply is missing.
  await wait(`Object.entries(window.__stepJ.db.sessions).some(([id,s]) => s.owner === 'account-a' && window.__stepJ.db.messages[id]?.some(m => m.role === 'assistant'))`)
  const lostCalls = await posts(); await reload(); await wait(`document.body.innerText.includes('Synthetic supplemental disclosure.')`); assert.equal(await posts(), lostCalls)
  await newChat(); await evaluate(`window.__stepJ.mode = 'unknown'`)
  await input('textarea', 'Synthetic uncertainty'); await click('Send'); await wait(`document.body.innerText.includes('Outcome unknown')`)
  const unknownCalls = await posts(); await sleep(2200); assert.equal(await posts(), unknownCalls)
  assert.equal(await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent === 'Start a new attempt').disabled`), true)
  await evaluate(`document.querySelector('input[type=checkbox]').click()`)
  await click('Close this uncertain attempt'); await wait(`!document.body.innerText.includes('Outcome unknown')`)
  assert.equal(await posts(), unknownCalls + 1) // abandonment only; no provider dispatch
  await click('Local history'); await click('Synthetic local history', false)
  await wait(`document.body.innerText.includes('Preserved local-only text')`)
  assert.equal(await evaluate(`!!document.querySelector('textarea')`), false)
  assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(legacyKey)})`), legacyBytes)
  assert.equal(await evaluate(`localStorage.getItem('lucent_chats')`), 'unscoped legacy bytes')
  await click('Conversations')
  // Populate only the synthetic in-browser repository to exercise real pagination controls.
  await evaluate(`(() => {
    const db = window.__stepJ.db;
    for (let i=0;i<35;i++) db.sessions['page-'+i] = { id:'page-'+i, owner:'account-a', title:'Paged conversation '+i, default_persona_id:${JSON.stringify(JSON.parse(fixture).persona_snapshot.id)}, etag:'"page"', updated_at:new Date(Date.now()+100000+i*1000).toISOString() };
    db.messages['page-34'] = Array.from({length:60},(_,i)=>({ id:'history-'+i, role:i%2?'assistant':'user', kind:'response', content:'History record '+i, created_at:new Date(Date.now()+i*1000).toISOString() }));
    window.__stepJ.save();
  })()`)
  await click('Conversations'); await click('Load more conversations')
  await wait(`document.querySelector('nav[aria-label="Conversation list"]').querySelectorAll('button').length > 30`)
  await click('Paged conversation 34', false); await wait(`document.body.innerText.includes('History record 59')`)
  assert.doesNotMatch(await text(), /History record 0\b/)
  await click('Load earlier messages'); await wait(`document.body.innerText.includes('History record 0')`)
  await click('Export chat')
  let jsonFile
  for (let i=0;i<100;i++) { jsonFile = (await readdir(downloads)).find(name=>name.endsWith('.json')); if(jsonFile) break; await sleep(100) }
  assert.ok(jsonFile, 'complete conversation export downloaded')
  const document = JSON.parse(await readFile(path.join(downloads, jsonFile), 'utf8'))
  assert.equal(document.schema_version, 1); assert.equal(document.messages.length, 60)
  assert.equal(JSON.stringify(document).includes('claim_token'), false)

  await evaluate(`window.__stepJ.switchAccount('account-b')`)
  await wait(`document.body.innerText.includes('Select persona')`)
  assert.doesNotMatch(await text(), /Synthetic uncertainty|Shortened synthetic text/)
  await evaluate(`window.__stepJ.switchAccount('account-a', 'viewer')`)
  await wait(`document.body.innerText.includes('Your workspace role permits reading')`)
  assert.equal(await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('New Chat')).disabled`), true)
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await sleep(200)
  assert.equal(await evaluate('document.documentElement.scrollWidth <= 390'), true)
  const screenshot = await cdp('Page.captureScreenshot', { format: 'png' })
  const screenshotPath = path.join(screenshotDir, 'step-j4-mobile.png'); await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'))
  assert.deepEqual(errors, [])
  console.log('Browser acceptance passed: send/reload, immutable shortening, archive/restore, image/video generation and revisions/reload, clarification/reload, lost reply, uncertainty/no redispatch, legacy bytes/read-only, conversation/history pagination, account switch, viewer, 390px layout. No Flask, Neon or provider calls.')
  console.log(`Screenshot: ${screenshotPath}`)
} finally {
  ws?.close()
  if (browser && process.platform === 'win32') await new Promise((resolve) => {
    const cleanup = spawn('taskkill', ['/PID', String(browser.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    cleanup.on('exit', resolve); cleanup.on('error', resolve)
  })
  else browser?.kill()
  await server?.close()
  // Only remove this runner's verified synthetic browser profile, inside the OS temp directory.
  await sleep(1000)
  const resolvedProfile = await realpath(profile), resolvedTemp = await realpath(tmpdir())
  if (path.dirname(resolvedProfile) === resolvedTemp && path.basename(resolvedProfile).startsWith('lucie-step-j-browser-')) {
    await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 }).catch(() => console.warn(`Synthetic browser profile still locked: ${resolvedProfile}`))
  }
}
