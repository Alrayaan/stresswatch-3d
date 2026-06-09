/* CORE LOGIC: STRESSWATCH 3D APPLICATION */

// Global App State
const state = {
    simulation: {
        anxiety: 25,
        caffeine: 10,
        activity: 15,
        breathing: 0,
        baseHR: 62,
        baseHRV: 75,
        currentHR: 65,
        currentHRV: 70,
        stressScore: 30,
        stressCategory: "Calm", // Calm, Balanced, Alert, Stress
    },
    breathing: {
        active: false,
        type: 'box', // box, relax, scan
        stage: 'ready', // inhale, hold, exhale, hold
        timer: null,
        duration: 0,
        intervalId: null
    },
    journal: {
        mood: null,
        logs: []
    },
    visuals: {
        three: {
            scene: null,
            camera: null,
            renderer: null,
            orb: null,
            geometry: null,
            originalPositions: null,
            material: null,
            lightCyan: null,
            lightPink: null,
            clock: null
        },
        waveform: {
            canvas: null,
            ctx: null,
            animationId: null,
            offset: 0
        },
        chart: null
    }
};

// Start App when DOM Loaded
document.addEventListener("DOMContentLoaded", () => {
    initSimulator();
    initThreeJS();
    initWaveform();
    initCharts();
    initBreathing();
    initJournal();
    init3DTilts();
    
    // Start continuous loops
    clockLoop();
});

/* =========================================================================
   1. BIOMETRIC SIMULATOR & SCORING
   ========================================================================= */

function initSimulator() {
    const sliders = {
        anxiety: document.getElementById('slider-anxiety'),
        caffeine: document.getElementById('slider-caffeine'),
        activity: document.getElementById('slider-activity'),
        breathing: document.getElementById('slider-breathing')
    };

    const valueDisplays = {
        anxiety: document.getElementById('val-anxiety'),
        caffeine: document.getElementById('val-caffeine'),
        activity: document.getElementById('val-activity'),
        breathing: document.getElementById('val-breathing')
    };

    // Update Slider Values UI
    function updateSliderUI(key, val) {
        let text = val + "%";
        if (key === 'anxiety') {
            if (val < 20) text = "Low (Relaxed)";
            else if (val < 55) text = "Mild (Busy)";
            else if (val < 85) text = "High (Anxious)";
            else text = "Panic Spike!";
        } else if (key === 'caffeine') {
            if (val === 0) text = "None";
            else if (val < 40) text = "1 Cup (Mild)";
            else if (val < 80) text = "Double Shot";
            else text = "Energy Drink!";
        } else if (key === 'activity') {
            if (val < 15) text = "Resting";
            else if (val < 45) text = "Stretching";
            else if (val < 75) text = "Active Walk";
            else text = "Cardio Peak";
        } else if (key === 'breathing') {
            if (val < 10) text = "No (Shallow)";
            else if (val < 50) text = "Moderate";
            else text = "Deep Paced";
        }
        valueDisplays[key].textContent = text;
        state.simulation[key] = val;
    }

    // Attach listeners
    Object.keys(sliders).forEach(key => {
        sliders[key].addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            updateSliderUI(key, val);
            calculateTelemetry();
        });
        // Initial setup
        updateSliderUI(key, parseInt(sliders[key].value));
    });

    // Reset buttons
    document.getElementById('btn-reset-sim').addEventListener('click', () => {
        sliders.anxiety.value = 25;
        sliders.caffeine.value = 10;
        sliders.activity.value = 15;
        sliders.breathing.value = 0;
        
        Object.keys(sliders).forEach(key => updateSliderUI(key, parseInt(sliders[key].value)));
        calculateTelemetry();
    });

    document.getElementById('btn-stress-spike').addEventListener('click', () => {
        sliders.anxiety.value = 95;
        sliders.caffeine.value = 70;
        sliders.activity.value = 35;
        sliders.breathing.value = 0;
        
        Object.keys(sliders).forEach(key => updateSliderUI(key, parseInt(sliders[key].value)));
        calculateTelemetry();
    });

    calculateTelemetry();
}

function calculateTelemetry() {
    const s = state.simulation;
    
    // Heart Rate calculation (Physiological approximation)
    // base (62) + caffeine impact + anxiety impact + physical activity - deep breathing offset
    let targetHR = s.baseHR;
    targetHR += (s.caffeine * 0.25);
    targetHR += (s.anxiety * 0.35);
    targetHR += (s.activity * 0.55);
    targetHR -= (s.breathing * 0.22);
    
    // Heart Rate Variability (HRV) calculation (Physiological approximation)
    // Base HRV drops with caffeine, anxiety, physical stress; raises with deep breathing
    let targetHRV = s.baseHRV;
    targetHRV -= (s.caffeine * 0.25);
    targetHRV -= (s.anxiety * 0.40);
    targetHRV -= (s.activity * 0.20);
    targetHRV += (s.breathing * 0.35);
    
    // Clamp values
    s.targetHR = Math.max(45, Math.min(180, targetHR));
    s.targetHRV = Math.max(10, Math.min(130, targetHRV));
}

