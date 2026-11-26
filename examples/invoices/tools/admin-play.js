// admin-play.js: a person at the admin pages, for tools/admin-shot.ce, which evaluates this in the page by the DevTools
// protocol (no script of the page's own: its Content-Security-Policy allows none) and then calls play(step, arg). It
// reads the page as a screen reader does, by the tree of semantics that Ceres mirrors (ceres.js Tree), clicks the
// canvas where a node is, and types into the hidden input of a field, as the browser's typing does. Each step gives a
// line that says what the page showed: "ok ..." or "FAIL ...". The pages in French (the document's lang, which the
// pages set), it reads and presses their French names; each page visited is checked to fit the window, no button over
// another; and a text with markup typed into a field stays a text in the document.
window.adminPlay = (() => {
  const FR = {
    'Users': 'Utilisateurs', 'Dashboard': 'Tableau de bord', 'Tenants': 'Tenants', 'Events': 'Événements', 'Log': 'Log', 'Jobs': 'Jobs',
    'Webhooks': 'Webhooks', 'Files': 'Fichiers', 'Settings': 'Réglages', 'Data': 'Données', 'Audit': 'Audit', 'Keys': 'Clés', 'Flags': 'Flags',
    'Unpaid': 'Impayées', 'Password': 'Mot de passe', 'Sign in': 'Se connecter', 'Sign out': 'Se déconnecter', 'Yes': 'Oui', 'Done.': 'Fait.',
    'yes': 'oui', 'Save': 'Enregistrer', 'Open': 'Ouvrir', 'Paid.': 'Payée.', 'Disable ada@example.com': 'Désactiver ada@example.com',
    'Disable ada@example.com?': 'Désactiver ada@example.com ?', '422 Check the fields. (Total:': '422 Vérifiez les champs. (Total:',
    'Mark invoice': 'Marquer payée la facture', 'Revoke key': 'Révoquer la clé', 'Accounting robot)?': 'Accounting robot) ?',
    'Tenants:': 'Tenants :', 'On for everyone': 'Activer pour tous', 'on for everyone': 'activé pour tous',
    'Ways of signing in': 'Moyens de connexion', 'Choose a session in the table': 'Choisissez une session dans le tableau',
    'End session': 'Terminer la session',
  }
  const say = s => (document.documentElement.lang.startsWith('fr') && FR[s]) || s
  const wait = ms => new Promise(r => setTimeout(r, ms))
  const tree = async () => { const m = await import('/admin/ceres.js'); const t = m.Tree(); return t ? JSON.parse(t) : null }
  const find = (n, f) => !n ? null : f(n) ? n : (n.Kids || []).map(k => find(k, f)).find(Boolean)
  const all = (n, f, acc = []) => { if (!n) return acc; if (f(n)) acc.push(n); (n.Kids || []).forEach(k => all(k, f, acc)); return acc }
  const until = async (f, ms = 15000) => { for (let t = 0; t < ms; t += 100) { const v = await f(); if (v) return v; await wait(100) } return null }
  const named = (role, name) => n => n.Role === role && (typeof name === 'function' ? name(n.Name || '') : n.Name === say(name))
  const node = async (role, name, ms) => until(async () => find(await tree(), named(role, name)), ms)
  const click = n => { const c = document.querySelector('canvas'), r = c.getBoundingClientRect()
    for (const type of ['pointerdown', 'pointerup'])
      c.dispatchEvent(new PointerEvent(type, { clientX: r.left + n.X + Math.min(10, n.W / 2), clientY: r.top + n.Y + Math.min(6, n.H / 2), button: 0, bubbles: true })) }
  const press = async (role, name) => { const n = await node(role, name); if (!n) return false; click(n); await wait(400); return true }
  const type = async (name, text) => {
    const f = await node('textbox', name); if (!f) return false
    click(f)
    await until(async () => { const n = find(await tree(), named('textbox', name)); return n && n.Focused })
    const i = document.querySelector('input[aria-label="' + say(name) + '"]')
    i.value = text
    i.dispatchEvent(new InputEvent('input', { data: text, inputType: 'insertText' }))
    await wait(200)
    return true
  }
  const texts = async () => all(await tree(), n => n.Role === 'text').map(n => n.Name)
  const says = async s => until(async () => (await texts()).some(t => t.includes(say(s))), 8000)
  // the boxes of a page that leave the window or lie over one another: a button, a link, a field or a text
  const overflows = t => {
    const w = innerWidth, boxes = all(t, n => ['button', 'link', 'textbox', 'text', 'heading'].includes(n.Role) && n.W > 0 && n.Y >= 0 && n.Y < innerHeight)
    const out = boxes.filter(n => n.X + n.W > w + 1).map(n => 'out: ' + n.Name)
    const buttons = boxes.filter(n => n.Role === 'button' || n.Role === 'textbox')
    for (let i = 0; i < buttons.length; i++) for (let j = i + 1; j < buttons.length; j++) {
      const a = buttons[i], b = buttons[j]
      if (a.X < b.X + b.W - 1 && b.X < a.X + a.W - 1 && a.Y < b.Y + b.H - 1 && b.Y < a.Y + a.H - 1) out.push('over: ' + a.Name + ' / ' + b.Name)
    }
    return out
  }
  const rowOf = async s => until(async () => all(await tree(), n => n.Role === 'row').find(r => all(r, c => c.Role === 'cell').some(c => (c.Name || '').includes(s))))
  const line = (cond, what) => (cond ? 'ok ' : 'FAIL ') + what
  const steps = {
    async lang (want) {
      const l = await until(async () => document.documentElement.lang || null, 20000) || ''
      return line(l === want && (want !== 'fr' || await node('button', 'Sign in', 20000) || await node('link', 'Users', 1000)), `the pages speak ${l}`)
    },
    async signIn () {
      if (!await node('textbox', 'E-mail', 20000)) return line(false, 'the sign-in shows')
      await type('E-mail', 'super@app.test')
      await type('Password', 'correct horse super')
      const pw = find(await tree(), named('textbox', 'Password'))
      const masked = pw && pw.Secret === true && !String(pw.Value || '').includes('horse') && document.querySelector('input[aria-label="' + say('Password') + '"]').type === 'password'
      setTimeout(() => press('button', 'Sign in'), 50)
      return line(masked, 'the password only dots in the tree, and a password input; signing in (the page loads again)')
    },
    async signedIn () { return line(await node('link', 'Users', 20000), 'signed in: the menu of the admin') },
    async visit (name) {
      await press('link', name)
      await wait(1500)
      const t = await tree(), bad = overflows(t)
      return line(all(t, n => n.Role === 'heading').length > 0 && bad.length === 0,
        `${say(name)}: ${all(t, n => n.Role === 'row').length} rows, ${all(t, n => n.Role === 'text').length} texts${bad.length ? ', ' + bad.join('; ') : ', all in the window'}`)
    },
    async markup () {
      const made = document.body.querySelectorAll('b, img, iframe, script:not([src])').length
      const shown = (await texts()).some(t => t.includes('<b>Renamed</b>')) || [...document.body.querySelectorAll('*')].some(e => (e.textContent || '').includes('<b>Renamed</b>'))
      return line(made === 0 && !window.pwned && shown, `markup typed stays a text: ${made} elements made of it`)
    },
    async disable () {
      const ada = await rowOf('ada@example.com'); if (!ada) return line(false, 'ada in the users')
      click(ada); await wait(500)
      const asked = await press('button', 'Disable ada@example.com') && await says('Disable ada@example.com?')
      await press('button', 'Yes')
      const done = await says('Done.')
      await wait(800)
      const row = await rowOf('ada@example.com')
      return line(asked && done && row && all(row, c => c.Role === 'cell').some(c => c.Name === say('yes')), 'a user chosen, disabled once asked, the table read again')
    },
    async edit () {
      await press('link', 'invoice'); await wait(1500)
      const first = all(await tree(), n => n.Role === 'row')[1]; if (!first) return line(false, 'an invoice in the data browser')
      click(first); await wait(700)
      await type('BillTo', '<b>Renamed</b><img src=x onerror="window.pwned=1"> by support ')
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
      await press('button', n => n.startsWith(say('Mark invoice')))
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
      const asked = await press('button', n => n.startsWith(say('Revoke key'))) && await says('Accounting robot)?')
      await press('button', 'Yes')
      return line(asked && await says('Done.'), 'a key chosen, revoked once asked')
    },
    async flag () {
      const shown = await says('export.country') && await says('Tenants:')
      await press('button', 'On for everyone')
      return line(shown && await says('on for everyone'), 'the flag of the export, its office, then on for everyone')
    },
    async user () {
      await press('link', 'Users'); await wait(1200)
      const bruno = await rowOf('bruno@example.com'); if (!bruno) return line(false, 'bruno in the users')
      click(bruno); await wait(500)
      await press('button', 'Open'); await wait(1500)
      const seen = await says('Ways of signing in') && await says('Choose a session in the table')
      const s = all(await tree(), n => n.Role === 'row')[1]; if (s) { click(s); await wait(500) }
      const asked = await press('button', n => n.startsWith(say('End session'))) && await says('?')
      await press('button', 'Yes')
      return line(seen && asked && await says('Done.'), "a user's ways of signing in, one session of his ended")
    },
    async signOut () {
      setTimeout(() => press('button', 'Sign out'), 50)
      return line(true, 'signing out (the page loads again)')
    },
    async signedOut () { return line(await node('textbox', 'E-mail', 15000), 'signed out: the sign-in again') },
  }
  return (step, arg) => steps[step](arg).catch(e => 'FAIL ' + step + ': ' + e.message)
})()
