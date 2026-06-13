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
            particles: null,
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

// Audio context holder for paced breathing sound synthesis
let audioCtx = null;

// Start App when DOM Loaded
document.addEventListener("DOMContentLoaded", () => {
    initNavigation();
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
   1. VIEW SWITCHING & NAVIGATION
   ========================================================================= */

function initNavigation() {
    const navItems = document.querySelectorAll('.nav-links .nav-item');
    const views = document.querySelectorAll('.views-container .app-view');

    function showView(targetId) {
        views.forEach(v => v.classList.remove('active'));
        navItems.forEach(n => n.classList.remove('active'));

        const activeView = document.getElementById(`view-${targetId}`);
        const activeNav = document.getElementById(`nav-${targetId === 'exercises' ? 'ex' : targetId}`);

        if (activeView) activeView.classList.add('active');
        if (activeNav) activeNav.classList.add('active');

        // Move Three.js renderer DOM element based on target view
        const canvasContainerDash = document.getElementById('threejs-dashboard-container');
        const canvasContainerEx = document.getElementById('threejs-breathing-container');
        const renderer = state.visuals.three.renderer;

        if (renderer && renderer.domElement) {
            if (targetId === 'exercises') {
                if (canvasContainerEx) {
                    canvasContainerEx.appendChild(renderer.domElement);
                    resizeRenderer(canvasContainerEx);
                }
            } else {
                if (canvasContainerDash) {
                    canvasContainerDash.appendChild(renderer.domElement);
                    resizeRenderer(canvasContainerDash);
                }
            }
        }

        // Trigger weekly report recalculation if entering Insights view
        if (targetId === 'insights') {
            updateWeeklyReport();
        }
    }

    function resizeRenderer(container) {
        const camera = state.visuals.three.camera;
        const renderer = state.visuals.three.renderer;
        if (camera && renderer && container) {
            const w = container.clientWidth || 300;
            const h = container.clientHeight || 300;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
        }
    }

    // Attach click listeners to sidebar navigation items
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const href = item.getAttribute('href');
            const targetId = href.replace('#', '');
            window.location.hash = targetId;
            showView(targetId);
        });
    });

    // Handle initial routing based on URL hash
    const initialHash = window.location.hash.replace('#', '') || 'dashboard';
    showView(initialHash);
}

