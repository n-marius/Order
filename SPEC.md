# Tafel – technische Spezifikation

Zwei PWAs (Vanilla JS, ES-Module, kein Build), gehostet auf GitHub Pages:

- `kueche/`  – Küche: Gerichte/Zutaten pflegen, Bestellungen empfangen und bearbeiten
- `bestellen/` – Bestellgeräte (ein Gerät je Raum)
- `shared/`  – gemeinsamer Code und Designsystem
- `worker/`  – Cloudflare Worker für Web-Push

Alle Pfade relativ (`../shared/...`), damit die Seite unter `/<repo>/` läuft.

## Synchronisation (shared/sync.js)

Ein privater GitHub-Gist („Daten-Gist“). **Jedes Gerät schreibt nur seine eigene Datei** `dev-<deviceId>.json`,
liest aber alle. Dadurch gibt es keine Schreibkonflikte. Mehrere Küchengeräte sind möglich: Menü und Status
werden pro Eintrag nach `updatedAt` zusammengeführt (neuester gewinnt, Löschen = Tombstone `deleted: true`).

Fotos liegen in einem zweiten Gist („Bilder-Gist“) als `img-<imageId>.txt` (Data-URL, JPEG ≤ 900 px),
lokal in IndexedDB gecacht.

Polling: alle 4 s bei sichtbarer App (ETag / 304), pausiert im Hintergrund. Schreiben: entprellt, bei
Fehler/Offline erneuter Versuch. Die Küche schreibt alle 60 s einen Heartbeat (`device.heartbeat`).

## Gerätedatei

```jsonc
{
  "v": 1,
  "device": { "id", "name", "role": "kitchen" | "order", "updatedAt", "heartbeat" },

  // nur Küche
  "menu": {
    "ingredients": { "<id>": { "id", "name", "available": true, "updatedAt", "deleted"? } },
    "dishes":      { "<id>": Dish }
  },
  "status": { "<orderId>": { "ackRev", "updatedAt", "items": { "<itemId>": ItemStatus } } },

  // nur Bestellgerät
  "orders": { "<orderId>": Order }
}
```

### Dish
```jsonc
{
  "id", "name", "category": "vorspeise|hauptspeise|dessert|getraenk|alkohol",
  "country": "IT" | "",            // ISO-3166 alpha-2 → Flaggen-Emoji
  "description": "", "imageId": null | "<id>",
  "prepMinutes": null | number,
  "sizes": [ { "id", "name" } ],   // leer = keine Portionsgrößen
  "defaultSizeId": null | "<id>",
  "ingredients": [ { "ingredientId", "unit", "amount", "amounts": { "<sizeId>": "" } } ],
                                   // ohne sizes: amount, mit sizes: amounts je Größe
  "steps": [ "..." ],
  "options": [ { "id", "name", "type": "single|multi", "required": false,
                 "choices": [ { "id", "name", "ingredientId": null|"<id>", "default": false } ] } ],
  "ice": null | { "default": true|false },   // null = keine Eis-Auswahl
  "sort": 0, "updatedAt", "deleted"?
}
```
Verfügbarkeit: Gericht verfügbar ⇔ alle Zutaten der Zutatenliste vorhanden. Option ausgegraut ⇔ verknüpfte Zutat fehlt.
Pro Kategorie gibt es zusätzlich das virtuelle Gericht `manual-<category>` („Manuell“, immer verfügbar,
Anmerkung Pflicht).

### Order (Bestellgerät)
```jsonc
{
  "id", "deviceId", "deviceName", "createdAt", "updatedAt",
  "rev": 1,                         // +1 bei jeder inhaltlichen Änderung durch den Besteller
  "note": "", "cancelled": false, "cancelledAt": null,
  "changes": [ { "at", "text" } ],  // Änderungsprotokoll für die Küche
  "items": [ {
    "id", "dishId", "name", "category", "country",
    "sizeId": null, "sizeName": null, "qty": 1,
    "ice": null | true | false,
    "options": { "<optionId>": ["<choiceId>"] },
    "optionLabels": [ "Optionsname: Auswahl" ],
    "note": "", "cancelled": false, "cancelledAt": null,
    "answers": { "<questionId>": { "quick": "ja|nein|egal|null", "text": "", "at" } }
  } ]
}
```

### ItemStatus (Küche)
```jsonc
{ "state": "neu|fertig|storno", "reason": "", "updatedAt",
  "questions": [ { "id", "text", "at" } ] }
```
Anzeige-Zustand je Position (`model.itemState`): `abbestellt` (vom Besteller storniert) → `storno` → `fertig` →
`nachfrage` (offene Frage ohne Antwort) → `neu`.

`ackRev`: höchste Bestell-Revision, die die Küche empfangen hat. `ackRev >= 1` = „bei der Küche angekommen“.
`ackRev < order.rev` = Änderung noch nicht empfangen.

## Push (shared/push.js, worker/)

Worker-Endpunkte (Header `X-Tafel-Key: <Haushaltsschlüssel>`):
- `GET  /vapid` → `{ publicKey }`
- `POST /subscribe` `{ deviceId, role, name, subscription }`
- `POST /notify` `{ to: { role?: "kitchen"|"order", deviceIds?: [] }, title, body, tag?, url? }`

Benachrichtigungen werden über `sync.queueNotify(msg)` gesendet: erst nachdem der zugehörige Gist-Stand
erfolgreich geschrieben wurde (sonst käme die Meldung vor den Daten an).

Auslöser:
- Bestellgerät → Küche: neue Bestellung, Änderung, Storno durch Besteller, Antwort auf Nachfrage
- Küche → Bestellgerät: Storno einer Position, Nachfrage, verspäteter Empfang (Bestellung war > 45 s unbestätigt)
- lokal am Bestellgerät: Küche hat Bestellung nach 25 s nicht bestätigt (Banner + ggf. lokale Mitteilung)

## Einstellungen (localStorage `tafel.settings.<role>`)
`deviceId, deviceName, token, gistId, imgGistId, workerUrl, workerKey, theme: system|light|dark, sound, apiBase`

Einrichtungscode: `TAFEL1:` + base64url(JSON `{ t, g, i, w, k }`), in der Küche erzeugt, am Bestellgerät eingefügt.