// Tick loop to add minor noise and interpolate simulated data smoothly
function clockLoop() {
    const s = state.simulation;
    
    // Smooth interpolation towards targets
    const lerpSpeed = 0.08;
    
    // Add heartbeat noise
    const hrNoise = (Math.random() - 0.5) * 1.8;
    const hrvNoise = (Math.random() - 0.5) * 2.2;
    
    s.currentHR = s.currentHR + (s.targetHR - s.currentHR) * lerpSpeed + hrNoise;
    s.currentHRV = s.currentHRV + (s.targetHRV - s.currentHRV) * lerpSpeed + hrvNoise;
    
    // Boundaries clamp
    s.currentHR = Math.max(45, Math.min(180, s.currentHR));
    s.currentHRV = Math.max(8, Math.min(140, s.currentHRV));
    
    // Calculate final stress score (0-100)
    // High heart rate and low HRV increases stress index
    const hrFactor = Math.max(0, Math.min(1, (s.currentHR - 50) / 100)); // 50 to 150
    const hrvFactor = Math.max(0, Math.min(1, (110 - s.currentHRV) / 95)); // 110ms down to 15ms
    
    // Weighted combination: HRV represents parasympathetic tone (weighted more heavily at rest)
    let score = (hrFactor * 40) + (hrvFactor * 60);
    
    // Adjust by direct anxiety score for simulation accuracy
    score = score * 0.75 + (s.anxiety * 0.25);
    s.stressScore = Math.max(1, Math.min(100, Math.round(score)));
    
    // Determine category
    let badge = document.getElementById('global-stress-badge');
    let badgeText = document.getElementById('global-stress-text');
    let orbStatus = document.getElementById('orb-status-badge');
    
    if (s.stressScore < 35) {
        s.stressCategory = "Calm";
        badge.className = "global-status-badge calm";
        badgeText.innerHTML = '<i data-lucide="check-circle-2"></i> RESTED & RECOVERING';
        orbStatus.textContent = "CALM STATE";
        orbStatus.style.borderColor = "var(--neon-cyan)";
        orbStatus.style.color = "var(--neon-cyan)";
        orbStatus.style.backgroundColor = "rgba(0, 243, 255, 0.1)";
    } else if (s.stressScore < 60) {
        s.stressCategory = "Balanced";
        badge.className = "global-status-badge alert";
        badgeText.innerHTML = '<i data-lucide="activity"></i> AUTONOMIC BALANCE';
        orbStatus.textContent = "BALANCED";
        orbStatus.style.borderColor = "var(--neon-purple)";
        orbStatus.style.color = "var(--neon-purple)";
        orbStatus.style.backgroundColor = "rgba(189, 0, 255, 0.1)";
    } else if (s.stressScore < 78) {
        s.stressCategory = "Alert";
        badge.className = "global-status-badge alert";
        badgeText.innerHTML = '<i data-lucide="alert-circle"></i> ELEVATED STRESS';
        orbStatus.textContent = "ELEVATED ALERT";
        orbStatus.style.borderColor = "var(--neon-yellow)";
        orbStatus.style.color = "var(--neon-yellow)";
        orbStatus.style.backgroundColor = "rgba(255, 183, 0, 0.1)";
    } else {
        s.stressCategory = "Stress";
        badge.className = "global-status-badge stress";
        badgeText.innerHTML = '<i data-lucide="alert-triangle"></i> STRESS OVERLOAD';
        orbStatus.textContent = "ACUTE STRESS";
        orbStatus.style.borderColor = "var(--neon-pink)";
        orbStatus.style.color = "var(--neon-pink)";
        orbStatus.style.backgroundColor = "rgba(255, 0, 85, 0.1)";
    }
    
    // Update digital displays
    document.getElementById('metric-hr').textContent = Math.round(s.currentHR);
    document.getElementById('metric-hrv').textContent = Math.round(s.currentHRV);
    document.getElementById('stress-index-number').textContent = s.stressScore;
    document.getElementById('stress-index-category').textContent = s.stressCategory.toUpperCase() + " STATE";
    
    const hrvPercentage = Math.round(Math.max(0, Math.min(100, (s.currentHRV / 120) * 100)));
    document.getElementById('parasymp-pct').textContent = hrvPercentage + "%";
    document.getElementById('parasymp-fill').style.width = hrvPercentage + "%";
    
    // Update metric statuses
    const hrvStatusText = document.getElementById('hrv-status-label');
    if (s.currentHRV > 70) {
        hrvStatusText.textContent = "Excellent Tone";
        hrvStatusText.style.color = "var(--neon-green)";
    } else if (s.currentHRV > 45) {
        hrvStatusText.textContent = "Stable Tone";
        hrvStatusText.style.color = "var(--neon-cyan)";
    } else {
        hrvStatusText.textContent = "Suppressed HRV";
        hrvStatusText.style.color = "var(--neon-pink)";
    }
    
    // Dynamic breathing control speed mapping (scale heartbeat animation duration)
    const heartIcon = document.getElementById('heart-pulse-icon');
    const bps = s.currentHR / 60;
    const dur = 1 / bps;
    heartIcon.style.animationDuration = `${dur}s`;

    // Re-create lucide icons for dynamic badges if modified
    lucide.createIcons();

    // Call loop again in 1 second
    setTimeout(clockLoop, 1000);
}