/* =========================================================================
   2. BIOMETRIC SIMULATOR & SCORING
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

    // Update Simulator values text labels
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
        if (sliders[key]) {
            sliders[key].addEventListener('input', (e) => {
                const val = parseInt(e.target.value);
                updateSliderUI(key, val);
                calculateTelemetry();
            });
            // Initial setup
            updateSliderUI(key, parseInt(sliders[key].value));
        }
    });

    // Reset control buttons
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
    
    // Physiological approximation calculations
    let targetHR = s.baseHR;
    targetHR += (s.caffeine * 0.25);
    targetHR += (s.anxiety * 0.35);
    targetHR += (s.activity * 0.55);
    targetHR -= (s.breathing * 0.22);
    
    let targetHRV = s.baseHRV;
    targetHRV -= (s.caffeine * 0.25);
    targetHRV -= (s.anxiety * 0.40);
    targetHRV -= (s.activity * 0.20);
    targetHRV += (s.breathing * 0.35);
    
    s.targetHR = Math.max(45, Math.min(180, targetHR));
    s.targetHRV = Math.max(10, Math.min(130, targetHRV));
}

// continuous tick loop for biometric noise & smooth interpolation
function clockLoop() {
    const s = state.simulation;
    
    // Smooth interpolation
    const lerpSpeed = 0.08;
    
    const hrNoise = (Math.random() - 0.5) * 1.8;
    const hrvNoise = (Math.random() - 0.5) * 2.2;
    
    s.currentHR = s.currentHR + (s.targetHR - s.currentHR) * lerpSpeed + hrNoise;
    s.currentHRV = s.currentHRV + (s.targetHRV - s.currentHRV) * lerpSpeed + hrvNoise;
    
    s.currentHR = Math.max(45, Math.min(180, s.currentHR));
    s.currentHRV = Math.max(8, Math.min(140, s.currentHRV));
    
    // Calculate stress score (0-100)
    const hrFactor = Math.max(0, Math.min(1, (s.currentHR - 50) / 100));
    const hrvFactor = Math.max(0, Math.min(1, (110 - s.currentHRV) / 95));
    
    let score = (hrFactor * 40) + (hrvFactor * 60);
    score = score * 0.75 + (s.anxiety * 0.25);
    s.stressScore = Math.max(1, Math.min(100, Math.round(score)));
    
    // Map to categories
    let badge = document.getElementById('global-stress-badge');
    let badgeText = document.getElementById('global-stress-text');
    let orbStatus = document.getElementById('orb-status-badge');
    
    if (s.stressScore < 35) {
        s.stressCategory = "Calm";
        if (badge) badge.className = "global-status-badge calm";
        if (badgeText) badgeText.innerHTML = '<i data-lucide="check-circle-2"></i> RESTED & RECOVERING';
        if (orbStatus) {
            orbStatus.textContent = "CALM STATE";
            orbStatus.style.borderColor = "var(--neon-green)";
            orbStatus.style.color = "var(--neon-green)";
            orbStatus.style.backgroundColor = "rgba(0, 255, 136, 0.1)";
        }
    } else if (s.stressScore < 60) {
        s.stressCategory = "Balanced";
        if (badge) badge.className = "global-status-badge alert";
        if (badgeText) badgeText.innerHTML = '<i data-lucide="activity"></i> AUTONOMIC BALANCE';
        if (orbStatus) {
            orbStatus.textContent = "BALANCED";
            orbStatus.style.borderColor = "var(--neon-cyan)";
            orbStatus.style.color = "var(--neon-cyan)";
            orbStatus.style.backgroundColor = "rgba(0, 243, 255, 0.1)";
        }
    } else if (s.stressScore < 78) {
        s.stressCategory = "Alert";
        if (badge) badge.className = "global-status-badge alert";
        if (badgeText) badgeText.innerHTML = '<i data-lucide="alert-circle"></i> ELEVATED STRESS';
        if (orbStatus) {
            orbStatus.textContent = "ELEVATED ALERT";
            orbStatus.style.borderColor = "var(--neon-yellow)";
            orbStatus.style.color = "var(--neon-yellow)";
            orbStatus.style.backgroundColor = "rgba(255, 183, 0, 0.1)";
        }
    } else {
        s.stressCategory = "Stress";
        if (badge) badge.className = "global-status-badge stress";
        if (badgeText) badgeText.innerHTML = '<i data-lucide="alert-triangle"></i> STRESS OVERLOAD';
        if (orbStatus) {
            orbStatus.textContent = "ACUTE STRESS";
            orbStatus.style.borderColor = "var(--neon-pink)";
            orbStatus.style.color = "var(--neon-pink)";
            orbStatus.style.backgroundColor = "rgba(255, 0, 85, 0.1)";
        }
    }
    
    // Update dashboard labels
    const metricHR = document.getElementById('metric-hr');
    const metricHRV = document.getElementById('metric-hrv');
    const stressIndexNum = document.getElementById('stress-index-number');
    const stressIndexCat = document.getElementById('stress-index-category');
    const parasympPct = document.getElementById('parasymp-pct');
    const parasympFill = document.getElementById('parasymp-fill');
    
    if (metricHR) metricHR.textContent = Math.round(s.currentHR);
    if (metricHRV) metricHRV.textContent = Math.round(s.currentHRV);
    if (stressIndexNum) stressIndexNum.textContent = s.stressScore;
    if (stressIndexCat) stressIndexCat.textContent = s.stressCategory.toUpperCase() + " STATE";
    
    const hrvPercentage = Math.round(Math.max(0, Math.min(100, (s.currentHRV / 120) * 100)));
    if (parasympPct) parasympPct.textContent = hrvPercentage + "%";
    if (parasympFill) parasympFill.style.width = hrvPercentage + "%";
    
    const hrvStatusText = document.getElementById('hrv-status-label');
    if (hrvStatusText) {
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
    }
    
    const heartIcon = document.getElementById('heart-pulse-icon');
    if (heartIcon) {
        const bps = s.currentHR / 60;
        const dur = 1 / bps;
        heartIcon.style.animationDuration = `${dur}s`;
    }

    lucide.createIcons();
    setTimeout(clockLoop, 1000);
}

/* =========================================================================
   3. THREE.JS 3D STRESS ORB
   ========================================================================= */

function initThreeJS() {
    const container = document.getElementById('threejs-dashboard-container');
    if (!container) return;

    const w = container.clientWidth || 300;
    const h = container.clientHeight || 300;

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

    // Sphere Geometry
    const geometry = new THREE.SphereGeometry(2, 48, 48);
    state.visuals.three.geometry = geometry;
    state.visuals.three.originalPositions = geometry.attributes.position.clone();

    // Translucent Liquid Glass Material
    const material = new THREE.MeshPhongMaterial({
        color: 0x00f3ff,
        emissive: 0x001a33,
        specular: 0xffffff,
        shininess: 95,
        flatShading: false,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide
    });
    state.visuals.three.material = material;

    const orb = new THREE.Mesh(geometry, material);
    scene.add(orb);
    state.visuals.three.orb = orb;

    // Floating particles (dust) in a sphere surrounding the orb
    const particleCount = 150;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount * 3; i += 3) {
        const u = Math.random();
        const v = Math.random();
        const theta = u * 2.0 * Math.PI;
        const phi = Math.acos(2.0 * v - 1.0);
        const r = 2.6 + Math.random() * 2.2;
        
        positions[i] = r * Math.sin(phi) * Math.cos(theta);
        positions[i+1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i+2] = r * Math.cos(phi);

        // Random cyan/purple color mix
        const isCyan = Math.random() > 0.4;
        colors[i] = isCyan ? 0.0 : 0.74; // R
        colors[i+1] = isCyan ? 0.94 : 0.0; // G
        colors[i+2] = isCyan ? 1.0 : 1.0; // B
    }

    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const particleMat = new THREE.PointsMaterial({
        size: 0.06,
        vertexColors: true,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending
    });

    const particleSystem = new THREE.Points(particleGeo, particleMat);
    scene.add(particleSystem);
    state.visuals.three.particles = particleSystem;

    // Neon Lights Setup
    const ambientLight = new THREE.AmbientLight(0x0a0c16, 1.6);
    scene.add(ambientLight);

    const lightCyan = new THREE.PointLight(0x00f0ff, 4, 30);
    lightCyan.position.set(-5, -3, 3);
    scene.add(lightCyan);
    state.visuals.three.lightCyan = lightCyan;

    const lightPink = new THREE.PointLight(0xff0055, 4, 30);
    lightPink.position.set(5, 5, 3);
    scene.add(lightPink);
    state.visuals.three.lightPink = lightPink;

    const frontLight = new THREE.DirectionalLight(0xffffff, 0.6);
    frontLight.position.set(0, 0, 10);
    scene.add(frontLight);

    state.visuals.three.clock = new THREE.Clock();

    // Handle global window resize
    window.addEventListener('resize', () => {
        const parent = renderer.domElement.parentElement;
        if (parent) {
            const width = parent.clientWidth;
            const height = parent.clientHeight;
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height);
        }
    });

    animateThreeJS();
}

