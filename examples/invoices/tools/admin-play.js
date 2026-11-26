// admin-play.js: a person at the admin pages, for tools/admin-shot.ce, which evaluates this in the page by the DevTools
// protocol (no script of the page's own: its Content-Security-Policy allows none) and then calls play(step, arg). It
// reads the page as a screen reader does, by the tree of semantics that Ceres mirrors (ceres.js Tree), clicks the
// canvas where a node is, and types into the hidden input of a field, as the browser's typing does. Each step gives a
// line that says what the page showed: "ok ..." or "FAIL ...".
window.adminPlay = (() => {
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
    i.value = text
    i.dispatchEvent(new InputEvent('input', { data: text, inputType: 'insertText' }))
    await wait(200)
    return true
  }
  const texts = async () => all(await tree(), n => n.Role === 'text').map(n => n.Name)
  const says = async s => until(async () => (await texts()).some(t => t.includes(s)), 8000)
  const rowOf = async s => until(async () => all(await tree(), n => n.Role === 'row').find(r => all(r, c => c.Role === 'cell').some(c => (c.Name || '').includes(s))))
  const line = (cond, what) => (cond ? 'ok ' : 'FAIL ') + what
  const steps = {
    async signIn () {
      if (!await node('textbox', 'E-mail', 20000)) return line(false, 'the sign-in shows')
      await type('E-mail', 'super@app.test')
      await type('Password', 'correct horse super')
      const pw = find(await tree(), named('textbox', 'Password'))
      const masked = pw && pw.Secret === true && !String(pw.Value || '').includes('horse') && document.querySelector('input[aria-label=Password]').type === 'password'
      setTimeout(() => press('button', 'Sign in'), 50)
      return line(masked, 'the password only dots in the tree, and a password input; signing in (the page loads again)')
    },
    async signedIn () { return line(await node('link', 'Users', 20000), 'signed in: the menu of the admin') },
    async visit (name) {
      await press('link', name)
      await wait(1500)
      const t = await tree()
      return line(all(t, n => n.Role === 'heading').length > 0, `${name}: ${all(t, n => n.Role === 'row').length} rows, ${all(t, n => n.Role === 'text').length} texts`)
    },
    async disable () {
      const ada = await rowOf('ada@example.com'); if (!ada) return line(false, 'ada in the users')
      click(ada); await wait(500)
      const asked = await press('button', 'Disable ada@example.com') && await says('Disable ada@example.com?')
      await press('button', 'Yes')
      const done = await says('Done.')
      await wait(800)
      const row = await rowOf('ada@example.com')
      return line(asked && done && row && all(row, c => c.Role === 'cell').some(c => c.Name === 'yes'), 'a user chosen, disabled once asked, the table read again')
    },
    async edit () {
      await press('link', 'invoice'); await wait(1500)
      const first = all(await tree(), n => n.Role === 'row')[1]; if (!first) return line(false, 'an invoice in the data browser')
      click(first); await wait(700)
      await type('BillTo', 'Renamed by support ')
      await press('button', 'Save')
      const saved = await says('Done.')
      await type('Total', 'a lot')
      await press('button', 'Save')
      const refused = await says('422 Check the fields. (Total:')
      return line(saved && refused, 'an invoice changed in place, a total that is no number refused with its field')
    },
    async pay () {
      const inv = all(await tree(), n => n.Role === 'row')[1]; if (!inv) return line(false, 'an unpaid invoice')
      click(inv); await wait(400)
      await press('button', n => n.startsWith('Mark invoice'))
      await press('button', 'Yes')
      return line(await says('Paid.'), 'the app\'s own action, Mark paid')
    },
    async audit () {
      await wait(800)
      const kinds = all(await tree(), n => n.Role === 'cell').map(n => n.Name)
      return line(['disabled', 'data-edited'].every(k => kinds.includes(k)), 'the audit trail holds each change')
    },
    async revoke () {
      const k = await rowOf('Accounting robot'); if (!k) return line(false, 'the key in the table')
      click(k); await wait(500)
      const asked = await press('button', n => n.startsWith('Revoke key')) && await says('Accounting robot)?')
      await press('button', 'Yes')
      return line(asked && await says('Done.'), 'a key chosen, revoked once asked')
    },
    async flag () {
      const shown = await says('export.country') && await says('Tenants:')
      await press('button', 'On for everyone')
      return line(shown && await says('on for everyone'), 'the flag of the export, its office, then on for everyone')
    },
    async signOut () {
      setTimeout(() => press('button', 'Sign out'), 50)
      return line(true, 'signing out (the page loads again)')
    },
    async signedOut () { return line(await node('textbox', 'E-mail', 15000), 'signed out: the sign-in again') },
  }
  return (step, arg) => steps[step](arg).catch(e => 'FAIL ' + step + ': ' + e.message)
})()
