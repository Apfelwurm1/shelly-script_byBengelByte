# shelly-script_byBengelByte

Eine Sammlung von maßgeschneiderten, hochzuverlässigen JavaScript-Skripten für Shelly Gen2/Gen3/Gen4-Geräte zur Hausautomatisierung.

---

## 📂 Struktur des Repositories

### 1. [2-Kanal-Lichtautomatik (`/shelly-2pm-blu-motion-automation`)](file:///home/admin/shelly-script_byBengelByte/shelly-2pm-blu-motion-automation)
Ein smartes Skript für den **Shelly 2PM Gen3 / Gen4**, das zwei getrennte Lichtkanäle basierend auf einem Bluetooth-Bewegungs- und Helligkeitssensor (z. B. Shelly BLU Motion) sowie physischen Wandschaltern steuert.

#### Key Features (2-Kanal):
*   **Zwei-Kanal-Modus:** Unterstützung für L1, L2 oder beide Kanäle parallel (einstellbar in der App).
*   **Schalter-Konflikt-Lösung (Detached Mode):** Das Skript konfiguriert die Eingänge des Shellys beim Start automatisch auf `detached`. Dadurch schaltet die Hardware nicht selbstständig, und das Skript behält die volle logische Kontrolle.
*   **Dusch- / Upgrade-Modus (Dusch-Modus):** 
    *   Wird das Licht automatisch durch Bewegung eingeschaltet, kann durch Betätigen des Wandschalters ein "Upgrade" in den manuellen Modus durchgeführt werden. 
    *   Das Licht blinkt einmal kurz zur Bestätigung und bleibt für eine lange manuelle Laufzeit (z. B. 30 Minuten) eingeschaltet – perfekt beim Baden oder Duschen.
*   **Rausgeh-Sperre (Manual Lockout):** Nach manuellem Ausschalten über den Taster wird die Bewegungserkennung für 4 Sekunden ignoriert, damit man den Raum ungestört verlassen kann.
*   **Helligkeitsschwelle mit Grace Period:** Nach dem Ausschalten gilt eine 5-minütige Phase, in der die Helligkeitsgrenze ignoriert wird, falls der Sensor den neuen Helligkeitswert noch nicht übertragen hat.
*   **Schonung des Flash-Speichers:** Einstellungen werden direkt aus den virtuellen Komponenten geladen. Physische Hardwarekonfigurationen (`Switch.SetConfig`) werden nur einmalig beim Start aufgerufen, um Flash-Schreibzyklen zu minimieren.

---

### 2. [1-Kanal-Lichtautomatik (`/shelly-1pm-blu-motion-automation`)](file:///home/admin/shelly-script_byBengelByte/shelly-1pm-blu-motion-automation)
Ein smartes Skript für den **Shelly 1PM / 1 Mini Gen3 / Gen4**, das ein einzelnes Relais (oder ein per HTTP-GET verknüpftes Gerät wie ein Shelly Duo Leuchtmittel) basierend auf Bewegung und Helligkeit steuert.

#### Key Features (1-Kanal):
*   **Relais- oder HTTP-Duo-Modus:** Kann das eigene Relais schalten oder eine remote Shelly Duo Lampe direkt per HTTP-API steuern.
*   **Taster- & App-Synchronisierung:** Vollständige Integration von physischen Wandschaltern (Detached Mode) und App-Bedienung.
*   **Rausgeh-Sperre & Grace Period:** Gleiche Zuverlässigkeits-Features wie beim 2-Kanal-Skript zum Schutz vor Fehltriggern.

---

## 🛠️ Installationsanleitung (Beispiel für 2-Kanal)

### 1. Virtuelle Komponenten auf dem Shelly anlegen
Erstelle folgende virtuelle Komponenten im Shelly-Webinterface oder in der App:
*   `number:200` (Name: `Motion_Time`) -> Laufzeit bei Bewegung in Sekunden (z. B. Min: 1, Max: 1800, Default: 240)
*   `number:201` (Name: `Motion_LUX`) -> Helligkeitsschwelle in Lux (z. B. Min: 0, Max: 500, Default: 30)
*   `number:202` (Name: `Manuell_time`) -> Manuelle Duschlaufzeit in Minuten (z. B. Min: 1, Max: 99, Default: 30)
*   `number:203` (Name: `Relais`) -> Schaltmodus (1 = Nur L1, 2 = Nur L2, 3 = Beide Kanäle, Default: 3)

### 2. Skript installieren
1. Erstelle im Shelly-Editor ein neues Skript (z. B. `LichtAutomatik`).
2. Kopiere den Code aus [`shelly_2pm_blu_motion_automation.js`](file:///home/admin/shelly-script_byBengelByte/shelly-2pm-blu-motion-automation/shelly_2pm_blu_motion_automation.js) hinein.
3. Speichere das Skript, aktiviere den Schalter **"Run on startup"** (Autostart) und starte das Skript.