/* =========================================================================
   2. THREE.JS 3D STRESS ORB
   ========================================================================= */

function initThreeJS() {
    const container = document.getElementById('threejs-canvas-container');
    if (!container) return;

    const w = container.clientWidth;
    const h = container.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    state.visuals.three.scene = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.z = 7;
    state.visuals.three.camera = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    state.visuals.three.renderer = renderer;

    // Create 3D Orb Geometry
    const geometry = new THREE.SphereGeometry(2, 48, 48);
    state.visuals.three.geometry = geometry;
    state.visuals.three.originalPositions = geometry.attributes.position.clone();

    // Shiny material with glowing properties
    const material = new THREE.MeshPhongMaterial({
        color: 0x00f0ff,
        emissive: 0x001a33,
        specular: 0xffffff,
        shininess: 90,
        flatShading: false,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide
    });
    state.visuals.three.material = material;

    const orb = new THREE.Mesh(geometry, material);
    scene.add(orb);
    state.visuals.three.orb = orb;

    // High Contrast Neon Lights Setup
    const ambientLight = new THREE.AmbientLight(0x0a0c16, 1.5);
    scene.add(ambientLight);

    // Neon Cyan light from bottom-left
    const lightCyan = new THREE.PointLight(0x00f0ff, 4, 30);
    lightCyan.position.set(-5, -3, 3);
    scene.add(lightCyan);
    state.visuals.three.lightCyan = lightCyan;

    // Neon Pink light from top-right
    const lightPink = new THREE.PointLight(0xff0055, 4, 30);
    lightPink.position.set(5, 5, 3);
    scene.add(lightPink);
    state.visuals.three.lightPink = lightPink;

    // Direct front light
    const frontLight = new THREE.DirectionalLight(0xffffff, 0.5);
    frontLight.position.set(0, 0, 10);
    scene.add(frontLight);

    state.visuals.three.clock = new THREE.Clock();

    // Resize Handler
    window.addEventListener('resize', () => {
        const width = container.clientWidth;
        const height = container.clientHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    });

    // Start rendering frame loop
    animateThreeJS();
}

