const canvas = document.querySelector("#outside-view");
const ctx = canvas.getContext("2d");

const controls = {
  throttle: document.querySelector("#throttle"),
  prop: document.querySelector("#prop"),
  mixture: document.querySelector("#mixture"),
  carbHeat: document.querySelector("#carb-heat"),
  fullscreenToggle: document.querySelector("#fullscreen-toggle"),
  soundToggle: document.querySelector("#sound-toggle"),
  reset: document.querySelector("#reset"),
};

const readouts = {
  phase: document.querySelector("#phase-readout"),
  power: document.querySelector("#power-readout"),
  feedback: document.querySelector("#feedback-readout"),
  target: document.querySelector("#target-readout"),
  throttle: document.querySelector("#throttle-out"),
  prop: document.querySelector("#prop-out"),
  mixture: document.querySelector("#mixture-out"),
  airspeed: document.querySelector("#airspeed"),
  altitude: document.querySelector("#altitude"),
  map: document.querySelector("#map"),
  rpm: document.querySelector("#rpm"),
  egt: document.querySelector("#egt"),
  mapMeter: document.querySelector("#map-meter"),
  rpmMeter: document.querySelector("#rpm-meter"),
  egtMeter: document.querySelector("#egt-meter"),
  asiNeedle: document.querySelector("#asi-needle"),
  altHundredsNeedle: document.querySelector("#alt-hundreds-needle"),
  altThousandsNeedle: document.querySelector("#alt-thousands-needle"),
  procedureBody: document.querySelector("#procedure-body"),
  steps: [],
};

const state = {
  time: 0,
  speed: 0,
  altitude: 0,
  verticalSpeed: 0,
  distance: 0,
  headingOffset: 0,
  airborne: false,
  carbHeatOn: false,
  soundOn: false,
  completed: new Set(),
  last: performance.now(),
};

const engineAudio = {
  context: null,
  master: null,
  filter: null,
  oscillators: [],
  noise: null,
  noiseGain: null,
};

const performanceMemo = [
  { label: "Vx Flaps 0", value: "61 mph", note: "Vid hinder i utflygningen" },
  { label: "Vx Flaps 3", value: "55 mph", note: "Klaffhantering" },
  { label: "Vy", value: "73 mph", note: "Normal stigfart, inflygningsfart" },
  { label: "Vs Flaps 3", value: "52 mph", note: "Farligt nära Vx" },
  { label: "Takeoff", value: "28\"/2650", note: "Full fräs" },
  { label: "Climb", value: "24\"/2450", note: "23.8\"" },
  { label: "Cruise", value: "21\"/2350", note: "20.6\"" },
  { label: "EGT Peak", value: "1415°F", note: "" },
  { label: "MTOW", value: "998 kg", note: "" },
  { label: "Max tilläggsvikt", value: "236 kg", note: "" },
  { label: "Fuel", value: "136 kg", note: "" },
];

