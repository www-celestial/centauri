// admin.js: the things of the admin pages that the page's glue (ceres.js) and Cesia's loader don't do: load the page
// again, once a sign-in or a sign-out changed its cookie, so that its live screen opens with the new session; tell the
// document the language of the pages, so that a screen reader reads them in it; read the theme the server set (the
// setting AdminTheme, on the canvas); and keep on this machine the layout of the pages on the web (pages, the default,
// or dock), and whether they open as tabs, which a change applies by loading the page again.
export const Reload = () => { location.reload() }
export const Lang = lang => { document.documentElement.lang = new TextDecoder().decode(lang) }
export const Theme = () => { const c = document.querySelector('canvas'); return (c && c.dataset.theme) || 'dark' }
const kept = (name, none) => { try { return localStorage.getItem('centauri ' + name) || none } catch (e) { return none } }
export const Layout = () => { const v = kept('layout', 'pages'); return v === 'dock' ? 'dock' : 'pages' }
export const Tabs = () => kept('tabs', 'off') === 'on'
export const Keep = (name, value) => { try { localStorage.setItem('centauri ' + new TextDecoder().decode(name), new TextDecoder().decode(value)) } catch (e) { } location.reload() }