function animateThreeJS() {
    requestAnimationFrame(animateThreeJS);

    const t = state.visuals.three;
    if (!t.orb || !t.clock) return;

    const time = t.clock.getElapsedTime();
    const stress = state.simulation.stressScore;
    const hr = state.simulation.currentHR;

    // 1. Map biometric data to 3D properties
    // Stress levels dictate displacement/chaos intensity
    let distortionScale = 0.02 + (stress / 100) * 0.15; // Mild waves at 0, spike spikes at 100
    let frequencyScale = 1.5 + (stress / 100) * 3.5;    // Higher frequency waves when stressed
    
    // Heart rate dictates rotation & pulsation frequency
    let pulseFrequency = (hr / 60) * 2.5; // Heartbeat pulsing cycles
    let rotationSpeed = 0.15 + (hr / 60) * 0.5;

    // 2. Vertex Displacement (Liquid Morpher Simulation)
    const position = t.geometry.attributes.position;
    const original = t.originalPositions;
    const count = position.count;

    for (let i = 0; i < count; i++) {
        let ox = original.getX(i);
        let oy = original.getY(i);
        let oz = original.getZ(i);

        // Calculate unit vector direction (spherical direction)
        let r = Math.sqrt(ox*ox + oy*oy + oz*oz);
        let nx = ox / r;
        let ny = oy / r;
        let nz = oz / r;

        // Wave formulas based on spatial positions and elapsed time
        let wave = Math.sin(nx * frequencyScale + time * pulseFrequency) * 
                   Math.cos(ny * frequencyScale + time * pulseFrequency) * 
                   Math.sin(nz * frequencyScale + time * pulseFrequency);
                   
        // Combined second-harmonic ripple
        let ripple = Math.cos((nx + ny + nz) * 2 + time * 1.5) * 0.4;
        
        let displacement = 1.0 + (wave + ripple) * distortionScale;

        // Apply deformation
        position.setXYZ(i, ox * displacement, oy * displacement, oz * displacement);
    }
    position.needsUpdate = true;
    t.geometry.computeVertexNormals();

    // 3. Size Pulsation (sync with breathing or heartbeat)
    let sizePulse = 1.0;
    if (state.breathing.active && state.breathing.stageStartTime) {
        // Compute breathing scale mathematically to prevent layout thrashing
        const elapsed = (Date.now() - state.breathing.stageStartTime) / 1000;
        const progress = Math.min(1.0, elapsed / state.breathing.stageDuration);
        
        // Easing function: easeInOutQuad
        const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        
        const scaleRange = state.breathing.targetScale - state.breathing.startScale;
        const currentScale = state.breathing.startScale + scaleRange * ease;
        
        // Map currentScale (0.65 to 1.4) to sizePulse comfortably
        sizePulse = 0.7 + (currentScale - 0.7) * 0.7;
    } else {
        // Otherwise, pulse gently in rhythm with simulated heart rate
        sizePulse = 1.0 + Math.sin(time * pulseFrequency) * 0.03;
    }
    t.orb.scale.set(sizePulse, sizePulse, sizePulse);

    // 4. Rotate Orb
    t.orb.rotation.y = time * rotationSpeed;
    t.orb.rotation.x = time * (rotationSpeed * 0.5);

    // 5. High Contrast Color Shifting based on Stress
    // Calm (Cyan: 0x00f0ff) -> Balanced/Alert (Purple: 0xbd00ff) -> Stress (Hot Pink: 0xff0055)
    let targetColor = new THREE.Color(0x00f0ff);
    let targetEmissive = new THREE.Color(0x00152b);

    if (stress < 35) {
        // Interpolate within calm (Cyanish hues)
        targetColor.setHex(0x00f0ff);
        targetEmissive.setHex(0x00152b);
        t.lightCyan.color.setHex(0x00f0ff);
        t.lightPink.color.setHex(0xbd00ff);
    } else if (stress < 70) {
        // Purple transition
        const ratio = (stress - 35) / 35;
        targetColor.lerpColors(new THREE.Color(0x00f0ff), new THREE.Color(0xbd00ff), ratio);
        targetEmissive.lerpColors(new THREE.Color(0x00152b), new THREE.Color(0x1a0033), ratio);
        t.lightCyan.color.setHex(0x00f0ff);
        t.lightPink.color.setHex(0xff0055);
    } else {
        // Pink/Red transition
        const ratio = Math.min(1.0, (stress - 70) / 30);
        targetColor.lerpColors(new THREE.Color(0xbd00ff), new THREE.Color(0xff0055), ratio);
        targetEmissive.lerpColors(new THREE.Color(0x1a0033), new THREE.Color(0x33000b), ratio);
        t.lightCyan.color.setHex(0xbd00ff);
        t.lightPink.color.setHex(0xff0055);
    }

    // Smooth lerp material color
    t.material.color.lerp(targetColor, 0.05);
    t.material.emissive.lerp(targetEmissive, 0.05);

    t.renderer.render(t.scene, t.camera);
}

/* =========================================================================
   3. ECG LIVE WAVEFORM SCANNER
   ========================================================================= */

function initWaveform() {
    const canvas = document.getElementById('live-waveform-canvas');
    if (!canvas) return;
    
    // Fit to container dimensions
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    
    state.visuals.waveform.canvas = canvas;
    state.visuals.waveform.ctx = canvas.getContext('2d');
    
    window.addEventListener('resize', () => {
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
    });

    drawWaveform();
}

