# Translate the app

The task: the invoices speak English and French. A browser that prefers French gets the errors in French, Centauri's,
those of the shapes and the app's own; a user who chose French in his account gets them in French whatever his
browser, and his mails too; and the pages say the same words from the same catalogue. An app that speaks English alone
pays nothing for it. The code is `src/i18n/i18n.ce` (catalogues, plurals, the language of a header),
`src/i18n/centauri.ce` (Centauri's words in French) and `src/app/words.ce` (the language of a request, the answers
translated at the door); the tests are `tests/words.test.ce`; the invoices' words are
`examples/invoices/src/invoices/words/words.ce`, checked by `isInFrench` in `examples/invoices/tests/l3.test.ce`.

What it uses: catalogues of messages (`i18n.Catalog`, `i18n.Of`), `i18n.Say`, the plural rules of CLDR (the Unicode
Common Locale Data Repository, `i18n.Plural`), the language of an `Accept-Language` header (`i18n.Best`), `app.Say` and
`app.SayIn`, the setting `Langs`, the `messages` of a module or an app, `PUT /auth/lang`, `Content-Language`.

## 1. A message is its English text

As gettext and Django write it, a message is known by its English text, with `{Name}` where a value goes. The code
stays readable in English, and a message no catalogue has is said in English, never as a code. A catalogue is of one
language, `i18n.Catalog(lang, messages)`: its messages are a list of pairs, each message and its text, or its plural
forms (`{one: ..., other: ...}`, and `By`, the name of the value that chooses the form). `i18n.Of` joins catalogues,
of one language or of several:

```cesia norun hide=code
(* For the check of this page: the packages its code uses, and the names it takes from the invoices of
   examples/invoices, unknown here. *)
use deps/www-celestial/centauri/src/admin
use deps/www-celestial/centauri/src/api
use deps/www-celestial/centauri/src/app
use deps/www-celestial/centauri/src/apptest
use deps/www-celestial/centauri/src/auth
use deps/www-celestial/centauri/src/flags
use deps/www-celestial/centauri/src/hooks
use deps/www-celestial/centauri/src/jobs
use std/bug
use std/json
use std/value
Countries = json.Parse("{}")!
ExportCountry = json.Parse("{}")!
Kinds = json.Parse("{}")!
Report = json.Parse("{}")!
Roles = json.Parse("{}")!
Rules = json.Parse("{}")!
Settings = json.Parse("{}")!
ada = json.Parse("{}")!
inv = json.Parse("{}")!
invoices = json.Parse("{}")!
keep = json.Parse("{}")!
lang = json.Parse("{}")!
n = json.Parse("{}")!
r = json.Parse("{}")!
words = json.Parse("{}")!
```

```cesia norun
(* src/invoices/words/words.ce *)
use deps/www-celestial/centauri/src/i18n

Words = i18n.Catalog("fr", [
  ["Invoice {Number} is paid already.", "La facture {Number} est déjà payée."],
  ["Another client has this e-mail.", "Un autre client a cette adresse e-mail."],
  ["This client has invoices: it stays.", "Ce client a des factures : il reste."],
  (* ... *)
  ["{N} unpaid invoices", {one: "{N} facture impayée", other: "{N} factures impayées"}],
])
```

The module gives its catalogue, and the app says which languages it speaks, its first the default:

```cesia norun
(* src/invoices/module.ce *)
Module = app.Module("invoices", kinds = Kinds, rules = Rules, start = keep, serve = [(* ... *)], migrations = [Countries], messages = words.Words)

App = app.Of([auth.Module(), jobs.Module(every = [Report]), hooks.Module(), flags.Module([ExportCountry]), admin.Module(folder = "admin"), Module], name = "invoices", roles = Roles, settings = Settings,
  defaults = {MemberRoles: "accountant", EmailCheck: "required", SignUpAnswer: "neutral", Langs: "en,fr"})
```

`APP_LANGS` overrides it, as any setting. Centauri's own catalogue comes first (`i18n.Centauri`), then those of the
modules, then the app's own (`app.Of(..., messages = ...)`): for a message in two, the last one's text wins
(`i18n.Of`). With `Langs` of `en` alone, the default, nothing is translated: no header is read, no answer is read
again (`isEnglishAloneUntouched`). List in `Langs` only the languages the catalogues have: a language without its
words would get the English texts.

```properties
# Spring Boot: messages.properties and messages_fr.properties, keyed by codes (spring.messages.basename=messages)
invoice.paid=Invoice {0} is paid already.
# messages_fr.properties
invoice.paid=La facture {0} est déjà payée.
```

## 2. Saying it

A handler writes its errors as it did, in English, the values in them:

```cesia norun
(* src/invoices/invoices.ce *)
    return app.Fail(409, "Invoice $(inv.Number) is paid already.")
```

