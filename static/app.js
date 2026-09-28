/**
 * OmniScribe Air - Client Controller
 * Manages WebSocket live streaming, PII rendering, and hardware telemetry displays.
 */

let currentMode = 'clinical';
let socket = null;
let piiCount = 0;
let lastStructuredData = null;

function switchMode(mode) {
  currentMode = mode;
  document.getElementById('btn-mode-clinical').classList.toggle('active', mode === 'clinical');
  document.getElementById('btn-mode-legal').classList.toggle('active', mode === 'legal');
  
  const docTitle = document.getElementById('doc-title');
  if (mode === 'clinical') {
    docTitle.innerText = "Structured Clinical SOAP Document (HIPAA / FHIR)";
  } else {
    docTitle.innerText = "Structured Legal Deposition Matrix (Privileged)";
  }
  
  resetSession();
}

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/stream`;
  
  socket = new WebSocket(wsUrl);
  
  socket.onopen = () => {
    console.log('[+] WebSocket connected to OmniScribe Air Core.');
  };
  
  socket.onmessage = (event) => {
    const payload = JSON.parse(event.data);
    
    if (payload.type === 'turn') {
      renderTurn(payload.data);
      updateTelemetry(payload.data.telemetry);
    } else if (payload.type === 'final_summary') {
      renderStructuredOutput(payload.data.structured_output);
      updateTelemetry(payload.data.telemetry);
      stopAudioIndicator();
    }
  };
  
  socket.onclose = () => {
    console.log('[-] WebSocket closed. Reconnecting...');
    setTimeout(connectWebSocket, 2000);
  };
}

function startStreaming() {
  const startBtn = document.getElementById('btn-start');
  startBtn.disabled = true;
  startBtn.innerHTML = `<span class="btn-icon">⏳</span> Ingesting NPU Stream...`;
  
  document.getElementById('audio-indicator').classList.add('active');
  document.getElementById('transcript-feed').innerHTML = '';
  document.getElementById('structured-content').innerHTML = `
    <div class="output-placeholder">
      <div class="spinner-idle" style="border: 2px solid var(--snap-gold); border-top-color: transparent; border-radius: 50%; width: 24px; height: 24px; animation: spin 1s linear infinite;"></div>
      <p style="margin-top: 10px;">Synthesizing structured intelligence via Hexagon NPU SLM...</p>
    </div>
  `;
  
  piiCount = 0;
  document.getElementById('pii-banner').style.display = 'flex';
  document.getElementById('pii-count').innerText = '0';
  
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    connectWebSocket();
    setTimeout(() => {
      socket.send(JSON.stringify({ action: 'start_session', mode: currentMode }));
    }, 500);
  } else {
    socket.send(JSON.stringify({ action: 'start_session', mode: currentMode }));
  }
}

function renderTurn(data) {
  const feed = document.getElementById('transcript-feed');
  
  // Format sanitized text with visual red badges for scrubbed PII
  let displayText = data.sanitized_text;
  displayText = displayText.replace(/\[REDACTED_([A-Z_]+)\]/g, '<span class="redacted-badge">🔒 [REDACTED_$1]</span>');
  
  if (data.pii_detected && data.pii_detected.length > 0) {
    piiCount += data.pii_detected.length;
    document.getElementById('pii-count').innerText = piiCount;
  }
  
  const turnEl = document.createElement('div');
  turnEl.className = 'turn-bubble';
  turnEl.innerHTML = `
    <div class="turn-speaker">${data.speaker}</div>
    <div class="turn-text">${displayText}</div>
  `;
  feed.appendChild(turnEl);
  feed.scrollTop = feed.scrollHeight;
}

function renderStructuredOutput(structured) {
  lastStructuredData = structured;
  const container = document.getElementById('structured-content');
  container.innerHTML = '';
  
  if (currentMode === 'clinical') {
    container.innerHTML = `
      <div class="schema-block">
        <div class="schema-heading">Subjective</div>
        <div class="schema-val"><strong>Chief Complaint:</strong> ${structured.subjective.chief_complaint}</div>
        <div class="schema-val" style="margin-top: 4px;"><strong>HPI:</strong> ${structured.subjective.history_of_present_illness}</div>
      </div>
      <div class="schema-block">
        <div class="schema-heading">Objective</div>
        <div class="schema-val"><strong>Vitals:</strong> ${structured.objective.vital_signs}</div>
        <div class="schema-val" style="margin-top: 4px;"><strong>Exam:</strong> ${structured.objective.physical_examination}</div>
      </div>
      <div class="schema-block">
        <div class="schema-heading">Assessment</div>
        <div class="schema-val"><strong>Primary Diagnosis:</strong> ${structured.assessment.primary_diagnosis}</div>
        <div class="schema-val" style="margin-top: 4px;"><strong>ICD-10 Code:</strong> <span class="redacted-badge" style="color: #68d391; border-color: #38a169; background: rgba(56, 161, 105, 0.2);">${structured.assessment.icd_10_code}</span></div>
      </div>
      <div class="schema-block">
        <div class="schema-heading">Plan</div>
        <div class="schema-val"><strong>Diagnostics:</strong> ${structured.plan.diagnostics}</div>
        <div class="schema-val" style="margin-top: 4px;"><strong>Rx:</strong> ${structured.plan.medications}</div>
        <div class="schema-val" style="margin-top: 4px;"><strong>Follow-up:</strong> ${structured.plan.follow_up}</div>
      </div>
    `;
  } else {
    container.innerHTML = `
      <div class="schema-block">
        <div class="schema-heading">Matter Summary</div>
        <div class="schema-val">${structured.matter_summary}</div>
      </div>
      <div class="schema-block">
        <div class="schema-heading">Key Sworn Admissions</div>
        <ul style="padding-left: 18px; margin-top: 4px;">
          ${structured.testimony_key_admissions.map(adm => `<li class="schema-val" style="margin-bottom: 4px;">${adm}</li>`).join('')}
        </ul>
      </div>
      <div class="schema-block">
        <div class="schema-heading">Contractual Risk Exposure</div>
        <div class="schema-val"><strong>Contested Clauses:</strong> ${structured.contractual_risk_analysis.contested_clauses.join(', ')}</div>
        <div class="schema-val" style="margin-top: 4px;"><strong>Statutory Exposure:</strong> ${structured.contractual_risk_analysis.statutory_exposure}</div>
        <div class="schema-val" style="margin-top: 4px;"><strong>Risk Rating:</strong> <span class="redacted-badge">${structured.contractual_risk_analysis.litigation_risk_level}</span></div>
      </div>
      <div class="schema-block">
        <div class="schema-heading">Recommended Counsel Actions</div>
        <ul style="padding-left: 18px; margin-top: 4px;">
          ${structured.action_items.map(act => `<li class="schema-val" style="margin-bottom: 4px;">${act}</li>`).join('')}
        </ul>
      </div>
    `;
  }
  
  const startBtn = document.getElementById('btn-start');
  startBtn.disabled = false;
  startBtn.innerHTML = `<span class="btn-icon">🎙️</span> Start Ambient Capture`;
}

function updateTelemetry(telemetry) {
  if (!telemetry) return;
  document.getElementById('npu-lat').innerText = `${telemetry.npu.latency_ms} ms`;
  document.getElementById('npu-power').innerText = `${telemetry.npu.power_watts} Watts`;
  document.getElementById('npu-battery').innerText = `${telemetry.npu.battery_projected_hours} Hours`;
  
  document.getElementById('cpu-lat').innerText = `${telemetry.cpu_baseline.latency_ms} ms`;
  document.getElementById('cpu-power').innerText = `${telemetry.cpu_baseline.power_watts} Watts`;
  document.getElementById('cpu-battery').innerText = `${telemetry.cpu_baseline.battery_projected_hours} Hours`;
}

function stopAudioIndicator() {
  document.getElementById('audio-indicator').classList.remove('active');
}

function resetSession() {
  stopAudioIndicator();
  document.getElementById('transcript-feed').innerHTML = `
    <div class="feed-placeholder">
      <p>Ready to capture ambient consultation audio.</p>
      <p class="placeholder-hint">Click <strong>"Start Ambient Capture"</strong> to demonstrate real-time Whisper NPU streaming & immediate PII sanitization.</p>
    </div>
  `;
  document.getElementById('structured-content').innerHTML = `
    <div class="output-placeholder">
      <div class="spinner-idle"></div>
      <p>Awaiting continuous speech stream to synthesize structured JSON schema.</p>
    </div>
  `;
  document.getElementById('pii-banner').style.display = 'none';
  const startBtn = document.getElementById('btn-start');
  startBtn.disabled = false;
  startBtn.innerHTML = `<span class="btn-icon">🎙️</span> Start Ambient Capture`;
}

function copyDocument() {
  if (!lastStructuredData) {
    alert("Please run a capture session first to generate structured data.");
    return;
  }
  navigator.clipboard.writeText(JSON.stringify(lastStructuredData, null, 2))
    .then(() => alert("Structured JSON schema copied to clipboard!"))
    .catch(err => alert("Copy error: " + err));
}

// Auto-connect on page load
window.addEventListener('DOMContentLoaded', () => {
  connectWebSocket();
});