function drawWaveform() {
    state.visuals.waveform.animationId = requestAnimationFrame(drawWaveform);
    
    const w = state.visuals.waveform.canvas.width;
    const h = state.visuals.waveform.canvas.height;
    const ctx = state.visuals.waveform.ctx;
    
    if (!ctx) return;
    
    ctx.clearRect(0, 0, w, h);
    
    // Draw background grid lines (cyberpunk mesh design)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 20) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
    }
    for (let y = 0; y < h; y += 20) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    }
    
    // Waveform rendering variables
    const hr = state.simulation.currentHR;
    const stress = state.simulation.stressScore;
    
    state.visuals.waveform.offset += 2.5 + (hr / 60) * 1.5; // Scroll speed relative to HR
    if (state.visuals.waveform.offset > w) {
        state.visuals.waveform.offset = 0;
    }
    
    const offset = state.visuals.waveform.offset;
    
    // Determine gradient line color based on stress
    let strokeGrad = ctx.createLinearGradient(0, 0, w, 0);
    let colorStart = 'rgba(0, 240, 255, 0.8)';
    let colorEnd = 'rgba(0, 240, 255, 0.8)';
    
    if (stress < 35) {
        colorStart = 'rgba(0, 243, 255, 0.8)';
        colorEnd = 'rgba(0, 255, 136, 0.4)';
    } else if (stress < 70) {
        colorStart = 'rgba(189, 0, 255, 0.8)';
        colorEnd = 'rgba(0, 243, 255, 0.4)';
    } else {
        colorStart = 'rgba(255, 0, 85, 0.9)';
        colorEnd = 'rgba(189, 0, 255, 0.4)';
    }
    
    strokeGrad.addColorStop(Math.max(0, (offset - 40) / w), 'rgba(255,255,255,0.05)');
    strokeGrad.addColorStop(offset / w, colorStart);
    strokeGrad.addColorStop(Math.min(1.0, (offset + 10) / w), colorEnd);
    strokeGrad.addColorStop(Math.min(1.0, (offset + 60) / w), 'rgba(255,255,255,0.05)');
    
    // Draw the ECG path
    ctx.beginPath();
    ctx.strokeStyle = strokeGrad;
    ctx.lineWidth = 2.5;
    ctx.shadowBlur = 8;
    ctx.shadowColor = stress > 70 ? 'rgba(255, 0, 85, 0.5)' : 'rgba(0, 240, 255, 0.5)';
    
    const midY = h / 2;
    const beatPeriod = 200; // Pixel period between beats
    
    ctx.moveTo(0, midY);
    for (let x = 0; x < w; x++) {
        // Calculate dynamic relative coordinate
        const relativeX = (x + offset) % beatPeriod;
        let yVal = midY;
        
        // Simulating ECG waves: P, Q, R, S, T complex
        // QRS spike is sharp, T wave is broad
        if (relativeX > 20 && relativeX < 35) {
            // P Wave
            yVal = midY - Math.sin((relativeX - 20) / 15 * Math.PI) * 4;
        } else if (relativeX >= 40 && relativeX < 45) {
            // Q Wave
            yVal = midY + (relativeX - 40) * 2.5;
        } else if (relativeX >= 45 && relativeX < 53) {
            // R Spike (massive sharp contraction)
            const peakPos = 49;
            const dist = Math.abs(relativeX - peakPos);
            yVal = midY - 35 * (1 - dist / 4);
        } else if (relativeX >= 53 && relativeX < 59) {
            // S Drop
            yVal = midY + 12 * (1 - Math.abs(relativeX - 56) / 3);
        } else if (relativeX >= 70 && relativeX < 95) {
            // T Wave (ventricular repolarization)
            yVal = midY - Math.sin((relativeX - 70) / 25 * Math.PI) * 8;
        }
        
        ctx.lineTo(x, yVal);
    }
    
    ctx.stroke();
    ctx.shadowBlur = 0; // Reset
}

/* =========================================================================
   4. INTERACTIVE ANALYTICS CHARTS (DAILY STRESS TREND)
   ========================================================================= */

function initCharts() {
    const ctx = document.getElementById('stress-trend-chart');
    if (!ctx) return;
    
    // Gradient fill setup
    const chartCtx = ctx.getContext('2d');
    const chartGrad = chartCtx.createLinearGradient(0, 0, 0, 200);
    chartGrad.addColorStop(0, 'rgba(0, 243, 255, 0.25)');
    chartGrad.addColorStop(0.6, 'rgba(189, 0, 255, 0.08)');
    chartGrad.addColorStop(1, 'rgba(6, 7, 10, 0)');

    const dataPoints = [22, 28, 30, 48, 55, 38, 25, 29, 65, 82, 75, 45, 33, 28, 32];
    const labels = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "Now"];

    state.visuals.chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Stress Index',
                data: dataPoints,
                borderColor: '#00f3ff',
                borderWidth: 3,
                backgroundColor: chartGrad,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#00f3ff',
                pointBorderColor: '#0c0e15',
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7,
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: '#bd00ff',
                pointHoverBorderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#121422',
                    titleFont: { family: 'Outfit', weight: 'bold' },
                    bodyFont: { family: 'Inter' },
                    borderWidth: 1,
                    borderColor: 'rgba(0, 243, 255, 0.25)',
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            let val = context.parsed.y;
                            let zone = "Calm";
                            if (val > 75) zone = "High Stress ⚠️";
                            else if (val > 55) zone = "Elevated ⚡";
                            else if (val > 35) zone = "Balanced 🧘";
                            return `Stress Index: ${val} (${zone})`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.03)' },
                    ticks: { color: '#8790ab', font: { family: 'Outfit', size: 11 } }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.03)' },
                    ticks: { color: '#8790ab', font: { family: 'Outfit', size: 11 } },
                    min: 0,
                    max: 100
                }
            }
        }
    });

    // Periodic chart update loop to append live simulator score to the chart
    setInterval(() => {
        if (!state.visuals.chart) return;
        
        const chart = state.visuals.chart;
        const currentScore = state.simulation.stressScore;
        
        // Update the last data point ("Now") with the current score
        const dataLength = chart.data.datasets[0].data.length;
        chart.data.datasets[0].data[dataLength - 1] = currentScore;
        
        // Dynamically adjust colors of points/lines based on current stress
        if (currentScore > 75) {
            chart.data.datasets[0].borderColor = '#ff0055';
            chart.data.datasets[0].pointBackgroundColor = '#ff0055';
        } else if (currentScore > 55) {
            chart.data.datasets[0].borderColor = '#bd00ff';
            chart.data.datasets[0].pointBackgroundColor = '#bd00ff';
        } else {
            chart.data.datasets[0].borderColor = '#00f3ff';
            chart.data.datasets[0].pointBackgroundColor = '#00f3ff';
        }
        
        chart.update('none'); // Update without full redraw animations
    }, 2000);
}

