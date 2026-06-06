/**
 * SHELLY 2PM GEN3/GEN4 - 2-CHANNEL LIGHT BLU MOTION AUTOMATION V1.0
 * ---------------------------------------------
 * Requirements: Set inputs to "Detached" mode in the Shelly settings.
 * (This script will automatically configure them to detached on startup)
 */

// CONFIGURATION
let IDS = {
    VcMotionTime: 200,   // Number: Motion duration (seconds)
    VcLuxLimit:   201,   // Number: Lux threshold
    VcManualTime: 202,   // Number: Manual duration (minutes)
    VcRelayMode:  203,   // Number: Relay control mode (1 = L1, 2 = L2, 3 = Both)
    SensorLux:    201,   // Sensor ID for Helligkeit/Lux
    SensorMotion: 202    // Sensor ID for Bewegung/Motion
};

// Status storage for each relay channel individually
// 0 = OFF, 1 = AUTO (Motion triggered), 2 = MANUAL (Switch/App triggered)
let CH_STATE = { 0: 0, 1: 0 }; 

let CFG = { mTime: 60, mLux: 50, manTime: 1800, mode: 3 };
let timerHandle = null;
let lastLightOffTs = 0;
const LUX_IGNORE_MS = 300000; // 5-minute lux ignore period after light turns off

// --- LOAD CONFIG FROM VIRTUAL COMPONENTS ---
function updateConfig() {
    let t = Shelly.getComponentStatus("number", IDS.VcMotionTime);
    if (t) CFG.mTime = t.value;
    let l = Shelly.getComponentStatus("number", IDS.VcLuxLimit);
    if (l) CFG.mLux = l.value;
    let m = Shelly.getComponentStatus("number", IDS.VcManualTime);
    if (m) CFG.manTime = m.value * 60; // Minutes to seconds
    let r = Shelly.getComponentStatus("number", IDS.VcRelayMode);
    if (r) CFG.mode = r.value;
}
updateConfig();

// --- INITIAL CONFIGURATION (ONCE AT STARTUP) ---
// Set input mode to detached and configure safety auto-off
let safeOffDelay = (CFG.manTime > CFG.mTime ? CFG.manTime : CFG.mTime) + 60;
if (safeOffDelay < 60) safeOffDelay = 3600; // Fallback to 1 hour if sliders are 0

Shelly.call("Switch.SetConfig", {
    id: 0,
    config: {
        in_mode: "detached",
        auto_off: true,
        auto_off_delay: safeOffDelay
    }
});
Shelly.call("Switch.SetConfig", {
    id: 1,
    config: {
        in_mode: "detached",
        auto_off: true,
        auto_off_delay: safeOffDelay
    }
});

// --- GLOBAL SHUTOFF TIMER ---
function resetTimer(seconds) {
    if (timerHandle) Timer.clear(timerHandle);
    timerHandle = Timer.set(seconds * 1000, false, function() {
        print("TIMER: Expired -> Turning all channels OFF");
        switchRelay(0, false);
        switchRelay(1, false);
        CH_STATE[0] = 0;
        CH_STATE[1] = 0;
        lastLightOffTs = Date.now();
    });
}

// --- CENTRAL RELAY SWITCHING ---
function switchRelay(id, on) {
    Shelly.call("Switch.Set", { id: id, on: on });
    if (!on) CH_STATE[id] = 0; // Reset status on turn off
}

// --- BLINK FEEDBACK (Upgrade Confirmation) ---
function blink(id) {
    Shelly.call("Switch.Set", { id: id, on: false });
    Timer.set(250, false, function() {
        Shelly.call("Switch.Set", { id: id, on: true });
    });
}

