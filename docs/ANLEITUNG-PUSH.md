# Push-Mitteilungen einrichten (Cloudflare Worker)

Damit Küche und Bestellgeräte Mitteilungen erhalten, auch wenn die App geschlossen ist, wird ein kleiner
Push-Server benötigt. Er läuft kostenlos bei Cloudflare und wird einmalig eingerichtet (ca. 15 Minuten).
Ein Kommandozeilenwerkzeug ist nicht nötig.

Hinweis: Cloudflare ändert gelegentlich Menübezeichnungen und Anordnung im Dashboard. Weichen Namen ab,
nach dem sinngemäß passenden Eintrag suchen (z. B. „Workers & Pages“, „Storage & Databases“, „Settings“).

## 1. Konto anlegen

1. <https://dash.cloudflare.com/sign-up> öffnen, E-Mail-Adresse und Passwort eingeben, E-Mail bestätigen.
2. Eine eigene Domain wird **nicht** benötigt. Abfragen zu Domains oder kostenpflichtigen Tarifen überspringen;
   der Free-Plan genügt.

## 2. Worker anlegen

1. Im Dashboard links **Workers & Pages** (bzw. **Compute → Workers**) öffnen.
2. **Create** (bzw. „Anwendung erstellen“) → **Create Worker** / **Start with Hello World!** wählen.
3. Beim ersten Worker fragt Cloudflare nach einer Subdomain unter `workers.dev` (z. B. `meinhaushalt`).
   Beliebigen Namen wählen.
4. Als Namen des Workers `tafel-push` eintragen und **Deploy** wählen. Es entsteht ein Beispiel-Worker.

## 3. Code einfügen und bereitstellen

1. Im neuen Worker **Edit code** (Code bearbeiten) öffnen.
2. Den gesamten vorhandenen Beispielcode im Editor löschen.
3. Den vollständigen Inhalt der Datei `worker/worker.js` aus diesem Projekt kopieren und einfügen.
4. Rechts oben **Deploy** wählen.

Bei späteren Aktualisierungen von `worker/worker.js` dieselben Schritte wiederholen. Gespeicherte Abos und
Schlüssel bleiben dabei erhalten.

## 4. KV-Speicher anlegen und verbinden

Der Worker speichert die Abos der Geräte und seinen Signaturschlüssel in einem KV-Namespace.

1. Im Dashboard links **Storage & Databases → KV** (früher „Workers KV“) öffnen.
2. **Create** / **Create a namespace** wählen, Name z. B. `tafel-push`, bestätigen.
3. Zurück zum Worker `tafel-push` → **Settings** → **Bindings** → **Add** (Bindung hinzufügen) →
   **KV namespace**.
4. **Variable name:** `TAFEL_KV` (genau so, Großbuchstaben). **KV namespace:** den eben angelegten auswählen.
5. Speichern bzw. **Deploy** bestätigen.

## 5. Haushaltsschlüssel als Secret anlegen

Der Haushaltsschlüssel schützt den Worker vor fremder Nutzung. Er muss nicht merkbar sein, sollte aber lang und
zufällig sein – nur Buchstaben und Ziffern, keine Umlaute oder Leerzeichen.

Einfache Möglichkeiten, einen Wert zu erzeugen:

- **Mac:** Programm *Terminal* öffnen, `openssl rand -hex 32` eingeben, Eingabetaste. Die ausgegebene Zeile
  (64 Zeichen) ist der Schlüssel.
- **Ohne Terminal:** in einem beliebigen Passwort-Manager (z. B. App *Passwörter* auf iPhone/iPad/Mac) ein
  starkes Passwort erzeugen lassen, Sonderzeichen möglichst weglassen, mindestens 32 Zeichen.

Anlegen:

1. Worker `tafel-push` → **Settings** → **Variables and Secrets** → **Add**.
2. **Type:** *Secret*. **Variable name:** `TAFEL_KEY`. **Value:** den erzeugten Schlüssel einfügen.
3. Speichern bzw. **Deploy** bestätigen.

Optional (nur bei Bedarf, Typ *Text*):

| Name             | Zweck                                                                                             |
|------------------|---------------------------------------------------------------------------------------------------|
| `VAPID_SUBJECT`  | Kontaktangabe für die Push-Dienste, z. B. `mailto:name@beispiel.de` (ohne Leerzeichen, ohne `< >`). Ohne Angabe wird die Adresse des Workers verwendet; das genügt normalerweise. |
| `ALLOWED_ORIGIN` | Nur Aufrufe von dieser Website zulassen, z. B. `https://name.github.io`. Ohne Angabe: alle.       |

## 6. Funktion prüfen und Worker-URL ablesen

1. Im Worker unter **Settings → Domains & Routes** (oder in der Übersicht) die Adresse ablesen, z. B.
   `https://tafel-push.meinhaushalt.workers.dev`.
2. Diese Adresse im Browser öffnen. Erwartete Anzeige:

   ```
   Tafel-Push-Server ist in Betrieb.
   KV-Namespace TAFEL_KV: verbunden
   Secret TAFEL_KEY: gesetzt
   ```

   Steht dort „FEHLT“, den entsprechenden Schritt (4 bzw. 5) wiederholen.

## 7. In der Küchen-App eintragen

1. Küchen-App öffnen → **Einstellungen → Mitteilungen**.
2. Worker-URL (aus Schritt 6) und Haushaltsschlüssel (aus Schritt 5) eintragen und speichern.
3. Der **Einrichtungscode** der Küche enthält ab jetzt auch Worker-URL und Schlüssel. Auf den Bestellgeräten
   den neuen Einrichtungscode einfügen; dort ist keine weitere Eingabe nötig.

