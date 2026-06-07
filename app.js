const canvas = document.querySelector("#outside-view");
const ctx = canvas.getContext("2d");

const controls = {
  throttle: document.querySelector("#throttle"),
  prop: document.querySelector("#prop"),
  mixture: document.querySelector("#mixture"),
  carbHeat: document.querySelector("#carb-heat"),
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
  altNeedle: document.querySelector("#alt-needle"),
  steps: [...document.querySelectorAll("#procedure-list li")],
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

const targets = {
  takeoff: "Full rik, prop fram, carb heat av, trottel full",
  climb: "Håll takeoff power tills farten är stabil",
  cruise: "23 inHg, 2300 RPM, magra mot peak EGT",
  approach: "Carb heat på, prop full fram, approach power",
};

controls.carbHeat.addEventListener("click", () => {
  state.carbHeatOn = !state.carbHeatOn;
  controls.carbHeat.setAttribute("aria-pressed", String(state.carbHeatOn));
  controls.carbHeat.textContent = state.carbHeatOn ? "På" : "Av";
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
  const climbDone = state.airborne && state.altitude > 20 && state.speed > 58;
  const cruiseSet = state.airborne && engine.map > 22.1 && engine.map < 24.1 && engine.rpm > 2220 && engine.rpm < 2380 && engine.mixture > 0.55 && engine.mixture < 0.76 && !state.carbHeatOn;
  const approachSet = state.airborne && state.carbHeatOn && engine.prop > 0.9 && engine.map < 18.5 && state.verticalSpeed < -120;

  if (takeoffReady) state.completed.add("takeoff");
  if (climbDone) state.completed.add("climb");
  if (cruiseSet) state.completed.add("cruise");
  if (approachSet) state.completed.add("approach");

  let phase = "Uppställning";
  let active = "takeoff";
  if (state.completed.has("takeoff") && !state.airborne) {
    phase = "Startroll";
    active = "climb";
  }
  if (state.airborne) {
    phase = state.verticalSpeed >= -60 ? "Stigning" : "Inflygning";
    active = state.completed.has("climb") ? "cruise" : "climb";
  }
  if (state.completed.has("cruise")) {
    phase = state.verticalSpeed < -80 ? "Inflygning" : "Planflykt";
    active = "approach";
  }
  if (state.completed.has("approach")) {
    phase = "Approach";
    active = "approach";
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
    return "Takeoff power satt";
  }

  if (active === "climb") {
    if (!state.airborne) return "Accelerera och rotera runt 46 kt";
    if (state.speed < 58) return "Bygg stigfart";
    return "Etablerad stigning";
  }

  if (active === "cruise") {
    if (engine.map > 24.1) return "Reducera trottel mot 23 inHg";
    if (engine.map < 22.1) return "Öka trottel något mot 23 inHg";
    if (engine.rpm > 2380) return "Dra propellerreglaget mot 2300 RPM";
    if (engine.rpm < 2220) return "Öka propellerreglaget mot 2300 RPM";
    if (engine.mixture > 0.76) return "Magra tills EGT närmar sig peak";
    if (engine.mixture < 0.55) return "För magert, rika något";
    return "Cruise power och magring sitter";
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
  const altDeg = -135 + clamp((state.altitude % 3000) / 3000, 0, 1) * 270;
  readouts.asiNeedle.style.transform = `rotate(${asiDeg}deg)`;
  readouts.altNeedle.style.transform = `rotate(${altDeg}deg)`;

  readouts.steps.forEach((step) => {
    const key = step.dataset.step;
    step.classList.toggle("done", state.completed.has(key));
    step.classList.toggle("active", key === mode.active && !state.completed.has(key));
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
