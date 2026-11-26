# Traduire l'app

La tâche : les factures parlent anglais et français. Un navigateur qui préfère le français reçoit les erreurs en
français : celles de Centauri, celles des formes (une forme dit ce qu'une valeur doit être : un texte de 1 à 120
octets, un nombre entier...) et celles de l'app (l'application, le serveur et ses pages). Un utilisateur qui a choisi le
français dans son compte les reçoit en français quel que soit son navigateur, et ses mails aussi. Et les pages disent
les mêmes mots, tirés du même catalogue. Une app qui ne parle qu'anglais ne paie rien pour tout cela. Le code est
`src/i18n/i18n.ce` (les catalogues, les pluriels, la langue d'un header, une ligne d'en-tête de la requête HTTP),
`src/i18n/centauri.ce` (les mots de Centauri en français) et `src/app/words.ce` (la langue d'une requête, les réponses
traduites à la porte, ce que Centauri vérifie à l'entrée de chaque requête) ; les tests sont `tests/words.test.ce` ; les
mots des factures sont dans `examples/invoices/src/invoices/words/words.ce`, vérifiés par `isInFrench` dans
`examples/invoices/tests/l3.test.ce`.

Ce qu'il utilise : des catalogues de messages (`i18n.Catalog`, `i18n.Of`), `i18n.Say`, les règles de pluriel de CLDR
(le Unicode Common Locale Data Repository, la base de données d'Unicode sur les langues ; `i18n.Plural`), la langue d'un
header `Accept-Language` (`i18n.Best`), `app.Say` et `app.SayIn`, le réglage `Langs`, les `messages` d'un module ou
d'une app, `PUT /auth/lang`, `Content-Language` (le header qui dit la langue d'une réponse).

## 1. Un message, c'est son texte anglais

Comme l'écrivent gettext et Django, un message est connu par son texte anglais, avec `{Name}` là où va une valeur. Le
code reste lisible en anglais, et un message qu'aucun catalogue n'a est dit en anglais, jamais sous forme de code. Un
catalogue est d'une seule langue, `i18n.Catalog(lang, messages)` : ses messages sont une liste de paires, chaque message
et son texte, ou ses formes de pluriel (`{one: ..., other: ...}`, et `By`, le nom de la valeur qui choisit la forme).
`i18n.Of` joint des catalogues, d'une langue ou de plusieurs :

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

Le module donne son catalogue, et l'app dit quelles langues elle parle, la première étant celle par défaut :

```cesia norun
(* src/invoices/module.ce *)
Module = app.Module("invoices", kinds = Kinds, rules = Rules, start = keep, serve = [(* ... *)], migrations = [Countries], messages = words.Words)

App = app.Of([auth.Module(), jobs.Module(every = [Report]), hooks.Module(), flags.Module([ExportCountry]), admin.Module(folder = "admin"), Module], name = "invoices", roles = Roles, settings = Settings,
  defaults = {MemberRoles: "accountant", EmailCheck: "required", SignUpAnswer: "neutral", Langs: "en,fr"})
```

`APP_LANGS` le remplace, comme tout réglage. Le catalogue de Centauri vient en premier (`i18n.Centauri`), puis ceux des
modules, puis celui de l'app (`app.Of(..., messages = ...)`) : pour un message qui est dans deux d'entre eux, le texte
du dernier gagne (`i18n.Of`). Avec `Langs` à `en` seul, le défaut, rien n'est traduit : aucun header n'est lu, aucune
réponse n'est relue (`isEnglishAloneUntouched`). Ne mettez dans `Langs` que les langues qu'ont les catalogues : une
langue sans ses mots recevrait les textes anglais.

```properties
# Spring Boot: messages.properties and messages_fr.properties, keyed by codes (spring.messages.basename=messages)
invoice.paid=Invoice {0} is paid already.
# messages_fr.properties
invoice.paid=La facture {0} est déjà payée.
```

## 2. Le dire

Un handler (la fonction qui répond à une requête) écrit ses erreurs comme avant, en anglais, les valeurs dedans :

```cesia norun
(* src/invoices/invoices.ce *)
    return app.Fail(409, "Invoice $(inv.Number) is paid already.")
```

La porte compare `Invoice 1 is paid already.` aux modèles du catalogue, trouve `Invoice {Number} is paid already.`, en
tire `1`, et le met dans le français : `La facture 1 est déjà payée.` (`isInFrench`). C'est
`i18n.Say(catalog, lang, message)` sans valeurs : le texte du message quand le catalogue l'a tel quel, sinon le premier
modèle auquel il correspond, sinon le message inchangé. Un modèle avec deux noms côte à côte (`{A}{B}`) ne peut pas être
relu à l'envers : il ne se dit qu'avec ses valeurs.

Avec des valeurs, un handler ou un job (un travail fait en arrière-plan, hors de la requête) dit lui-même un message,
dans la langue de la requête :

```cesia norun
app.Say(r, "{N} unpaid invoices", args = {N: 2})    (* "2 unpaid invoices", or "2 factures impayées" *)
```

Une langue que le catalogue n'a pas donne l'anglais, rempli ; `pt-BR` est servi par `pt` quand il n'y a pas de `pt-BR`.
`app.SayIn(env, lang, message, args)` fait la même chose là où il n'y a pas de requête (un job, un mail).

```java
// Spring Boot: MessageSource, with the Locale of the request
messages.getMessage("invoice.paid", new Object[]{inv.number}, LocaleContextHolder.getLocale());
```

## 3. La langue d'une requête

1. Celle du compte, quand l'utilisateur en a choisi une : `PUT /auth/lang {Lang: "fr"}`, l'une de `Langs` (une autre
   est un `422`), ou `""` pour revenir à celle de son navigateur. L'`Account` la donne dans `Lang`
   (`isAccountBeforeBrowser`).
2. Sinon celle que l'`Accept-Language` du navigateur préfère parmi `Langs`, telle quelle (`fr-CA`) ou par sa base
   (`fr`).
3. Sinon la première de `Langs`.

Une inscription garde comme langue du compte celle que le navigateur préfère parmi celles de l'app
(`isSignUpTakingTheBrowsersLanguage`) : les mails envoyés avant toute requête de l'utilisateur sont donc dans cette
langue.

```java
// Spring Boot: an AcceptHeaderLocaleResolver with its supported locales; the language of an account, a
// LocaleResolver of your own that reads it
@Bean LocaleResolver localeResolver() {
  var r = new AcceptHeaderLocaleResolver(); r.setSupportedLocales(List.of(Locale.ENGLISH, Locale.FRENCH)); r.setDefaultLocale(Locale.ENGLISH); return r;
}
```

## 4. Les erreurs, traduites à la porte

Chaque réponse en Problem Details (le format standard des erreurs d'une API HTTP, RFC 9457 ;
`application/problem+json`) passe par la porte, qui traduit son `title`, son `detail` et le message de chaque champ, et
dit `Content-Language`. Ainsi les erreurs des formes de std/check et celles de Centauri arrivent en français sans que
l'app écrive rien :

```text
$ curl -s -H 'Accept-Language: fr-FR,fr;q=0.9,en;q=0.5' -H 'Content-Type: application/json' localhost:8080/auth/signup -d '{"Email":"ana@example.com","Password":"short","Name":"Ana"}'
{"type":"about:blank","title":"Contenu non traitable","status":422,"detail":"Vérifiez les champs.","errors":{"Password":"Un texte de 12 à 128 octets."},...}
```

(`isFrenchByTheBrowser`, avec son `Content-Language: fr`.) Les réponses qui réussissent appartiennent à l'app : ce
qu'elles disent, l'app le dit avec `app.Say`.

```java
// Spring Boot: a ProblemDetail's title and detail from the MessageSource by their codes
// (problemDetail.title.<exception's class>, problemDetail.<exception's class>); Bean Validation's own messages in
// French come with Hibernate Validator (ValidationMessages_fr)
```

## 5. Les mails

Les mails de Centauri (la vérification d'une adresse, un nouveau mot de passe, le mail au propriétaire d'une adresse
avec laquelle quelqu'un s'est inscrit) sont dans la langue de leur utilisateur : sa `Lang`, sinon la première de l'app.
Une invitation est dans la première langue de l'app, puisque l'invité n'a pas encore de compte. Leurs textes sont des
messages du catalogue, dits par `x.Say` :

```cesia norun
(* src/auth/auth.ce *)
Mails = {
  Check: x -> {Subject: x.Say("Check your e-mail address for {App}"), Text: x.Say("Hello {Name},\n\nTo check that this address is yours, open this link within {Hours} hours:\n\n{Link}\n\nIf you didn't sign up for {App}, ignore this mail.\n")},
  (* ... *)
}
```

`x.Say(template)` remplit le modèle à partir de `x` (`Link`, `Name`, `Email`, `App`, `Hours`, `Lang`) dans la langue de
l'utilisateur, son pluriel choisi par `Hours` : « dans l’heure » pour une, « dans les 48 heures » pour 48
(`isMailInTheUsersLanguage` : le mail d'un nouveau mot de passe, « Un nouveau mot de passe pour words »). Les mails
propres à une app (`auth.Module(mails = ...)`) prennent le même `x`, et leurs modèles viennent de son catalogue.

## 6. Le même catalogue dans une page

Le package i18n (un package : un dossier de fichiers Cesia groupés sous un nom) n'utilise que std : une page de Ceres,
en WebAssembly (le code compilé que le navigateur exécute), le prend comme le fait le serveur, avec les mêmes
catalogues.

```cesia norun
(* a sketch: a page of the invoices; words is their package src/invoices/words *)
use deps/www-celestial/centauri/src/i18n

c = i18n.Of([i18n.Centauri, words.Words])
said = i18n.Say(c, lang, "{N} unpaid invoices", {N: n})
```

`lang` est celle que le serveur a choisie, qu'une page lit dans le `Content-Language` de la réponse à `GET /auth/me`
(une app de plusieurs langues l'envoie, que l'utilisateur soit connecté ou non) : la langue du compte, sinon celle du
navigateur, parmi celles de l'app. Un formulaire vérifié par une forme dans la page reçoit ses erreurs en anglais ;
`i18n.Say(c, lang, message)` les donne en français, comme le fait la porte. Les actions de l'écran en direct d'une page
portent la langue du navigateur : leurs erreurs arrivent donc dans cette langue aussi.

Les pages d'administration de Centauri fonctionnent ainsi : chaque texte passe par leur catalogue, les nombres et les
heures sont écrits comme en français, et les pages d'administration propres à une app disent ses mots
([les pages d'administration](admin.md), étape 4).

![Les pages d'administration en français : le tableau de bord « Tableau de bord », ses cases Utilisateurs, Tenants, Sessions, Requêtes, Refusées et « Connexions échouées/min », la ligne « Dernière seconde : … » et les graphiques « Requêtes par seconde » et « Durée d'une requête (ms) ».](images/admin-dashboard.png)

## 7. Les pluriels

`i18n.Plural(lang, n)` donne la catégorie d'un nombre dans une langue : `zero`, `one`, `two`, `few`, `many` ou
`other`, selon les règles de CLDR 49. Une forme est choisie par la valeur que nomme `By`, sinon par la première valeur
qui est un nombre. Un nombre écrit comme un texte compte ce qui est écrit : `"1.50"` a deux chiffres après le point, et
`"1.0"` n'est pas `1` en anglais.

| langues | `one` | `few`, `many`, `two`, `zero` | `other` |
|---|---|---|---|
| en, de, nl, sv | 1, sans décimales | | le reste |
| fr, pt (Brésil) | 0 et 1, et leurs décimales (1,5) | many : un million entier (1 000 000, 2 000 000) | le reste |
| it, pt-PT | 1, sans décimales | many : un million entier | le reste |
| es | 1, et 1,0 | many : un million entier | le reste |
| tr | 1, et 1,0 | | le reste |
| ru, uk | finit par 1, pas par 11 | few : finit par 2 à 4, pas par 12 à 14 ; many : les autres nombres entiers | les décimaux |
| pl | 1 | few : finit par 2 à 4, pas par 12 à 14 ; many : les autres nombres entiers | les décimaux |
| ar | 1 | zero : 0 ; two : 2 ; few : finit par 03 à 10 ; many : finit par 11 à 99 (nombres entiers, 3,0 aussi) | le reste, et les décimaux |
| ja, ko, zh, et toute autre | | | tout |

```cesia norun
i18n.Plural("fr", 0) --> "one"
i18n.Plural("fr", 1000000) --> "many"
i18n.Plural("ru", 22) --> "few"
i18n.Plural("pl", 12) --> "many"
i18n.Plural("ar", 102) --> "other"
```

En es, tr et ar, CLDR lit la valeur elle-même (son opérande `n`) : un nombre entier écrit avec des décimales (`"1.0"`,
`"3.0"`) prend donc la catégorie du nombre entier. `Plural("es", "1.0")` est `one`.

```java
// Spring Boot: MessageFormat's {0} has no plural rules of CLDR (ChoiceFormat is by ranges); ICU4J's MessageFormat has:
new com.ibm.icu.text.MessageFormat("{0, plural, one {# facture impayée} other {# factures impayées}}", Locale.FRENCH).format(new Object[]{2});
```

## 8. Ce qui vient avec Centauri, et ce qu'un header ne peut pas faire

Le français vient avec Centauri : les messages des formes de std/check, les titres des statuts HTTP, ceux de la porte,
des comptes, du second facteur, des passkeys (une passkey : une clé d'accès gardée par l'appareil, qui remplace le mot
de passe), des fournisseurs (providers, comme Google), et les mails (`i18n.Centauri`). Une app ajoute ses propres mots,
et pour un message qui est dans les deux, son texte gagne.

Un header `Accept-Language` est lu jusqu'à 400 octets et 20 langues, chacune un tag (une étiquette de langue) de
lettres, de chiffres et de `-` de 35 octets au plus, avec un `q` (son poids) de plus de 0 à 1 ; `*` et tout le reste
sont ignorés. Rien n'en atteint une réponse, sauf l'une de `Langs` : une fin de ligne qui ajouterait un header, un
script, un tag que l'app ne parle pas, un `q` de 2 donnent la première langue de l'app, ou celle que le header nomme
correctement (`isLanguageHeaderInjectionHarmless`). Le choix du compte passe avant tout header.

## 9. Ses tests

`tests/words.test.ce` : le français par le navigateur, son titre, son détail et son champ (`isFrenchByTheBrowser`) ;
l'anglais seul intact, sans `Content-Language` (`isEnglishAloneUntouched`) ; le compte avant le navigateur, les mots de
l'app, une langue que l'app ne parle pas refusée (`isAccountBeforeBrowser`) ; des headers faits pour injecter
(`isLanguageHeaderInjectionHarmless`) ; un mail dans la langue de l'utilisateur (`isMailInTheUsersLanguage`) ; une
inscription qui garde celle du navigateur (`isSignUpTakingTheBrowsersLanguage`) ; le français du catalogue exact, avec
son espace insécable avant un deux-points (`isCatalogueExact`).

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

| menace | défense | test |
|---|---|---|
| un header injecté par `Accept-Language` (`fr\r\nset-cookie: ...`), un script dedans | le header lu seulement comme des tags ; l'une de `Langs` dans `Content-Language` | `isLanguageHeaderInjectionHarmless` |
| un header de 5 000 langues | 400 octets et 20 langues lus | `isLanguageHeaderInjectionHarmless` |
| une langue que l'app ne parle pas réglée sur un compte | l'une de `Langs`, sinon un `422` | `isAccountBeforeBrowser` |

Suite : [Ouvrir une fonction à un seul cabinet](flags.md).