## 8. Mitteilungen auf jedem Gerät aktivieren

**iPad/iPhone (iOS/iPadOS 16.4 oder neuer):** Mitteilungen funktionieren nur für installierte Web-Apps.

1. Die App in Safari öffnen → **Teilen** (Quadrat mit Pfeil) → **Zum Home-Bildschirm** → **Hinzufügen**.
2. Die App ab jetzt nur noch über das Symbol auf dem Home-Bildschirm starten.
3. In der App **Einstellungen → Mitteilungen → Mitteilungen aktivieren** antippen und die Nachfrage mit **Erlauben**
   bestätigen.

**Mac, Android, Windows (Chrome, Edge, Firefox, Safari):** In der App **Mitteilungen aktivieren** wählen und
erlauben. Eine Installation ist dort nicht zwingend.

Die Aktivierung ist je Gerät und je App (Küche/Bestellen) einmal nötig. Zum Prüfen eine Testmitteilung
auslösen („Testmitteilung senden“ bzw. „Test senden“) oder eine Bestellung aufgeben.

## Kostenrahmen (Free-Plan)

Stand der Recherche Oktober 2026 – bitte bei Cloudflare prüfen:
<https://developers.cloudflare.com/workers/platform/pricing/>,
<https://developers.cloudflare.com/kv/platform/pricing/>.

| Posten                        | Free-Plan pro Tag (Rücksetzung 00:00 UTC) | Verbrauch durch Tafel                              |
|-------------------------------|-------------------------------------------|----------------------------------------------------|
| Worker-Anfragen               | 100 000                                   | 1 je Mitteilung, 2 je Abo-Auffrischung             |
| CPU-Zeit je Anfrage           | 10 ms                                     | wenige ms je Mitteilung                            |
| KV-Lesevorgänge               | 100 000                                   | 1–3 je Mitteilung                                  |
| KV-Schreibvorgänge            | 1 000                                     | 1 je Gerät und Tag, dazu wenige für Schlüssel      |
| KV-Listenabfragen             | 1 000                                     | 1 je Mitteilung an „alle Küchengeräte“             |
| KV-Löschvorgänge              | 1 000                                     | nur bei abgelaufenen Abos                          |
| KV-Speicher                   | 1 GB                                      | wenige KB                                          |

Für einen Haushalt bleibt der Verbrauch weit unter den Grenzen. Wird eine Grenze überschritten, schlagen weitere
Aufrufe bis zur täglichen Rücksetzung fehl; es entstehen ohne Tarifwechsel keine Kosten.

## Fehlerbehebung

**„Haushaltsschlüssel falsch“ / Fehler 401**
Der in der App eingetragene Schlüssel stimmt nicht mit dem Secret `TAFEL_KEY` überein. Wert in der Küche erneut
einfügen (auf Leerzeichen am Anfang/Ende achten). Nach einer Änderung des Schlüssels den neuen Einrichtungscode
auf allen Bestellgeräten einfügen.

**„Push-Server: 500“**
Worker-Adresse im Browser öffnen (Schritt 6). Fehlt KV oder Secret, Schritt 4 bzw. 5 wiederholen. Nach
Code-Änderungen prüfen, ob wirklich der vollständige Inhalt von `worker/worker.js` eingefügt und **Deploy**
gewählt wurde.

**Keine Mitteilungen auf iPad/iPhone**
- iOS/iPadOS mindestens 16.4 (Einstellungen → Allgemein → Info).
- App über das Symbol auf dem Home-Bildschirm öffnen, nicht im Safari-Tab. Jede installierte Web-App hat eigene
  Mitteilungsrechte.
- iOS-Einstellungen → **Mitteilungen** → App auswählen → **Mitteilungen erlauben** einschalten, Stil
  „Banner“, Ton aktiv.
- Wurde die App vom Home-Bildschirm entfernt und neu hinzugefügt, „Mitteilungen aktivieren“ erneut antippen.
- Gerät mit dem Internet verbunden? Mitteilungen werden bis zu 24 Stunden nachgeliefert.

**Mitteilungen kommen an, aber ohne Ton oder Banner (Fokus-Modus)**
Ein aktiver Fokus (Nicht stören, Schlafen, Arbeiten …) unterdrückt Mitteilungen. Einstellungen → **Fokus** →
jeweiligen Fokus → **Apps** → die Tafel-App als erlaubte App hinzufügen, oder den Fokus auf dem Küchengerät
deaktivieren. Ebenso prüfen: Stummschalter/Lautstärke, „Mitteilungen zusammenfassen“ (zeitversetzte Zustellung).

**Einzelne Geräte erhalten nichts**
Fehlgeschlagene Zustellungen protokolliert der Worker mit Statuscode und Grund (Cloudflare-Dashboard → Worker
→ **Logs**/**Observability**, Echtzeitprotokoll einschalten und eine Testmitteilung auslösen). Dieselben Angaben
stehen im Feld `errors` der Antwort auf `/notify`.
- `403` mit `BadJwtToken` (Apple): Variable `VAPID_SUBJECT` mit einer gültigen Adresse setzen, z. B.
  `mailto:name@beispiel.de`, und erneut testen.
- `403` mit `VapidPkHashMismatch`: Das Gerät nutzt ein Abo eines alten Schlüssels. In der App „Mitteilungen
  aktivieren“ erneut antippen.
- Abgelaufene Abos (`404`/`410`) entfernt der Worker selbst. Auf dem betroffenen Gerät „Mitteilungen aktivieren“
  erneut antippen.

**Wichtig:** Den KV-Eintrag `vapid` nicht löschen. Er enthält den Signaturschlüssel; ohne ihn müssen alle Geräte
„Mitteilungen aktivieren“ erneut ausführen.
