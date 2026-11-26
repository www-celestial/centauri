# Sign up with an e-mail check, and a forgotten password

The task: someone signs up for his office, and gets no session before he opens the link of a mail we sent to his
address; a person who forgot his password asks for a new one and sets it by the link of a mail; and nobody learns, by
signing up or by asking for a password, which addresses have an account. The code is `src/auth/auth.ce` and
`src/mail/mail.ce`, their tests `tests/checks.test.ce` and `tests/mail.test.ce`; the invoices turn it on in
`examples/invoices/src/invoices/module.ce`, and `examples/invoices/tests/month.test.ce` (`isSignedUpByTheLinkOfItsMail`)
runs it.

What it uses: the settings `EmailCheck` and `SignUpAnswer`, codes kept as their hash and serving once, mails sent by
background jobs (package `mail`, chapter [The report of each night](nightly-report.md) for the jobs), the endpoints
`CheckEmail`, `SendCheck`, `Forgot` and `Reset` of `api.Accounts`.

## 1. Two settings

```cesia norun hide=code
(* For the check of this page: the packages its code uses, and the names it takes from the invoices of
   examples/invoices, unknown here. *)
use deps/www-celestial/centauri/src/api
use deps/www-celestial/centauri/src/app
use deps/www-celestial/centauri/src/apptest
use deps/www-celestial/centauri/src/auth
use deps/www-celestial/centauri/src/hooks
use deps/www-celestial/centauri/src/jobs
use std/bug
use std/http
use std/value
use std/json
Module = json.Parse("{}")!
Report = json.Parse("{}")!
Roles = json.Parse("{}")!
Settings = json.Parse("{}")!
ada = json.Parse("{}")!
invoices = json.Parse("{}")!
now = json.Parse("{}")!
```

```cesia norun
App = app.Of([auth.Module(), jobs.Module(every = [Report]), hooks.Module(), Module], name = "invoices", roles = Roles, settings = Settings,
  defaults = {MemberRoles: "accountant", EmailCheck: "required", SignUpAnswer: "neutral"})
```

