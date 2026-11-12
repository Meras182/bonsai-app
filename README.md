# 🌳 Bonsai – Pflege-App fürs iPhone

Eine Progressive Web App (PWA) zum Dokumentieren deiner Bonsais:

- **Bäume anlegen** (Name, Art, Notizen)
- **Fotos machen** direkt über die iPhone-Kamera und im Baum-Profil ablegen
- **Pflege-Erinnerungen** für Gießen, Düngen, Schneiden und Umtopfen – mit individuellen Intervallen pro Baum
- **Tagesübersicht**: überfällig / heute fällig / demnächst
- **Echte Push-Benachrichtigungen** täglich früh morgens, wenn Pflege fällig ist
- **Offline-fähig**: alle Daten liegen lokal auf dem Gerät (IndexedDB)

**Kein Mac, kein Apple-Developer-Konto nötig.** Die App wird über den Browser installiert.

---

## 1. Auf dem iPhone installieren

1. Deploye die App (siehe unten) und öffne die URL in **Safari**.
2. Tippe auf das **Teilen-Symbol** (Quadrat mit Pfeil) → **„Zum Home-Bildschirm"** → **Hinzufügen**.
3. Öffne die App vom Home-Bildschirm (nicht aus Safari-Tabs!).
4. In der App: Tab **Einstellungen** → **🔔 Erinnerungen aktivieren** → Benachrichtigungen erlauben.

> ⚠️ Voraussetzungen für Push auf iOS: **iOS 16.4 oder neuer** und Installation
> über „Zum Home-Bildschirm". In einem normalen Safari-Tab verweigert iOS die Push-Freigabe –
> die App zeigt dir das in den Einstellungen an.

## 2. Deployment ohne Mac (kostenlos, ca. 15 Minuten)

Die App besteht aus zwei Teilen: der **Web-App** (`public/`) und den **Server-Funktionen**
für Push (`api/`). Beides läuft auf dem kostenlosen **Vercel**-Hobbyplan, benachrichtigt
wird über den kostenlosen **Upstash**-Redis-Speicher.

### Schritt 1: Repository nach GitHub pushen

```bash
git init && git add -A && git commit -m "Bonsai App"
git remote add origin https://github.com/<DEIN-NAME>/<REPO>.git
git push -u origin main
```

### Schritt 2: Auf Vercel deployen

1. Auf [vercel.com](https://vercel.com) mit GitHub anmelden (kostenloser Hobbyplan).
2. **Add New → Project** → das Repository auswählen → **Import**.
3. Noch **nicht** deployen, sondern zuerst unter **Environment Variables** diese Variablen anlegen:

| Variable | Wert |
|---|---|
| `VAPID_PUBLIC_KEY` | aus Schritt 3 |
| `VAPID_PRIVATE_KEY` | aus Schritt 3 |
| `VAPID_SUBJECT` | `mailto:deine-mail@beispiel.de` |
| `UPSTASH_REDIS_REST_URL` | aus Schritt 4 |
| `UPSTASH_REDIS_REST_TOKEN` | aus Schritt 4 |
| `CRON_SECRET` | ein selbst gewähltes langes Zufallspasswort |

4. Jetzt auf **Deploy** klicken. Fertig – die URL (z. B. `bonsai-app.vercel.app`) ist deine App.

### Schritt 3: VAPID-Schlüssel erzeugen

Auf deinem Computer (oder in [GitHub Codespaces](https://codespaces.new) – läuft im Browser):

```bash
npm install
npm run vapid
```

Die ausgegebenen Werte trägst du wie oben beschrieben bei Vercel ein.

### Schritt 4: Upstash Redis anlegen (kostenlos)

1. Auf [upstash.com](https://upstash.com) anmelden → **Create Database** (Region z. B. *eu-central-1*, Free-Plan).
2. In der Datenbank-Ansicht unter **REST API** die Werte **UPSTASH_REDIS_REST_URL** und **UPSTASH_REDIS_REST_TOKEN** kopieren und bei Vercel eintragen.

### Schritt 5: Erinnerungen testen

- In der App unter **Einstellungen** → **Test-Benachrichtigung senden**.
- Der tägliche Push-Versand läuft automatisch per Cron-Job (`vercel.json`, täglich 07:00 Uhr UTC).

## Projektstruktur

```
public/            Web-App (HTML/CSS/JS, Service Worker, Icons)
api/               Vercel-Serverfunktionen
  subscribe.js       Push-Abos speichern/aktualisieren/löschen
  vapid-public.js    öffentlichen Schlüssel ausliefern
  cron-reminders.js  täglicher Versand der fälligen Erinnerungen
  _lib.js            Upstash-Redis-Helfer
scripts/           Helfer (VAPID-Schlüssel erzeugen)
vercel.json        Cron-Job-Konfiguration
```

## Datenschutz

Bäume, Fotos und Verlauf bleiben **komplett auf dem Gerät** (IndexedDB). Der Server
speichert ausschließlich das Push-Abo und die fälligen Pflegetermine (Baumname + Datum),
die er für die Benachrichtigung braucht.
