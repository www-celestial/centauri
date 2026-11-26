// admin.js: the two things of the admin pages that the page's glue (ceres.js) and Cesia's loader don't do: load the
// page again, once a sign-in or a sign-out changed its cookie, so that its live screen opens with the new session; and
// tell the document the language of the pages, so that a screen reader reads them in it.
export const Reload = () => { location.reload() }
export const Lang = lang => { document.documentElement.lang = new TextDecoder().decode(lang) }