const procedureGroups = [
  {
    id: "takeoff",
    title: "Takeoff",
    items: [
      { key: "takeoffPower", text: "Full skatt med bullerskall. Reducera till CLIMB när allt är under kontroll." },
      { key: "takeoffObs", text: "OBS! Avvakta om kapaciteten behövs för viktigare uppgifter." },
      { key: "airspeedAlive", text: "Callout: Airspeed alive." },
      { key: "noseLight", text: "IAS 40 mph: avlasta noshjulet." },
      { key: "rotate", text: "Rotera." },
      { key: "positiveRate", text: "Callout: Positive rate of climb." },
      { key: "engineGreen", text: "Engine check: gröna värden." },
    ],
  },
  {
    id: "climb300",
    title: "300 ft",
    items: [
      { key: "airspeedCheck", text: "Airspeed check -> Flaps 0." },
      { key: "lightsOff", text: "LIGHTS OFF." },
      { key: "climbSettings", text: "Climb settings: 24\"/2450." },
    ],
  },
  {
    id: "cruise",
    title: "Cruise",
    items: [
      { key: "gearUp", text: "Gear UP." },
      { key: "cruisePower", text: "Cruise: 21\"/2350 (20.6\")." },
      { key: "mixtureCruise", text: "MIXTURE: EGT 1360°F." },
    ],
  },
  {
    id: "downwind",
    title: "Downwind",
    items: [
      { key: "briefing", text: "Briefing: bränslenivå, bälten, västar, sättpunkt, pådragspunkt." },
      { key: "gearCallout", text: "Gear callout: vad landar du på? UP WATER, 4 BLA." },
      { key: "preheatTill", text: "Förvärmning TILL." },
      { key: "reduceDownwind", text: "Reducera." },
      { key: "flapsOne", text: "Flaps 1." },
      { key: "lightsOn", text: "LIGHTS ON. Skräm måsarna!" },
      { key: "downwindSpeed", text: "IAS 75 mph." },
    ],
  },
  {
    id: "base",
    title: "Base",
    items: [
      { key: "flapsTwo", text: "Flaps 2." },
    ],
  },
  {
    id: "final",
    title: "Final",
    items: [
      { key: "finalSpeed", text: "IAS 70 mph." },
      { key: "flapsThree", text: "Flaps 3. Flaps 2 vid byiga vindar + 5 kt IAS." },
      { key: "propIn", text: "PROP IN." },
      { key: "preheatIn", text: "FÖRVÄRMNING IN." },
      { key: "landingIn", text: "BLANDNING IN." },
    ],
  },
  {
    id: "shortFinal",
    title: "Short Final",
    items: [
      { key: "under300", text: "<300 ft." },
      { key: "stable", text: "Etablerad och stabiliserad, annars Go Around." },
      { key: "threshold", text: "THR: 50 ft AGL, trädtoppar." },
      { key: "thresholdSpeed", text: "IAS 65 mph." },
    ],
  },
  {
    id: "touchdown",
    title: "Touch Down",
    items: [
      { key: "noseUp", text: "Nos upp, flare." },
      { key: "touchSpeed", text: "IAS 58 mph." },
      { key: "idleSupport", text: "Liiitet stöttning med trotteln. Ljudillustrationer ingår :-)" },
    ],
  },
  {
    id: "glassyLanding",
    title: "Glassy Water Landing",
    items: [
      { key: "glassyNose", text: "THR NOS UPP, 50 ft kvar." },
      { key: "glassyFlaps", text: "Flaps 2." },
      { key: "glassyVs", text: "VS -150 ft/min." },
      { key: "glassySpeed", text: "IAS 63 mph. Saknas sjunk, sänk farten." },
      { key: "glassyThrottle", text: "Tumregel: 20 sekunder till vattenkontakt, se skiss." },
      { key: "glassyAttitude", text: "LAST NOSLÄGE LIGGER VID BLEKE." },
    ],
  },
  {
    id: "shortTakeoff",
    title: "Short Takeoff",
    items: [
      { key: "avoidStep", text: "Undvik stegtaxning." },
      { key: "shortFlaps", text: "Flaps 3." },
      { key: "goScares", text: "Gör S.C.A.R.F.S i svängen. Ova!" },
      { key: "drag", text: "Skeva dig loss." },
    ],
  },
  {
    id: "powerOff",
    title: "Power-off Landing",
    items: [
      { key: "powerOffSpeed", text: "<800 ft: landa i konen framåt." },
      { key: "powerOffFlaps", text: "Flaps 2." },
      { key: "powerOffFlare", text: "300 ft: öka farten till 80 mph, enklare flare." },
    ],
  },
  {
    id: "glassyTakeoff",
    title: "Glassy Water Takeoff",
    items: [
      { key: "glassyTakeoffYes", text: "Yes! Du är en fena på blekelandning och tänker inte alls på blekestarten." },
      { key: "tapNose", text: "Tappa nosen nu och du havererar med full motoreffekt och 10-25 kn högre fart." },
    ],
  },
  {
    id: "parking",
    title: "Parking",
    items: [
      { key: "waterRudder", text: "Vattenroder UP." },
      { key: "parkingFlaps", text: "Flaps 3." },
      { key: "belts", text: "Bälta styrspaken." },
      { key: "pitot", text: "Pitotrörsskydd PÅ." },
    ],
  },
  {
    id: "scarfs",
    title: "S.C.A.R.F.S",
    items: [
      { key: "scarfsS", text: "S: Seatbelt, safety vests." },
      { key: "scarfsC", text: "C: Carb, allt framåt." },
      { key: "scarfsA", text: "A: Area clear." },
      { key: "scarfsR", text: "R: Rudder UP." },
      { key: "scarfsF", text: "F: Flaps." },
      { key: "scarfsStick", text: "S: Stick back." },
    ],
  },
  {
    id: "freda",
    title: "F.R.E.D.A",
    items: [
      { key: "fredaFuel", text: "F: Fuel. Se, inte bara titta." },
      { key: "fredaRadio", text: "R: Radio. Borde jag ha rapporterat Valler?" },
      { key: "fredaEngine", text: "E: Engine. Betyder oftast magra." },
      { key: "fredaDirections", text: "D: Directions." },
      { key: "fredaAltitude", text: "A: Altitude. Klarerad höjd?" },
    ],
  },
  {
    id: "training",
    title: "Övningar",
    items: [
      { key: "reducedPower", text: "Starta med reducerad effekt, 23-24\"." },
      { key: "glassyTraining", text: "Blekelandningar: gör var tredje landning enligt blekeprocedur." },
      { key: "judgement", text: "Bedömningslandning: vid vilken höjd hinner du kurva tillbaka?" },
      { key: "judgementWarn", text: "Helt OK att stötta med gas om avståndet blir för stort." },
    ],
  },
];

