# S'inscrire avec une vérification de l'e-mail, et un mot de passe oublié

La tâche : quelqu'un s'inscrit pour son cabinet, et n'a pas de session (le temps où un utilisateur reste connecté)
avant d'avoir ouvert le lien d'un mail que nous avons envoyé à son adresse. Une personne qui a oublié son mot de passe
en demande un nouveau, et le choisit par le lien d'un mail. Et personne n'apprend, en s'inscrivant ou en demandant un
mot de passe, quelles adresses ont un compte. Le code est dans `src/auth/auth.ce` et `src/mail/mail.ce`, ses tests dans
`tests/checks.test.ce` et `tests/mail.test.ce`. L'exemple des factures l'active dans
`examples/invoices/src/invoices/module.ce`, et `examples/invoices/tests/month.test.ce` (`isSignedUpByTheLinkOfItsMail`)
le fait tourner.

Ce qu'il utilise : les réglages `EmailCheck` et `SignUpAnswer` ; des codes gardés sous forme de hash (une empreinte :
un nombre calculé à partir d'un texte, d'où on ne peut pas revenir au texte), qui ne servent qu'une fois ; des mails
envoyés par des jobs, c'est-à-dire des travaux faits en arrière-plan, hors de la requête (le package `mail`, du code
groupé sous ce nom ; les jobs sont au chapitre [Le rapport de chaque nuit](nightly-report.md)) ; les endpoints
`CheckEmail`, `SendCheck`, `Forgot` et `Reset` de `api.Accounts` (un endpoint est une adresse de l'API avec sa méthode
HTTP, comme `POST /clients`).

## 1. Deux réglages

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

