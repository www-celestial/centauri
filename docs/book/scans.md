# The scan of an invoice

The task: an accountant joins the scan of an invoice (a PDF, a JPEG or a PNG, 10 MB at most), kept with the
database, sealed for his office; anyone of the office reads it back, whole or the pages a viewer asks by ranges; and
nobody passes a page of HTML off as a PDF, sends a file of a gigabyte, or reads another office's scan. The code is
`src/app/files.ce` (and the bodies in pieces of `std/http`), its tests `tests/files.test.ce`; the invoices' scan is
`scan` and `scanFile` in `examples/invoices/src/invoices/month.ce`, checked by `isScanKeptAndReadByRanges`.

What it uses: `api.Upload`, a body read in pieces as it comes (never whole), its type checked by its first bytes,
`app.Store` into Cepheus's vault by parts, `app.Download` with `Range`.

## 1. The contract

```
Scan = api.Upload("/invoices/:id/scan", ["application/pdf", "image/jpeg", "image/png"], most = 10485760,
  out = check.Record({File: check.Id(), Size: check.Int(0)}), role = "accountant")
ScanFile = api.Get("/invoices/:id/scan", out = api.File(), role = "accountant")
```

A page sends the file itself as the body, with its type and its name: `fetch("/invoices/7/scan?name=scan.pdf", {method:
"POST", body: file, headers: {"content-type": file.type}})`. The handler gets `file`, `{Name, Type, Size, Read}`:

```
defn scan(r, file)
  inv = app.Own(Invoice, r.Params.id, r)?
  f = app.Store(Scans, file, r)?
  cepheus.Write([cepheus.Expect(inv.Id, Invoice.Scan, dict.Get("Scan", inv)), cepheus.Add(inv.Id, Invoice.Scan, f)], r.Db, by = r.User.Id, why = r.Why)?
  {File: f, Size: file.Size}
end

defn scanFile(r)
  inv = app.Own(Invoice, r.Params.id, r)?
  if value.IsMissing(dict.Get("Scan", inv))
    return app.Missing("This invoice has no scan.")
  end
  app.Download(Scans, inv.Scan, r)
end
```

`Scans = app.Files("scan")` is its kind: each thing a file, with its tenant, name, size, type, parts, owner.

```java
// Spring Boot: a MultipartFile (multipart/form-data, spring.servlet.multipart.max-file-size), Apache Tika to check
// the type, a store of your choice (S3, a folder, a BLOB column), and ResourceRegion for ranges
@PostMapping("/invoices/{id}/scan") ScanOut scan(@PathVariable long id, @RequestParam MultipartFile file, @AuthenticationPrincipal Principal u) throws IOException {
  var inv = own(id, u);
  var type = tika.detect(file.getInputStream());               // the first bytes
  if (!Set.of("application/pdf", "image/jpeg", "image/png").contains(type)) throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE);
  var key = storage.put(u.officeId(), file.getInputStream(), file.getSize());   // S3 or a folder: a second store to back up
  inv.scan = key; return new ScanOut(key, file.getSize());
}
@GetMapping("/invoices/{id}/scan") ResponseEntity<Resource> file(@PathVariable long id, @AuthenticationPrincipal Principal u) {
  return ResponseEntity.ok().header(CONTENT_DISPOSITION, "attachment").body(storage.get(own(id, u).scan));   // Range by Spring's ResourceHttpRequestHandler
}
```

## 2. A body in pieces

