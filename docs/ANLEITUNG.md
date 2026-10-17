# Tafel – Einrichtung

Einmalige Schritte in dieser Reihenfolge. Zeitaufwand etwa 20 Minuten.

## 1. GitHub Pages einschalten (einmalig)

1. https://github.com/n-marius/Order öffnen → **Settings** → links **Pages**.
2. Unter „Build and deployment“ → **Source**: „Deploy from a branch“.
3. **Branch**: `main`, Ordner `/ (root)` → **Save**.
4. Nach 1–2 Minuten ist die Seite erreichbar unter
   **https://n-marius.github.io/Order/**
   (Küche: `…/Order/kueche/`, Bestellgeräte: `…/Order/bestellen/`).

Jede spätere Änderung am Branch `main` wird automatisch veröffentlicht. Die Apps holen sich Updates beim nächsten Start; manchmal ist ein zweiter Start nötig.

## 2. GitHub-Token erstellen

Der Token erlaubt den Apps, die beiden privaten Gists (Daten und Fotos) zu lesen und zu schreiben.

1. https://github.com/settings/personal-access-tokens/new öffnen (Fine-grained token).
2. **Token name**: `Tafel`. **Expiration**: so lang wie möglich bzw. „No expiration“, wenn angeboten.
3. **Repository access**: „Public repositories (read-only)“ genügt (die Apps brauchen keinen Repo-Zugriff).
4. **Permissions → Account permissions → Gists**: „Read and write“.
5. **Generate token** → Token kopieren (beginnt mit `github_pat_`). Er wird nur einmal angezeigt.

Sicherheit: Der Token liegt im Speicher jedes eingerichteten Geräts und gibt Schreibzugriff auf alle Gists des Kontos. Wer ihn besitzt, kann diese Gists lesen und ändern. Wenn ein Gerät verloren geht: Token auf GitHub löschen, neuen erzeugen, Geräte neu einrichten. Ein „secret“ Gist ist nicht passwortgeschützt, sondern nur nicht auffindbar.

Falls fine-grained Tokens keine Gist-Berechtigung anbieten: „Tokens (classic)“ mit nur dem Haken **gist** verwenden.

## 3. Push-Server (optional, für Mitteilungen)

Siehe [ANLEITUNG-PUSH.md](ANLEITUNG-PUSH.md). Ohne Push funktioniert alles, Meldungen erscheinen dann jedoch nur bei geöffneter App.

## 4. Küche einrichten (iPad in der Küche)

1. In Safari `https://n-marius.github.io/Order/kueche/` öffnen → Teilen → **Zum Home-Bildschirm**.
2. App über das neue Symbol starten.
3. Gerätename (z. B. „Küche“) und Token eingeben → **Neue Ablage anlegen**. Die App erstellt die beiden Gists selbst.
4. Falls Push eingerichtet: Einstellungen → Push → Worker-URL und Haushaltsschlüssel eintragen → **Mitteilungen aktivieren** → Erlauben.
5. Zutaten und Gerichte anlegen.
6. Einstellungen → **Einrichtungscode** → Kopieren. Den Code z. B. per AirDrop, Nachrichten oder Notizen auf die Bestellgeräte bringen.

## 5. Bestellgeräte einrichten (je Raum)

1. In Safari `https://n-marius.github.io/Order/bestellen/` öffnen → Teilen → **Zum Home-Bildschirm**.
2. App über das Symbol starten, Raumname eingeben (z. B. „Wohnzimmer“), Einrichtungscode einfügen.
3. Einstellungen → Push → **Mitteilungen aktivieren** → Erlauben.

Wichtig auf iPad/iPhone: Die Home-Bildschirm-App hat einen eigenen Speicher, getrennt von Safari. Die Einrichtung deshalb immer in der installierten App vornehmen, nicht im Safari-Tab.

## Verhalten und Grenzen

- **Aktualität**: Die Geräte fragen den Gist alle 4 Sekunden ab, solange die App im Vordergrund ist. Neue Bestellungen erscheinen in der Küche nach wenigen Sekunden.
- **Küche „offline“**: Die Küche meldet sich jede Minute. Bestätigt sie eine Bestellung nicht innerhalb von 25 Sekunden, zeigt das Bestellgerät einen Hinweis; sobald die Küche sie empfängt, folgt eine Bestätigung. Bei gesperrtem Küchen-iPad gilt die Küche als offline – für den Dauerbetrieb Automatische Sperre in den iPad-Einstellungen auf „Nie“ stellen (Einstellungen → Anzeige & Helligkeit).
- **Ohne Internet** arbeiten alle Apps weiter (Menü aus dem Speicher, Bestellungen werden gespeichert und später gesendet). Oben erscheint dann ein rotes Band.
- **GitHub-Limits**: 5.000 API-Anfragen pro Stunde je Token. Unveränderte Abrufe zählen laut GitHub nicht mit. Bei vielen gleichzeitig offenen Geräten über Stunden kann das Limit theoretisch erreicht werden; die Einstellungen zeigen die verbleibenden Anfragen.
- **Mehrere Küchengeräte** sind möglich. Bearbeiten zwei Küchen gleichzeitig dasselbe Gericht, gilt die zuletzt gespeicherte Fassung.