The door reads `Invoice 1 is paid already.` against the templates of the catalogue, finds `Invoice {Number} is paid
already.`, takes `1` from it, and puts it in the French: `La facture 1 est déjà payée.` (`isInFrench`). This is
`i18n.Say(catalog, lang, message)` without values: the message's text when the catalogue has it as it is, else the
first template it matches, else the message unchanged. A template with two names side by side (`{A}{B}`) can't be read
back, and is said with its values only.

With values, a handler or a job says a message itself, in the language of the request:

```cesia norun
app.Say(r, "{N} unpaid invoices", args = {N: 2})    (* "2 unpaid invoices", or "2 factures impayées" *)
```

A language the catalogue lacks gives the English, filled in; `pt-BR` is served by `pt` when there is no `pt-BR`.
`app.SayIn(env, lang, message, args)` is the same where there is no request (a job, a mail).

```java
// Spring Boot: MessageSource, with the Locale of the request
messages.getMessage("invoice.paid", new Object[]{inv.number}, LocaleContextHolder.getLocale());
```

## 3. The language of a request

1. The account's, when the user chose one: `PUT /auth/lang {Lang: "fr"}`, one of `Langs` (another is a `422`), or `""`
   to go back to his browser's. The `Account` gives it as `Lang` (`isAccountBeforeBrowser`).
2. Else the one the browser's `Accept-Language` prefers among `Langs`, as it is (`fr-CA`) or by its base (`fr`).
3. Else the first of `Langs`.

A sign-up keeps the language the browser prefers among the app's as the account's (`isSignUpTakingTheBrowsersLanguage`),
so the mails sent before any request of his are in it.

```java
// Spring Boot: an AcceptHeaderLocaleResolver with its supported locales; the language of an account, a
// LocaleResolver of your own that reads it
@Bean LocaleResolver localeResolver() {
  var r = new AcceptHeaderLocaleResolver(); r.setSupportedLocales(List.of(Locale.ENGLISH, Locale.FRENCH)); r.setDefaultLocale(Locale.ENGLISH); return r;
}
```

## 4. The errors, translated at the door

Every answer of Problem Details (`application/problem+json`) goes through the door, which translates its `title`, its
`detail` and the message of each field, and says `Content-Language`. So the errors of the shapes of std/check and
those of Centauri come in French with nothing written by the app:

```text
$ curl -s -H 'Accept-Language: fr-FR,fr;q=0.9,en;q=0.5' -H 'Content-Type: application/json' localhost:8080/auth/signup -d '{"Email":"ana@example.com","Password":"short","Name":"Ana"}'
{"type":"about:blank","title":"Contenu non traitable","status":422,"detail":"Vérifiez les champs.","errors":{"Password":"Un texte de 12 à 128 octets."},...}
```

(`isFrenchByTheBrowser`, with its `Content-Language: fr`.) The answers that work are the app's own: what they say, the
app says with `app.Say`.

```java
// Spring Boot: a ProblemDetail's title and detail from the MessageSource by their codes
// (problemDetail.title.<exception's class>, problemDetail.<exception's class>); Bean Validation's own messages in
// French come with Hibernate Validator (ValidationMessages_fr)
```

## 5. Mails

