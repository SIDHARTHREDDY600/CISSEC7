const SERVER_CAPACITY = 10;
let serversPrimary = [];
let serversSecondary = [];
let chartPrimary = null;
let chartSecondary = null;
let isSimulating = false;
let stepResolve = null;

// DOM Elements
const startBtn = document.getElementById('start-btn');
const stepBtn = document.getElementById('step-btn');
const simSpeedSelect = document.getElementById('simSpeed');
const algoSelect = document.getElementById('algorithm');
const particleContainer = document.getElementById('particle-container');

// Settings
let isDualMode = false;

function initCharts() {
    if (chartPrimary) chartPrimary.destroy();
    if (chartSecondary) chartSecondary.destroy();

    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            y: { beginAtZero: true, grid: { color: '#e2e8f0' }, ticks: { font: { family: "'Inter', sans-serif" } } },
            x: { grid: { display: false }, ticks: { font: { family: "'Outfit', sans-serif", weight: 'bold' } } }
        },
        plugins: { legend: { display: false } },
        animation: { duration: 200 }
    };

    const ctxPrimary = document.getElementById('trafficChart').getContext('2d');
    chartPrimary = new Chart(ctxPrimary, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: 'Active Connections',
                data: [],
                backgroundColor: '#ff6bca',
                borderColor: '#121212',
                borderWidth: 3,
                borderRadius: 5,
            }]
        },
        options: commonOptions
    });

    const ctxSecondary = document.getElementById('trafficChartSecondary').getContext('2d');
    chartSecondary = new Chart(ctxSecondary, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: 'Active Connections',
                data: [],
                backgroundColor: '#9fb3ff',
                borderColor: '#121212',
                borderWidth: 3,
                borderRadius: 5,
            }]
        },
        options: commonOptions
    });
}

function handleAlgoChange() {
    isDualMode = (algoSelect.value === 'dualMode');
    const container = document.getElementById('simulation-container');
    const primaryWrapper = document.getElementById('primary-grid-wrapper');
    const secondaryWrapper = document.getElementById('secondary-grid-wrapper');
    const primaryTitle = document.getElementById('primary-grid-title');
    const primaryChart = document.getElementById('primary-chart-container');
    const secondaryChart = document.getElementById('secondary-chart-container');

    if (isDualMode) {
        container.classList.add('dual-active');
        primaryTitle.style.display = 'block';
        secondaryWrapper.style.display = 'block';
        secondaryChart.style.display = 'block';
        document.getElementById('primary-chart-title').innerText = "Round Robin Traffic";
    } else {
        container.classList.remove('dual-active');
        primaryTitle.style.display = 'none';
        secondaryWrapper.style.display = 'none';
        secondaryChart.style.display = 'none';
        document.getElementById('primary-chart-title').innerText = "Current Traffic Distribution";
    }
}
algoSelect.addEventListener('change', handleAlgoChange);

function buildServers(count) {
    let arr = [];
    for (let i = 1; i <= count; i++) {
        arr.push({ id: i, connections: 0, capacity: SERVER_CAPACITY, active: true });
    }
    return arr;
}

window.togglePower = function(serverId, prefix) {
    const servers = prefix === 'p' ? serversPrimary : serversSecondary;
    const server = servers.find(s => s.id === serverId);
    if (!server) return;
    
    server.active = !server.active;
    if (!server.active) {
        // If turned off, drop all connections to simulate crash
        server.connections = 0;
    }
    
    updateServerUI(server, prefix);
    triggerChartUpdate();
    updateMetrics();
}