function animateThreeJS() {
    requestAnimationFrame(animateThreeJS);

    const t = state.visuals.three;
    if (!t.orb || !t.clock) return;

    const time = t.clock.getElapsedTime();
    const stress = state.simulation.stressScore;
    const hr = state.simulation.currentHR;

    // Map biometric variables to 3D deformation variables
    let distortionScale = 0.025 + (stress / 100) * 0.16;
    let frequencyScale = 1.4 + (stress / 100) * 3.6;
    
    let pulseFrequency = (hr / 60) * 2.6;
    let rotationSpeed = 0.12 + (hr / 60) * 0.45;

    // Vertex displacement liquid wave
    const position = t.geometry.attributes.position;
    const original = t.originalPositions;
    const count = position.count;

    for (let i = 0; i < count; i++) {
        let ox = original.getX(i);
        let oy = original.getY(i);
        let oz = original.getZ(i);

        let r = Math.sqrt(ox*ox + oy*oy + oz*oz);
        let nx = ox / r;
        let ny = oy / r;
        let nz = oz / r;

        let wave = Math.sin(nx * frequencyScale + time * pulseFrequency) * 
                   Math.cos(ny * frequencyScale + time * pulseFrequency) * 
                   Math.sin(nz * frequencyScale + time * pulseFrequency);
                   
        let ripple = Math.cos((nx + ny + nz) * 2.2 + time * 1.6) * 0.35;
        
        let displacement = 1.0 + (wave + ripple) * distortionScale;

        position.setXYZ(i, ox * displacement, oy * displacement, oz * displacement);
    }
    position.needsUpdate = true;
    t.geometry.computeVertexNormals();

    // Scale pulsation based on paced breathing or simulated pulse
    let sizePulse = 1.0;
    if (state.breathing.active && state.breathing.stageStartTime) {
        const elapsed = (Date.now() - state.breathing.stageStartTime) / 1000;
        const progress = Math.min(1.0, elapsed / state.breathing.stageDuration);
        
        // easeInOutQuad
        const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        
        const scaleRange = state.breathing.targetScale - state.breathing.startScale;
        const currentScale = state.breathing.startScale + scaleRange * ease;
        
        sizePulse = 0.65 + (currentScale - 0.65) * 0.75;
    } else {
        sizePulse = 1.0 + Math.sin(time * pulseFrequency) * 0.025;
    }
    t.orb.scale.set(sizePulse, sizePulse, sizePulse);

    // Rotate Orb
    t.orb.rotation.y = time * rotationSpeed;
    t.orb.rotation.x = time * (rotationSpeed * 0.5);

    // Orbiting particle system
    if (t.particles) {
        t.particles.rotation.y = time * 0.06;
        t.particles.rotation.x = time * 0.02;
    }

    // Material color transitions
    let targetColor = new THREE.Color(0x00f3ff);
    let targetEmissive = new THREE.Color(0x00152b);

    if (state.breathing.active) {
        // Soothing green/teal visual feedback when breathing
        targetColor.setHex(0x00ff88);
        targetEmissive.setHex(0x002410);
        t.lightCyan.color.setHex(0x00ff88);
        t.lightPink.color.setHex(0x00f0ff);
    } else if (stress < 35) {
        targetColor.setHex(0x00f3ff);
        targetEmissive.setHex(0x00152b);
        t.lightCyan.color.setHex(0x00f0ff);
        t.lightPink.color.setHex(0xbd00ff);
    } else if (stress < 70) {
        const ratio = (stress - 35) / 35;
        targetColor.lerpColors(new THREE.Color(0x00f3ff), new THREE.Color(0xbd00ff), ratio);
        targetEmissive.lerpColors(new THREE.Color(0x00152b), new THREE.Color(0x1b0033), ratio);
        t.lightCyan.color.setHex(0x00f0ff);
        t.lightPink.color.setHex(0xff0055);
    } else {
        const ratio = Math.min(1.0, (stress - 70) / 30);
        targetColor.lerpColors(new THREE.Color(0xbd00ff), new THREE.Color(0xff0055), ratio);
        targetEmissive.lerpColors(new THREE.Color(0x1a0033), new THREE.Color(0x38000b), ratio);
        t.lightCyan.color.setHex(0xbd00ff);
        t.lightPink.color.setHex(0xff0055);
    }

    t.material.color.lerp(targetColor, 0.05);
    t.material.emissive.lerp(targetEmissive, 0.05);

    t.renderer.render(t.scene, t.camera);
}

