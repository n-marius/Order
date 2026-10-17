# Tafel

Zwei PWAs für zu Hause: **Bestellen** (ein iPad je Raum) und **Küche** (empfängt Bestellungen, verwaltet Gerichte und Zutaten). Synchronisation über einen privaten GitHub-Gist, Mitteilungen über einen Cloudflare Worker.

- Apps: https://n-marius.github.io/Order/
- Einrichtung: [docs/ANLEITUNG.md](docs/ANLEITUNG.md)
- Push-Server: [docs/ANLEITUNG-PUSH.md](docs/ANLEITUNG-PUSH.md)
- Technik: [SPEC.md](SPEC.md)

Lokal testen: `node tests/mock-server.mjs 8080` → http://localhost:8080/ (simuliert Gist-API und Worker, siehe Kopf der Datei).