function renderServers(servers, gridId, prefix) {
    const grid = document.getElementById(gridId);
    grid.innerHTML = '';
    
    servers.forEach(server => {
        const card = document.createElement('div');
        card.className = `server-card ${server.connections > server.capacity ? 'overloaded' : ''}`;
        if(!server.active) card.classList.add('offline');
        
        card.id = `server-${prefix}-${server.id}`;
        
        let percentage = (server.connections / server.capacity) * 100;
        let clampedPercentage = Math.min(percentage, 100);

        card.innerHTML = `
            <div class="server-header">
                <span class="server-id">SRV ${server.id}</span>
                <div class="server-controls">
                    <div class="status-indicator" id="ind-${prefix}-${server.id}"></div>
                    <button class="power-btn" onclick="togglePower(${server.id}, '${prefix}')">⏻</button>
                </div>
            </div>
            <div class="server-body">
                <div class="stat-group">
                    <div class="stat-label">Conns</div>
                    <div class="stat-value" id="val-${prefix}-${server.id}">${server.connections}</div>
                </div>
                <div class="progress-bar-container">
                    <div class="progress-bar" id="bar-${prefix}-${server.id}" style="width: ${clampedPercentage}%"></div>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

function updateServerUI(server, prefix) {
    const card = document.getElementById(`server-${prefix}-${server.id}`);
    const val = document.getElementById(`val-${prefix}-${server.id}`);
    const bar = document.getElementById(`bar-${prefix}-${server.id}`);
    
    if (card) {
        if (!server.active) {
            card.className = "server-card offline";
            val.innerText = "0";
            bar.style.width = "0%";
            return;
        }

        val.innerText = server.connections;
        let percentage = (server.connections / server.capacity) * 100;
        let clampedPercentage = Math.min(percentage, 100);
        bar.style.width = `${clampedPercentage}%`;

        card.className = "server-card active-pulse";
        if (server.connections > server.capacity) {
            card.classList.add('overloaded');
        }
    }
}

function triggerChartUpdate() {
    chartPrimary.data.labels = serversPrimary.map(s => `SRV ${s.id}`);
    chartPrimary.data.datasets[0].data = serversPrimary.map(s => s.connections);
    chartPrimary.update();

    if (isDualMode) {
        chartSecondary.data.labels = serversSecondary.map(s => `SRV ${s.id}`);
        chartSecondary.data.datasets[0].data = serversSecondary.map(s => s.connections);
        chartSecondary.update();
    }
}

function updateMetrics() {
    // Only analyze tracking servers (secondary if dual, else primary)
    const activeServers = (isDualMode ? serversSecondary : serversPrimary).filter(s => s.active);
    
    // 1. Avg Response Time Simulator
    let avgTime = 0;
    if (activeServers.length > 0) {
        const totalConns = activeServers.reduce((sum, s) => sum + s.connections, 0);
        // Base latency 50ms + connections factor
        avgTime = 50 + (totalConns / activeServers.length) * 15;
    }
    document.getElementById('metric-response').innerText = `~ ${Math.round(avgTime)}ms`;

    // 2. Load Balance
    let balance = 100;
    if (activeServers.length > 1) {
        const conns = activeServers.map(s => s.connections);
        const max = Math.max(...conns);
        const min = Math.min(...conns);
        if (max > 0) {
            balance = Math.max(0, 100 - ((max - min) / max * 100));
        }
    } else if (activeServers.length === 0) {
        balance = 0;
    }
    document.getElementById('metric-balance').innerText = `${Math.round(balance)}%`;

    // 3. Overloaded Count
    const overloadedCount = activeServers.filter(s => s.connections > s.capacity).length;
    document.getElementById('metric-overload').innerText = `${overloadedCount} / ${activeServers.length}`;
}

async function spawnParticle(targetPrefix, targetId) {
    const btnRect = startBtn.getBoundingClientRect();
    const targetCard = document.getElementById(`server-${targetPrefix}-${targetId}`);
    if (!targetCard) return;

    const targetRect = targetCard.getBoundingClientRect();
    
    const particle = document.createElement('div');
    particle.className = 'request-particle';
    
    // Start coords (near the button)
    const startX = btnRect.left + (btnRect.width / 2) - 12;
    const startY = btnRect.top - 12;
    
    // End coords (middle of the card)
    const endX = targetRect.left + (targetRect.width / 2) - 12;
    const endY = targetRect.top + (targetRect.height / 2) - 12;
    
    particle.style.left = `${startX}px`;
    particle.style.top = `${startY}px`;
    
    particleContainer.appendChild(particle);

    // Calculate dynamic duration based on settings, cap animation time so it feels good
    let speedSetting = simSpeedSelect.value;
    let animDuration = 400; // default 400ms
    if(speedSetting === '50') animDuration = 150; // fast
    if(speedSetting === '1000') animDuration = 800; // slow
    
    particle.animate([
        { transform: `translate(0px, 0px) scale(1)` },
        { transform: `translate(${(endX - startX)/2}px, ${(endY - startY)/4 - 50}px) scale(1.5)` },
        { transform: `translate(${endX - startX}px, ${endY - startY}px) scale(0.5)` }
    ], {
        duration: animDuration,
        easing: 'cubic-bezier(0.25, 1, 0.5, 1)'
    });

    setTimeout(() => {
        if(particle.parentNode) particle.remove();
    }, animDuration);
    
    return new Promise(resolve => setTimeout(resolve, animDuration));
}

function getNextSleep() {
    return new Promise(resolve => {
        if (simSpeedSelect.value === 'step') {
            stepBtn.style.display = 'inline-block';
            stepResolve = resolve;
        } else {
            stepBtn.style.display = 'none';
            setTimeout(resolve, parseInt(simSpeedSelect.value));
        }
    });
}

window.triggerNextStep = function() {
    if (stepResolve) {
        let temp = stepResolve;
        stepResolve = null;
        temp();
    }
}

async function runSimulation() {
    if (isSimulating) return;
    
    const numServers = parseInt(document.getElementById('serverCount').value);
    const numRequests = parseInt(document.getElementById('requestCount').value);
    
    if (numServers < 1 || numRequests < 1) return;

    isSimulating = true;
    startBtn.disabled = true;
    startBtn.innerText = 'SIMULATING...';
    
    // Setup
    isDualMode = (algoSelect.value === 'dualMode');
    serversPrimary = buildServers(numServers);
    renderServers(serversPrimary, 'server-grid', 'p');
    
    serversSecondary = [];
    if (isDualMode) {
        serversSecondary = buildServers(numServers);
        renderServers(serversSecondary, 'server-grid-secondary', 's');
    }

    initCharts();
    triggerChartUpdate();
    updateMetrics();

    document.querySelector('.server-section').scrollIntoView({ behavior: 'smooth' });
    
    let rrIndexPrimary = 0;
    
    for (let req = 1; req <= numRequests; req++) {
        
        let algoPrimary = isDualMode ? 'roundRobin' : algoSelect.value;
        let activeP = serversPrimary.filter(s => s.active);
        
        // Execute Primary Grid logic
        if (activeP.length > 0) {
            let targetServerP = null;
            if (algoPrimary === 'roundRobin') {
                targetServerP = activeP[rrIndexPrimary % activeP.length];
                rrIndexPrimary++;
            } else if (algoPrimary === 'leastConnections') {
                targetServerP = activeP.reduce((prev, curr) => (prev.connections < curr.connections) ? prev : curr);
            }
            // Animate and apply
            await spawnParticle('p', targetServerP.id);
            targetServerP.connections++;
            updateServerUI(targetServerP, 'p');
        }

        // Execute Secondary Grid logic if Dual Mode
        if (isDualMode) {
            let activeS = serversSecondary.filter(s => s.active);
            if (activeS.length > 0) {
                let targetServerS = activeS.reduce((prev, curr) => (prev.connections < curr.connections) ? prev : curr);
                // Animate and apply
                spawnParticle('s', targetServerS.id); // fire parallel visual
                targetServerS.connections++;
                updateServerUI(targetServerS, 's');
            }
        }

        triggerChartUpdate();
        updateMetrics();
        
        await getNextSleep();
    }
    
    isSimulating = false;
    startBtn.disabled = false;
    startBtn.innerText = 'START SIMULATION';
    stepBtn.style.display = 'none';
}

window.startSimulation = runSimulation;

window.addEventListener('DOMContentLoaded', () => {
    handleAlgoChange();
    initCharts();
});