const targets = {
  takeoff: "Full rik, prop fram, carb heat av, full trottel, rotera och bekräfta positive rate",
  climb: "Håll takeoff power tills farten är stabil",
  climb300: "300 ft: airspeed check, flaps 0, lights off, 24\"/2450",
  cruise: "21\"/2350, magra mot EGT 1360°F",
  downwind: "Förvärmning till, reducera, flaps 1, lights on, 75 mph",
  final: "70 mph, flaps 3, prop in, förvärmning in/av, blandning in",
  shortFinal: "<300 ft stabiliserad, annars Go Around. Sikta 65 mph",
  touchdown: "Nos upp, flare, sikta 58 mph",
  reference: "Specialrutiner och S.C.A.R.F.S/F.R.E.D.A finns i listan",
};

renderProcedures();

function renderProcedures() {
  readouts.procedureBody.innerHTML = `
    <section class="memo-strip" aria-label="Prestandamemo">
      ${performanceMemo.map((item) => `
        <div class="memo-item">
          <span>${item.label}</span>
          <strong>${item.value}</strong>
          ${item.note ? `<small>${item.note}</small>` : ""}
        </div>
      `).join("")}
    </section>
    <ol id="procedure-list" class="procedure-list">
      ${procedureGroups.map((group) => `
        <li class="procedure-group" data-group="${group.id}">
          <h2>${group.title}</h2>
          <ul>
            ${group.items.map((item) => `<li data-step="${item.key}">${item.text}</li>`).join("")}
          </ul>
        </li>
      `).join("")}
    </ol>
  `;
  readouts.steps = [...readouts.procedureBody.querySelectorAll("[data-step]")];
}

controls.carbHeat.addEventListener("click", () => {
  state.carbHeatOn = !state.carbHeatOn;
  controls.carbHeat.setAttribute("aria-pressed", String(state.carbHeatOn));
  controls.carbHeat.textContent = state.carbHeatOn ? "På" : "Av";
});

controls.fullscreenToggle.addEventListener("click", async () => {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      if (screen.orientation?.lock) {
        await screen.orientation.lock("landscape").catch(() => undefined);
      }
    } else {
      await document.exitFullscreen();
    }
  } catch {
    controls.fullscreenToggle.textContent = "Öppna i helskärm";
  }
});

document.addEventListener("fullscreenchange", () => {
  controls.fullscreenToggle.textContent = document.fullscreenElement ? "Lämna" : "Fullskärm";
});

controls.soundToggle.addEventListener("click", async () => {
  if (!state.soundOn) {
    state.soundOn = true;
    controls.soundToggle.setAttribute("aria-pressed", "true");
    controls.soundToggle.textContent = "Ljud på";
    let started = false;
    try {
      started = await startEngineAudio();
    } catch {
      started = false;
    }

    if (!started) {
      state.soundOn = false;
      controls.soundToggle.setAttribute("aria-pressed", "false");
      controls.soundToggle.textContent = "Ljud saknas";
    }
  } else {
    state.soundOn = false;
    controls.soundToggle.setAttribute("aria-pressed", "false");
    controls.soundToggle.textContent = "Ljud av";
  }
});