| setting | values | what it does |
|---|---|---|
| `APP_EMAIL_CHECK` | `off` (the default: as before), `required`, `later` | `required`: the account is made, its mail sent, and no session until its link is opened (a sign-in before it is a 403 that sends the mail again); `later`: a session at once, the mail sent, `r.User.Checked` false until its link is opened |
| `APP_SIGN_UP_ANSWER` | `tell` (the default), `neutral` | `neutral`: a sign-up with an address that has an account answers as one with a new address, the same `202` and the same body; the owner of the address gets a mail that tells him, with a link to set a new password; it needs `EmailCheck = required` (the start stops otherwise: it can give a session to neither) |
| `APP_CHECK_TIME`, `APP_RESET_TIME` | 172800 (2 days), 3600 | how long a link of a check, of a new password, lasts |
| `APP_CHECK_PAGE`, `APP_RESET_PAGE` | `/check-email`, `/reset-password` | the pages of the front the links open, at `APP_ORIGIN` |
| `APP_MAILS_PER_HOUR` | 5 | the mails an address gets an hour, whoever asks: nobody fills a stranger's box |
| `APP_MAIL_URL`, `APP_MAIL_FROM` | `log:` in dev, `test:` in test, required in prod | the transport and the sender: [The report of each night](nightly-report.md#3-the-mail) |

Each is a setting, and an app that wants another way of its own sets it: a public app of strangers takes `required` and
`neutral`; an app of a company's staff, invited one by one, can keep `off`.

```java
// Spring Boot: no e-mail check in Spring Security; an entity of tokens, a controller, a JavaMailSender, a flag on the
// user that the UserDetails reads, and the same answer for a taken address written by hand
@Entity class CheckToken { @Id @GeneratedValue Long id; @ManyToOne User user; String hash; Instant ends; }
@PostMapping("/auth/signup") ResponseEntity<Void> signUp(@Valid @RequestBody SignUpIn in) {
  if (users.existsByEmail(in.email())) { mails.send(in.email(), "Someone tried to sign up..."); return ResponseEntity.accepted().build(); }
  var u = users.save(new User(in.email(), encoder.encode(in.password()), false));
  var code = tokens.newFor(u);                       // keep its hash, send the code
  mails.send(u.email, "Check your address: " + origin + "/check-email#code=" + code);
  return ResponseEntity.accepted().build();
}
```

## 2. The link of the mail

The sign-up writes, in one group, the user, his tenant, his membership and the job of the mail; the job makes the code,
keeps its BLAKE2b hash with its end (`centauri_code`), and sends the link:

```text
http://localhost:8080/check-email#code=5f0c...e91a
```

- The code is 32 random bytes of the kernel, in hex. The database never holds it, only its hash: a copy of the database
  opens no account (`isNoCodeKept`). The job makes it when it runs, so it is not in the job's arguments either.
- The code is in the fragment, after `#`: a browser never sends a fragment to a server, so no log, no proxy and no
  `Referer` holds it. The page of the front reads it and sends it to `POST /auth/check`.
- A GET never writes (chapter [Your first API](first-api.md)), and a client of mail that opens the link to show a preview
  checks nothing: only the page's POST does.
- The code serves once and ends: the group that uses it expects it as it was (`Expect`), so two pages that send it at
  once check once (`isCheckedBeforeASession`, `isOldLinkRefused`).

`POST /auth/check {Code}` marks the address checked (`centauri_user/Checked`, the instant) and signs in: the cookie comes
back, as at a sign-in. A new mail is `POST /auth/check/send {Email}`, which answers `202` whatever the address.

## 3. A forgotten password

```text
POST /auth/forgot {Email}            -> 202, always
POST /auth/reset  {Code, Password}   -> the account, and a new session
```

`Forgot` writes one job, whatever the address; the job looks for the account and sends the mail only to one that
exists. So an address with an account and one without get the same answer, after the same work (one write), byte for
byte (`isPasswordSetByItsMail`). `Reset` checks the code (of the kind `reset`: a code of a check sets no password),
sets the new password (Argon2id), marks the address checked (the mail reached it), ends **every** session of the user,
the one a thief may hold too, and opens a new one.

```java
// Spring Boot: a PasswordResetToken entity, its controller, and the end of the sessions by Spring Session's
// FindByIndexNameSessionRepository, by hand
@PostMapping("/auth/reset") Account reset(@Valid @RequestBody ResetIn in, HttpServletRequest req) {
  var t = tokens.findByHashAndKind(hash(in.code()), "reset").filter(x -> x.ends.isAfter(Instant.now())).orElseThrow(Forbidden::new);
  t.user.password = encoder.encode(in.password()); tokens.delete(t);
  sessions.findByPrincipalName(t.user.email).keySet().forEach(sessions::deleteById);
  return signIn(t.user, req);
}
```

## 4. What it defends against

| threat | defense | test |
|---|---|---|
| learning which addresses have an account by signing up | `SignUpAnswer = neutral`: the same answer, after one password hash and one write either way; the owner of the address is told, not the sender | `isSignUpNeutral` |
| the same, by a forgotten password | `202` always, one write always, the mail sent by the job only to an account | `isPasswordSetByItsMail` |
| a link used twice, or late, or of another kind | the code serves once, ends after its time, and has a kind | `isCheckedBeforeASession`, `isOldLinkRefused`, `isPasswordSetByItsMail` |
| a code read in the database, the logs or the jobs | its hash only; made by the job as it sends; in the fragment of the link | `isNoCodeKept` |
| a stranger's box filled with our mails | `MailsPerHour` an address, and the sign-ups of an address | `isStrangersBoxNotFilled` |
| a header added to a mail by an address or a name (`\r\nBcc:`) | every header checked; addresses of RFC 5321's plain form only; non-ASCII as RFC 2047; the text in base64 | `isHeaderInjectionRefused` |
| a thief's session kept after a new password | every session of the user ended, in this process at once | `isPasswordSetByItsMail` |

And the generated tests pass on an app whose sign-up checks addresses: `apptest.Isolated` and `apptest.Fuzz`
(`isAccountsIsolatedAndFuzzedWithMail`). In a test, `t.SignUp` follows the link of the mail itself, as its owner would,
so the tests of an app don't change when it turns the check on (`examples/invoices` kept its 23).

## 5. Its test

```cesia norun
defn isSignedUpByTheLinkOfItsMail()
  t = apptest.Start(invoices.App, now = now)?
  first = t.Anyone().Send(api.SignUp, ada)
  bug.Assert(first.Status == 202 and value.IsMissing(http.HeaderValue("set-cookie", first.Headers)), "no session before the check")
  t.RunJobs()?
  a = t.Anyone().Call(api.CheckEmail, {Code: t.Code(ada.Email)})?
  (* ... *)
end
```

`t.RunJobs()` runs the jobs due on the test's clock (the mail), `t.Mails()` gives the mails sent to the box of the test
transport, and `t.Code(email)` the code of the last link mailed to an address.

Next: [The report of each night](nightly-report.md).