/* =========================================================================
   5. CBT BREATHING LAB & EXERCISE FLOW
   ========================================================================= */

function initBreathing() {
    const selectorButtons = document.querySelectorAll('.exercise-btn');
    const controlBtn = document.getElementById('btn-breathing-control');
    const durationTimer = document.getElementById('breath-timer');
    const stageIndicator = document.getElementById('breathing-stage');
    const instructionPrompt = document.getElementById('breathing-prompt');
    const circleOuter = document.getElementById('breath-circle-outer');
    const circleInner = document.getElementById('breath-circle-inner');

    // Exercise parameter lists
    const profiles = {
        box: {
            name: "Box Breathing",
            steps: [
                { stage: 'Inhale', duration: 4, prompt: 'Breathe in slowly through your nose...', scale: 1.35 },
                { stage: 'Hold', duration: 4, prompt: 'Suspend your breath, relax your jaw...', scale: 1.35 },
                { stage: 'Exhale', duration: 4, prompt: 'Let it go gently through your mouth...', scale: 0.7 },
                { stage: 'Hold', duration: 4, prompt: 'Hold empty before next cycle...', scale: 0.7 }
            ]
        },
        relax: {
            name: "4-7-8 Relaxing Breath",
            steps: [
                { stage: 'Inhale', duration: 4, prompt: 'Inhale silently through the nose...', scale: 1.4 },
                { stage: 'Hold', duration: 7, prompt: 'Retain the oxygen in your lungs...', scale: 1.4 },
                { stage: 'Exhale', duration: 8, prompt: 'Woosh out completely through your mouth...', scale: 0.65 }
            ]
        },
        scan: {
            name: "3D Body Scan",
            steps: [
                { stage: 'Head Focus', duration: 5, prompt: 'Bring awareness to forehead, neck, and jaw. Release tension.', scale: 1.2 },
                { stage: 'Chest & Shoulders', duration: 5, prompt: 'Drop your shoulders. Feel chest expand and release.', scale: 1.25 },
                { stage: 'Core & Breath', duration: 5, prompt: 'Feel your belly rise and fall. Breathe from diaphragm.', scale: 1.3 },
                { stage: 'Grounding Limbs', duration: 5, prompt: 'Relax your legs, hands, and feet. Let go completely.', scale: 1.0 }
            ]
        }
    };

    // Swap Exercise Selector Action
    selectorButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (state.breathing.active) return; // Prevent swap while active
            
            selectorButtons.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            state.breathing.type = e.target.getAttribute('data-type');
            
            // Adjust visual colors of circles based on active type
            const activeProfile = profiles[state.breathing.type];
            if (state.breathing.type === 'scan') {
                circleInner.style.border = '2px solid var(--neon-purple)';
                circleInner.style.background = 'radial-gradient(circle, rgba(189, 0, 255, 0.3) 0%, rgba(189, 0, 255, 0.02) 70%)';
                circleInner.style.boxShadow = 'var(--purple-glow)';
            } else {
                circleInner.style.border = '2px solid var(--neon-green)';
                circleInner.style.background = 'radial-gradient(circle, rgba(0, 255, 136, 0.3) 0%, rgba(0, 255, 136, 0.02) 70%)';
                circleInner.style.boxShadow = 'var(--green-glow)';
            }
            
            stageIndicator.textContent = "Ready";
            instructionPrompt.textContent = `Paced to: ${activeProfile.name}. Click start.`;
        });
    });

    // Control Trigger Action
    controlBtn.addEventListener('click', () => {
        if (state.breathing.active) {
            stopBreathing();
        } else {
            startBreathing();
        }
    });

    function startBreathing() {
        state.breathing.active = true;
        controlBtn.textContent = "Cancel Session";
        controlBtn.classList.remove('btn-primary');
        controlBtn.classList.add('btn-secondary');
        
        // Feed deep breathing signal into biometric engine
        document.getElementById('slider-breathing').value = 100;
        state.simulation.breathing = 100;
        calculateTelemetry();
        
        let stepIndex = 0;
        let timeRemaining = 0;
        const profile = profiles[state.breathing.type];
        
        function runStep() {
            if (!state.breathing.active) return;
            
            const currentStep = profile.steps[stepIndex];
            state.breathing.stage = currentStep.stage;
            timeRemaining = currentStep.duration;
            
            // Set state variables for JS interpolation
            state.breathing.stageStartTime = Date.now();
            state.breathing.stageDuration = currentStep.duration; // in seconds
            let prevIndex = (stepIndex - 1 + profile.steps.length) % profile.steps.length;
            state.breathing.startScale = stepIndex === 0 ? 1.0 : profile.steps[prevIndex].scale;
            state.breathing.targetScale = currentStep.scale;
            
            // Update UI Labels
            stageIndicator.textContent = currentStep.stage.toUpperCase();
            if (state.breathing.type === 'scan') {
                stageIndicator.style.color = 'var(--neon-purple)';
            } else {
                stageIndicator.style.color = currentStep.stage === 'Inhale' ? 'var(--neon-cyan)' : 'var(--neon-green)';
            }
            
            instructionPrompt.textContent = currentStep.prompt;
            durationTimer.textContent = timeRemaining;
            
            // Trigger 3D css transitions on the circles
            circleInner.style.transform = `scale(${currentStep.scale})`;
            circleOuter.style.transform = `scale(${currentStep.scale + 0.15})`;
            
            // Transition timing transition matching step duration
            circleInner.style.transition = `transform ${currentStep.duration}s cubic-bezier(0.4, 0, 0.2, 1)`;
            circleOuter.style.transition = `transform ${currentStep.duration}s cubic-bezier(0.4, 0, 0.2, 1)`;

            // Countdown sub-timer loop
            clearInterval(state.breathing.intervalId);
            state.breathing.intervalId = setInterval(() => {
                timeRemaining--;
                durationTimer.textContent = timeRemaining;
                
                if (timeRemaining <= 0) {
                    clearInterval(state.breathing.intervalId);
                    // Cycle to next step index
                    stepIndex = (stepIndex + 1) % profile.steps.length;
                    runStep();
                }
            }, 1000);
        }
        
        runStep();
    }

    function stopBreathing() {
        state.breathing.active = false;
        clearInterval(state.breathing.intervalId);
        
        controlBtn.textContent = "Start Breathing";
        controlBtn.classList.remove('btn-secondary');
        controlBtn.classList.add('btn-primary');
        
        // Remove deep breathing simulation offset
        document.getElementById('slider-breathing').value = 0;
        state.simulation.breathing = 0;
        calculateTelemetry();
        
        stageIndicator.textContent = "Ready";
        stageIndicator.style.color = 'var(--text-secondary)';
        instructionPrompt.textContent = "Session ended. Breathe normally.";
        durationTimer.textContent = "00";
        
        // Reset scales
        circleInner.style.transform = 'scale(1)';
        circleOuter.style.transform = 'scale(1)';
        circleInner.style.transition = 'transform 0.4s ease';
        circleOuter.style.transition = 'transform 0.4s ease';
    }
}