Centauri's mails, the check of an address, a new password, the mail to the owner of an address someone signed up
with, are in the language of their user (his `Lang`, else the app's first); an invitation in the app's first, since
the invitee has no account yet. Their texts are messages of the catalogue, said by `x.Say`:

```cesia norun
(* src/auth/auth.ce *)
Mails = {
  Check: x -> {Subject: x.Say("Check your e-mail address for {App}"), Text: x.Say("Hello {Name},\n\nTo check that this address is yours, open this link within {Hours} hours:\n\n{Link}\n\nIf you didn't sign up for {App}, ignore this mail.\n")},
  (* ... *)
}
```

`x.Say(template)` fills the template from `x` (`Link`, `Name`, `Email`, `App`, `Hours`, `Lang`) in the user's
language, its plural chosen by `Hours`: "dans l’heure" for one, "dans les 48 heures" for 48
(`isMailInTheUsersLanguage`: the mail of a new password, "Un nouveau mot de passe pour words"). An app's own mails
(`auth.Module(mails = ...)`) take the same `x`, and their templates come from its catalogue.

## 6. The same catalogue in a page

Package i18n uses std only: a page of Ceres, in WebAssembly, takes it as the server does, with the same catalogues.

```cesia norun
(* a sketch: a page of the invoices; words is their package src/invoices/words *)
use deps/www-celestial/centauri/src/i18n

c = i18n.Of([i18n.Centauri, words.Words])
said = i18n.Say(c, lang, "{N} unpaid invoices", {N: n})
```

`lang` is the `Lang` of the `Account` that the sign-in gave, else `i18n.Best` of the browser's languages. A form checked
by a shape in the page gets its errors in English; `i18n.Say(c, lang, message)` gives them in French, as the door does.

## 7. Plurals

`i18n.Plural(lang, n)` gives the category of a number in a language: `zero`, `one`, `two`, `few`, `many` or `other`,
by the rules of CLDR 49. A form is chosen by the value that `By` names, else by the first value that is a number. A
number written as a text counts what is written: `"1.50"` has two digits after the point, and `"1.0"` is not `1` in
English.

| languages | `one` | `few`, `many`, `two`, `zero` | `other` |
|---|---|---|---|
| en, de, nl, sv | 1, without decimals | | the rest |
| fr, pt (Brazil) | 0 and 1, and their decimals (1.5) | many: a whole million (1,000,000, 2,000,000) | the rest |
| it, pt-PT | 1, without decimals | many: a whole million | the rest |
| es | 1, and 1.0 | many: a whole million | the rest |
| tr | 1, and 1.0 | | the rest |
| ru, uk | ends in 1, not 11 | few: ends in 2 to 4, not 12 to 14; many: the other whole numbers | decimals |
| pl | 1 | few: ends in 2 to 4, not 12 to 14; many: the other whole numbers | decimals |
| ar | 1 | zero: 0; two: 2; few: ends in 03 to 10; many: ends in 11 to 99 (whole numbers, 3.0 too) | the rest, and decimals |
| ja, ko, zh, and any other | | | everything |

```cesia norun
i18n.Plural("fr", 0) --> "one"
i18n.Plural("fr", 1000000) --> "many"
i18n.Plural("ru", 22) --> "few"
i18n.Plural("pl", 12) --> "many"
i18n.Plural("ar", 102) --> "other"
```

In es, tr and ar, CLDR reads the value itself (its operand `n`), so a whole number written with decimals (`"1.0"`,
`"3.0"`) takes the category of the whole number: `Plural("es", "1.0")` is `one`.

```java
// Spring Boot: MessageFormat's {0} has no plural rules of CLDR (ChoiceFormat is by ranges); ICU4J's MessageFormat has:
new com.ibm.icu.text.MessageFormat("{0, plural, one {# facture impayée} other {# factures impayées}}", Locale.FRENCH).format(new Object[]{2});
```

## 8. What comes with Centauri, and what a header can't do

French comes with Centauri: the messages of std/check's shapes, the titles of HTTP's statuses, the door's, the
accounts', the second factor's, the passkeys', the providers', and the mails (`i18n.Centauri`). An app adds its own
words, and for a message in both, its text wins.

An `Accept-Language` header is read up to 400 bytes and 20 languages, each a tag of letters, digits and `-` of 35
bytes at most, with a `q` from more than 0 to 1; `*` and anything else are passed over. Nothing of it reaches an answer
but one of `Langs`: a line end that would add a header, a script, a tag the app doesn't speak, a `q` of 2, give the
app's first language, or the one the header names well (`isLanguageHeaderInjectionHarmless`). The account's choice
comes before any header.

## 9. Its tests

`tests/words.test.ce`: French by the browser, its title, detail and field (`isFrenchByTheBrowser`); English alone
untouched, no `Content-Language` (`isEnglishAloneUntouched`); the account before the browser, the app's own words, a
language the app doesn't speak refused (`isAccountBeforeBrowser`); headers made to inject (`isLanguageHeaderInjectionHarmless`);
a mail in the user's language (`isMailInTheUsersLanguage`); a sign-up that keeps the browser's
(`isSignUpTakingTheBrowsersLanguage`); the catalogue's French exactly, with its no-break space before a colon
(`isCatalogueExact`).

```cesia norun
defn isInFrench()
  t = apptest.Start(invoices.App)?
  a = t.SignUp(ada)?
  (* ... *)
  fr = [{Name: "accept-language", Value: "fr-FR,fr;q=0.9"}]
  again = a.Raw("POST", "/invoices/$(inv.Id)/pay", headers = fr)
  wrong = a.Raw("POST", "/clients", body = json.Text({Name: "", Email: "nobody"}), headers = fr)
  p = json.Parse(wrong.Body)?
  bug.Assert(json.Parse(again.Body)?.detail == "La facture 1 est déjà payée.", "the app's words: $(again.Body)")
  bug.Assert(p.detail == "Vérifiez les champs." and p.errors.Email == "Une adresse e-mail, comme ada@example.com.", "Centauri's and std/check's: $(wrong.Body)")
  a.Call(api.SetLang, {Lang: "fr"})?
  t.Anyone().Call(api.Forgot, {Email: ada.Email})
  t.RunJobs()?
  t.Mails()[value.Len(t.Mails())].Subject == "Un nouveau mot de passe pour invoices"
end
```

| threat | defense | test |
|---|---|---|
| a header injected through `Accept-Language` (`fr\r\nset-cookie: ...`), a script in it | the header read as tags only; one of `Langs` in `Content-Language` | `isLanguageHeaderInjectionHarmless` |
| a header of 5,000 languages | 400 bytes and 20 languages read | `isLanguageHeaderInjectionHarmless` |
| a language the app doesn't speak set on an account | one of `Langs`, else a `422` | `isAccountBeforeBrowser` |

Next: [Open a feature to one office](flags.md).
