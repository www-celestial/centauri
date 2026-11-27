# Security

Each threat of the OWASP Top 10:2025, and the others an app of accounts and tenants meets, with Centauri's defense, on
by default, and the test that proves it. The tests are in `src/app/app.test.ce` (app), `tests/auth.test.ce` (auth),
`tests/apptest.test.ce` (apptest) and `examples/invoices/tests/invoices.test.ce` (invoices).

| threat | defense | test |
|---|---|---|
| **A01** broken access control: another's data read or changed by its id (IDOR) | the role on the endpoint (401, 403); the tenant from `r.User`, never from the request; `app.Own` (404, never 403); the output through its shape | `apptest.Isolated` on every endpoint, and it catching a route without `app.Own` (apptest `isLeakCaught`); invoices `isOfficesApart`, `isAccountantSeesInvoicesOnly`; app `isMadeOwnedAndNumbered` |
| roles raised by who has them not | nobody gives or takes a role he hasn't; a tenant keeps an owner; a role written wrong in a contract stops the start | auth `isNoRaiseOfOwnRoles`; app `isRoleWrittenWrongRefused`, `isRoleChecked` |
| fields that leak (API3:2023) or that a sender adds | `check.Out` sends the declared fields only; `check.Read` drops the others | app `isOutputFilteredAndErrorsHidden`, `isMadeOwnedAndNumbered`; std/check `isInvoiceRead` |
| **A02** security misconfiguration | three fixed profiles; prod refuses to start without https, a secret and a database, naming each; headers on every response; no OpenAPI nor detail of errors in prod | app `isSecurityHeaders`, `isOpenApiInTestOnly`, `isOutputFilteredAndErrorsHidden`; the example of `Read` in prod |
| **A03** supply chain | no package of others: Centauri, Cesia, Cepheus are ours; `deps/` checked file by file by `cesia.lock`; libsodium and OpenSSL, fuzzed by their projects | Cesia refuses a file whose fingerprint differs from `cesia.lock` |
| **A04** cryptographic failures | Argon2id; BLAKE2b of session secrets, compared in constant time; cursors sealed (XSalsa20-Poly1305) under a key for each endpoint and tenant, challenges under HMAC-SHA-256; the kernel's randomness; no algorithm chosen by the client (no JWT) | auth `isNoSecretKept`, `isForgedCookieNobody`; app `isPagedBySealedCursors`, `isCursorOfBeforeRead` |
| **A05** injection | a question of Cepheus is a structure, its values never code; JSON in, JSON out; a CSV cell that starts with `=`, `+`, `-`, `@` gets a `'` | `apptest.Fuzz` with SQL, HTML and formulas; invoices `isCsvOfTheFilter` |
| **A06** insecure design | writes with `Expect`, numbers with `Incr` in the group, `unique`; no transaction open between two requests; a GET only reads | invoices `isPaidOnceAtTheSameMoment`, `isNumberedInOrderAtOnce`; app `isGetThatWritesRefused` |
| **A07** authentication failures | sessions cut in two, `__Host-`, `HttpOnly`, `SameSite=Strict`, a new one at each sign-in; failures counted and delays that double; the same answer and time for an unknown login; sessions that end; sign-out for good; the sessions a process keeps (`APP_SESSION_CACHE`, 2 s) kept under the BLAKE2b of their cookie, forgotten at once by a write of the accounts in that process, seen within those seconds elsewhere | auth `isLockedAfterFailures`, `isUnknownLoginAnsweredAsAWrongPassword`, `isSignedOutForGood`, `isSessionIdleAndOld`, `isForgedCookieNobody`, `isPasswordChanged`, `isDisabledBySuper`, `isRoleTakenSeenAtOnce`, `isChangeOutsideSeenWithinSessionCache`, `isForgedCookieNobodyBesideAKeptOne` |
| **A08** integrity failures | no deserialization of objects: JSON becomes values, then a shape; a cursor or a challenge made by hand is refused | app `isPagedBySealedCursors`; invoices `isBadCursorRefused`; auth `isProofOfWorkAsked` (forged) |
| **A09** logging and alerting failures | every write with who and why (Cepheus); sign-ins, failures, lockouts, refusals, invitations, roles as events; metrics of refusals; no secret, body, cookie or query in a log | auth `isEventsAndAdministration`, `isNoSecretKept` (the logs too) |
| **A10** exceptional conditions | errors are values, sent as Problem Details; a panic stops its fiber alone and answers 500 with no detail in prod; a deadline for each request | `apptest.Fuzz` (no 500), and it catching a handler that fails (apptest `isCrashCaught`) |
| cross-site request forgery | a write from another site refused, its cookie never read; SameSite=Strict | app `isOtherSiteRefused`; invoices `isOtherOriginRefused` |
| denial of service | limits per address (IPv6 by /64), user, tenant, endpoint, a request refused by its role counted too; the bounds of std/http (head, body, time, memory); password hashes in bounded slots; events of refusals written once a minute a key; the tables of the limits and of the sessions kept bounded, pruned with a quarter to spare, so that a flood of new addresses or cookies never prunes at each request | app `isLimited`, `isFloodOfKeysPrunedWithRoom`, `isFloodOfSessionsBounded`; auth `isSignUpLimitedByAddressAndTenantsByHour` |
| bots | proof of work under attack, answers serving once; the trap field; new tenants capped an hour | auth `isProofOfWorkAsked`, `isProofOfWorkUnderAttack`, `isBotTrapped`, `isSignUpLimitedByAddressAndTenantsByHour` |
| token theft | no token in the page; the cookie unreadable by a script; a session ended is ended at once in its process, and within `APP_SESSION_CACHE` seconds (2) in the other workers | auth `isSignedOutForGood`, `isSessionsListedAndEnded`, `isChangeOutsideSeenWithinSessionCache` |
| API breaks (never break user space) | the surface compared at each test | `apptest.Surface`, and it catching what breaks (apptest `isSurfaceKept`) |