/* =========================================================================
   6. STRESS JOURNAL & CBT AI RECONSTRUCTING COACH
   ========================================================================= */

function initJournal() {
    const journalText = document.getElementById('journal-text');
    const moodTags = document.querySelectorAll('.mood-tag');
    const submitBtn = document.getElementById('btn-submit-journal');
    const aiCoachPanel = document.getElementById('ai-coach-panel');
    const distortionText = document.getElementById('cbt-distortion-text');
    const reframeText = document.getElementById('cbt-reframe-text');

    // Select Mood Tag
    moodTags.forEach(tag => {
        tag.addEventListener('click', (e) => {
            moodTags.forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            state.journal.mood = e.target.getAttribute('data-mood');
            
            // Adjust simulation slightly based on selected mood
            if (state.journal.mood === 'anxious' || state.journal.mood === 'overwhelmed') {
                state.simulation.anxiety = Math.max(state.simulation.anxiety, 65);
                document.getElementById('slider-anxiety').value = state.simulation.anxiety;
            } else if (state.journal.mood === 'calm') {
                state.simulation.anxiety = Math.min(state.simulation.anxiety, 20);
                document.getElementById('slider-anxiety').value = state.simulation.anxiety;
            }
            calculateTelemetry();
        });
    });

    // Submit Action & CBT parser
    submitBtn.addEventListener('click', () => {
        const text = journalText.value.trim().toLowerCase();
        
        if (!text) {
            alert("Please type a few thoughts in your stress journal.");
            return;
        }

        submitBtn.textContent = "Analyzing thoughts...";
        submitBtn.disabled = true;

        // Simulate network / AI inference delay
        setTimeout(() => {
            let distortion = "General Stress Accumulation";
            let reframe = "Take a step back. Recognize that your current stress feels intense, but it is temporary. You are safe, and you can solve problems step-by-step.";

            // Cognitive Distortions Rule Engine
            if (text.includes("never") || text.includes("always") || text.includes("nothing") || text.includes("everything") || text.includes("perfect")) {
                distortion = "All-or-Nothing Thinking (Polarization)";
                reframe = "You are looking at things in black-and-white categories. Reframe: 'Just because one thing is going poorly doesn't mean everything is ruined. There is grey area, and things are rarely entirely good or entirely bad.'";
            } 
            else if (text.includes("fail") || text.includes("ruin") || text.includes("disaster") || text.includes("worst") || text.includes("catastrophe") || text.includes("die")) {
                distortion = "Catastrophizing (Magnification)";
                reframe = "You are predicting the worst-case scenario. Reframe: 'Even if the presentation or event doesn't go perfectly, the absolute worst-case outcome is extremely unlikely. You have handled mistakes in the past and will cope with this, too.'";
            }
            else if (text.includes("feel like") || text.includes("feel anxious") || text.includes("feel stupid") || text.includes("just know")) {
                distortion = "Emotional Reasoning";
                reframe = "You are assuming your negative emotions reflect objective truth. Reframe: 'Feeling anxious does not mean you are in danger or incapable. Acknowledge the feeling as a temporary wave, not a factual verdict on your capabilities.'";
            }
            else if (text.includes("my fault") || text.includes("i should") || text.includes("i must") || text.includes("blame myself")) {
                distortion = "Personalization & Overresponsibility";
                reframe = "You hold yourself entirely responsible for events outside your control. Reframe: 'You are only responsible for your own actions and reactions. List the other contributing variables to this situation and release control of them.'";
            }

            // Display reframing response
            distortionText.textContent = distortion;
            reframeText.textContent = reframe;
            
            aiCoachPanel.classList.remove('hidden');
            
            submitBtn.textContent = "Analyze thoughts (AI)";
            submitBtn.disabled = false;

            // Trigger minor stress spike when writing anxious logs to simulate state tracking,
            // then let it settle as they read the reframes.
            if (state.journal.mood === 'anxious' || state.journal.mood === 'overwhelmed') {
                // Flash stress values briefly
                const originalAnxiety = state.simulation.anxiety;
                state.simulation.anxiety = Math.min(100, originalAnxiety + 15);
                calculateTelemetry();
                
                // Add tag point on chart if possible
                if (state.visuals.chart) {
                    const chart = state.visuals.chart;
                    const len = chart.data.datasets[0].data.length;
                    
                    // Highlight the point on chart as a marker
                    chart.data.labels[len-1] = "Journaled";
                    chart.update();
                }
                
                // Slowly cool down anxiety after 10 seconds (representing therapeutic relief)
                setTimeout(() => {
                    state.simulation.anxiety = originalAnxiety;
                    calculateTelemetry();
                }, 10000);
            }
        }, 1200);
    });
}