/* =========================================================================
   4. ECG LIVE WAVEFORM SCANNER
   ========================================================================= */

function initWaveform() {
    const canvas = document.getElementById('live-waveform-canvas');
    if (!canvas) return;
    
    canvas.width = canvas.parentElement.clientWidth || 300;
    canvas.height = canvas.parentElement.clientHeight || 90;
    
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
    
    // Cyberpunk grid mesh background
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
    
    const hr = state.simulation.currentHR;
    const stress = state.simulation.stressScore;
    
    state.visuals.waveform.offset += 2.2 + (hr / 60) * 1.6;
    if (state.visuals.waveform.offset > w) {
        state.visuals.waveform.offset = 0;
    }
    
    const offset = state.visuals.waveform.offset;
    
    let strokeGrad = ctx.createLinearGradient(0, 0, w, 0);
    let colorStart = 'rgba(0, 240, 255, 0.8)';
    let colorEnd = 'rgba(0, 240, 255, 0.8)';
    
    if (stress < 35) {
        colorStart = 'rgba(0, 255, 136, 0.9)';
        colorEnd = 'rgba(0, 240, 255, 0.4)';
    } else if (stress < 70) {
        colorStart = 'rgba(189, 0, 255, 0.8)';
        colorEnd = 'rgba(0, 240, 255, 0.4)';
    } else {
        colorStart = 'rgba(255, 0, 85, 0.95)';
        colorEnd = 'rgba(189, 0, 255, 0.4)';
    }
    
    strokeGrad.addColorStop(Math.max(0, (offset - 40) / w), 'rgba(255,255,255,0.04)');
    strokeGrad.addColorStop(offset / w, colorStart);
    strokeGrad.addColorStop(Math.min(1.0, (offset + 10) / w), colorEnd);
    strokeGrad.addColorStop(Math.min(1.0, (offset + 60) / w), 'rgba(255,255,255,0.04)');
    
    ctx.beginPath();
    ctx.strokeStyle = strokeGrad;
    ctx.lineWidth = 2.5;
    ctx.shadowBlur = 8;
    ctx.shadowColor = stress > 70 ? 'rgba(255, 0, 85, 0.4)' : 'rgba(0, 240, 255, 0.4)';
    
    const midY = h / 2;
    const beatPeriod = 200;
    
    ctx.moveTo(0, midY);
    for (let x = 0; x < w; x++) {
        const relativeX = (x + offset) % beatPeriod;
        let yVal = midY;
        
        // ECG wave simulation components: P-Q-R-S-T
        if (relativeX > 20 && relativeX < 35) {
            yVal = midY - Math.sin((relativeX - 20) / 15 * Math.PI) * 4;
        } else if (relativeX >= 40 && relativeX < 45) {
            yVal = midY + (relativeX - 40) * 2.5;
        } else if (relativeX >= 45 && relativeX < 53) {
            const peakPos = 49;
            const dist = Math.abs(relativeX - peakPos);
            yVal = midY - 32 * (1 - dist / 4);
        } else if (relativeX >= 53 && relativeX < 59) {
            yVal = midY + 11 * (1 - Math.abs(relativeX - 56) / 3);
        } else if (relativeX >= 70 && relativeX < 95) {
            yVal = midY - Math.sin((relativeX - 70) / 25 * Math.PI) * 7;
        }
        
        ctx.lineTo(x, yVal);
    }
    
    ctx.stroke();
    ctx.shadowBlur = 0;
}

/* =========================================================================
   5. INTERACTIVE ANALYTICS CHARTS (DAILY STRESS TREND)
   ========================================================================= */

function initCharts() {
    const ctx = document.getElementById('stress-trend-chart');
    if (!ctx) return;
    
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

    // Chart live update loop
    setInterval(() => {
        if (!state.visuals.chart) return;
        
        const chart = state.visuals.chart;
        const currentScore = state.simulation.stressScore;
        
        const dataLength = chart.data.datasets[0].data.length;
        chart.data.datasets[0].data[dataLength - 1] = currentScore;
        
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
        
        chart.update('none');
    }, 2000);
}

/* =========================================================================
   6. CBT BREATHING LAB & AUDIO SYNTHESIS
   ========================================================================= */

function playPacedChime(frequency = 440, type = 'sine', duration = 0.8) {
    const audioToggle = document.getElementById('audio-toggle');
    if (audioToggle && !audioToggle.checked) return;

    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);

        // Soothing envelope
        gain.gain.setValueAtTime(0, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.12, audioCtx.currentTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch (err) {
        console.warn("Chime synthesis error:", err);
    }
}

