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
    await wait(`performance.timeOrigin !== ${previous} && window.__stepJ && (document.body.innerText.includes('Persona:') || document.querySelector('button[aria-label^="Select persona:"]'))`, 'new document after reload')
  }
  const click = async (label, exact = true) => {
    const expression = `[...document.querySelectorAll('button')].find(b => ${exact ? `(b.textContent.trim() === ${JSON.stringify(label)} || b.getAttribute('aria-label') === ${JSON.stringify(label)})` : `b.textContent.includes(${JSON.stringify(label)})`} && !b.disabled)`
    await wait(expression, `button ${label}`); await evaluate(`${expression}.click()`)
  }
  const input = async (selector, value) => evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event('input', { bubbles: true })); })()`)
  const enter = async (selector) => { await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`); await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter'}); await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter'}) }
  const text = () => evaluate('document.body.innerText')
  const posts = () => evaluate(`window.__stepJ.db.calls.filter(c => c.method === 'POST').length`)
  await cdp('Runtime.enable'); await cdp('Page.enable')
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/__step_j__` })
  await wait(`document.querySelector('button[aria-label^="Select persona:"]')`)
  const legacyKey = `lucent_chats:v2:${encodeURIComponent(JSON.stringify(['account-a', 'workspace-a']))}`
  const legacyBytes = JSON.stringify({ chats: [{ id: 'local-history', title: 'Synthetic local history', messages: [{ id: 'local-message', role: 'assistant', type: 'text', text: 'Preserved local-only text' }] }] })
  await evaluate(`localStorage.setItem(${JSON.stringify(legacyKey)}, ${JSON.stringify(legacyBytes)}); localStorage.setItem('lucent_chats', 'unscoped legacy bytes')`)
  await reload()
  const choosePersona = async () => { await wait(`document.querySelector('button[aria-label^="Select persona:"]')`); await evaluate(`document.querySelector('button[aria-label^="Select persona:"]').click()`); await click('Set Brand Guidelines') }
  const newChat = async () => { await click('New Chat'); await choosePersona() }
  await evaluate(`window.__stepJ.openConfiguration()`)
  await wait(`document.querySelector('[role=radio][aria-label="Professional to Casual: 2"]')`)
  await evaluate(`document.querySelector('[role=radio][aria-label="Professional to Casual: 2"]').click()`)
  const profileWrites = await evaluate(`window.__stepJ.db.calls.filter(c=>c.url==='/api/brand-profile'&&c.method==='PUT').length`)
  await input('input[aria-label="Keywords"]', 'clear advice'); await enter('input[aria-label="Keywords"]')
  await input('input[aria-label="Keywords"]', 'CLEAR ADVICE'); await enter('input[aria-label="Keywords"]')
  assert.equal(await evaluate(`document.querySelectorAll('ul[aria-label="Keywords tags"] li').length`), 1)
  await input('input[aria-label="Keywords"]', 'x'.repeat(201)); await enter('input[aria-label="Keywords"]')
  await wait(`document.body.innerText.includes('200 characters or fewer')`)
  await input('input[aria-label="Keywords"]', 'financing')
  await input('input[aria-label="Catchphrases"]', 'Clarity, at every step'); await enter('input[aria-label="Catchphrases"]')
  await input('input[aria-label="Banned words"]', 'guaranteed'); await enter('input[aria-label="Banned words"]')
  await input('textarea[aria-label="New writing example"]', 'First sample.\n\nSecond paragraph.'); await enter('textarea[aria-label="New writing example"]')
  await input('textarea[aria-label="New writing example"]', 'A second sample waiting to be added')
  assert.equal(await evaluate(`window.__stepJ.db.calls.filter(c=>c.url==='/api/brand-profile'&&c.method==='PUT').length`), profileWrites)
  assert.equal(await evaluate(`document.body.innerText.includes('One item per line') || document.body.innerText.includes('JSON array or object')`), false)
  await click('Save brand profile'); await wait(`window.__stepJ.db.brand.tone.professional === 2`)
  assert.deepEqual(await evaluate(`window.__stepJ.db.brand.keywords`), ['clear advice','financing'])
  assert.deepEqual(await evaluate(`window.__stepJ.db.brand.catchphrases`), ['Clarity, at every step'])
  assert.deepEqual(await evaluate(`window.__stepJ.db.brand.blog_examples`), [{text:'First sample.\n\nSecond paragraph.'},{text:'A second sample waiting to be added'}])
  await click('Remove Keywords: clear advice'); await click('Save brand profile')
  await wait(`window.__stepJ.db.brand.keywords.length === 1`)
  assert.deepEqual(await evaluate(`window.__stepJ.db.brand.keywords`), ['financing'])
  await input('textarea[aria-label="Writing Example 1"]', 'Edited sample, with the same stored format.')
  await click('Remove writing Example 2'); await click('Save brand profile')
  await wait(`window.__stepJ.db.brand.blog_examples.length === 1 && window.__stepJ.db.brand.blog_examples[0].text.startsWith('Edited sample')`)
  const brandScreenshot = await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})
  await writeFile(path.join(process.env.STEP_J_SCREENSHOT_DIR || tmpdir(),'brand-tag-inputs.png'),Buffer.from(brandScreenshot.data,'base64'))

  assert.equal(await evaluate(`window.__stepJ.db.brand.tone.custom`), 'Preserve tone')
  await evaluate(`document.querySelector('button[aria-label^="Select persona:"]').click()`); await wait(`document.querySelector('form[data-persona-guidelines]')`)
  await evaluate(`[...document.querySelectorAll('form[data-persona-guidelines] summary')].find(e=>e.textContent==='More audience and writing guidance').parentElement.open=true`)
  await input('textarea[aria-label="Audience needs"]', 'Document education\nClear next steps')
  await input('textarea[aria-label="Pain points"]', 'Confusing documentation')
  await evaluate(`document.querySelector('form[data-persona-guidelines] [role=radio][aria-label="Serious to Humorous: 3"]').click(); window.__stepJ.failBrand=true`)
  await click('Set Brand Guidelines'); await wait(`document.body.innerText.includes('Audience changes were saved. Shared brand settings were not saved.')`)
  assert.equal(await evaluate(`window.__stepJ.db.personas[0].audience_profile.needs.length`), 2)
  const personaWrites = await evaluate(`window.__stepJ.db.calls.filter(c=>c.url.startsWith('/api/personas/')&&c.method==='PUT').length`)
  await evaluate(`window.__stepJ.failBrand=false`)
  await click('Set Brand Guidelines'); await wait(`!document.querySelector('form[data-persona-guidelines]')`)
  assert.equal(await evaluate(`window.__stepJ.db.calls.filter(c=>c.url.startsWith('/api/personas/')&&c.method==='PUT').length`), personaWrites)

  assert.equal(await evaluate(`window.__stepJ.db.personas[0].audience_profile.custom.preserve`), true)
  await click('Back to chat')
  const screenshotDir = process.env.STEP_J_SCREENSHOT_DIR || tmpdir()
  const capture = async (name) => { const shot = await cdp('Page.captureScreenshot', {format:'png'}); await writeFile(path.join(screenshotDir, name), Buffer.from(shot.data, 'base64')) }
  await cdp('Emulation.setDeviceMetricsOverride', {width:760,height:650,deviceScaleFactor:1,mobile:false})
  await capture('legacy-persona-picker.png')
  await click('New persona')
  await input('input[aria-label="Persona name"]', 'Review audience')
  await input('textarea[aria-label="Short description"]', 'A separate audience for reviewing the original creation flow.')
  await capture('legacy-add-persona.png')
  await click('Add Persona')
  await wait(`document.querySelector('form[data-persona-guidelines]') && document.body.innerText.includes('Review audience')`)
  assert.equal(await evaluate(`window.__stepJ.db.personas.find(p=>p.name==='Review audience').audience_profile.ageRange`), undefined)
  await click('← Back to personas')
  await evaluate(`document.querySelector('button[aria-label^="Select persona:"]').click()`)

  await wait(`document.querySelector('form[data-persona-guidelines]')`)
  await evaluate(`document.querySelector('button[aria-label="Remove Core values: Clarity"]').click()`)
  await input('input[aria-label="Core values"]', 'Transparency'); await enter('input[aria-label="Core values"]')
  await input('input[aria-label="Core values"]', 'Accuracy'); await enter('input[aria-label="Core values"]')
  await evaluate(`document.querySelector('[role=radio][aria-label="Professional to Casual: 3"]').click()`)
  await evaluate(`document.querySelector('[role=radio][aria-label="Authoritative to Conversational: 3"]').click()`)
  await evaluate(`document.querySelector('[role=radio][aria-label="Serious to Humorous: 3"]').click()`)
  await evaluate(`document.querySelector('[role=radio][aria-label="Matter of Fact to Enthusiastic: 3"]').click()`)
  await click('Use 25–45')
  await evaluate(`document.querySelector('[role=slider][aria-label="Minimum age"]').focus()`)
  await cdp('Input.dispatchKeyEvent', {type:'keyDown',key:'ArrowRight',code:'ArrowRight'}); await cdp('Input.dispatchKeyEvent', {type:'keyUp',key:'ArrowRight',code:'ArrowRight'})
  assert.equal(await evaluate(`document.querySelector('[aria-label="Minimum age"]').getAttribute('aria-valuenow')`), '26')
  await evaluate(`document.querySelector('[role=radio][aria-label="Professional to Casual: 3"]').focus()`)
  await cdp('Input.dispatchKeyEvent', {type:'keyDown',key:'ArrowRight',code:'ArrowRight'}); await cdp('Input.dispatchKeyEvent', {type:'keyUp',key:'ArrowRight',code:'ArrowRight'})
  assert.equal(await evaluate(`document.querySelector('[role=radio][aria-label="Professional to Casual: 4"]').getAttribute('aria-checked')`), 'true')
  // Both sliders clamp at the opposite bound; keyboard interaction cannot cross handles.
  await evaluate(`document.querySelector('[aria-label="Minimum age"]').focus()`)
  await cdp('Input.dispatchKeyEvent', {type:'keyDown',key:'End',code:'End'}); await cdp('Input.dispatchKeyEvent', {type:'keyUp',key:'End',code:'End'})
  assert.equal(await evaluate(`document.querySelector('[aria-label="Minimum age"]').getAttribute('aria-valuenow')`), '45')
  await cdp('Input.dispatchKeyEvent', {type:'keyDown',key:'Home',code:'Home'}); await cdp('Input.dispatchKeyEvent', {type:'keyUp',key:'Home',code:'Home'})
  const handle = await evaluate(`(() => { const r=document.querySelector('[aria-label="Minimum age"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2} })()`)
  await cdp('Input.dispatchMouseEvent', {type:'mousePressed',x:handle.x,y:handle.y,button:'left',clickCount:1})
  await cdp('Input.dispatchMouseEvent', {type:'mouseMoved',x:handle.x+80,y:handle.y,button:'left',buttons:1})
  await cdp('Input.dispatchMouseEvent', {type:'mouseReleased',x:handle.x+80,y:handle.y,button:'left',clickCount:1})
  const draggedAge = await evaluate(`Number(document.querySelector('[aria-label="Minimum age"]').getAttribute('aria-valuenow'))`)
  assert.ok(draggedAge > 1 && draggedAge <= 45)

  const select = async (label,value) => evaluate(`(() => { const e=document.querySelector('select[aria-label="'+${JSON.stringify(label)}+'"]'); e.value=${JSON.stringify(value)}; e.dispatchEvent(new Event('change',{bubbles:true})); })()`)
  await select('Household income', 'Under $100k'); await select('Highest education attained', "Bachelor's degree")
  await cdp('Emulation.setDeviceMetricsOverride', {width:760,height:1580,deviceScaleFactor:1,mobile:false})
  await evaluate(`document.querySelector('.h-dvh.overflow-y-auto').scrollTop=0`)
  await capture('legacy-persona-guidelines.png')
  await cdp('Emulation.setDeviceMetricsOverride', {width:390,height:844,deviceScaleFactor:1,mobile:true})
  assert.equal(await evaluate('document.documentElement.scrollWidth <= 390'), true)
  await capture('legacy-persona-guidelines-mobile.png')
  await cdp('Emulation.setDeviceMetricsOverride', {width:1440,height:1000,deviceScaleFactor:1,mobile:false})
  await click('Set Brand Guidelines')
  await wait(`window.__stepJ.db.brand.tone.professional === 4 && window.__stepJ.db.personas[0].audience_profile.ageRange?.[0] === ${draggedAge}`)
  assert.equal(await evaluate(`window.__stepJ.db.personas[0].audience_profile.education`), "Bachelor's degree")
  assert.equal(await evaluate(`window.__stepJ.db.personas[0].audience_profile.custom.preserve`), true)
  assert.equal(await evaluate(`window.__stepJ.db.brand.tone.custom`), 'Preserve tone')
  assert.deepEqual(await evaluate(`window.__stepJ.db.brand.values`), ['Transparency','Accuracy'])
  // Match the old stacked primary navigation and highlight the current view.
  const positions = await evaluate(`['Chat','Calendar','New Chat'].map(label=>{ const e=document.querySelector('nav[aria-label="Main navigation"] button[aria-label="'+label+'"]'),r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width} })`)
  assert.ok(positions[0].y < positions[1].y && positions[1].y < positions[2].y)
  assert.equal(positions[0].x, positions[1].x); assert.equal(positions[1].w, positions[2].w)
  await click('Calendar'); assert.equal(await evaluate(`document.querySelector('button[aria-label="Calendar"]').getAttribute('aria-current')`), 'page')
  await click('Chat')
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
    for (let i=0;i<35;i++) db.sessions['page-'+i] = { id:'page-'+i, owner:'account-a', created_by_member_id:'account-a', workspace_id:'workspace-a', title:'Paged conversation '+i, default_persona_id:${JSON.stringify(JSON.parse(fixture).persona_snapshot.id)}, etag:'"page"', updated_at:new Date(Date.now()+100000+i*1000).toISOString() };
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
  await wait(`document.body.innerText.includes('Paged conversation 34')`)
  await click('Paged conversation 33', false)
  await wait(`document.querySelector('textarea')`)
  await evaluate(`window.__stepJ.mode = 'text'`)
  await input('textarea', 'A shared followup from account B'); await click('Send')
  await wait(`window.__stepJ.db.messages['page-33']?.some(m=>m.author_member_id==='account-b')`)
  assert.equal(await evaluate(`window.__stepJ.db.sessions['page-33'].created_by_member_id`), 'account-a')
  await click('Rename'); await input('dialog input', 'Shared collaboration'); await click('Save title')
  await wait(`window.__stepJ.db.sessions['page-33'].title === 'Shared collaboration'`)
  await input('textarea', 'Keep my unsent draft')
  await evaluate(`window.__stepJ.db.sessions['page-32'].title='Updated by teammate'; window.dispatchEvent(new Event('focus'))`)
  await wait(`document.body.innerText.includes('Updated by teammate')`)
  assert.equal(await evaluate(`document.querySelector('textarea').value`), 'Keep my unsent draft')
  await evaluate(`window.__stepJ.switchAccount('account-b', 'owner', 'workspace-b')`)
  await wait(`document.querySelector('button[aria-label^="Select persona:"]')`)
  assert.doesNotMatch(await text(), /Shared collaboration|Paged conversation/)
  assert.equal(await evaluate(`window.__stepJ.api.send({url:'/api/chat/sessions/page-33?version=2',method:'GET'}, {expectedScope:JSON.stringify(['account-b','workspace-b'])}).then(()=>false,e=>e.response.status===404)`), true)
  await evaluate(`window.__stepJ.switchAccount('account-a')`)
  await wait(`document.body.innerText.includes('Shared collaboration')`)
  await click('Shared collaboration', false)
  await wait(`document.body.innerText.includes('A shared followup from account B')`)
  await click('Clear / Archive'); await click('Archive and start new'); await choosePersona(); await click('Archive')
  await click('Shared collaboration', false); await click('Restore'); await click('Conversations')
  await evaluate(`window.__stepJ.switchAccount('account-a', 'viewer')`)
  await wait(`document.body.innerText.includes('Your workspace role permits reading')`)
  assert.equal(await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('New Chat')).disabled`), true)
  await evaluate(`window.__stepJ.openConfiguration()`)
  await wait(`document.querySelector('input[aria-label="Keywords"]')`)
  assert.equal(await evaluate(`document.querySelector('input[aria-label="Keywords"]').disabled`), true)
  assert.equal(await evaluate(`!!document.querySelector('button[aria-label="Add Keywords"]')`), false)
  assert.equal(await evaluate(`document.querySelectorAll('ul[aria-label="Keywords tags"] li').length`), 1)
  await click('Back to chat')
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await sleep(200)
  assert.equal(await evaluate('document.documentElement.scrollWidth <= 390'), true)
  const screenshot = await cdp('Page.captureScreenshot', { format: 'png' })
  const screenshotPath = path.join(screenshotDir, 'step-j4-mobile.png'); await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'))
  assert.deepEqual(errors, [])
  console.log('Browser acceptance passed: send/reload, immutable shortening, archive/restore, image/video generation and revisions/reload, clarification/reload, lost reply, uncertainty/no redispatch, legacy bytes/read-only, conversation/history pagination, cross-account collaboration/attribution/archive/restore, workspace isolation, focus refresh/draft preservation, viewer, 390px layout. No Flask, Neon or provider calls.')
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