Centauri serves an `api.Upload` with a route of `std/http` that takes its body in pieces (`http.Route(..., stream =
most)`): a body larger than one read, or than `APP_MAX_BODY`, comes to the handler as it reads it, a piece at a time (64
KiB at most), so the server never holds it whole. A body larger than `most` is a `413` before anything runs; a client
that sent `Expect: 100-continue` (curl does, for a large body) is told to go on only when the handler reads, so a
request refused first (a `401`, a type the endpoint doesn't take) never sends its body. Each piece has the request's
timeout, and the whole a second more for each 64 KiB: a client that sends a byte a minute is closed, one on a slow line
is not.

## 3. Its type, by its first bytes

The `Content-Type` a client sends proves nothing: Centauri believes it only when the file's first bytes say so
(`%PDF-` for a PDF, the signature of PNG, `FF D8 FF` for JPEG, `GIF8`, `RIFF....WEBP`, `PK` for zip and the files of
Office, UTF-8 without a NUL for text and CSV). A page of HTML sent as a PDF, a script sent as a PNG are a `415`
(`isTypeTrustedByItsBytesOnly`). And a file never runs in the app's origin: a download is an attachment
(`Content-Disposition: attachment`), its type never sniffed by the browser (`X-Content-Type-Options: nosniff`), under
`Content-Security-Policy: sandbox`, which forbids scripts if it is opened anyway.

## 4. In the vault, by parts

`app.Store(Scans, file, r)` stores the file as it comes, by parts of `APP_UPLOAD_PART` bytes (1 MiB), each a file of
Cepheus's vault (`cepheus.Put`: compressed, sealed with the key of its owner, the office, stored once), then one thing
of `Scans` that names them in order. One part at most is in memory. Cepheus has no `Put` of a file in pieces yet (it is
proposed); until then a file is its parts, which also keeps each request to Cepheus under its frame of 16 MiB. A file
cut short, or a part the database refuses, leaves no file: the parts written are deleted. Erasing the office's key
(`cepheus.Erase`) makes all its scans unreadable, on every disk and every copy. In a test, or in dev without a server,
the database is a fork, which holds no file: the parts are then facts of the fork, and the code is the same.

`app.Download(Scans, id, r)` sends it part by part, reading only the parts under the range asked:

| `Range` | answer |
|---|---|
| none | `200`, the whole file |
| `bytes=0-99`, `bytes=900-`, `bytes=-100` | `206` and `Content-Range: bytes 900-999/1000` |
| starting past the end | `416` and `Content-Range: bytes */1000` |
| several ranges, another unit, a syntax it doesn't read | `200`, the whole file (as RFC 9110 allows) |

## 5. What it defends against

| threat | defense | test |
|---|---|---|
| a page of HTML or a script stored as a PDF, then opened in the app's origin (stored XSS) | the type believed by its first bytes only; downloads as attachments, never sniffed, sandboxed | `isTypeTrustedByItsBytesOnly`, `isStoredByPartsAndReadByRanges` |
| a file too large, or many at once, to fill the memory or the disk (upload bombs) | `most` refused before a byte is read; the body never whole (one part, one piece); `APP_UPLOADS_AT_ONCE` (16) uploads at once in a process, then `503`; Centauri never decodes a file, so a zip or an image that unpacks to gigabytes stays its own size | `isTooLargeRefused`, `isUploadsAtOnceBounded`, `isStreamedOverTheNetwork` |
| a slow upload that holds a connection (slowloris) | each piece within the timeout, the whole within the timeout plus a second a 64 KiB | `tests/net/http-pieces.ce` of Cesia |
| a name that climbs out of a folder (`../../etc/passwd`), or adds a header | a file names no path (its bytes are in the database); its name kept as its last part, without control characters or quotes | `isNameKeptHarmless` |
| another office's scan, by its id | `app.Own` (404) | `isOtherTenantsFileHidden`, `apptest.Isolated` |
| a range that wraps or overflows | a range read as one of numbers of 15 digits at most; past the end a `416` | `isStoredByPartsAndReadByRanges` |

## 6. What it costs

Measured on this machine, a real Cepheus server on its SSD, 21 runs (2026-11-26, load 1.3 to 2.9): a scan of 10 MiB
of random bytes (which no compression shrinks) is stored in 274 ms [210, 2986] (38 MB/s: ten parts, each forced to
the disk), read back whole in 51 ms [46, 56] (207 MB/s), and a range of 64 KiB in its middle in 0.9 ms [0.9, 1.1]. The
first number carries ten `fsync`s of the vault; Spring with S3 would carry the round trips to S3 instead (not measured
here).

An upload cut on the way goes on from the bytes the app holds, sent with an `Idempotency-Key` (the headers of the tus
protocol, on this same endpoint), and a download cut goes on by `Range` and `If-Range`: [When the connection
drops](connection.md#6-uploads-and-downloads-that-go-on).

Next: [The unpaid invoices, live](live.md).