function initBreathing() {
    const selectorOptions = document.querySelectorAll('.exercise-option');
    const controlBtn = document.getElementById('btn-breathing-control');
    const durationTimer = document.getElementById('breath-timer');
    const stageIndicator = document.getElementById('breathing-lab-stage');
    const instructionPrompt = document.getElementById('breathing-prompt');
    const circleOuter = document.getElementById('breath-circle-outer');
    const circleInner = document.getElementById('breath-circle-inner');

    const profiles = {
        box: {
            name: "Box Breathing",
            steps: [
                { stage: 'Inhale', duration: 4, prompt: 'Breathe in slowly through your nose...', scale: 1.35, freq: 587.33 }, // D5
                { stage: 'Hold', duration: 4, prompt: 'Suspend your breath, relax your jaw...', scale: 1.35, freq: 440.00 }, // A4
                { stage: 'Exhale', duration: 4, prompt: 'Let it go gently through your mouth...', scale: 0.7, freq: 349.23 },  // F4
                { stage: 'Hold', duration: 4, prompt: 'Hold empty before next cycle...', scale: 0.7, freq: 293.66 }       // D4
            ]
        },
        relax: {
            name: "4-7-8 Relaxing Breath",
            steps: [
                { stage: 'Inhale', duration: 4, prompt: 'Inhale silently through the nose...', scale: 1.4, freq: 587.33 },
                { stage: 'Hold', duration: 7, prompt: 'Retain the oxygen in your lungs...', scale: 1.4, freq: 440.00 },
                { stage: 'Exhale', duration: 8, prompt: 'Woosh out completely through your mouth...', scale: 0.65, freq: 349.23 }
            ]
        },
        scan: {
            name: "3D Body Scan",
            steps: [
                { stage: 'Head Focus', duration: 5, prompt: 'Bring awareness to forehead, neck, and jaw. Release tension.', scale: 1.2, freq: 523.25 }, // C5
                { stage: 'Chest & Shoulders', duration: 5, prompt: 'Drop your shoulders. Feel chest expand and release.', scale: 1.25, freq: 440.00 },
                { stage: 'Core & Breath', duration: 5, prompt: 'Feel your belly rise and fall. Breathe from diaphragm.', scale: 1.3, freq: 349.23 },
                { stage: 'Grounding Limbs', duration: 5, prompt: 'Relax your legs, hands, and feet. Let go completely.', scale: 1.0, freq: 261.63 } // C4
            ]
        }
    };

    selectorOptions.forEach(opt => {
        opt.addEventListener('click', (e) => {
            if (state.breathing.active) return;
            
            selectorOptions.forEach(b => b.classList.remove('active'));
            const target = e.target.closest('.exercise-option');
            target.classList.add('active');
            
            state.breathing.type = target.getAttribute('data-type');
            
            const activeProfile = profiles[state.breathing.type];
            if (state.breathing.type === 'scan') {
                circleInner.style.border = '2px solid var(--neon-purple)';
                circleInner.style.background = 'radial-gradient(circle, rgba(189, 0, 255, 0.2) 0%, rgba(189, 0, 255, 0) 70%)';
                circleInner.style.boxShadow = 'var(--purple-glow)';
            } else {
                circleInner.style.border = '2px solid var(--neon-green)';
                circleInner.style.background = 'radial-gradient(circle, rgba(0, 255, 136, 0.2) 0%, rgba(0, 255, 136, 0) 70%)';
                circleInner.style.boxShadow = 'var(--green-glow)';
            }
            
            stageIndicator.textContent = "Ready";
            instructionPrompt.textContent = `Paced to: ${activeProfile.name}. Press start to begin.`;
        });
    });

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
        
        // Set breathing simulation variables
        const sliderBreathing = document.getElementById('slider-breathing');
        if (sliderBreathing) sliderBreathing.value = 100;
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
            
            state.breathing.stageStartTime = Date.now();
            state.breathing.stageDuration = currentStep.duration;
            let prevIndex = (stepIndex - 1 + profile.steps.length) % profile.steps.length;
            state.breathing.startScale = stepIndex === 0 ? 1.0 : profile.steps[prevIndex].scale;
            state.breathing.targetScale = currentStep.scale;
            
            // Audio cue trigger
            playPacedChime(currentStep.freq, 'sine', 1.0);
            
            // Update labels
            stageIndicator.textContent = currentStep.stage.toUpperCase();
            if (state.breathing.type === 'scan') {
                stageIndicator.style.color = 'var(--neon-purple)';
            } else {
                stageIndicator.style.color = currentStep.stage === 'Inhale' ? 'var(--neon-cyan)' : 'var(--neon-green)';
            }
            
            instructionPrompt.textContent = currentStep.prompt;
            durationTimer.textContent = timeRemaining;
            
            circleInner.style.transform = `scale(${currentStep.scale})`;
            circleOuter.style.transform = `scale(${currentStep.scale + 0.15})`;
            
            circleInner.style.transition = `transform ${currentStep.duration}s cubic-bezier(0.4, 0, 0.2, 1)`;
            circleOuter.style.transition = `transform ${currentStep.duration}s cubic-bezier(0.4, 0, 0.2, 1)`;

            // Countdown sub-timer loop
            clearInterval(state.breathing.intervalId);
            state.breathing.intervalId = setInterval(() => {
                timeRemaining--;
                durationTimer.textContent = timeRemaining;
                
                if (timeRemaining <= 0) {
                    clearInterval(state.breathing.intervalId);
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
        
        controlBtn.textContent = "Start Breathing Session";
        controlBtn.classList.remove('btn-secondary');
        controlBtn.classList.add('btn-primary');
        
        const sliderBreathing = document.getElementById('slider-breathing');
        if (sliderBreathing) sliderBreathing.value = 0;
        state.simulation.breathing = 0;
        calculateTelemetry();
        
        stageIndicator.textContent = "Ready";
        stageIndicator.style.color = 'var(--text-secondary)';
        instructionPrompt.textContent = "Session ended. Breathe normally.";
        durationTimer.textContent = "00";
        
        circleInner.style.transform = 'scale(1)';
        circleOuter.style.transform = 'scale(1)';
        circleInner.style.transition = 'transform 0.4s ease';
        circleOuter.style.transition = 'transform 0.4s ease';
    }
}

/* =========================================================================
   7. STRESS JOURNAL & CBT RECONSTRUCTING TIMELINE
   ========================================================================= */

function initJournal() {
    const journalText = document.getElementById('journal-text');
    const moodTags = document.querySelectorAll('.mood-tags .mood-tag');
    const submitBtn = document.getElementById('btn-submit-journal');
    const aiCoachPanel = document.getElementById('ai-coach-panel');
    const distortionText = document.getElementById('cbt-distortion-text');
    const reframeText = document.getElementById('cbt-reframe-text');

    // Mood Tag Click selectors
    moodTags.forEach(tag => {
        tag.addEventListener('click', (e) => {
            moodTags.forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            state.journal.mood = e.target.getAttribute('data-mood');
            
            // Influence biometric simulator based on tagged mood
            const sliderAnxiety = document.getElementById('slider-anxiety');
            if (state.journal.mood === 'anxious' || state.journal.mood === 'overwhelmed') {
                state.simulation.anxiety = Math.max(state.simulation.anxiety, 65);
                if (sliderAnxiety) sliderAnxiety.value = state.simulation.anxiety;
            } else if (state.journal.mood === 'calm') {
                state.simulation.anxiety = Math.min(state.simulation.anxiety, 20);
                if (sliderAnxiety) sliderAnxiety.value = state.simulation.anxiety;
            }
            calculateTelemetry();
        });
    });

    submitBtn.addEventListener('click', () => {
        const text = journalText.value.trim().toLowerCase();
        
        if (!text) {
            alert("Please type a few thoughts in your stress journal.");
            return;
        }

        submitBtn.textContent = "Analyzing thoughts...";
        submitBtn.disabled = true;

        setTimeout(() => {
            let distortion = "General Stress Accumulation";
            let reframe = "Take a step back. Recognize that your current stress feels intense, but it is temporary. You are safe, and you can solve problems step-by-step.";

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

            // Display values on coach panel card
            distortionText.textContent = distortion;
            reframeText.textContent = reframe;
            aiCoachPanel.classList.remove('hidden');
            
            submitBtn.textContent = "Analyze thoughts (AI)";
            submitBtn.disabled = false;

            // Push to local timeline list
            const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const dateStr = new Date().toLocaleDateString([], { month: 'short', day: 'numeric' });
            
            state.journal.logs.unshift({
                text: journalText.value.trim(),
                mood: state.journal.mood || "neutral",
                distortion: distortion,
                reframe: reframe,
                time: timestamp,
                date: dateStr
            });

            // Update UI timeline
            renderJournalHistory();
            
            // Clear textarea
            journalText.value = "";
            moodTags.forEach(t => t.classList.remove('active'));
            state.journal.mood = null;

            // Trigger temporary stress spike representing writing/recalling the stress event
            const originalAnxiety = state.simulation.anxiety;
            state.simulation.anxiety = Math.min(100, originalAnxiety + 15);
            calculateTelemetry();
            
            // Slowly resolve the stress spike after 10 seconds representing cognitive restructuring
            setTimeout(() => {
                state.simulation.anxiety = originalAnxiety;
                calculateTelemetry();
            }, 10000);
            
        }, 1200);
    });
}

function renderJournalHistory() {
    const timeline = document.getElementById('journal-history-timeline');
    if (!timeline) return;

    if (state.journal.logs.length === 0) {
        timeline.innerHTML = `
            <div class="empty-timeline-message">
                <i data-lucide="book-open" class="empty-icon"></i>
                <p>No journal entries logged yet. Your cognitive reframing entries will appear here.</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    timeline.innerHTML = state.journal.logs.map((log) => `
        <div class="timeline-item">
            <div class="timeline-item-meta">
                <span class="timeline-item-date">${log.date} @ ${log.time}</span>
                <span class="timeline-item-mood ${log.mood}">${log.mood.toUpperCase()}</span>
            </div>
            <div class="timeline-item-thought">"${log.text}"</div>
            <div class="timeline-item-cbt">
                <div class="timeline-item-distortion">${log.distortion}</div>
                <div class="timeline-item-reframe"><strong>Reframe:</strong> ${log.reframe}</div>
            </div>
        </div>
    `).join('');

    lucide.createIcons();
}

/* =========================================================================
   8. WEEKLY REPORT RECALCULATION & TRIGGER METRICS
   ========================================================================= */

function updateWeeklyReport() {
    const s = state.simulation;
    const logs = state.journal.logs;

    // Calculate dynamic stats
    let avgStress = Math.round(s.stressScore * 0.7 + 35);
    if (logs.length > 0) {
        avgStress = Math.max(10, avgStress - logs.length * 4);
    }

    let avgHRV = Math.round(s.currentHRV * 0.85 + 40);
    if (logs.length > 0) {
        avgHRV = Math.min(130, avgHRV + logs.length * 3);
    }

    let avgHR = Math.round(s.currentHR * 0.8 + 12);
    let mindfulMins = 12 + logs.length * 4;

    // Write values
    const weeklyStressText = document.getElementById('insight-weekly-stress');
    const weeklyHrvText = document.getElementById('insight-weekly-hrv');
    const weeklyHrText = document.getElementById('insight-weekly-hr');
    const weeklyBreathingText = document.getElementById('insight-weekly-breathing');

    if (weeklyStressText) weeklyStressText.textContent = avgStress;
    if (weeklyHrvText) weeklyHrvText.textContent = avgHRV;
    if (weeklyHrText) weeklyHrText.textContent = Math.round(avgHR);
    if (weeklyBreathingText) weeklyBreathingText.textContent = mindfulMins;

    // Update low/mod/high status badge
    const badge = document.querySelector('.insight-stat-card .stat-label-badge');
    if (badge) {
        if (avgStress < 35) {
            badge.textContent = "Optimized";
            badge.className = "stat-label-badge low-stress";
            badge.style.backgroundColor = "rgba(0, 255, 136, 0.1)";
            badge.style.color = "var(--neon-green)";
        } else if (avgStress < 60) {
            badge.textContent = "Moderate";
            badge.className = "stat-label-badge alert-stress";
            badge.style.backgroundColor = "rgba(0, 243, 255, 0.1)";
            badge.style.color = "var(--neon-cyan)";
        } else {
            badge.textContent = "Elevated";
            badge.className = "stat-label-badge high-stress";
            badge.style.backgroundColor = "rgba(255, 0, 85, 0.1)";
            badge.style.color = "var(--neon-pink)";
        }
    }

    // Render Stress Triggers progress bars list
    const triggersContainer = document.getElementById('triggers-list-container');
    if (triggersContainer) {
        const triggerData = [
            { label: "Mental Anxiety & Stressors", val: s.anxiety, class: "anxiety" },
            { label: "Caffeine & Stimulants", val: s.caffeine, class: "caffeine" },
            { label: "Physical Exertion & Fatigue", val: s.activity, class: "activity" },
            { label: "Vagal nerve suppression (shallow breathing)", val: 100 - s.breathing, class: "breathing" }
        ];

        triggersContainer.innerHTML = triggerData.map(t => `
            <div class="trigger-row">
                <div class="trigger-meta">
                    <span class="trigger-label">${t.label}</span>
                    <span class="trigger-val">${t.val}%</span>
                </div>
                <div class="trigger-bar-track">
                    <div class="trigger-bar-fill ${t.class}" style="width: ${t.val}%;"></div>
                </div>
            </div>
        `).join('');
    }

    // Update zone distributions
    let calmZone = Math.round(100 - s.anxiety);
    let stressZone = Math.round(s.anxiety * 0.4);
    let alertZone = Math.round(s.anxiety * 0.3 + s.activity * 0.3);
    let balancedZone = Math.max(0, 100 - (calmZone + stressZone + alertZone));
    
    const sum = calmZone + stressZone + alertZone + balancedZone;
    if (sum > 0) {
        calmZone = Math.round((calmZone / sum) * 100);
        balancedZone = Math.round((balancedZone / sum) * 100);
        alertZone = Math.round((alertZone / sum) * 100);
        stressZone = 100 - (calmZone + balancedZone + alertZone);
    }

    const pctCalm = document.getElementById('pct-zone-calm');
    const fillCalm = document.getElementById('fill-zone-calm');
    const pctBalanced = document.getElementById('pct-zone-balanced');
    const fillBalanced = document.getElementById('fill-zone-balanced');
    const pctAlert = document.getElementById('pct-zone-alert');
    const fillAlert = document.getElementById('fill-zone-alert');
    const pctStress = document.getElementById('pct-zone-stress');
    const fillStress = document.getElementById('fill-zone-stress');

    if (pctCalm) pctCalm.textContent = calmZone + "%";
    if (fillCalm) fillCalm.style.width = calmZone + "%";
    if (pctBalanced) pctBalanced.textContent = balancedZone + "%";
    if (fillBalanced) fillBalanced.style.width = balancedZone + "%";
    if (pctAlert) pctAlert.textContent = alertZone + "%";
    if (fillAlert) fillAlert.style.width = alertZone + "%";
    if (pctStress) pctStress.textContent = stressZone + "%";
    if (fillStress) fillStress.style.width = stressZone + "%";

    // CBT pattern mapping
    let distortionPattern = "None Detected";
    let distortionDesc = "Log your feelings in the Stress Journal to allow the AI to extract cognitive patterns and map behavioral trends.";
    
    if (logs.length > 0) {
        const counts = {};
        logs.forEach(log => {
            counts[log.distortion] = (counts[log.distortion] || 0) + 1;
        });
        
        let maxDist = "";
        let maxCount = 0;
        Object.keys(counts).forEach(k => {
            if (counts[k] > maxCount) {
                maxCount = counts[k];
                maxDist = k;
            }
        });

        distortionPattern = maxDist;
        
        if (maxDist.includes("All-or-Nothing")) {
            distortionDesc = "You show a tendency to view events in rigid, black-and-white categories. This heightens autonomic response by treating minor setbacks as total failures.";
        } else if (maxDist.includes("Catastrophizing")) {
            distortionDesc = "You frequently project worst-case scenarios. This locks your amygdala into constant high-alert states, elevating resting heart rate.";
        } else if (maxDist.includes("Emotional")) {
            distortionDesc = "You treat subjective emotional spikes as absolute objective reality, confusing 'feeling overwhelmed' with 'being incapable'.";
        } else if (maxDist.includes("Personalization")) {
            distortionDesc = "You internalize blame for stress variables outside your agency, overloading cognitive capacity and suppressing daily HRV.";
        } else {
            distortionDesc = "General stressors are piling up. Continuous journaling will help map specific cognitive biases.";
        }
    }

    const cbtPattern = document.getElementById('insight-cbt-distortion-pattern');
    const cbtDesc = document.getElementById('insight-cbt-distortion-desc');
    if (cbtPattern) cbtPattern.textContent = distortionPattern;
    if (cbtDesc) cbtDesc.textContent = distortionDesc;

    // Interventions mapping
    const recsList = document.getElementById('insights-recommendations-list');
    if (recsList) {
        let recs = [
            `Continue tracking your average autonomic score (${avgStress}) on the dashboard.`,
            "Complete 5 minutes of Box Paced breathing when simulator levels cross 60%.",
            "Keep journal descriptions specific to events rather than broad statements."
        ];
        if (distortionPattern.includes("All-or-Nothing")) {
            recs = [
                "Practice identifying 'grey areas' in daily stressors (e.g. rate outcomes from 1-10 instead of pass/fail).",
                "Do a 4-7-8 Relaxing Breath session to downregulate emergency neural signals.",
                "Log another journal entry focusing strictly on facts rather than generalizations."
            ];
        } else if (distortionPattern.includes("Catastrophizing")) {
            recs = [
                "Write down the realistic best-case scenario next to the worst-case, then estimate the mathematical odds of each.",
                "Use the 3D Body Scan exercise to ground your focus inside physical sensations, breaking panic feedback loops.",
                "Limit stimulant/caffeine intake to below 30% on the simulator slider."
            ];
        } else if (distortionPattern.includes("Emotional")) {
            recs = [
                "Remind yourself: 'My anxiety is a wave of adrenaline, not a factual report on my life situation.'",
                "Do Box breathing specifically to physically lower heart rate when emotional intensity spikes.",
                "Review reframes from past entries in the history panel."
            ];
        }

        recsList.innerHTML = recs.map((r, i) => {
            const colors = ['text-cyan', 'text-green', 'text-purple'];
            const icons = ['check-circle', 'wind', 'edit-3'];
            return `<li><i data-lucide="${icons[i]}" class="li-icon ${colors[i]}"></i> ${r}</li>`;
        }).join('');

        lucide.createIcons();
    }
}

/* =========================================================================
   9. 3D CARD PERSPECTIVE TILT TRACKING
   ========================================================================= */

function init3DTilts() {
    const cards = document.querySelectorAll('.tilt-card');
    
    cards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const cardWidth = rect.width;
            const cardHeight = rect.height;
            
            const xPercent = (x / cardWidth) - 0.5;
            const yPercent = (y / cardHeight) - 0.5;
            
            const rotateX = -yPercent * 12;
            const rotateY = xPercent * 12;
            
            card.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px)`;
            card.style.boxShadow = `0 20px 40px rgba(0, 0, 0, 0.45), 0 0 20px rgba(0, 240, 255, 0.05)`;
            card.style.borderColor = `rgba(255, 255, 255, ${0.08 + Math.abs(xPercent) * 0.15})`;
        });
        
        card.addEventListener('mouseleave', () => {
            card.style.transform = 'rotateX(0deg) rotateY(0deg) translateY(0)';
            card.style.boxShadow = 'none';
            card.style.borderColor = 'var(--border-color)';
            card.style.transition = 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1), box-shadow 0.3s ease, border-color 0.3s ease';
        });
        
        card.addEventListener('mouseenter', () => {
            card.style.transition = 'transform 0.08s ease, box-shadow 0.3s ease, border-color 0.3s ease';
        });
    });
}