// --- LOGIC: MOTION DETECTION ---
function handleMotion() {
    // 1. Check if any channel is already ON
    let s0 = Shelly.getComponentStatus("switch", 0).output;
    let s1 = Shelly.getComponentStatus("switch", 1).output;
    
    if (s0 || s1) {
        // KEEP ALIVE: Prolong timer.
        // If any channel is in manual mode, use the manual time, otherwise motion time.
        let isAnyManual = (CH_STATE[0] === 2 || CH_STATE[1] === 2);
        let duration = isAnyManual ? CFG.manTime : CFG.mTime;
        resetTimer(duration);
        return;
    }

    // 2. Both channels are OFF: Turn ON (Auto Mode)
    let lx = Shelly.getComponentStatus("bthomesensor", IDS.SensorLux);
    let luxVal = (lx && lx.value !== undefined) ? lx.value : 0;
    let grace = (Date.now() - lastLightOffTs) < LUX_IGNORE_MS;

    if (grace || luxVal <= CFG.mLux) {
        print("MOTION: Auto Start (Lux: " + luxVal + ")");
        let dur = CFG.mTime;
        
        // Select relays to turn on based on mode
        let sw0 = (CFG.mode === 1 || CFG.mode === 3);
        let sw1 = (CFG.mode === 2 || CFG.mode === 3);
        
        if (sw0) { switchRelay(0, true); CH_STATE[0] = 1; }
        if (sw1) { switchRelay(1, true); CH_STATE[1] = 1; }
        
        resetTimer(dur);
    }
}

// --- LOGIC: SWITCH INPUTS ---
function handleSwitch(id) {
    let relayOn = Shelly.getComponentStatus("switch", id).output;
    let currentState = CH_STATE[id]; // 0=Off, 1=Auto, 2=Manual

    if (!relayOn) {
        // CASE A: Light is OFF -> Switch toggle -> Turn ON (Manual)
        print("SWITCH " + id + ": Turn ON (Manual)");
        switchRelay(id, true);
        CH_STATE[id] = 2; 
        resetTimer(CFG.manTime);
    } 
    else {
        // Light is already ON.
        if (currentState === 1) {
            // CASE B: Light is AUTO -> Switch toggle -> UPGRADE to Manual (Dusch-Modus)
            print("SWITCH " + id + ": Upgrade to Manual Mode");
            CH_STATE[id] = 2;
            blink(id); // Blink for visual confirmation
            resetTimer(CFG.manTime);
        } 
        else {
            // CASE C: Light is MANUAL -> Switch toggle -> Turn OFF
            print("SWITCH " + id + ": Turn OFF");
            switchRelay(id, false);
            CH_STATE[id] = 0;
            
            // Check if the other channel is still ON
            let otherId = (id === 0 ? 1 : 0);
            if (Shelly.getComponentStatus("switch", otherId).output) {
                print(" -> Other channel remains ON");
            } else {
                print(" -> All channels OFF, stopping timer");
                if (timerHandle) Timer.clear(timerHandle);
                lastLightOffTs = Date.now();
            }
        }
    }
}

// --- EVENT HANDLER ---
Shelly.addEventHandler(function(event) {
    if (!event || !event.component) return;

    // Config update when sliders move in UI
    if (event.component.indexOf("number:") === 0) { 
        updateConfig(); 
        return; 
    }

    // Motion Sensor Event
    if (event.component === "bthomesensor:" + IDS.SensorMotion) {
        if (event.info && (event.info.value === true || event.info.value === 1)) {
            handleMotion();
        }
    }

    // Physical Wandschalter (Detached) Event
    if ((event.component === "input:0" || event.component === "input:1") && event.info && event.info.event === "toggle") {
        let id = (event.component === "input:0") ? 0 : 1;
        handleSwitch(id);
    }

    // App/Cloud/Voice Assistant Control (Switch output changes)
    if ((event.component === "switch:0" || event.component === "switch:1") && event.info && typeof event.info.output === "boolean") {
        let id = (event.component === "switch:0") ? 0 : 1;
        let isOn = event.info.output;
        
        if (isOn && CH_STATE[id] === 0) {
            print("APP: Channel " + id + " ON -> Manual Mode");
            CH_STATE[id] = 2;
            resetTimer(CFG.manTime);
        } else if (!isOn && CH_STATE[id] !== 0) {
            print("APP: Channel " + id + " OFF");
            CH_STATE[id] = 0;
            // Check other channel
            let other = (id === 0 ? 1 : 0);
            if (!Shelly.getComponentStatus("switch", other).output) {
                if (timerHandle) Timer.clear(timerHandle);
                lastLightOffTs = Date.now();
            }
        }
    }
});

// Watchdog (Safety polling in case events are missed)
Timer.set(5000, true, function() {
    let mot = Shelly.getComponentStatus("bthomesensor", IDS.SensorMotion);
    if (mot && (mot.value === true || mot.value === 1)) {
        handleMotion();
    }
});

print("Shelly 2PM BLU Motion Automation Script loaded.");