| réglage | valeurs | ce qu'il fait |
|---|---|---|
| `APP_EMAIL_CHECK` | `off` (le défaut : comme avant), `required`, `later` | `required` : le compte est créé, son mail envoyé, et pas de session tant que son lien n'est pas ouvert (une connexion avant cela reçoit un 403 qui renvoie le mail) ; `later` : une session tout de suite, le mail envoyé, `r.User.Checked` à faux tant que son lien n'est pas ouvert |
| `APP_SIGN_UP_ANSWER` | `tell` (le défaut), `neutral` | `neutral` : une inscription avec une adresse qui a déjà un compte reçoit la même réponse qu'une inscription avec une adresse nouvelle, le même `202` et le même corps ; le propriétaire de l'adresse reçoit un mail qui le lui dit, avec un lien pour choisir un nouveau mot de passe ; il faut `EmailCheck = required` (sinon le démarrage s'arrête : il ne peut donner de session ni à l'un ni à l'autre) |
| `APP_CHECK_TIME`, `APP_RESET_TIME` | 172 800 (2 jours), 3 600 | combien de temps dure un lien de vérification, un lien de nouveau mot de passe |
| `APP_CHECK_PAGE`, `APP_RESET_PAGE` | `/check-email`, `/reset-password` | les pages du front (la partie de l'application qui tourne dans le navigateur) que les liens ouvrent, sous `APP_ORIGIN` |
| `APP_MAILS_PER_HOUR` | 5 | les mails qu'une adresse reçoit par heure, quel que soit celui qui les demande : personne ne remplit la boîte d'un inconnu |
| `APP_MAIL_URL`, `APP_MAIL_FROM` | `log:` en dev, `test:` en test, obligatoires en prod | le transport et l'expéditeur : [Le rapport de chaque nuit](nightly-report.md#3-le-courrier) |

Chacun est un réglage, et une app (l'application, le serveur et ses pages) qui veut faire autrement le règle à sa façon.
Une app publique, ouverte à des inconnus, prend `required` et `neutral`. Une app pour le personnel d'une entreprise,
invité une personne à la fois, peut garder `off`.

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

## 2. Le lien du mail

L'inscription écrit, en un seul groupe (des écritures faites toutes ensemble, ou pas du tout), l'utilisateur, son
tenant (un client de la plateforme, comme un cabinet ou une entreprise, avec ses données à lui), son appartenance à ce
tenant et le job du mail. Le job fabrique le code, garde son hash BLAKE2b avec sa date de fin (`centauri_code`), et
envoie le lien :

```text
http://localhost:8080/check-email#code=5f0c...e91a
```

- Le code fait 32 octets aléatoires tirés du noyau, écrits en hexadécimal. La base de données ne le garde jamais,
  seulement son hash : une copie de la base n'ouvre aucun compte (`isNoCodeKept`). Le job le fabrique au moment où il
  tourne, donc il n'est pas non plus dans les arguments du job.
- Le code est dans le fragment, après `#` : un navigateur n'envoie jamais le fragment à un serveur, donc aucun log (le
  journal où un serveur note ce qu'il fait), aucun proxy (un serveur intermédiaire) et aucun `Referer` (le header où le
  navigateur dit de quelle page il vient ; un header est une ligne d'information en tête d'une requête) ne le contient.
  La page du front le lit et l'envoie à `POST /auth/check`.
- Un GET n'écrit jamais (chapitre [Votre première API](first-api.md)), et un logiciel de mail qui ouvre le lien pour en
  montrer un aperçu ne vérifie rien : seul le POST de la page le fait.
- Le code sert une fois, puis il expire. Le groupe qui l'utilise exige qu'il soit encore tel qu'il était (`Expect`) :
  deux pages qui l'envoient en même temps ne vérifient donc qu'une fois (`isCheckedBeforeASession`,
  `isOldLinkRefused`).

`POST /auth/check {Code}` marque l'adresse comme vérifiée (`centauri_user/Checked`, l'instant de la vérification) et
connecte l'utilisateur : le cookie (un petit texte que le navigateur garde et renvoie à chaque requête) revient, comme
à une connexion. Un nouveau mail se demande par `POST /auth/check/send {Email}`, qui répond `202` quelle que soit
l'adresse.

## 3. Un mot de passe oublié

```text
POST /auth/forgot {Email}            -> 202, always
POST /auth/reset  {Code, Password}   -> the account, and a new session
```

`Forgot` écrit un job, quelle que soit l'adresse ; le job cherche le compte et n'envoie le mail qu'à un compte qui
existe. Ainsi une adresse avec un compte et une adresse sans compte reçoivent la même réponse, octet pour octet, après
le même travail (une écriture) (`isPasswordSetByItsMail`). `Reset` vérifie le code (de la sorte `reset` : un code de
vérification d'adresse ne fixe aucun mot de passe), fixe le nouveau mot de passe (Argon2id), et marque l'adresse comme
vérifiée (le mail l'a atteinte). Puis il met fin à **toutes** les sessions de l'utilisateur, y compris celle qu'un
voleur peut tenir, et en ouvre une nouvelle.

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

## 4. Ce contre quoi il protège

| menace | défense | test |
|---|---|---|
| apprendre quelles adresses ont un compte, en s'inscrivant | `SignUpAnswer = neutral` : la même réponse, après un hash de mot de passe et une écriture dans les deux cas ; c'est le propriétaire de l'adresse qui est prévenu, pas celui qui a envoyé l'inscription | `isSignUpNeutral` |
| la même chose, par un mot de passe oublié | `202` toujours, une écriture toujours, le mail envoyé par le job seulement à un compte | `isPasswordSetByItsMail` |
| un lien utilisé deux fois, ou trop tard, ou d'une autre sorte | le code sert une fois, expire après son temps, et a une sorte | `isCheckedBeforeASession`, `isOldLinkRefused`, `isPasswordSetByItsMail` |
| un code lu dans la base, dans les logs ou dans les jobs | son hash seulement ; fabriqué par le job au moment où il l'envoie ; dans le fragment du lien | `isNoCodeKept` |
| la boîte d'un inconnu remplie de nos mails | `MailsPerHour` par adresse, et la limite des inscriptions de l'adresse IP de celui qui demande | `isStrangersBoxNotFilled` |
| un header ajouté à un mail par une adresse ou un nom (`\r\nBcc:`) | chaque header vérifié ; seulement des adresses de la forme simple de la RFC 5321 ; le non-ASCII encodé selon la RFC 2047 ; le texte en base64 | `isHeaderInjectionRefused` |
| la session d'un voleur gardée après un nouveau mot de passe | toutes les sessions de l'utilisateur fermées, tout de suite dans ce processus | `isPasswordSetByItsMail` |

Et les tests générés passent sur une app dont l'inscription vérifie les adresses : `apptest.Isolated` et
`apptest.Fuzz` (`isAccountsIsolatedAndFuzzedWithMail`). Dans un test, `t.SignUp` suit lui-même le lien du mail, comme
le ferait son propriétaire ; les tests d'une app ne changent donc pas quand elle active la vérification
(`examples/invoices` a gardé ses 23 tests).

## 5. Son test

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

`t.RunJobs()` fait tourner les jobs dus à l'heure de l'horloge du test (ici, le mail), `t.Mails()` donne les mails
envoyés dans la boîte du transport de test, et `t.Code(email)` le code du dernier lien envoyé par mail à une adresse.

Suite : [Le rapport de chaque nuit](nightly-report.md).
