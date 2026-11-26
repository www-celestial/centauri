// drop-play.js: a person at the admin pages while the network comes and goes, for tools/drop-shot.ce, which evaluates
// this in the page by the DevTools protocol, cuts the network (Chrome's offline mode, a proxy that drops the TCP
// connections, a restart of the app) and then calls dropPlay(step, arg). It reads the page by the tree of semantics
// that Ceres mirrors (ceres.js Tree), as tools/admin-play.js does. Each step gives JSON: {Line, Box}, Line "ok ..." or
// "FAIL ...", Box the place of what the step looked at, for a picture of that part of the page.
window.dropPlay = (() => {
  // what the page writes to the console as an error, kept for the step errors
  const errors = []
  let onlines = 0, offlines = 0
  addEventListener('online', () => onlines++)
  addEventListener('offline', () => offlines++)
  const was = console.error
  console.error = (...a) => { errors.push(a.map(String).join(' ')); was.apply(console, a) }
  const wait = ms => new Promise(r => setTimeout(r, ms))
  const tree = async () => { const m = await import('/admin/ceres.js'); const t = m.Tree(); return t ? JSON.parse(t) : null }
  const find = (n, f) => !n ? null : f(n) ? n : (n.Kids || []).map(k => find(k, f)).find(Boolean)
  const all = (n, f, acc = []) => { if (!n) return acc; if (f(n)) acc.push(n); (n.Kids || []).forEach(k => all(k, f, acc)); return acc }
  const until = async (f, ms = 15000) => { for (let t = 0; t < ms; t += 100) { const v = await f(); if (v) return v; await wait(100) } return null }
  const named = (role, name) => n => n.Role === role && (typeof name === 'function' ? name(n.Name || '') : n.Name === name)
  const node = async (role, name, ms) => until(async () => find(await tree(), named(role, name)), ms)
  const click = n => { const c = document.querySelector('canvas'), r = c.getBoundingClientRect()
    for (const type of ['pointerdown', 'pointerup'])
      c.dispatchEvent(new PointerEvent(type, { clientX: r.left + n.X + Math.min(10, n.W / 2), clientY: r.top + n.Y + Math.min(6, n.H / 2), button: 0, bubbles: true })) }
  const press = async (role, name) => { const n = await node(role, name); if (!n) return false; click(n); await wait(400); return true }
  const type = async (name, text) => {
    const f = await node('textbox', name); if (!f) return false
    click(f)
    await until(async () => { const n = find(await tree(), named('textbox', name)); return n && n.Focused })
    const i = document.querySelector('input[aria-label="' + name + '"]')
    // what the field holds first rubbed out, as a person does with End and Backspace
    const key = k => i.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))
    key('End')
    for (let k = String(f.Value || '').length; k > 0; k--) key('Backspace')
    await wait(100)
    i.value = text
    i.dispatchEvent(new InputEvent('input', { data: text, inputType: 'insertText' }))
    await wait(200)
    return true
  }
  const texts = async () => all(await tree(), n => n.Role === 'text').map(n => n.Name)
  const says = async (s, ms = 15000) => until(async () => (await texts()).some(t => t.includes(s)), ms)
  const status = async () => find(await tree(), n => n.Role === 'text' && /^(Live|Offline|Connecting|Signed out|Screen closed)/.test(n.Name || ''))
  const box = n => n ? { X: n.X, Y: n.Y, W: n.W, H: n.H } : null
  const band = async () => { const s = await status(); return s ? { X: 0, Y: 0, W: innerWidth, H: s.Y + s.H + 8 } : null }
  const out = (cond, what, b) => JSON.stringify({ Line: (cond ? 'ok ' : 'FAIL ') + what, Box: b || null })
  const cellsOf = r => all(r, c => c.Role === 'cell').map(c => c.Name)
  const steps = {
    async live () {
      const s = await until(async () => { const n = await status(); return n && /^Live/.test(n.Name) ? n : null })
      return out(s, 'the band says ' + (s ? s.Name : 'nothing'), await band())
    },
    async offline () {
      const s = await until(async () => { const n = await status(); return n && /^Offline/.test(n.Name) ? n : null }, 20000)
      return out(s, 'the band says at once: ' + (s ? s.Name : 'nothing'), await band())
    },
    async choose () {
      await press('link', 'Data'); await wait(1200)
      await press('link', 'invoice'); await wait(1500)
      const row = all(await tree(), n => n.Role === 'row')[2]; if (!row) return out(false, 'an invoice in the data browser')
      click(row); await wait(700)
      const head = await until(async () => find(await tree(), n => n.Role === 'text' && /^invoice \d+$/.test(n.Name || '')))
      return JSON.stringify({ Line: (head ? 'ok ' : 'FAIL ') + (head ? head.Name : 'no invoice') + ' chosen in the data browser', Id: head ? Number(head.Name.split(' ')[1]) : null })
    },
    async save (bill) {
      const typed = await type('BillTo', bill)
      await press('button', 'Save')
      return out(typed, 'changed while away, Save: ' + bill)
    },
    async markPaid () {
      const asked = await press('button', n => n.startsWith('Mark paid'))
      // Yes by its key, C-y, as the band of keys says: the question is under the fields, below the window
      await until(async () => (await texts()).some(t => /^Mark paid .*\?$/.test(t)), 5000)
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true, cancelable: true }))
      const gone = await until(async () => !(await texts()).some(t => /^Mark paid .*\?$/.test(t)), 5000)
      return out(asked && gone, 'Mark paid while away, Yes')
    },
    async waiting (n) {
      const want = n + ' actions waiting'
      const s = await until(async () => { const x = await status(); return x && x.Name.includes(want) ? x : null })
      return out(s, 'the band says: ' + (s ? s.Name : 'nothing with ' + want), await band())
    },
    async back () {
      const t0 = performance.now()
      const s = await until(async () => { const x = await status(); return x && /^Live/.test(x.Name) && !/sending/.test(x.Name) ? x : null }, 45000)
      const now = await status()
      return out(s, 'back: ' + (s ? s.Name + ' after ' + Math.round(performance.now() - t0) + ' ms' : 'not back: ' + (now ? now.Name : '?') + ', navigator.onLine ' + navigator.onLine + ', online events ' + onlines + ', offline events ' + offlines), await band())
    },
    async conflict () {
      const t = await until(async () => find(await tree(), n => n.Role === 'text' && (n.Name || '').includes('was refused')), 15000)
      const keep = await node('button', 'Keep mine', 2000)
      const b = t && keep ? { X: 0, Y: 0, W: innerWidth, H: keep.Y + keep.H + 12 } : await band()
      return out(t && keep, 'the conflict shown: ' + (t ? t.Name : 'none') + ', ' + (await texts()).filter(x => /^(seen|now|yours) /.test(x)).join(' / '), b)
    },
    async keepMine () {
      await press('button', 'Keep mine')
      const gone = await until(async () => !find(await tree(), named('button', 'Keep mine')), 15000)
      return out(gone, 'kept mine: sent again over the value now', await band())
    },
    async again (bill) {
      // the kind read again (the data browser is a list, not a live view), the same invoice chosen; then a change
      // asked, and the network cut by the test as it goes (tools/drop-shot.ce cuts after this step returns)
      const was = find(await tree(), n => n.Role === 'text' && /^invoice \d+$/.test(n.Name || ''))
      await press('link', 'Data'); await wait(1200)
      await press('link', 'invoice'); await wait(1500)
      const row = all(await tree(), n => n.Role === 'row')[2]; if (row) { click(row); await wait(700) }
      const now = await until(async () => find(await tree(), n => n.Role === 'text' && /^invoice \d+$/.test(n.Name || '')))
      if (!was || !now || was.Name !== now.Name) return out(false, 'the same invoice chosen again')
      await type('BillTo', bill)
      await press('button', 'Save')
      return out(true, 'a change asked as the connection drops: ' + bill)
    },
    async reloaded () {
      const s = await until(async () => { const x = await status(); return x && /data reloaded/.test(x.Name) ? x : null }, 30000)
      return out(s, 'after the restart: ' + (s ? s.Name : 'no reload said'), await band())
    },
    async errors () { return out(errors.length === 0, 'errors of the page: ' + (errors.length ? errors.join(' / ').slice(0, 2000) : 'none')) },
    async dump () {
      const t = await tree()
      return out(true, 'links ' + all(t, n => n.Role === 'link').map(n => n.Name).join('|') + ' rows ' + all(t, n => n.Role === 'row').length + ' texts ' + (await texts()).slice(0, 12).join('|') + ' ... ' + (await texts()).slice(-12).join('|'))
    },
    async says (words) { return out(await says(words), 'the page says ' + words) },
  }
  return async (step, arg) => { try { return await steps[step](arg) } catch (e) { return out(false, step + ': ' + e) } }
})()