/* =========================================================================
   7. 3D CARD PERSPECTIVE TILT TRACKING
   ========================================================================= */

function init3DTilts() {
    const cards = document.querySelectorAll('.tilt-card');
    
    cards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left; // Mouse position inside card
            const y = e.clientY - rect.top;
            
            const cardWidth = rect.width;
            const cardHeight = rect.height;
            
            // Convert to offset ranges from -0.5 to 0.5
            const xPercent = (x / cardWidth) - 0.5;
            const yPercent = (y / cardHeight) - 0.5;
            
            // Scale to rotation angles (tilt degrees)
            const rotateX = -yPercent * 12; // Cap tilt at +-6 degrees
            const rotateY = xPercent * 12;
            
            // Adjust card styling dynamically
            card.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px)`;
            card.style.boxShadow = `0 20px 40px rgba(0, 0, 0, 0.45), 0 0 20px rgba(0, 240, 255, 0.05)`;
            
            // Subtle shifting of border brightness
            card.style.borderColor = `rgba(255, 255, 255, ${0.08 + Math.abs(xPercent) * 0.15})`;
        });
        
        card.addEventListener('mouseleave', () => {
            // Reset transforms smoothly
            card.style.transform = 'rotateX(0deg) rotateY(0deg) translateY(0)';
            card.style.boxShadow = 'none';
            card.style.borderColor = 'var(--border-color)';
            card.style.transition = 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1), box-shadow 0.3s ease, border-color 0.3s ease';
        });
        
        card.addEventListener('mouseenter', () => {
            // Remove transitions briefly during move for fast response
            card.style.transition = 'transform 0.08s ease, box-shadow 0.3s ease, border-color 0.3s ease';
        });
    });
}