controls.reset.addEventListener("click", () => {
  state.time = 0;
  state.speed = 0;
  state.altitude = 0;
  state.verticalSpeed = 0;
  state.distance = 0;
  state.headingOffset = 0;
  state.airborne = false;
  state.carbHeatOn = false;
  state.soundOn = false;
  state.completed.clear();
  controls.throttle.value = 0;
  controls.prop.value = 100;
  controls.mixture.value = 100;
  controls.carbHeat.setAttribute("aria-pressed", "false");
  controls.carbHeat.textContent = "Av";
  controls.soundToggle.setAttribute("aria-pressed", "false");
  controls.soundToggle.textContent = "Ljud av";
  updateEngineAudio({ rpm: 0, throttle: 0, power: 0 });
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(current, target, rate) {
  return current + (target - current) * clamp(rate, 0, 1);
}

async function startEngineAudio() {
  if (!engineAudio.context) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      controls.soundToggle.textContent = "Ljud saknas";
      return false;
    }

    engineAudio.context = new AudioContext();
    engineAudio.master = engineAudio.context.createGain();
    engineAudio.filter = engineAudio.context.createBiquadFilter();
    engineAudio.master.gain.value = 0;
    engineAudio.filter.type = "lowpass";
    engineAudio.filter.frequency.value = 780;
    engineAudio.filter.Q.value = 0.9;
    engineAudio.filter.connect(engineAudio.master);
    engineAudio.master.connect(engineAudio.context.destination);

    const partials = [
      { multiplier: 1, gain: 0.65, type: "sawtooth" },
      { multiplier: 2, gain: 0.24, type: "square" },
      { multiplier: 3, gain: 0.12, type: "triangle" },
    ];

    engineAudio.oscillators = partials.map((partial) => {
      const oscillator = engineAudio.context.createOscillator();
      const gain = engineAudio.context.createGain();
      oscillator.type = partial.type;
      gain.gain.value = partial.gain;
      oscillator.connect(gain);
      gain.connect(engineAudio.filter);
      oscillator.start();
      return { oscillator, gain, partial };
    });

    engineAudio.noiseGain = engineAudio.context.createGain();
    engineAudio.noiseGain.gain.value = 0.012;
    engineAudio.noise = createNoiseSource(engineAudio.context);
    engineAudio.noise.connect(engineAudio.noiseGain);
    engineAudio.noiseGain.connect(engineAudio.filter);
    engineAudio.noise.start();
  }

  if (engineAudio.context.state === "suspended") {
    await engineAudio.context.resume();
  }

  return true;
}

function createNoiseSource(context) {
  const bufferSize = context.sampleRate * 2;
  const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
  const data = buffer.getChannelData(0);

  for (let index = 0; index < bufferSize; index += 1) {
    data[index] = (Math.random() * 2 - 1) * 0.55;
  }

  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  return source;
}

function updateEngineAudio(engine) {
  if (!engineAudio.context || !engineAudio.master) return;

  const now = engineAudio.context.currentTime;
  const rpm = state.soundOn ? engine.rpm : 0;
  const baseFrequency = clamp(rpm / 28, 24, 112);
  const volume = state.soundOn ? 0.018 + engine.power * 0.07 : 0;
  const filterFrequency = state.soundOn ? 360 + engine.throttle * 1450 : 220;

  engineAudio.master.gain.setTargetAtTime(volume, now, 0.08);
  engineAudio.filter.frequency.setTargetAtTime(filterFrequency, now, 0.08);

  engineAudio.oscillators.forEach(({ oscillator, partial }) => {
    oscillator.frequency.setTargetAtTime(baseFrequency * partial.multiplier, now, 0.045);
  });

  if (engineAudio.noiseGain) {
    engineAudio.noiseGain.gain.setTargetAtTime(state.soundOn ? 0.004 + engine.throttle * 0.018 : 0, now, 0.1);
  }
}

