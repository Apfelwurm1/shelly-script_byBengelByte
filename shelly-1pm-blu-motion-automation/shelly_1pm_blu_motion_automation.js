/**
 * SHELLY 1PM / 1 MINI GEN3/GEN4 - 1-CHANNEL LIGHT BLU MOTION AUTOMATION V1.0
 * ---------------------------------------------
 * Requirements: Set input to "Detached" mode in the Shelly settings.
 * (This script will automatically configure it to detached on startup)
 */

// CONFIGURATION
let CFG = {
  RelayMode: true,            // true = Relay | false = remote Duo light
  LuxTooBright: 150,          // Stop triggering if ambient lux is above this value
  LuxOnlyFirst: true,         // Only evaluate lux on first motion detection
  
  // Default fallback values (usually overwritten by Virtual Components):
  LuxThreshold: 30,           
  MotionTimeSec: 60,         
  ManualTimeSec: 1800,        
  
  FirmwareAutoOffSec: 3600,   // Safety auto-off (1 hour)
  IP_Duo: "192.168.200.121",  // Remote IP of Duo light (if RelayMode = false)
  Debug: false,

  BypassLuxForMs: 60000,      // Ignore lux for 60s after boot
  ManualLockoutMs: 4000,      // 4-second motion lockout after turning off manually
  IgnoreLuxAfterOffMs: 300000,// 5-minute lux ignore period after turning off (Lux trap fix)
  
  // Sensor component IDs:
  IdLux: 201,
  IdMotion: 202,

  // Virtual Component IDs:
  VcIdLux: 200,          // number:200 -> Lux Threshold
  VcIdMotionTime: 201,   // number:201 -> Motion Duration (Seconds)
  VcIdManualTime: 202,   // number:202 -> Manual Duration (Minutes)
  VcIdIpDuo: 200         // text:200   -> IP address (if RelayMode = false)
};

// ---- Runtime variables ----
let motionActive = false;
let isManualMode = false;   
let manualOffUntil = 0;
let lastLightOffTs = 0;
let lastLux = null;
let timerHandle = null;     
let holdTimer = null;       
let lastInputState = null;  
let bootTs = Date.now();

// ---------- HELPER: Config Sync ----------
function syncConfigFromComponents() {
  // 1. Lux Threshold (ID 200)
  let cLux = Shelly.getComponentStatus("number", CFG.VcIdLux);
  if (cLux && typeof cLux.value === "number") {
    CFG.LuxThreshold = cLux.value;
  }

  // 2. Motion duration in seconds (ID 201)
  let cMot = Shelly.getComponentStatus("number", CFG.VcIdMotionTime);
  if (cMot && typeof cMot.value === "number") {
    CFG.MotionTimeSec = cMot.value;
  }

  // 3. Manual duration in minutes (ID 202) -> converted to seconds
  let cMan = Shelly.getComponentStatus("number", CFG.VcIdManualTime);
  if (cMan && typeof cMan.value === "number") {
    CFG.ManualTimeSec = cMan.value * 60; // minutes * 60 = seconds
  }

  // 4. IP Duo (Optional, text:200)
  try {
      let cIp = Shelly.getComponentStatus("text", CFG.VcIdIpDuo);
      if (cIp && cIp.value) CFG.IP_Duo = cIp.value;
  } catch(e) {}

  if(CFG.Debug) {
    print("[CFG UPDATE] Lux:", CFG.LuxThreshold, 
          "| Motion:", CFG.MotionTimeSec, "s", 
          "| Manual:", (CFG.ManualTimeSec/60), "min");
  }
}

// ---------- LOGGING ----------
function log(msg, v) { if(CFG.Debug) print("[SCRIPT] " + msg + (v !== undefined ? " " + JSON.stringify(v) : "")); }

// ---------- ACTIONS ----------
function actOn() {
  if (CFG.RelayMode) {
    Shelly.call("Switch.Set", { id: 0, on: true });
    startHoldLoop(); 
  } else {
    Shelly.call("HTTP.GET", { url: "http://" + CFG.IP_Duo + "/light/0?turn=on&brightness=100", timeout: 1 });
  }
  log("TURN ON");
}

// ---------- ACTIONS ----------
function actOff() {
  isManualMode = false;
  motionActive = false;
  lastLightOffTs = Date.now(); 

  if (CFG.RelayMode) {
    stopHoldLoop();
    Shelly.call("Switch.Set", { id: 0, on: false });
  } else {
    Shelly.call("HTTP.GET", { url: "http://" + CFG.IP_Duo + "/light/0?turn=off", timeout: 1 });
  }
  log("TURN OFF");
}

// ---------- TIMER ----------
function startTimer() {
  if (timerHandle) { Timer.clear(timerHandle); timerHandle = null; }
  
  // Sync slider settings
  syncConfigFromComponents();

  let duration = isManualMode ? CFG.ManualTimeSec : CFG.MotionTimeSec;
  
  timerHandle = Timer.set(duration * 1000, false, function() {
    log("Timer expired (" + duration + "s)");
    timerHandle = null;
    actOff();
  });
  if(CFG.Debug) log("Timer started:", duration + "s");
}

