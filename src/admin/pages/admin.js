// admin.js: the one thing of the admin pages that the page's glue (ceres.js) and Cesia's loader don't do: load the page
// again, once a sign-in or a sign-out changed its cookie, so that its live screen opens with the new session.
export const Reload = () => { location.reload() }