function getEngine() {
  const throttle = Number(controls.throttle.value) / 100;
  const prop = Number(controls.prop.value) / 100;
  const mixture = Number(controls.mixture.value) / 100;
  const carbPenalty = state.carbHeatOn ? 0.92 : 1;
  const altitudePenalty = clamp(1 - state.altitude / 13000, 0.62, 1);
  const leanPower = mixture < 0.25
    ? clamp((mixture / 0.25) * 0.55, 0, 0.55)
    : clamp(1 - Math.abs(mixture - 0.72) * 0.22, 0.72, 1);
  const mixturePower = mixture > 0.92 ? 1 : leanPower;
  const takeoffRichBoost = mixture > 0.92 && throttle > 0.86 ? 1.02 : 1;
  const map = (10.8 + throttle * 18.7 * carbPenalty * altitudePenalty);
  const propAuthority = 110 + throttle * 900;
  const rpmDemand = 680 + throttle * 1550 + prop * propAuthority;
  const rpm = clamp(rpmDemand * carbPenalty * mixturePower * takeoffRichBoost, 620, 2750);
  const power = clamp((map - 10) / 19.5, 0, 1) * clamp((rpm - 600) / 2100, 0, 1);
  const egtPeakFactor = 1 - Math.abs(mixture - 0.62) * 1.55;
  const egt = clamp(920 + throttle * 210 + clamp(egtPeakFactor, 0, 1) * 310 - (state.carbHeatOn ? 30 : 0), 850, 1560);

  return {
    throttle,
    prop,
    mixture,
    map,
    rpm,
    power,
    egt,
  };
}

function getFlight(engine, dt) {
  const runwayRolling = !state.airborne;
  const drag = state.airborne ? state.speed * 0.006 : state.speed * 0.011;
  const rollingFriction = runwayRolling ? 0.42 : 0;
  const targetAcceleration = engine.power * 13.4 - drag - rollingFriction - (state.carbHeatOn && engine.throttle > 0.55 ? 0.42 : 0);

  state.speed = clamp(state.speed + targetAcceleration * dt, 0, 128);
  if (runwayRolling && engine.throttle < 0.08 && state.speed < 2) {
    state.speed = 0;
  }

  if (!state.airborne && state.speed > 46 && engine.power > 0.72) {
    state.airborne = true;
    state.verticalSpeed = 420;
  }

  let targetVs = 0;
  if (state.airborne) {
    const climbPower = engine.power - 0.48;
    targetVs = climbPower * 1900 - Math.max(0, state.speed - 96) * 7;

    if (engine.map < 19.2 || engine.power < 0.42) {
      targetVs -= 420;
    }

    targetVs = clamp(targetVs, -850, 1050);
  }

  if (runwayRolling) {
    targetVs = 0;
  }

  state.verticalSpeed = lerp(state.verticalSpeed, targetVs, dt * 1.8);
  state.altitude = Math.max(0, state.altitude + state.verticalSpeed * dt / 60);

  if (state.altitude <= 0.1 && state.airborne && state.verticalSpeed < -120) {
    state.airborne = false;
    state.altitude = 0;
    state.verticalSpeed = 0;
  }

  state.distance += state.speed * 1.6878 * dt;
  state.headingOffset = Math.sin(state.time * 0.32) * clamp(state.speed / 120, 0, 0.9);
}