The threats of L2, the first month (the jobs, mail, files, live screens, webhooks and calls), each with its test in
`tests/jobs.test.ce`, `tests/mail.test.ce`, `tests/checks.test.ce`, `tests/files.test.ce`, `tests/live.test.ce`,
`tests/calls.test.ce`, `tests/migrate.test.ce`, and Cesia's `tests/net/http-pieces.ce`:

| threat | defense | test |
|---|---|---|
| **A10 (2021)** server-side request forgery: a call made for someone else to this machine or its network (`169.254.169.254`, `localhost`, `10.0.0.1`) | `app.Call` checks the address the connection reached, before any byte (TLS's too), against the special blocks of IPv4 and IPv6 (mapped, NAT64 and 6to4 read as IPv4); every spelling (`2130706433`, `0x7f000001`, `127.1`, `0177.0.0.1`) is the address it connects to; `APP_CALL_ALLOW` names the hosts that may be private | calls `isPrivateInEverySpelling`, `isCallToThisMachineRefusedBeforeAByte` (the service hears nothing) |
| SSRF by DNS rebinding: a name that answers a public address to a check and a private one to the connection | no check before the connection: the address checked is the one connected (`net.Peer`), with no second lookup | calls `isCallToThisMachineRefusedBeforeAByte` (a name of `/etc/hosts` resolved to 127.0.1.1) |
| SSRF by a redirect, a user in the address, plain http | redirects not followed unless asked, and then each checked as the first; a user in an address refused; https unless allowed | calls `isAllowedHostAndItsRedirects`, `isCallShapeChecked` |
| a webhook sent to a private address | the job is dead at once, the service never reached | calls `isPrivateEndpointDeadAtOnce` |
| webhook forgery: a message made or changed by someone without the secret | HMAC-SHA256 over id, timestamp and body (Standard Webhooks), compared in constant time; any of the signatures sent | calls `isReceivedOnceAndForgeriesRefused`, `isSignedAsStandardWebhooks` |
| webhook replay: a message caught and sent again | its time within 5 minutes; its id kept unique in Cepheus, in the group of what it does: done once | calls `isReceivedOnceAndForgeriesRefused` |
| a webhook's secret read in the database | sealed under the app's key; given once | calls `isSentSignedAndTriedAgain` |
| upload bombs: a file too large, many at once, a slow one | the most bytes refused before a byte is read; the body in pieces, never whole; uploads at once bounded (503); a piece within the timeout; no file decoded | files `isTooLargeRefused`, `isUploadsAtOnceBounded`, `isStreamedOverTheNetwork`; Cesia `http-pieces` |
| a file that lies about its type, opened in the app's origin (stored XSS) | the type believed by its first bytes; downloads as attachments, nosniff, `sandbox` | files `isTypeTrustedByItsBytesOnly`, `isStoredByPartsAndReadByRanges` |
| path tricks: a name that climbs out of a folder or adds a header | a file names no path; its name its last part, cleaned; a zone's name of tzdata checked too | files `isNameKeptHarmless`; jobs `isZoneNameChecked` |
| mail header injection: a line end in an address, a subject or a name | each refused; plain addresses of RFC 5321; RFC 2047 for the rest; the text in base64 | mail `isHeaderInjectionRefused` |
| mail in clear, or to a server that isn't the one named | smtps, or STARTTLS required; the certificate checked against the system's authorities or `APP_MAIL_CA` | mail `isSentByStartTlsOnly`, `isUntrustedCertificateRefused` |
| job poisoning: a job that would hold the queue (an unknown kind, arguments that don't fit, a panic, a run without end) | dead at once, or failed and tried again, or stopped past its most; its error kept on one line, 1,000 bytes; the others run | jobs `isPoisonDeadOrStopped` |
| a job run twice by two processes | taken by a group that expects it ready; a lease renewed while it runs | jobs `isTakenOnceByTwoAtOnce`, `isTakenBackFromADeadProcess` |
| enumeration through the sign-up | `SignUpAnswer = neutral`: the same answer, byte for byte, after the same work; the owner told | checks `isSignUpNeutral` |
| enumeration through a forgotten password | `202` always, one write always; the mail only to an account | checks `isPasswordSetByItsMail` |
| a link of a mail used twice, late, or for another thing; its code read in the database | once, with its end and its kind; its hash only; in the fragment of the link | checks `isCheckedBeforeASession`, `isOldLinkRefused`, `isNoCodeKept` |
| a stranger's box filled with our mails | `MailsPerHour` an address | checks `isStrangersBoxNotFilled` |
| a live screen of another site, without a session, of a role one hasn't, or kept after a sign-out | SameOrigin at the upgrade; the session of its cookie; the role and the shape of each show; the screens of a session ended with it | live `isRefusedWithoutRights`, `isEndedBySignOut` |
| another tenant's rows on a screen | the server writes the question, the tenant in it | live `isShownAsWritesComeAcrossServers` |
| a request sent twice that runs twice (a payment) | `Idempotency-Key` kept unique in Cepheus with its request's hash | calls `isIdempotencyKeyRunOnce`, `isIdempotencyKeyRequiredAndChecked` |
| an action sent again after a dropped connection that runs twice | each action of a page carries the key made when it was asked; the screen kept through the break runs an action it heard once (`Heard`), a new screen gets the first answer by the key; the key is the account's, so a sign-in again keeps it | drop `isActionSentAgainRunOnce`, `isKeyOfTheAccountAfterASignInAgain`; std/live `isEachActionRunOnceThroughBreaks` (40 actions through a network cut at random) |
| a key reused for another request | the request's hash kept with its key: another body is a 422, nothing run | drop `isKeyForAnotherBodyRefused` |
| the next user of a browser sending the first one's actions (an outbox replayed after a sign-out) | each screen tells its page a tag of its account; the page stamps its actions with it and drops those of another account; the app refuses an action whose tag isn't its screen's (403) | drop `isScreenOfAnotherAccountNotResumed`; std/live `isActionOfAnotherWhoRefused` |
| a screen taken over with another's token, or for other data | a token alone resumes nothing: the account and the shows asked must be the screen's, else a new screen | drop `isScreenOfAnotherAccountNotResumed`; std/live `isTokenOfAnotherPageRefused` |
| QUIC used to flood another address with answers (amplification), or to fill the server with handshakes | a client proves it owns its address (Retry, RFC 9000 8.1) before the server sends it more than 3 times what it sent; a flood of handshakes leaves no state behind | Cesia `tests/quic/threats.ce`: 0.08 times the bytes received with Retry, 1.01 without; 2,000 Initials from 2,000 ports: Retries back, 0.05 times the bytes, 0.2 MB more memory at most |
| a connection moved to another address by a packet replayed from it (a spoofed migration); a client followed by its connection ids | OpenSSL's QUIC has no migration: such a packet is dropped; the server's ids are random, new for each connection | Cesia `tests/quic/threats.ce` |
| QPACK's table filled to take the memory; a flood of streams | the table is 0 bytes, an insertion or a reference ends the connection; a head is 16 KiB at most (431); 100 streams at once, each head within the timeout | Cesia `tests/quic/threats.ce`: 1,000 requests at once, all answered |
| a payment replayed in TLS's early data (0-RTT) | OpenSSL's QUIC takes no early data; a request a proxy took in it, that changes something, gets 425 (RFC 8470) | Cesia `tests/quic/http3.ce` |
| WebTransport asked by another site; a session given another's cookies | the same origin check as WebSocket's (`http.SameOrigin`) on the session's CONNECT; a session asked without `APP_WEBTRANSPORT=on` gets 400; a session, which carries no cookie, gets those of its page by a ticket asked with them (same origin), used once within 30 s: used, forged or late, 403 | `tests/http3.test.ce` `isSessionOfWebTransport`; Cesia `tests/quic/webtransport.ce` |
| a page's queue of actions that floods its memory, or the app | at most `APP_OUTBOX_COUNT` actions and `APP_OUTBOX_BYTES` wait, the next refused at once; each action goes through the door, its limits too; a screen keeps `APP_RESUME_BYTES` of frames at most, and ends past them while away | Ceres `isOutboxBounded`; std/live `isBufferBounded` |
| a change queued while away that writes over someone's change made meanwhile | the page sends what it saw (`Centauri-Base`); `app.Unchanged` refuses a field changed (409 with both values) and `Expect`s the others in the same write | drop `isChangeOverAChangeRefused`; Ceres `isConflictShownWithItsChoices` |
| a reconnect storm after a restart | waits drawn at random under a bound that doubles (full jitter, 0.5 to 30 s) | `bench/storm.ce` (1,000 pages) |
| a resumed download that mixes two versions of a file | a strong `ETag`; `If-Range` of another version gets the whole file | drop `isDownloadNeverAMix` |
| a migration run twice, or half | its fact unique, its lease, its state; a fill that never overwrites | migrate `isOnceAcrossProcesses`, `isFilledWithoutOverwriting`, `isTakenAgainAfterItsLease` |

The threats of the admin pages, each with its test in `tests/admin.test.ce`, and in a browser
`examples/invoices/tools/admin-shot.sh`:

| threat | defense | test |
|---|---|---|
| a back door: an endpoint of the pages that skips a check | none: the pages call the endpoints of the role super through the door, by HTTP or by the live screen's actions; the module adds only three live shows, of the role super | admin `isEveryEndpointForSuperOnly`, `isLiveForSuperOnly` |
| the pages used without a session, or by a user who isn't a super-admin | 401 and 403 on each endpoint and each show; a sign-in of an account that isn't a super-admin's is signed out at once | admin `isEveryEndpointForSuperOnly`, `isLiveForSuperOnly`; the browser test |
| cross-site request forgery against a super-admin | a write of another site refused before its cookie is read; the screen opened from the app's origin only; `SameSite=Strict` | admin `isCrossSiteRefused`; live `isRefusedWithoutRights` |
| a secret sent to the page: a hash of a password, a session's, a webhook's secret, a setting | `app.Kind(..., secret)` fields masked by the server, never changed; settings masked by `check.Masked`; the password field a dot per character in the page's tree, a password input | admin `isSecretNeverSent`, `isEditCheckedByTheKind`; the browser test (`signIn`) |
| a field set to a value of another type, a unique value taken, a rule broken through the data browser | each field read through the shape of its Cepheus type, a wrong one named; Cepheus checks unique values and rules | admin `isEditCheckedByTheKind` |
| a change nobody can trace | each change an event of its user, address and route, naming the fields and never their values; Cepheus's history keeps who and why | admin `isEditCheckedByTheKind`, `isJobCancelledAndRetried` |
| script injection into the pages (XSS) | no HTML made from data: the page is drawn in a canvas from Cesia; the hidden DOM holds texts as text; no script of its own in `index.html`, the Content-Security-Policy allows the app's scripts and its WebAssembly only, no framing | admin `isPagesServedWithTheirHeaders` |
| a file outside the pages' folder, or their source, read by its path | the pages are a map of names read at the start; `..` or a name not in it gives 404; `.ce` files are left out | admin `isPagesServedWithTheirHeaders` |
| a flood through the pages | every action passes the limits of the address, the user and the tenant; the screens of a session (16) and their shows (64) are bounded | app `isLimited`; live `isRefusedWithoutRights` |

The threats of L3 (signing in with a provider, passkeys, the second factor, the keys of programs, the languages),
each with its test in `tests/oidc.test.ce` (oidc), `tests/passkeys.test.ce` (passkeys), `tests/second.test.ce`
(second), `tests/keys.test.ce` (keys), `tests/people.test.ce` (people), `tests/words.test.ce` (words), and
`examples/invoices/tests/l3.test.ce` (l3):

| threat | defense | test |
|---|---|---|
| token substitution: an ID token of another app, or of another sign-in | `aud` this app's client, and `azp` when there are several; `nonce` a BLAKE2b of the secret of this browser's cookie | oidc `isTokenOfAnotherAppOrSignInRefused` |
| mix-up: the answer of one provider taken for another's, the code of a sign-in sent to the wrong provider | the answer's `iss` checked when given, and asked when the provider says it gives it (RFC 9207); the code sent only to the token endpoint of the flow's provider, from its own discovery document | oidc `isMixUpRefused`, `isIssuerAskedWhenPromised` |
| replay of a flow: a finish sent twice | the flow ends at its first finish, by a write that expects it | oidc `isFinishedOnce` |
| CSRF of the callback, login CSRF: a sign-in started in the attacker's browser, finished in the victim's | `state` a BLAKE2b of the secret of the cookie of the browser that started (`__Host-oidc`, `SameSite=Strict`), compared in constant time; the finish refused from another site; the callback writes nothing | oidc `isLoginCsrfRefused`, `isCallbackPassedOn`, `isFlowCookieGuarded` |
| open redirect of `Return` | a path of the app only: a `/` not followed by another, no `\` nor control character, 2,000 bytes at most; else `/` | oidc `isReturnKeptInTheApp` |
| JWKS spoofing: keys a token names in itself, `alg: none`, HS256 with the provider's public key | the algorithms the app's (RS256, PS256, ES256, EdDSA); `none` and HMACs refused; the key from the provider's set by `kid` and type; `jwk`, `jku`, `x5u`, `x5c` never read | oidc `isForgedTokenRefused`; the keys turned, read again: `isRotationRead` |
| an expired token, or one of the future | `exp` and `iat`, a minute of skew | oidc `isTokenOfAnotherAppOrSignInRefused` |
| an unverified address used to take an account | an account linked only by an address the provider says is verified, as `OidcLink` says; Microsoft's `xms_edov` | oidc `isLinkedOnlyByAVerifiedAddress`, `isMicrosoftAndAppleRead`, `isAddressCheckedByTheProvider` |
| a provider's text shown to the user | only the error codes of OAuth 2.0 and OpenID Connect named | oidc `isProviderTextNotShown` |
| TOTP brute force | `StepTries` codes a ticket; the user's failures in Cepheus with the delay that doubles; `SignInPerIp` | second `isGuessingStopped` |
| TOTP replay: a code seen and typed again | the step of the last code taken kept; a code of that step or an earlier one refused; the write expects the old step | second `isCodeTakenOnce` |
| recovery code reuse | each code ended when used, by a write that expects it | second `isRecoveryCodeOnce` |
| a ticket of the second step forged, of another step, or late | `id.secret`, its hash kept, compared in constant time; `StepTime` | second `isTicketForgedRefused` |
| the secrets of TOTP and the recovery codes read in a copy of the database | the secret sealed (XSalsa20-Poly1305), the codes a keyed BLAKE2b, under a key of `APP_SECRET` | second `isSecretSealed` |
| TOTP turned off by who holds a session only | a code of the app or a recovery code asked | second `isTurnedOffOnlyWithACode`; set up again at the next sign-in when the settings ask it, `isTurnedOffThenSetUpAgainWhenAsked` |
| a passkey's answer from a phishing site, for another relying party, of another ceremony, in a frame | the origin (`APP_ORIGIN`, `PasskeyOrigins`), the SHA-256 of `RpId`, the type and the challenge of the ceremony, `crossOrigin` and `topOrigin` | passkeys `isPhishingRefused`, `isMadeOnlyHere`, `isTicketAndAssertionOnce` |
| a cloned passkey: its counter rolled back | a counter that must grow when either side counts; an event `passkey-cloned`; refused with `PasskeyCounter = refuse` | passkeys `isClonedKeyRefused`, `isCounterOfZeroTaken` |
| user verification skipped | `PasskeyCheck = required`: a device that verified nobody refused; else the second step | passkeys `isVerificationAsked` |
| an API key leaked in a log | no header in a log line; the events name the key's id, never its secret | keys `isKeyNeverInLogsNorEvents` |
| a key copied from the database | the BLAKE2b of its secret only | keys `isKeyOfTheDatabaseUseless` |
| a key used past its roles | its roles those of its maker's it was given and he still has, checked at each endpoint; a maker disabled or gone ends it | keys `isKeyBoundToItsRoles`; l3 `isPartnerApiWithItsKey`, `isKeyBoundToItsMaker` |
| a key used on the accounts | the door refuses a key on the endpoints of the module of the accounts | keys `isKeyNoPerson` |
| a key used past its end | `Ends` read at each request | keys `isKeyEnded` |
| a key used after it was revoked | its facts retracted; at once in this process, within `APP_SESSION_CACHE` seconds in the others | keys `isKeyRevokedEverywhere`; people `isKeysSeenAndRevokedBySuper` |
| a flood from a program | `KeyLimit` a minute for each key, and the limits of the address and of the tenant | keys `isKeyLimitedApart` |
| language header injection: a line end, a script, 5,000 languages in `Accept-Language` | the header read as tags only, 400 bytes and 20 languages; one of `Langs` in `Content-Language` | words `isLanguageHeaderInjectionHarmless` |
| a second factor skipped by another way in | the step after a password, a provider, a passkey its device didn't verify, the link of a check, a new password, a tenant entered, an invitation taken | second `isAskedOnEveryWayIn`; oidc `isSecondFactorAfterTheProvider`; passkeys `isVerificationAsked`; l3 `isPasskeyAndTwoFactor` |
| the code of an invitation read in an answer or the database | with `Mail`, a job makes it and mails it; its hash kept | people `isTenantAdminInvitingByMail`, `isInvitedByMail` |

The threats of the pages in French, each with its test in `tests/translated.test.ce` (translated),
`src/admin/pages/pages.test.ce` (pages), `examples/invoices/tests/l3.test.ce` (l3), and the browser test with
`LANG=fr`:

| threat | defense | test |
|---|---|---|
| markup in a translation, or in a text typed or kept, made into HTML in a page | a translation is a text: the canvas draws it, the hidden DOM gets it as text (`textContent`, `aria-label`); the door sends it inside JSON of `application/problem+json`, with nosniff | translated `isATranslationATextNotMarkup`; pages `isATranslationATextNotMarkup`; the browser test's step `markup` (no element made of `<b>` or `<img onerror>`) |
| a text without its translation, or with an empty one, shown empty or in a broken sentence | a text the catalogue lacks, or whose translation is empty, shows in English; a test walks the pages for each text said and fails on one without French, a name of a value lost (`{N}`), a value written into a text | pages `isMissingEnglishNeverEmpty`; translated `isEveryTextOfTheAdminInFrench`, `isCentaurisCatalogueWhole`, `isAnUntranslatedTextFound`; l3 `isAdminInFrench` |
| a header `Accept-Language` made to inject, sent to a page or to its live screen | read as tags only (400 bytes, 20 languages); the answer the same but its `Content-Language`, one of `Langs`; an action of the screen gets the header of its opening, read the same way | translated `isBadAcceptLanguageOnlyTheLanguage`, `isActInTheBrowsersLanguage` |

The threats of telemetry, OpenTelemetry's (`APP_OTEL`) and the pages' (`APP_TELEMETRY_CLIENT`), each with its test
in `tests/otel.test.ce` (otel), `tests/telemetry.test.ce` (telemetry) and Cesia's `tests/net/otel.ce` (std/otel):

| threat | defense | test |
|---|---|---|
| a flood of `/telemetry` | 300 batches a minute an address (429 past them), 64 KiB a batch (413), `APP_TELEMETRY_MOST` batches a minute for the process, past which a batch is dropped with a 204 and counted, nothing written; the limits of the door | telemetry `isFloodBounded` |
| data made up by a page or a bot | read through its shape (texts bounded, numbers in range, any other field dropped); routes, names of actions and kinds of errors only those the app knows; a view written only by its own session; everything marked `Untrusted`, used for no decision of the app | telemetry `isWhatAPageSaysMasked`, `isViewOfAnotherSessionUntouched`, `isBatchKeptAsAView` |
| personal data leaking through an address, an error, a span | the page masks its texts and the app again: addresses of mail, runs of 6 digits, tokens of 24 characters, the query and fragment of an address; a referrer kept as its origin; spans named by their route, never a path; a call's `url.full` without its path and query; no address nor account unless the settings say and, with `APP_TELEMETRY_CONSENT=ask`, the visitor said yes | telemetry `isWhatAPageSaysMasked`, `isVisitorNamedOnlyAsSaidAndAsked`; otel `isRequestTracedWithItsReads`, `isClientNamedOnlyAsTheSettingsSay`, `isCallAndJobInTheTrace` |
| markup in what a page says, shown in the admin | kept as a text; the admin's pages get it inside JSON (`application/json`, nosniff) and draw it as text in their canvas | telemetry `isMarkupKeptAsText`; the admin's `isPagesServedWithTheirHeaders` |
| a fingerprint of the visitor | only the low-entropy client hints, no canvas, fonts, audio nor high-entropy hint; a session of a tab, in its `sessionStorage`; the clock's offset, not its zone; Global Privacy Control and an objection honored: nothing sent | Ceres `web/telemetry.js` (its reads listed in [telemetry](telemetry.md#4-what-the-pages-tell)) |
| labels without end in the metrics (a method or a route made up) | 2,000 series a metric, the others in one, `otel_metric_overflow="true"` | std/otel `-- labels made from requests` |
| a collector slow, gone or that asks to wait | a queue of `APP_OTEL_QUEUE` that never makes a request wait: past it, dropped and counted (`otel_dropped_total`); tries again with full jitter or `Retry-After`, five at most; each export in a fiber of its own | std/otel `-- a dead collector never slows a request` (2,000 requests in less than a second), `-- a queue past its size drops, and counts`, `-- the collector asks to wait` |
| a `traceparent` from the internet, to choose a trace or force its sampling | `APP_OTEL_TRUST=restart`: a new trace, its sampling the app's, a link to the one given; a malformed one ignored; `tracestate` dropped, or kept within 512 bytes and 32 members when trusted | otel `isTraceparentFromOutsideRestarted`; std/otel `-- a traceparent from the internet` |
| the data of a request not sampled leaving | no span of it is made, its children neither; its info lines stay out; only its own span when it failed or was slow (`APP_OTEL_ALWAYS`) | otel `isNotSampledLeavingNothing`; std/otel `-- not sampled: nothing of it leaves` |
| the key of a vendor in a log | `APP_OTEL_HEADERS` is a secret: masked in the admin, never logged | app `isAdminOfTheApp` (settings masked) |

What Centauri does not do yet: the third wall, a token of Cepheus per role that reads only its kinds (G16), for roles
that must never see some kinds (an outside accountant); checking a new password against the lists of leaked ones. The
neutral answer of a sign-up came with L2 (`SignUpAnswer`, with mail); multi-factor and passkeys (L3) are done now:
TOTP and recovery codes, passkeys, signing in with a provider, and the second factor on every way in.