function stopTimer() {
  if (timerHandle) {
    Timer.clear(timerHandle);
    timerHandle = null;
  }
  if(CFG.Debug) log("Timer stopped");
}

// ---------- HOLD LOOP (Keep Alive Watchdog) ----------
function startHoldLoop() {
  if (!CFG.RelayMode || holdTimer) return;
  holdTimer = Timer.set(3000, true, function() {
    if (!motionActive && !isManualMode) { stopHoldLoop(); return; }
    Shelly.call("Switch.GetStatus", {id:0}, function(res){
      if(res && res.output === false) {
        log("Watchdog: Relay was off, turning on!");
        Shelly.call("Switch.Set", { id: 0, on: true });
      }
    });
  });
}
function stopHoldLoop() { if(holdTimer) { Timer.clear(holdTimer); holdTimer = null; } }

// ---------- LUX CHECK LOGIC ----------
function checkLux() {
  let now = Date.now();
  if ((now - bootTs) < CFG.BypassLuxForMs) return true;
  if ((now - lastLightOffTs) < CFG.IgnoreLuxAfterOffMs) {
      log("Lux check bypassed (Grace Period)");
      return true;
  }
  if (lastLux === null) return true;
  return lastLux < CFG.LuxThreshold;
}

// ---------- MOTION DETECTED ----------
function onMotionDetected() {
  if (Date.now() < manualOffUntil) return;

  if (!motionActive && !isManualMode) {
    // Start Automatik
    if (checkLux()) {
      motionActive = true;
      actOn();
      startTimer();
    } else {
      if(CFG.Debug) log("Too bright (" + lastLux + ")");
    }
  } else {
    // Prolong duration
    if (!isManualMode && !CFG.LuxOnlyFirst && lastLux !== null && lastLux > CFG.LuxTooBright) {
       if ((Date.now() - lastLightOffTs) > CFG.IgnoreLuxAfterOffMs) return;
    }
    startTimer();
  }
}

// ---------- PHYSICAL SWITCH INPUT ----------
function handleInputEdge() {
  if (motionActive || isManualMode) {
    // Turn OFF manually
    log("Switch: Manual OFF");
    manualOffUntil = Date.now() + CFG.ManualLockoutMs;
    stopTimer();
    actOff(); 
  } else {
    // Turn ON manually
    log("Switch: Manual ON");
    isManualMode = true;
    actOn();
    startTimer();
  }
}

// ---------- EVENT HANDLER ----------
Shelly.addEventHandler(function(ev) {
  if (!ev || !ev.info) return;

  // 1. MOTION
  if (ev.component === "bthomesensor:" + CFG.IdMotion) {
    if (ev.info.value === true || ev.info.value === 1) onMotionDetected();
  }
  // 2. LUX
  else if (ev.component === "bthomesensor:" + CFG.IdLux) {
    if (typeof ev.info.value === "number") lastLux = ev.info.value;
  }
  // 3. INPUT (Physical Switch Edge)
  else if (ev.component === "input:0" && typeof ev.info.state === "boolean") {
    if (lastInputState !== null && lastInputState !== ev.info.state) {
        handleInputEdge();
    }
    lastInputState = ev.info.state;
  }
  // 4. APP / CLOUD / VOICE CONTROL
  else if (ev.component === "switch:0" && typeof ev.info.output === "boolean") {
     let out = ev.info.output;
     if (out === true) {
       if (!motionActive && !isManualMode) {
         log("App Control ON -> Manual Mode started");
         isManualMode = true;
         startTimer();
       }
     } else {
       if (motionActive || isManualMode) {
         log("App Control OFF -> Reset");
         isManualMode = false;
         motionActive = false;
         stopTimer();
       }
     }
  }
  // 5. VIRTUAL COMPONENTS LIVE SYNC
  else if (typeof ev.component === "string" && (ev.component.indexOf("number:") === 0 || ev.component.indexOf("text:") === 0)) {
      syncConfigFromComponents();
  }
});

// ---------- POLLING BACKUP ----------
Timer.set(2500, true, function() {
  let ls = Shelly.getComponentStatus("bthomesensor", CFG.IdLux);
  if (ls && typeof ls.value === "number") lastLux = ls.value;
  
  if (!motionActive && !isManualMode && (Date.now() > manualOffUntil)) {
     let ms = Shelly.getComponentStatus("bthomesensor", CFG.IdMotion);
     if (ms && (ms.value === true || ms.value === 1)) {
       if(checkLux()) onMotionDetected();
     }
  }
});

// ---------- INIT CONFIGURATION ----------
if (CFG.RelayMode) {
  Shelly.call("Switch.SetConfig", { id: 0, config: { in_mode: "detached", auto_off: true, auto_off_delay: CFG.FirmwareAutoOffSec } });
}
let curIn = Shelly.getComponentStatus("input", 0);
if(curIn) lastInputState = curIn.state;

syncConfigFromComponents();

print("Shelly 1PM BLU Motion Automation Script loaded.");