function classify(engine) {
  const takeoffReady = engine.throttle > 0.92 && engine.prop > 0.92 && engine.mixture > 0.92 && !state.carbHeatOn;
  const airspeedAlive = state.speed > 12;
  const noseLight = state.speed > 35;
  const rotateDone = state.airborne && state.altitude > 8;
  const positiveRate = state.airborne && state.verticalSpeed > 120;
  const engineGreen = state.airborne && engine.rpm > 2300 && engine.egt > 900;
  const climb300Done = state.airborne && state.altitude > 300;
  const climbSet = climb300Done && engine.map > 22.8 && engine.map < 25.5 && engine.rpm > 2360 && engine.rpm < 2530;
  const cruiseSet = state.airborne && engine.map > 20.2 && engine.map < 22.2 && engine.rpm > 2260 && engine.rpm < 2425 && engine.mixture > 0.55 && engine.mixture < 0.76 && !state.carbHeatOn;
  const downwindSet = state.airborne && state.carbHeatOn && engine.map < 21.5 && state.speed < 86;
  const finalSet = state.completed.has("downwindSpeed") && !state.carbHeatOn && engine.prop > 0.9 && engine.mixture > 0.9 && state.speed < 76;
  const shortFinalSet = finalSet && state.altitude < 300 && state.verticalSpeed < -80;
  const touchdownSet = !state.airborne && state.completed.has("stable") && state.speed < 62;

  if (takeoffReady) {
    state.completed.add("takeoffPower");
    state.completed.add("takeoffObs");
  }
  if (airspeedAlive) state.completed.add("airspeedAlive");
  if (noseLight) state.completed.add("noseLight");
  if (rotateDone) state.completed.add("rotate");
  if (positiveRate) state.completed.add("positiveRate");
  if (engineGreen) state.completed.add("engineGreen");
  if (climb300Done) {
    state.completed.add("airspeedCheck");
    state.completed.add("lightsOff");
  }
  if (climbSet) state.completed.add("climbSettings");
  if (cruiseSet) {
    state.completed.add("gearUp");
    state.completed.add("cruisePower");
    state.completed.add("mixtureCruise");
  }
  if (downwindSet) {
    state.completed.add("preheatTill");
    state.completed.add("reduceDownwind");
    state.completed.add("flapsOne");
    state.completed.add("lightsOn");
    state.completed.add("downwindSpeed");
  }
  if (finalSet) {
    state.completed.add("finalSpeed");
    state.completed.add("flapsThree");
    state.completed.add("propIn");
    state.completed.add("preheatIn");
    state.completed.add("landingIn");
  }
  if (shortFinalSet) {
    state.completed.add("under300");
    state.completed.add("stable");
    state.completed.add("threshold");
    state.completed.add("thresholdSpeed");
  }
  if (touchdownSet) {
    state.completed.add("noseUp");
    state.completed.add("touchSpeed");
    state.completed.add("idleSupport");
  }

  let phase = "Uppställning";
  let active = "takeoff";
  if (state.completed.has("takeoffPower") && !state.airborne) {
    phase = "Startroll";
    active = "takeoff";
  }
  if (state.airborne) {
    phase = state.verticalSpeed >= -60 ? "Stigning" : "Inflygning";
    active = state.altitude < 300 ? "takeoff" : "climb300";
  }
  if (state.completed.has("climbSettings")) {
    phase = "Stigning";
    active = "cruise";
  }
  if (state.completed.has("cruisePower")) {
    phase = state.verticalSpeed < -80 ? "Inflygning" : "Planflykt";
    active = state.verticalSpeed < -80 || state.carbHeatOn ? "downwind" : "cruise";
  }
  if (state.completed.has("downwindSpeed")) {
    phase = "Downwind";
    active = "final";
  }
  if (state.completed.has("finalSpeed")) {
    phase = "Final";
    active = "shortFinal";
  }
  if (state.completed.has("stable")) {
    phase = "Short final";
    active = "touchdown";
  }
  if (state.completed.has("touchSpeed")) {
    phase = "Utrullning";
    active = "reference";
  }

  let power = "Idle";
  if (engine.map > 26 && engine.rpm > 2500) power = "Takeoff power";
  else if (engine.map > 22 && engine.rpm > 2200) power = "Cruise power";
  else if (engine.map > 15.5 && engine.map < 20.5) power = "Approach power";
  else if (engine.map > 12.5) power = "Taxi/low power";

  const feedback = getFeedback(active, engine);
  return { phase, active, power, feedback };
}

