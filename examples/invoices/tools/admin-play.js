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
    'End session': 'Terminer la session', 'No': 'Non', 'Run job': 'Relancer le job', 'E-mail to invite': 'E-mail à inviter',
    'Invite by mail': 'Inviter par mail', 'Live': 'Direct', 'Code of your app': 'Code de votre app', 'Send': 'Envoyer',
    'Disable': 'Désactiver', 'Invoices — admin': 'Factures — administration', 'Events': 'Événements', 'Audit trail': 'Piste d’audit',
    'Keys of programs': 'Clés de programmes', 'Unpaid invoices': 'Factures impayées', 'Requests a second': 'Requêtes par seconde',
    'Invoices': 'Factures', 'User ': 'Utilisateur ', 'Tenant ': 'Tenant ', 'Roles of the invitation': 'Rôles de l’invitation',
  }
  const say = s => (document.documentElement.lang.startsWith('fr') && FR[s]) || s
  const wait = ms => new Promise(r => setTimeout(r, ms))
  const tree = async () => { const m = await import('/admin/ceres.js'); const t = m.Tree(); return t ? JSON.parse(t) : null }
  const find = (n, f) => !n ? null : f(n) ? n : (n.Kids || []).map(k => find(k, f)).find(Boolean)
  const all = (n, f, acc = []) => { if (!n) return acc; if (f(n)) acc.push(n); (n.Kids || []).forEach(k => all(k, f, acc)); return acc }
  const until = async (f, ms = 15000) => { for (let t = 0; t < ms; t += 100) { const v = await f(); if (v) return v; await wait(100) } return null }
  // a name, or its start when it ends with *
  const named = (role, name) => n => n.Role === role && (typeof name === 'function' ? name(n.Name || '')
    : name.endsWith('*') ? (n.Name || '').startsWith(say(name.slice(0, -1))) : n.Name === say(name))
  const node = async (role, name, ms) => until(async () => find(await tree(), named(role, name)), ms)
  const click = n => { const c = document.querySelector('canvas'), r = c.getBoundingClientRect()
    for (const type of ['pointerdown', 'pointerup'])
      c.dispatchEvent(new PointerEvent(type, { clientX: r.left + n.X + Math.min(10, n.W / 2), clientY: r.top + n.Y + Math.min(6, n.H / 2), button: 0, bubbles: true })) }
  // a node out of the sight of its panel (a page taller than the center of the dock) brought into it as a person does,
  // by the wheel over a part of the panel that no table takes (the wheel over a table scrolls the table)
  const pathTo = (n, f, up = []) => { if (!n) return null; const p = [...up, n]; if (f(n)) return p; for (const k of n.Kids || []) { const got = pathTo(k, f, p); if (got) return got } return null }
  const inSight = async n => {
    for (let k = 0; k < 40; k++) {
      const t = await tree(), path = pathTo(t, x => x.Id === n.Id)
      if (!path) return n
      const m = path[path.length - 1], panel = [...path].reverse().find(x => x.Role === 'tabpanel')
      if (!panel || (m.Y >= panel.Y && m.Y + m.H <= panel.Y + panel.H)) return m
      const tables = all(panel, x => x.Role === 'table'), x = panel.X + 12
      let y = null
      for (let at = panel.Y + 4; at < panel.Y + panel.H - 4 && y === null; at += 8)
        if (!tables.some(b => x >= b.X && x < b.X + b.W && at >= b.Y && at < b.Y + b.H)) y = at
      if (y === null) return m
      const c = document.querySelector('canvas'), r = c.getBoundingClientRect()
      c.dispatchEvent(new WheelEvent('wheel', { clientX: r.left + x, clientY: r.top + y, deltaY: m.Y < panel.Y ? -100 : 100, bubbles: true, cancelable: true }))
      await wait(80)
    }
    return n
  }
  const press = async (role, name) => { let n = await node(role, name); if (!n) return false; n = await inSight(n); click(n); await wait(400); return true }
  // a field's text replaced as a person does, its old text emptied first (End, then Backspace), then the new one typed
  const type = async (name, text) => {
    const f = await node('textbox', name); if (!f) return false
    click(await inSight(f))
    await until(async () => { const n = find(await tree(), named('textbox', name)); return n && n.Focused })
    const i = document.querySelector('input[aria-label="' + say(name) + '"]')
    for (const key of ['End', ...Array(80).fill('Backspace')]) i.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    await wait(100)
    i.value = text
    i.dispatchEvent(new InputEvent('input', { data: text, inputType: 'insertText' }))
    await wait(200)
    return true
  }
  // a field emptied as a person does: End, then Backspace until nothing is left
  const clear = async name => {
    const f = await node('textbox', name); if (!f) return false
    click(await inSight(f))
    await until(async () => { const n = find(await tree(), named('textbox', name)); return n && n.Focused })
    const i = document.querySelector('input[aria-label="' + say(name) + '"]')
    for (const key of ['End', ...Array(40).fill('Backspace')]) i.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
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
  // the box of a part of the page for a picture: from the node top to the node bottom (or height pixels), right of
  // the menu unless wide, as wide as what shows there
  const box = async spec => {
    const t = await tree(), pick = s => s && find(t, named(s[0], s[1]))
    const top = pick(spec.top), bottom = pick(spec.bottom)
    if (!top) return null
    const y0 = Math.max(0, top.Y - 10), y1 = Math.min(innerHeight, bottom ? bottom.Y + bottom.H + 10 : y0 + (spec.height || 300))
    const x0 = spec.wide ? 0 : 150
    const inside = all(t, n => n.W > 0 && n.Role !== 'page' && n.Y >= y0 && n.Y + n.H <= y1 + 1 && n.X >= x0 - 1)
    const x1 = Math.min(innerWidth, Math.max(...inside.map(n => n.X + n.W)) + 12)
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
  }
  // a page of the admin, by its row in the outliner of the dock (or a link of the page, as the kinds of the data)
  const go = async name => {
    let n = await node('treeitem', name, 3000)
    if (!n) return press('link', name)
    // the outliner scrolled by the wheel until the row is in sight, then a click on its label, past its triangle
    const c = document.querySelector('canvas'), r = c.getBoundingClientRect()
    for (let k = 0; k < 60 && (n.Y < 70 || n.Y > innerHeight - 120); k++) {
      c.dispatchEvent(new WheelEvent('wheel', { clientX: r.left + n.X + 60, clientY: r.top + innerHeight / 2, deltaY: n.Y < 70 ? -100 : 100, bubbles: true, cancelable: true }))
      await wait(80)
      n = find(await tree(), named('treeitem', name)) || n
    }
    for (const type of ['pointerdown', 'pointerup'])
      c.dispatchEvent(new PointerEvent(type, { clientX: r.left + n.X + 14 * n.Level + 30, clientY: r.top + n.Y + n.H / 2, button: 0, bubbles: true }))
    await wait(400)
    return true
  }
  const choose = async name => { const r = await rowOf(name); if (!r) return false; click(r); await wait(500); return true }
  const steps = {
    async clip (spec) { return JSON.stringify(await box(spec)) },
    async signInForm () {
      if (!await node('textbox', 'E-mail', 20000)) return line(false, 'the sign-in shows')
      await type('E-mail', 'super@app.test')
      await type('Password', 'correct horse super')
      return line(true, 'the sign-in, its e-mail and password typed')
    },
    async submit () {
      setTimeout(() => press('button', 'Sign in'), 50)
      return line(true, 'signing in (the page loads again)')
    },
    async yes () { await press('button', 'Yes'); return line(await says('Done.') || await says('Paid.'), 'yes: done') },
    async askDisable () {
      const asked = await choose('ada@example.com') && await press('button', 'Disable ada@example.com') && await says('Disable ada@example.com?')
      return line(asked, 'a user chosen, his disabling asked')
    },
    async openUser () {
      await go('Users'); await wait(1200)
      const opened = await choose('bruno@example.com') && await press('button', 'Open')
      await wait(1500)
      const seen = await says('Ways of signing in')
      const s = all(await tree(), n => n.Role === 'row')[1]; if (s) { click(s); await wait(500) }
      const asked = await press('button', 'End session*') && await says('?')
      return line(opened && seen && asked, "a user's page: his factors, one session's end asked")
    },
    async openTenant () {
      await go('Tenants'); await wait(1200)
      const opened = await choose('Martin & Co') && await press('button', 'Open')
      await wait(1500)
      await type('E-mail to invite', 'cleo@example.com')
      await clear('Roles of the invitation')
      await type('Roles of the invitation', 'accountant')
      await press('button', 'Invite by mail')
      return line(opened && await says('Done.'), 'a tenant, its members, an invitation sent')
    },
    async askRetry () {
      const asked = await choose('centauri.mail') && await press('button', 'Run job*') && await says('?')
      return line(asked, 'a dead job chosen, its new run asked')
    },
    async askPay () {
      const inv = all(await tree(), n => n.Role === 'row')[1]; if (!inv) return line(false, 'an unpaid invoice')
      click(inv); await wait(400)
      return line(await press('button', 'Mark invoice*') && await says('?'), "the app's own action asked")
    },
    async askRevoke () {
      return line(await choose('Accounting robot') && await press('button', 'Revoke key*') && await says('Accounting robot)?'), 'a key chosen, its revoking asked')
    },
    async live () {
      await press('button', 'Live'); await wait(1500)
      return line(all(await tree(), n => n.Role === 'row').length > 0, 'the events of the last hour, live')
    },
    async secondStep () {
      if (!await node('textbox', 'E-mail', 20000)) return line(false, 'the sign-in shows')
      await type('E-mail', 'bruno@example.com')
      await type('Password', 'correct horse battery')
      await press('button', 'Sign in')
      return line(await node('textbox', 'Code of your app', 15000), 'a password right, the second step asks the code of his app')
    },
    async lang (want) {
      const l = await until(async () => document.documentElement.lang || null, 20000) || ''
      return line(l === want && (want !== 'fr' || await node('button', 'Sign in', 20000) || await node('treeitem', 'Users', 1000)), `the pages speak ${l}`)
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
    async signedIn () { return line(await node('treeitem', 'Users', 20000), 'signed in: the outliner of the admin') },
    async visit (name) {
      await go(name)
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
    async edit (billTo) {
      await go('Invoices'); await wait(1500)
      const first = all(await tree(), n => n.Role === 'row')[1]; if (!first) return line(false, 'an invoice in the data browser')
      click(first); await wait(700)
      await type('BillTo', billTo || '<b>Renamed</b><img src=x onerror="window.pwned=1"> by support ')
      await press('button', 'Save')
      const saved = await says('Done.')
      await type('Total', 'a lot')
      await press('button', 'Save')
      const refused = await says('422 Check the fields. (Total:')
      if (billTo) { await type('Total', '1280.5'); await press('button', 'Save') }
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
      await go('Users'); await wait(1200)
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