function getFeedback(active, engine) {
  if (active === "takeoff") {
    if (engine.mixture < 0.92) return "Magring ska vara full rik för takeoff";
    if (engine.prop < 0.92) return "Propellerreglaget full fram";
    if (state.carbHeatOn) return "Förgasarvärme av för takeoff";
    if (engine.throttle < 0.92) return "Sätt full trottel";
    if (state.speed < 12) return "Callout: airspeed alive när farten kommer";
    if (state.speed < 35) return "Fortsätt startroll, avlasta noshjulet vid 40 mph";
    if (!state.airborne) return "Rotera när flygplanet vill flyga";
    if (state.verticalSpeed < 120) return "Bekräfta positive rate of climb";
    return "Takeoff och initial stigning sitter";
  }

  if (active === "climb") {
    if (!state.airborne) return "Accelerera och rotera runt 46 kt";
    if (state.speed < 58) return "Bygg stigfart";
    return "Etablerad stigning";
  }

  if (active === "climb300") {
    if (state.altitude < 300) return "Fortsätt stig till 300 ft";
    if (engine.map > 25.5) return "Reducera mot climb power 24 inHg";
    if (engine.map < 22.8) return "Öka något mot climb power 24 inHg";
    if (engine.rpm > 2530) return "Reducera prop mot 2450 RPM";
    if (engine.rpm < 2360) return "Öka prop mot 2450 RPM";
    return "300 ft-rutin och climb settings sitter";
  }

  if (active === "cruise") {
    if (engine.map > 22.2) return "Reducera trottel mot 21 inHg";
    if (engine.map < 20.2) return "Öka trottel något mot 21 inHg";
    if (engine.rpm > 2425) return "Dra propellerreglaget mot 2350 RPM";
    if (engine.rpm < 2260) return "Öka propellerreglaget mot 2350 RPM";
    if (engine.mixture > 0.76) return "Magra tills EGT närmar sig peak";
    if (engine.mixture < 0.55) return "För magert, rika något";
    return "Cruise 21/2350 och magring sitter";
  }

  if (active === "downwind") {
    if (!state.carbHeatOn) return "Förvärmning till på medvind";
    if (engine.map > 21.5) return "Reducera på medvind";
    if (state.speed > 86) return "Låt farten komma mot 75 mph";
    return "Downwind-rutinen sitter";
  }

  if (active === "final") {
    if (state.speed > 76) return "Fånga finalfarten runt 70 mph";
    if (engine.prop < 0.9) return "Prop in på final";
    if (state.carbHeatOn) return "Förvärmning in/av på final";
    if (engine.mixture < 0.9) return "Blandning in";
    return "Final-rutinen sitter";
  }

  if (active === "shortFinal") {
    if (state.altitude > 300) return "Vänta med short final tills under 300 ft";
    if (state.verticalSpeed > -80) return "Stabilisera sjunket, annars Go Around";
    if (state.speed > 70) return "Sikta 65 mph över tröskeln";
    return "Stabiliserad short final";
  }

  if (active === "touchdown") {
    if (state.airborne) return "Nos upp och håll flare";
    if (state.speed > 62) return "Låt farten blöda mot 58 mph";
    return "Touchdown-rutinen sitter";
  }

  if (active === "reference") {
    return "Repetera specialrutiner och minneslistor";
  }

  if (!state.carbHeatOn) return "Carb heat på innan power reduceras";
  if (engine.prop < 0.9) return "Propeller full fram för approach";
  if (engine.map > 18.5) return "Reducera trottel till approach power";
  if (state.verticalSpeed > -120) return "Invänta stabil sjunk";
  return "Approach power satt";
}

function updateReadouts(engine, mode) {
  readouts.throttle.textContent = `${Math.round(engine.throttle * 100)}%`;
  readouts.prop.textContent = `${Math.round(engine.prop * 100)}%`;
  readouts.mixture.textContent = engine.mixture > 0.92 ? "Rik" : `${Math.round(engine.mixture * 100)}%`;
  controls.throttle.closest(".lever").style.setProperty("--control-pct", engine.throttle);
  controls.prop.closest(".lever").style.setProperty("--control-pct", engine.prop);
  controls.mixture.closest(".lever").style.setProperty("--control-pct", engine.mixture);

  readouts.phase.textContent = mode.phase;
  readouts.power.textContent = mode.power;
  readouts.feedback.textContent = mode.feedback;
  readouts.target.textContent = targets[mode.active];

  readouts.airspeed.textContent = Math.round(state.speed);
  readouts.altitude.textContent = Math.round(state.altitude);
  readouts.map.textContent = engine.map.toFixed(1);
  readouts.rpm.textContent = Math.round(engine.rpm / 10) * 10;
  readouts.egt.textContent = Math.round(engine.egt);
  readouts.mapMeter.value = engine.map;
  readouts.rpmMeter.value = engine.rpm;
  readouts.egtMeter.value = engine.egt;

  const asiDeg = -135 + clamp(state.speed / 130, 0, 1) * 270;
  const altHundredsDeg = (state.altitude % 1000) / 1000 * 360;
  const altThousandsDeg = (state.altitude % 10000) / 10000 * 360;
  readouts.asiNeedle.style.transform = `rotate(${asiDeg}deg)`;
  readouts.altHundredsNeedle.style.transform = `rotate(${altHundredsDeg}deg)`;
  readouts.altThousandsNeedle.style.transform = `rotate(${altThousandsDeg}deg)`;

  readouts.steps.forEach((step) => {
    const key = step.dataset.step;
    step.classList.toggle("done", state.completed.has(key));
  });

  readouts.procedureBody.querySelectorAll("[data-group]").forEach((group) => {
    group.classList.toggle("active-group", group.dataset.group === mode.active);
  });
}

function fitCanvas() {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(640, Math.floor(rect.width * ratio));
  const height = Math.max(280, Math.floor(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function drawOutside() {
  fitCanvas();
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const horizon = height * (0.54 - clamp(state.altitude / 3500, 0, 0.18)) + state.verticalSpeed * 0.014;
  const runwayScale = clamp(1 - state.altitude / 950, 0.18, 1);
  const speedPulse = state.distance * 0.018;

  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, "#7db7df");
  sky.addColorStop(1, "#c8dfeb");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#547a51";
  ctx.fillRect(0, horizon, width, height - horizon);

  ctx.fillStyle = "#6e8f52";
  for (let i = -1; i < 10; i += 1) {
    const y = horizon + ((i * 48 + speedPulse) % 480) * (1.1 + runwayScale);
    ctx.globalAlpha = 0.22;
    ctx.fillRect(0, y, width, 6 + i * 0.4);
  }
  ctx.globalAlpha = 1;

  drawMountains(width, horizon);
  drawRunway(width, height, horizon, runwayScale);
  drawLake(width, height, horizon);
  drawPitchReference(width, height);
}

function drawMountains(width, horizon) {
  ctx.fillStyle = "#6b7d7f";
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  for (let x = 0; x <= width; x += 90) {
    const peak = horizon - 35 - Math.sin(x * 0.017 + state.time * 0.08) * 16;
    ctx.lineTo(x + 45, peak);
    ctx.lineTo(x + 90, horizon);
  }
  ctx.lineTo(width, horizon);
  ctx.closePath();
  ctx.fill();
}

function drawRunway(width, height, horizon, scale) {
  const center = width / 2 + state.headingOffset * 26;
  const nearHalf = width * 0.23 * scale;
  const farHalf = width * 0.035 * scale;
  const farY = horizon + 10;
  const nearY = height + 32;

  ctx.fillStyle = "#363a3c";
  ctx.beginPath();
  ctx.moveTo(center - farHalf, farY);
  ctx.lineTo(center + farHalf, farY);
  ctx.lineTo(center + nearHalf, nearY);
  ctx.lineTo(center - nearHalf, nearY);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "#e8dfcf";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(center, farY + 10);
  ctx.lineTo(center, nearY);
  ctx.setLineDash([26, 34]);
  ctx.lineDashOffset = -state.distance * 0.18;
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = "rgba(255,255,255,0.72)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(center - farHalf, farY);
  ctx.lineTo(center - nearHalf, nearY);
  ctx.moveTo(center + farHalf, farY);
  ctx.lineTo(center + nearHalf, nearY);
  ctx.stroke();
}

function drawLake(width, height, horizon) {
  const lakeY = horizon + height * 0.16 + Math.sin(state.time * 0.2) * 3;
  ctx.fillStyle = "rgba(57, 129, 157, 0.64)";
  ctx.beginPath();
  ctx.ellipse(width * 0.78, lakeY, width * 0.22, height * 0.08, -0.08, 0, Math.PI * 2);
  ctx.fill();
}

function drawPitchReference(width, height) {
  const cx = width / 2;
  const cy = height * 0.47;
  ctx.strokeStyle = "rgba(20, 25, 28, 0.64)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 48, cy);
  ctx.lineTo(cx - 12, cy);
  ctx.moveTo(cx + 12, cy);
  ctx.lineTo(cx + 48, cy);
  ctx.moveTo(cx, cy - 10);
  ctx.lineTo(cx, cy + 10);
  ctx.stroke();
}

function tick(now) {
  const dt = clamp((now - state.last) / 1000, 0.001, 0.05);
  state.last = now;
  state.time += dt;

  const engine = getEngine();
  getFlight(engine, dt);
  const mode = classify(engine);
  updateReadouts(engine, mode);
  updateEngineAudio(engine);
  drawOutside();

  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
