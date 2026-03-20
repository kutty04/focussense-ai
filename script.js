// ===== STATE =====
let timerInterval, pomodoroInterval;
let seconds = 0, distractions = 0;
let isRunning = false, isPaused = false;
let pomodoroActive = false;
let pomodoroSeconds = 25 * 60, pomodoroPhase = 'focus';
let pomodoroSessionCount = 0, pomodoroWorkMins = 25, pomodoroBreakMins = 5;
let lastResult = null, currentCode = '';
let chatHistory = [], flashCards = [], flashIndex = 0, flashFlipped = false;
let distractionLog = [];
let audioCtx = null, musicNode = null, currentTrack = 'off';

const API = 'https://focussense-ai.onrender.com';

// ===== PERSISTENT DATA =====
let sessionHistory  = JSON.parse(localStorage.getItem('focusSessions')  || '[]');
let savedSnippets   = JSON.parse(localStorage.getItem('codeSnippets')   || '[]');
let xpData          = JSON.parse(localStorage.getItem('xpData')         || '{"xp":0,"level":0}');
let streakData      = JSON.parse(localStorage.getItem('streakData')     || '{"streak":0,"lastDate":""}');
let unlockedBadges  = JSON.parse(localStorage.getItem('unlockedBadges') || '[]');
let goalData        = JSON.parse(localStorage.getItem('goalData')       || '{"goalMins":60,"todayMins":0,"date":""}');
let challengeData   = JSON.parse(localStorage.getItem('challengeData')  || '{"date":"","claimed":false}');
let heatmapData     = JSON.parse(localStorage.getItem('heatmapData')    || '{}');

// ===== LEVELS =====
const LEVELS = [
    { name: 'Novice Coder',      icon: '🌱', xp: 0    },
    { name: 'Junior Dev',        icon: '💻', xp: 100  },
    { name: 'Code Explorer',     icon: '🔍', xp: 250  },
    { name: 'Bug Slayer',        icon: '🐛', xp: 500  },
    { name: 'Focus Warrior',     icon: '⚔️', xp: 900  },
    { name: 'Code Scholar',      icon: '📚', xp: 1400 },
    { name: 'Algorithm Master',  icon: '⚡', xp: 2000 },
    { name: 'Code Wizard',       icon: '🧙', xp: 3000 },
    { name: 'Grand Architect',   icon: '🏰', xp: 5000 },
];

function getLevel(xp) {
    let lvl = 0;
    for (let i = LEVELS.length - 1; i >= 0; i--) {
        if (xp >= LEVELS[i].xp) { lvl = i; break; }
    }
    return { ...LEVELS[lvl], index: lvl };
}

// ===== BADGES =====
const ALL_BADGES = [
    { id: 'first_flame',  icon: '🔥', name: 'First Flame',    desc: 'Complete your first focus session' },
    { id: 'perfect_100',  icon: '💯', name: 'Perfect Focus',   desc: 'Score 100% in a session' },
    { id: 'warrior_7',    icon: '🗡️', name: '7-Day Warrior',   desc: 'Study 7 days in a row' },
    { id: 'night_owl',    icon: '🦉', name: 'Night Owl',       desc: 'Study after 10 PM' },
    { id: 'early_bird',   icon: '🌅', name: 'Early Bird',      desc: 'Study before 7 AM' },
    { id: 'code_scholar', icon: '📚', name: 'Code Scholar',    desc: 'Explain 10 programs' },
    { id: 'speed_demon',  icon: '⚡', name: 'Speed Demon',     desc: '5 min focus, no distractions' },
    { id: 'marathon',     icon: '🏃', name: 'Marathon',        desc: 'Focus for 60+ minutes total today' },
    { id: 'bug_hunter',   icon: '🐛', name: 'Bug Hunter',      desc: 'Find bugs in 5 programs' },
    { id: 'zen_master',   icon: '🧘', name: 'Zen Master',      desc: '3 sessions with 0 distractions' },
    { id: 'streak_3',     icon: '📅', name: 'Hat Trick',       desc: '3-day study streak' },
    { id: 'goal_crusher', icon: '🎯', name: 'Goal Crusher',    desc: 'Hit your daily goal 3 times' },
];

// ===== DAILY CHALLENGES =====
const CHALLENGES = [
    { text: 'Focus for at least 30 minutes today', check: () => goalData.todayMins >= 30, xp: 50 },
    { text: 'Complete a focus session with 0 distractions', check: () => sessionHistory.some(s => s.distractions === 0 && isToday(s.date)), xp: 75 },
    { text: 'Explain 3 different programs today', check: () => (localStorage.getItem('explainCount') || 0) >= 3, xp: 60 },
    { text: 'Achieve a focus score above 80%', check: () => sessionHistory.some(s => s.score >= 80 && isToday(s.date)), xp: 80 },
    { text: 'Study for 2 pomodoro sessions', check: () => pomodoroSessionCount >= 2, xp: 70 },
    { text: 'Hit your daily goal', check: () => goalData.goalMins > 0 && goalData.todayMins >= goalData.goalMins, xp: 100 },
];

function getTodayChallenge() {
    const day = new Date().getDay();
    return CHALLENGES[day % CHALLENGES.length];
}

function isToday(dateStr) {
    return dateStr && dateStr.split(',')[0] === new Date().toLocaleDateString();
}

// ===== PAGES =====
function startApp() { showPage('appPage'); showAssistant('👋 Welcome! Paste code and choose an action.'); }

function showPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    if (id === 'historyPage')  renderHistory();
    if (id === 'snippetsPage') renderSnippets();
    if (id === 'badgesPage')   renderBadges();
    if (id === 'goalPage')     renderGoalPage();
    if (id === 'homePage')     renderHomeStats();
}

// ===== THEME =====
function toggleTheme() {
    const current = document.body.getAttribute('data-theme');
    document.body.setAttribute('data-theme', current === 'light' ? '' : 'light');
    document.getElementById('themeToggle').textContent = current === 'light' ? '🌙' : '☀️';
}

// ===== CODE INPUT =====
function clearCode() { document.getElementById('codeInput').value = ''; }

// ===== EXPLAIN CODE =====
async function explainCode() {
    currentCode = document.getElementById('codeInput').value.trim();
    if (!currentCode) { showAssistant('📋 Paste some code first!'); return; }

    const btn = document.querySelector('.primary-btn');
    const txt = document.getElementById('submitText');
    const ldr = document.getElementById('submitLoader');
    btn.disabled = true; txt.textContent = 'Analyzing...'; ldr.classList.remove('hidden');

    showPage('resultsPage');
    resetResultCols();

    try {
        const res = await fetch(`${API}/explain-ai`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ code: currentCode })
        });
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        const data = await res.json();
        lastResult = data;
        renderResults(data, currentCode);
        // Track explains for badge
        const cnt = parseInt(localStorage.getItem('explainCount') || '0') + 1;
        localStorage.setItem('explainCount', cnt);
        earnXP(10, '+10 XP for explaining code!');
        if (cnt >= 10) unlockBadge('code_scholar');
    } catch(e) {
        showResultError(e.message);
    } finally {
        btn.disabled = false; txt.textContent = '🔍 Explain'; ldr.classList.add('hidden');
    }
}

function resetResultCols() {
    const spin = t => `<div class="col-loading"><div class="spinner"></div><span>${t}</span></div>`;
    document.getElementById('explainColBody').innerHTML = spin('Analyzing code...');
    document.getElementById('overviewColBody').innerHTML = spin('Summarizing...');
    document.getElementById('vivaColBody').innerHTML = spin('Preparing questions...');
    document.getElementById('resultLangBadge').textContent = '—';
    document.getElementById('resultSource').textContent = '—';
}

function renderResults(data, code) {
    document.getElementById('resultLangBadge').textContent = data.language || 'Code';
    document.getElementById('resultSource').textContent = data.source === 'groq-ai' ? '🤖 Groq AI' : '⚙️ Regex';
    renderLineByLine(data.lines || []);
    renderOverview(data.overview || {});
    renderViva(data.viva || []);
    const lc = code.split('\n').filter(l => l.trim()).length;
    showAssistant(`✅ ${data.language} analyzed — ${lc} lines · ${(data.viva||[]).length} viva questions!`);
}

function renderLineByLine(lines) {
    const body = document.getElementById('explainColBody');
    if (!lines.length) { body.innerHTML = '<div class="col-loading" style="color:var(--muted)">No lines found.</div>'; return; }
    body.innerHTML = lines.map((item, i) => `
        <div class="line-card" style="animation-delay:${i*0.025}s">
            <span class="lc-num">${item.lineNum}</span>
            <span class="lc-icon">${item.icon||'▸'}</span>
            <span class="lc-text">${esc(item.text)}</span>
        </div>`).join('');
}

function renderOverview(ov) {
    const body = document.getElementById('overviewColBody');
    const concepts = Array.isArray(ov.concepts)
        ? ov.concepts.map(c => `<span class="ov-tag">${esc(c)}</span>`).join('')
        : esc(ov.concepts || '—');
    body.innerHTML = `
        <div class="overview-section"><div class="ov-label">🎯 Purpose</div><div class="ov-content">${esc(ov.purpose||'—')}</div></div>
        <div class="overview-section"><div class="ov-label">📥 Input</div><div class="ov-content">${esc(ov.input||'None')}</div></div>
        <div class="overview-section"><div class="ov-label">🖨️ Output</div><div class="ov-content">${esc(ov.output||'—')}</div></div>
        <div class="overview-section"><div class="ov-label">🧩 Concepts</div><div class="ov-content">${concepts}</div></div>
        <div class="overview-section"><div class="ov-label">📊 Difficulty</div><div class="ov-content">${esc(ov.difficulty||'—')}</div></div>
        <div class="overview-section"><div class="ov-label">💡 Tip</div><div class="ov-content">${esc(ov.tip||'Keep practicing!')}</div></div>`;
}

function renderViva(questions) {
    const body = document.getElementById('vivaColBody');
    if (!questions.length) { body.innerHTML = '<div class="col-loading" style="color:var(--muted)">No questions.</div>'; return; }
    body.innerHTML = questions.map((q,i) => {
        const dc = {Easy:'diff-easy',Medium:'diff-medium',Hard:'diff-hard'}[q.difficulty]||'diff-easy';
        return `<div class="viva-card" style="animation-delay:${i*0.04}s">
            <div class="viva-num">Q${i+1}</div>
            <div class="viva-q">${esc(q.question)}</div>
            <div class="viva-hint">💬 ${esc(q.hint)}</div>
            <span class="difficulty-badge ${dc}">${esc(q.difficulty||'Medium')}</span>
        </div>`;
    }).join('');
}

function showResultError(msg) {
    document.getElementById('explainColBody').innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><p>${esc(msg)}<br><br>Make sure Flask is running:<br><code style="color:var(--accent)">python app.py</code></p></div>`;
    document.getElementById('overviewColBody').innerHTML = '<div class="col-loading" style="color:var(--muted)">Waiting...</div>';
    document.getElementById('vivaColBody').innerHTML = '<div class="col-loading" style="color:var(--muted)">Waiting...</div>';
    showAssistant('🚨 Server not connected! Run python app.py');
}

// ===== BUG DETECTOR =====
async function detectErrors() {
    const code = document.getElementById('codeInput').value.trim();
    if (!code) { showAssistant('📋 Paste some code first!'); return; }
    setRightPanel('BUG REPORT', '🐛');
    showAssistant('🐛 Scanning for bugs...');
    document.getElementById('rightPanelContent').innerHTML = '<div class="col-loading" style="padding:20px"><div class="spinner"></div><span>Scanning for bugs...</span></div>';
    try {
        const res = await fetch(`${API}/analyze-errors`, {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ code })
        });
        const data = await res.json();
        renderErrors(data);
        earnXP(15, '+15 XP for bug hunting!');
        const bugCount = parseInt(localStorage.getItem('bugCount') || '0') + 1;
        localStorage.setItem('bugCount', bugCount);
        if (bugCount >= 5) unlockBadge('bug_hunter');
    } catch(e) {
        document.getElementById('rightPanelContent').innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><p>${esc(e.message)}</p></div>`;
    }
}

function renderErrors(data) {
    const errors = data.errors || [];
    const score = data.score ?? 75;
    const scoreColor = score >= 80 ? 'var(--green)' : score >= 50 ? 'var(--yellow)' : 'var(--red)';
    document.getElementById('rightPanelBadge').textContent = `Score: ${score}`;
    document.getElementById('rightPanelBadge').classList.remove('hidden');
    if (!errors.length) {
        document.getElementById('rightPanelContent').innerHTML = `
            <div class="score-ring"><div class="score-num" style="color:${scoreColor}">${score}</div><div class="score-label">Code Quality Score</div></div>
            <div class="overview-section" style="margin:10px"><div class="ov-label">Summary</div><div class="ov-content">${esc(data.summary||'No issues found!')}</div></div>`;
        showAssistant(`✅ No bugs found! Quality score: ${score}/100`);
        return;
    }
    document.getElementById('rightPanelContent').innerHTML = `
        <div class="score-ring"><div class="score-num" style="color:${scoreColor}">${score}</div><div class="score-label">Quality Score — ${errors.length} issue${errors.length>1?'s':''} found</div></div>
        <div style="padding:0 10px 10px">
        ${errors.map((e,i) => `
            <div class="error-card severity-${e.severity||'warning'}" style="margin-bottom:6px;animation-delay:${i*0.05}s">
                <div class="error-line">${e.type?.toUpperCase()||'ISSUE'} · Line ${e.line||'?'} · <span style="text-transform:uppercase">${e.severity||'warning'}</span></div>
                <div class="error-msg">${esc(e.message||'Issue detected')}</div>
                <div class="error-fix">Fix: ${esc(e.fix||'Review this line')}</div>
            </div>`).join('')}
        </div>`;
    showAssistant(`🐛 Found ${errors.length} issue${errors.length>1?'s':''}. Quality: ${score}/100`);
}

// ===== COMPLEXITY =====
async function showComplexity() {
    const code = document.getElementById('codeInput').value.trim();
    if (!code) { showAssistant('📋 Paste some code first!'); return; }
    setRightPanel('COMPLEXITY SCORE', '📊');
    document.getElementById('rightPanelContent').innerHTML = '<div class="col-loading" style="padding:20px"><div class="spinner"></div><span>Analyzing complexity...</span></div>';
    showAssistant('📊 Calculating complexity score...');
    try {
        const res = await fetch(`${API}/complexity`, {
            method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({code})
        });
        const data = await res.json();
        renderComplexity(data);
        earnXP(10, '+10 XP for complexity analysis!');
    } catch(e) {
        document.getElementById('rightPanelContent').innerHTML = `<div class="empty-state"><p>❌ ${esc(e.message)}</p></div>`;
    }
}

function renderComplexity(data) {
    const score = data.score ?? 50;
    const scoreColor = score < 30 ? 'var(--green)' : score < 60 ? 'var(--yellow)' : 'var(--red)';
    document.getElementById('rightPanelContent').innerHTML = `
        <div class="score-ring">
            <div class="score-num" style="color:${scoreColor}">${score}</div>
            <div class="score-label">Complexity Score · ${esc(data.level||'—')}</div>
        </div>
        <div style="padding:0 10px 4px">
            <div class="complexity-meter"><div class="complexity-fill" style="width:${score}%;background:${scoreColor}"></div></div>
        </div>
        <div style="padding:0 10px 10px;display:flex;flex-direction:column;gap:6px">
            ${(data.breakdown||[]).map(b=>`
                <div class="overview-section" style="display:flex;justify-content:space-between;padding:7px 10px">
                    <span style="color:var(--muted);font-size:0.78rem">${esc(b.factor)}</span>
                    <span style="font-family:var(--font-mono);font-size:0.78rem;color:var(--text)">${esc(b.value)}</span>
                </div>`).join('')}
            <div class="overview-section"><div class="ov-label">💡 Recommendation</div><div class="ov-content">${esc(data.recommendation||'—')}</div></div>
        </div>`;
    showAssistant(`📊 Complexity: ${score}/100 · ${data.level||'—'} level`);
}

function setRightPanel(title, badge) {
    document.getElementById('rightPanelTitle').textContent = title;
    document.getElementById('rightPanelBadge').textContent = badge;
    document.getElementById('rightPanelBadge').classList.remove('hidden');
    document.getElementById('rightPanelContent').innerHTML = '';
}

// ===== DRY RUN =====
async function showDryRun() {
    const code = document.getElementById('codeInput').value.trim();
    if (!code) { showAssistant('📋 Paste some code first!'); return; }
    showPage('dryRunPage');
    document.getElementById('dryRunSteps').innerHTML = '<div class="col-loading"><div class="spinner"></div><span>Tracing execution...</span></div>';
    document.getElementById('dryRunOutput').textContent = '—';
    document.getElementById('dryRunSummary').textContent = '—';
    showAssistant('▶️ Tracing code execution step by step...');
    try {
        const res = await fetch(`${API}/dry-run`, {
            method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({code})
        });
        const data = await res.json();
        renderDryRun(data);
        earnXP(20, '+20 XP for dry run!');
    } catch(e) {
        document.getElementById('dryRunSteps').innerHTML = `<div class="empty-state"><p>❌ ${esc(e.message)}</p></div>`;
    }
}

function renderDryRun(data) {
    const steps = data.steps || [];
    if (!steps.length) {
        document.getElementById('dryRunSteps').innerHTML = '<div class="col-loading" style="color:var(--muted)">No steps traced. Try with shorter code (under 40 lines).</div>';
        return;
    }
    document.getElementById('dryRunSteps').innerHTML = steps.map((s,i) => {
        const vars = Object.entries(s.variables||{}).map(([k,v])=>`<span class="var-chip">${esc(k)} = ${esc(String(v))}</span>`).join('');
        return `<div class="step-card" style="animation-delay:${i*0.04}s">
            <div class="step-num">STEP ${s.step||i+1} · Line ${s.line||'?'}</div>
            <div class="step-action">${esc(s.action||'—')}</div>
            ${vars ? `<div class="step-vars">${vars}</div>` : ''}
            ${s.output ? `<div class="step-output">→ ${esc(s.output)}</div>` : ''}
        </div>`;
    }).join('');
    document.getElementById('dryRunOutput').textContent = data.final_output || '(no output)';
    document.getElementById('dryRunSummary').textContent = data.summary || '—';
    showAssistant(`▶️ Traced ${steps.length} execution steps!`);
}

// ===== FLASHCARDS =====
function openFlashcards() {
    if (!lastResult || !lastResult.viva?.length) { showAssistant('⚠️ Run an analysis first!'); return; }
    flashCards = lastResult.viva;
    flashIndex = 0; flashFlipped = false;
    showPage('flashcardsPage');
    updateFlashcard();
}

function updateFlashcard() {
    if (!flashCards.length) return;
    const card = flashCards[flashIndex];
    document.getElementById('cardFront').textContent = card.question;
    document.getElementById('cardBack').textContent = card.hint;
    document.getElementById('flashProgress').textContent = `${flashIndex+1} / ${flashCards.length}`;
    const dc = {Easy:'diff-easy',Medium:'diff-medium',Hard:'diff-hard'}[card.difficulty]||'diff-easy';
    document.getElementById('flashDiffRow').innerHTML = `<span class="difficulty-badge ${dc}">${card.difficulty||'Medium'}</span>`;
    const inner = document.getElementById('flashcardInner');
    inner.classList.remove('flipped'); flashFlipped = false;
}

function flipCard() {
    flashFlipped = !flashFlipped;
    document.getElementById('flashcardInner').classList.toggle('flipped', flashFlipped);
}

function nextCard() { flashIndex = (flashIndex+1) % flashCards.length; updateFlashcard(); }
function prevCard() { flashIndex = (flashIndex-1+flashCards.length) % flashCards.length; updateFlashcard(); }

// ===== CHAT =====
function openChat() {
    if (!currentCode) { showAssistant('⚠️ Run an analysis first!'); return; }
    document.getElementById('chatCodePreview').textContent = currentCode;
    chatHistory = [];
    document.getElementById('chatMessages').innerHTML = '<div class="chat-msg assistant-msg"><div class="msg-bubble">Hi! Ask me anything about your code 👋</div></div>';
    showPage('chatPage');
}

async function sendChat() {
    const input = document.getElementById('chatInput');
    const q = input.value.trim();
    if (!q) return;
    input.value = '';
    appendMsg('user', q);
    chatHistory.push({role:'user', content: q});
    const typing = appendMsg('assistant', '...', true);
    try {
        const res = await fetch(`${API}/chat`, {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ code: currentCode, question: q, history: chatHistory.slice(-6) })
        });
        const data = await res.json();
        typing.remove();
        appendMsg('assistant', data.answer || 'Sorry, I could not answer that.');
        chatHistory.push({role:'assistant', content: data.answer});
    } catch(e) {
        typing.remove();
        appendMsg('assistant', '❌ Chat unavailable. Make sure Flask is running.');
    }
    document.getElementById('chatSuggestions').classList.add('hidden');
}

function appendMsg(role, text, isTyping=false) {
    const msgs = document.getElementById('chatMessages');
    const div = document.createElement('div');
    div.className = `chat-msg ${role}-msg${isTyping?' msg-typing':''}`;
    div.innerHTML = `<div class="msg-bubble">${esc(text)}</div>`;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
    return div;
}

function askSuggestion(btn) { document.getElementById('chatInput').value = btn.textContent; sendChat(); }
function clearChat() {
    chatHistory = [];
    document.getElementById('chatMessages').innerHTML = '<div class="chat-msg assistant-msg"><div class="msg-bubble">Chat cleared! Ask me anything 👋</div></div>';
    document.getElementById('chatSuggestions').classList.remove('hidden');
}

// ===== COMPARE =====
async function runCompare() {
    const c1 = document.getElementById('compare1').value.trim();
    const c2 = document.getElementById('compare2').value.trim();
    if (!c1 || !c2) { showAssistant('⚠️ Paste code in both boxes!'); return; }
    const results = document.getElementById('compareResults');
    results.classList.remove('hidden');
    document.getElementById('compareBody').innerHTML = '<div class="col-loading" style="padding:20px"><div class="spinner"></div><span>Comparing...</span></div>';
    try {
        const res = await fetch(`${API}/compare`, {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({code1:c1, code2:c2})
        });
        const data = await res.json();
        renderCompare(data);
    } catch(e) {
        document.getElementById('compareBody').innerHTML = `<div class="empty-state"><p>❌ ${esc(e.message)}</p></div>`;
    }
}

function renderCompare(data) {
    const winnerLabel = data.winner === 'code1' ? 'Code 1 wins 🏆' : data.winner === 'code2' ? 'Code 2 wins 🏆' : 'Tie ⚖️';
    const diffs = (data.differences||[]).map(d=>`
        <tr><td style="color:var(--muted);font-weight:600">${esc(d.aspect)}</td>
        <td>${esc(d.code1)}</td><td>${esc(d.code2)}</td></tr>`).join('');
    const pros1 = (data.code1_pros||[]).map(p=>`<div class="pro-item"><span style="color:var(--green)">✓</span>${esc(p)}</div>`).join('');
    const pros2 = (data.code2_pros||[]).map(p=>`<div class="pro-item"><span style="color:var(--green)">✓</span>${esc(p)}</div>`).join('');
    document.getElementById('compareBody').innerHTML = `
        <div class="compare-winner"><span class="winner-badge">${winnerLabel}</span><span style="font-size:0.82rem;color:var(--text)">${esc(data.reason||'')}</span></div>
        <div style="display:flex;gap:10px;padding:0 12px 10px">
            <div style="flex:1"><div class="ov-label" style="padding:6px 0">CODE 1 PROS</div>${pros1}</div>
            <div style="flex:1"><div class="ov-label" style="padding:6px 0">CODE 2 PROS</div>${pros2}</div>
        </div>
        ${diffs ? `<table class="compare-table"><thead><tr><th>ASPECT</th><th>CODE 1</th><th>CODE 2</th></tr></thead><tbody>${diffs}</tbody></table>` : ''}
        <div class="overview-section" style="margin:10px"><div class="ov-label">RECOMMENDATION</div><div class="ov-content">${esc(data.recommendation||'—')}</div></div>`;
    showAssistant(`⚖️ Comparison done — ${winnerLabel}`);
}

// ===== SNIPPETS =====
function saveSnippet() {
    const code = document.getElementById('codeInput').value.trim();
    if (!code) { showAssistant('📋 Paste code first!'); return; }
    const name = prompt('Name this snippet:', `Snippet ${savedSnippets.length+1}`);
    if (!name) return;
    const lang = detectLangSimple(code);
    savedSnippets.unshift({ id: Date.now(), name, lang, code, date: new Date().toLocaleDateString() });
    localStorage.setItem('codeSnippets', JSON.stringify(savedSnippets));
    showAssistant(`💾 Saved "${name}"!`);
}

function renderSnippets() {
    const list = document.getElementById('snippetsList');
    if (!savedSnippets.length) { list.innerHTML = '<div class="no-snippets">No saved snippets yet.</div>'; return; }
    list.innerHTML = savedSnippets.map(s => `
        <div class="snippet-card">
            <div class="snippet-header">
                <span class="snippet-name">${esc(s.name)}</span>
                <span class="snippet-lang">${esc(s.lang)}</span>
                <span class="hist-date">${esc(s.date)}</span>
                <button class="mini-btn" onclick="deleteSnippet(${s.id})">🗑️</button>
            </div>
            <div class="snippet-preview">${esc(s.code.slice(0,120))}${s.code.length>120?'...':''}</div>
            <div class="snippet-actions">
                <button class="mini-btn" onclick="loadSnippet(${s.id})">📂 Load into editor</button>
            </div>
        </div>`).join('');
}

function loadSnippet(id) {
    const s = savedSnippets.find(x=>x.id===id);
    if (!s) return;
    document.getElementById('codeInput').value = s.code;
    showPage('appPage');
    showAssistant(`📂 Loaded "${s.name}"!`);
}

function deleteSnippet(id) {
    savedSnippets = savedSnippets.filter(x=>x.id!==id);
    localStorage.setItem('codeSnippets', JSON.stringify(savedSnippets));
    renderSnippets();
}

function clearSnippets() {
    if (!confirm('Delete all snippets?')) return;
    savedSnippets = []; localStorage.removeItem('codeSnippets'); renderSnippets();
}

// ===== FOCUS TIMER =====
function startFocus() {
    if (isRunning) { showAssistant('⏰ Already running!'); return; }
    isRunning = true; isPaused = false; distractionLog = [];
    document.getElementById('startBtn').style.display = 'none';
    document.getElementById('pauseBtn').style.display = '';
    timerInterval = setInterval(() => {
        if (!isPaused) { seconds++; updateTimer(); updateGoalProgress(); }
    }, 1000);
    showAssistant('🎯 Focus session started! Stay on task.');
    // Check for early bird / night owl
    const h = new Date().getHours();
    if (h < 7)  unlockBadge('early_bird');
    if (h >= 22) unlockBadge('night_owl');
}

function pauseResumeFocus() {
    isPaused = !isPaused;
    document.getElementById('pauseBtn').textContent = isPaused ? '▶ Resume' : '⏸ Pause';
    showAssistant(isPaused ? '⏸ Session paused.' : '▶️ Session resumed!');
}

function markDistracted() {
    if (!isRunning) { showAssistant('▶️ Start a session first!'); return; }
    distractions++;
    distractionLog.push(seconds);
    showAssistant(`😅 Distraction #${distractions} at ${formatTime(seconds)}`);
}

function endFocus() {
    if (!isRunning) { showAssistant('📌 No active session!'); return; }
    clearInterval(timerInterval);
    isRunning = false; isPaused = false;
    document.getElementById('startBtn').style.display = '';
    document.getElementById('pauseBtn').style.display = 'none';
    document.getElementById('pauseBtn').textContent = '⏸ Pause';

    const focusTime = Math.max(0, seconds - distractions * 5);
    const score = seconds > 0 ? parseFloat(((focusTime/seconds)*100).toFixed(1)) : 0;
    document.getElementById('focusScore').textContent = score + '%';

    // Save session
    const session = {
        date: new Date().toLocaleString(), duration: seconds,
        score, distractions, log: distractionLog
    };
    sessionHistory.unshift(session);
    if (sessionHistory.length > 50) sessionHistory.pop();
    localStorage.setItem('focusSessions', JSON.stringify(sessionHistory));

    // XP per minute of focus
    const mins = Math.floor(seconds / 60);
    if (mins > 0) earnXP(mins * 2, `+${mins*2} XP for ${mins} min focus!`);

    // Update streak
    updateStreak();
    // Update heatmap
    updateHeatmap(seconds);
    // Goal progress
    updateGoalData(seconds);

    // Badge checks
    if (score >= 100) unlockBadge('perfect_100');
    if (distractions === 0 && seconds >= 300) unlockBadge('speed_demon');
    if (unlockedBadges.length === 0 || !unlockedBadges.includes('first_flame')) unlockBadge('first_flame');
    checkZenMaster(score);
    checkMarathon();

    if (score < 50)       showAssistant('📊 Low focus. Try a shorter session!');
    else if (score >= 80) showAssistant(`🌟 Excellent! ${score}% focus!`);
    else                  showAssistant(`📊 Done — ${score}% focus. Keep it up!`);

    seconds = 0; distractions = 0; distractionLog = [];
    updateTopBarXP();
}

function updateTimer() {
    document.getElementById('timer').textContent = formatTime(seconds);
    if (seconds === 30)  showAssistant('⏰ 30 seconds in — great start!');
    if (seconds === 120) showAssistant('⏱️ 2 minutes! Stay sharp.');
    if (seconds === 300) showAssistant('🔥 5 minutes of focus!');
    if (seconds === 600) showAssistant('🏆 10 minutes! Outstanding!');
    if (seconds === 1800) showAssistant('💪 30 minutes! You\'re incredible!');
}

function formatTime(s) {
    return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
}

// ===== POMODORO =====
function togglePomodoro() {
    if (pomodoroActive) { stopPomodoro(); return; }
    pomodoroActive = true; pomodoroPhase = 'focus';
    pomodoroSeconds = pomodoroWorkMins * 60; pomodoroSessionCount = 0;
    document.getElementById('pomodoroBanner').classList.remove('hidden');
    updatePomoDisplay();
    pomodoroInterval = setInterval(tickPomodoro, 1000);
    if (!isRunning) startFocus();
    showAssistant(`🍅 Pomodoro started — ${pomodoroWorkMins} min focus!`);
}

function tickPomodoro() {
    pomodoroSeconds--;
    updatePomoDisplay();
    if (pomodoroSeconds <= 0) {
        if (pomodoroPhase === 'focus') {
            pomodoroSessionCount++;
            const isLongBreak = pomodoroSessionCount % 4 === 0;
            pomodoroPhase = 'break';
            pomodoroSeconds = isLongBreak ? 15*60 : pomodoroBreakMins*60;
            showAssistant(isLongBreak ? '🍅 4 sessions done! 15 min long break!' : '🍅 Focus done! 5 min break.');
            if (isRunning) endFocus();
        } else {
            pomodoroPhase = 'focus'; pomodoroSeconds = pomodoroWorkMins * 60;
            showAssistant('🍅 Break over! Starting focus session.');
            startFocus();
        }
        updatePomoDisplay();
    }
}

function updatePomoDisplay() {
    const phase = pomodoroPhase === 'focus' ? '🍅 Focus' : '☕ Break';
    document.getElementById('pomodoroLabel').textContent = phase;
    document.getElementById('pomodoroTimer').textContent = formatTime(pomodoroSeconds);
    document.getElementById('pomoSessionCount').textContent = `${pomodoroSessionCount}/4`;
}

function stopPomodoro() {
    clearInterval(pomodoroInterval); pomodoroActive = false;
    document.getElementById('pomodoroBanner').classList.add('hidden');
    showAssistant('🍅 Pomodoro stopped.');
}

// ===== GOAL TRACKER =====
function setGoal(mins) {
    goalData.goalMins = mins;
    if (!isToday(goalData.date)) { goalData.todayMins = 0; goalData.date = new Date().toLocaleString(); }
    localStorage.setItem('goalData', JSON.stringify(goalData));
    document.querySelectorAll('.goal-opt-btn').forEach(b => b.classList.remove('selected'));
    event.target.classList.add('selected');
    renderGoalPage();
    updateGoalBanner();
    showAssistant(`🎯 Goal set: ${mins} minutes today!`);
}

function setCustomGoal() {
    const val = parseInt(document.getElementById('customGoalInput').value);
    if (!val || val < 1) return;
    setGoal(val);
}

function updateGoalProgress() {
    // Called every second during focus
    goalData.todayMins = Math.floor(seconds / 60) + (getTodayFocusMins());
    localStorage.setItem('goalData', JSON.stringify(goalData));
    updateGoalBanner();
}

function getTodayFocusMins() {
    return sessionHistory
        .filter(s => isToday(s.date))
        .reduce((a,s) => a + Math.floor(s.duration/60), 0);
}

function updateGoalData(sessionSeconds) {
    if (!isToday(goalData.date)) { goalData.todayMins = 0; goalData.date = new Date().toLocaleString(); }
    goalData.todayMins = getTodayFocusMins();
    localStorage.setItem('goalData', JSON.stringify(goalData));
    updateGoalBanner();
    if (goalData.goalMins > 0 && goalData.todayMins >= goalData.goalMins) {
        unlockBadge('goal_crusher');
        showAssistant('🎯 Daily goal achieved! Amazing work!');
    }
}

function updateGoalBanner() {
    if (!goalData.goalMins) return;
    const pct = Math.min(100, Math.round((goalData.todayMins / goalData.goalMins) * 100));
    document.getElementById('goalBanner').classList.remove('hidden');
    document.getElementById('goalBannerFill').style.width = pct + '%';
    document.getElementById('goalBannerLabel').textContent = `${goalData.todayMins} / ${goalData.goalMins} min`;
}

function renderGoalPage() {
    if (!isToday(goalData.date)) { goalData.todayMins = getTodayFocusMins(); goalData.date = new Date().toLocaleString(); }
    const pct = goalData.goalMins > 0 ? Math.min(100, Math.round((goalData.todayMins / goalData.goalMins)*100)) : 0;
    document.getElementById('goalBigNum').textContent = `${goalData.todayMins} min`;
    document.getElementById('goalTarget').textContent = `of ${goalData.goalMins || '—'} min goal`;
    document.getElementById('goalPageFill').style.width = pct + '%';
    document.getElementById('goalPagePct').textContent = pct + '%';
    document.getElementById('goalStreakInfo').textContent = `🔥 ${streakData.streak} day streak`;

    // Challenge
    const ch = getTodayChallenge();
    document.getElementById('challengeText').textContent = ch.text;
    document.getElementById('challengeReward').textContent = `Reward: +${ch.xp} XP`;
    const claimed = challengeData.claimed && isToday(challengeData.date);
    document.getElementById('claimBtn').textContent = claimed ? '✅ Claimed!' : 'Claim Reward';
    document.getElementById('claimBtn').disabled = claimed || !ch.check();
}

function claimChallenge() {
    const ch = getTodayChallenge();
    if (!ch.check()) { showAssistant('⚠️ Challenge not completed yet!'); return; }
    if (challengeData.claimed && isToday(challengeData.date)) { showAssistant('✅ Already claimed today!'); return; }
    challengeData = { date: new Date().toLocaleString(), claimed: true };
    localStorage.setItem('challengeData', JSON.stringify(challengeData));
    earnXP(ch.xp, `+${ch.xp} XP — Daily challenge complete!`);
    renderGoalPage();
}

// ===== STREAK =====
function updateStreak() {
    const today = new Date().toDateString();
    const last = streakData.lastDate;
    if (last === today) return; // already counted today
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    if (last === yesterday) {
        streakData.streak++;
    } else if (last !== today) {
        streakData.streak = 1;
    }
    streakData.lastDate = today;
    localStorage.setItem('streakData', JSON.stringify(streakData));
    document.getElementById('streakDisplay').textContent = streakData.streak;
    if (streakData.streak >= 3)  unlockBadge('streak_3');
    if (streakData.streak >= 7)  unlockBadge('warrior_7');
}

// ===== HEATMAP =====
function updateHeatmap(sessionSeconds) {
    const today = new Date().toISOString().split('T')[0];
    heatmapData[today] = (heatmapData[today] || 0) + Math.floor(sessionSeconds / 60);
    localStorage.setItem('heatmapData', JSON.stringify(heatmapData));
}

function renderHeatmap() {
    const container = document.getElementById('focusHeatmap');
    if (!container) return;
    const days = 49; // 7 weeks
    let html = '';
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000);
        const key = d.toISOString().split('T')[0];
        const mins = heatmapData[key] || 0;
        const level = mins === 0 ? 0 : mins < 15 ? 1 : mins < 30 ? 2 : mins < 60 ? 3 : 4;
        html += `<div class="heatmap-day level-${level}" title="${key}: ${mins} min"></div>`;
    }
    container.innerHTML = html;
}

// ===== XP SYSTEM =====
function earnXP(amount, message) {
    xpData.xp += amount;
    const oldLevel = xpData.level;
    const newLevelData = getLevel(xpData.xp);
    xpData.level = newLevelData.index;
    localStorage.setItem('xpData', JSON.stringify(xpData));
    updateTopBarXP();
    showXPToast(message);
    if (newLevelData.index > oldLevel) {
        showBadgeToast(`${newLevelData.icon} Level Up! ${newLevelData.name}`);
    }
}

function updateTopBarXP() {
    const el = document.getElementById('xpDisplay');
    if (el) el.textContent = xpData.xp;
    const streak = document.getElementById('streakDisplay');
    if (streak) streak.textContent = streakData.streak;
}

function showXPToast(msg) {
    const t = document.getElementById('xpToast');
    t.textContent = msg; t.classList.remove('hidden');
    setTimeout(() => t.classList.add('hidden'), 2500);
}

// ===== BADGES =====
function unlockBadge(id) {
    if (unlockedBadges.includes(id)) return;
    unlockedBadges.push(id);
    localStorage.setItem('unlockedBadges', JSON.stringify(unlockedBadges));
    const badge = ALL_BADGES.find(b => b.id === id);
    if (badge) {
        showBadgeToast(`${badge.icon} Badge Unlocked: ${badge.name}!`);
        earnXP(25, `+25 XP — Badge: ${badge.name}`);
    }
}

function showBadgeToast(msg) {
    const t = document.getElementById('badgeToast');
    t.innerHTML = `<div style="font-size:1.2rem">${msg}</div>`;
    t.classList.remove('hidden');
    setTimeout(() => t.classList.add('hidden'), 3000);
}

function renderBadges() {
    const lvl = getLevel(xpData.xp);
    const nextLvl = LEVELS[Math.min(lvl.index + 1, LEVELS.length - 1)];
    const xpToNext = nextLvl.xp - xpData.xp;
    const pct = lvl.index < LEVELS.length - 1
        ? Math.round(((xpData.xp - lvl.xp) / (nextLvl.xp - lvl.xp)) * 100)
        : 100;

    document.getElementById('levelIcon').textContent = lvl.icon;
    document.getElementById('levelName').textContent = lvl.name;
    document.getElementById('levelNext').textContent = lvl.index < LEVELS.length - 1 ? `${xpToNext} XP to ${nextLvl.name}` : 'Max Level!';
    document.getElementById('xpBarFill').style.width = pct + '%';
    document.getElementById('xpBarLabel').textContent = `${xpData.xp} XP`;
    document.getElementById('levelBadgeDisplay').textContent = `${lvl.icon} ${lvl.name}`;
    document.getElementById('xpBadgeDisplay').textContent = `${xpData.xp} XP`;

    document.getElementById('badgeGrid').innerHTML = ALL_BADGES.map(b => `
        <div class="badge-card ${unlockedBadges.includes(b.id) ? 'unlocked' : 'locked'}">
            <div class="badge-icon">${b.icon}</div>
            <div class="badge-name">${b.name}</div>
            <div class="badge-desc">${b.desc}</div>
        </div>`).join('');
}

function checkZenMaster(score) {
    const zeroDist = sessionHistory.filter(s => s.distractions === 0).length;
    if (zeroDist >= 3) unlockBadge('zen_master');
}

function checkMarathon() {
    const todayMins = getTodayFocusMins();
    if (todayMins >= 60) unlockBadge('marathon');
}

// ===== HOME STATS =====
function renderHomeStats() {
    const lvl = getLevel(xpData.xp);
    const nextLvl = LEVELS[Math.min(lvl.index + 1, LEVELS.length - 1)];
    const pct = lvl.index < LEVELS.length - 1
        ? Math.round(((xpData.xp - lvl.xp) / (nextLvl.xp - lvl.xp)) * 100) : 100;

    const streakEl = document.getElementById('homeStreakVal');
    const levelEl = document.getElementById('homeLevelName');
    const xpBar = document.getElementById('homeXpBar');
    const xpLabel = document.getElementById('homeXpLabel');

    if (streakEl) streakEl.textContent = streakData.streak;
    if (levelEl) levelEl.textContent = `${lvl.icon} ${lvl.name}`;
    if (xpBar) xpBar.style.width = pct + '%';
    if (xpLabel) xpLabel.textContent = `${xpData.xp} XP`;

    // Goal progress on home
    if (!isToday(goalData.date)) goalData.todayMins = getTodayFocusMins();
    const goalPct = goalData.goalMins > 0 ? Math.min(100, Math.round((goalData.todayMins / goalData.goalMins)*100)) : 0;
    const goalLabel = document.getElementById('homeGoalLabel');
    const goalFill = document.getElementById('homeGoalFill');
    const goalPctEl = document.getElementById('homeGoalPct');
    if (goalLabel) goalLabel.textContent = goalData.goalMins ? `${goalData.goalMins} min` : 'Not set';
    if (goalFill) goalFill.style.width = goalPct + '%';
    if (goalPctEl) goalPctEl.textContent = goalPct + '%';
}

// ===== MUSIC PLAYER =====
function toggleMusicPlayer() {
    const player = document.getElementById('musicPlayer');
    player.classList.toggle('hidden');
}

function playTrack(name) {
    stopMusic();
    document.querySelectorAll('.track-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    currentTrack = name;
    if (name === 'off') return;

    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const vol = document.getElementById('musicVolume').value / 100;
        const gainNode = audioCtx.createGain();
        gainNode.gain.value = vol * 0.3;
        gainNode.connect(audioCtx.destination);

        // Generate ambient sound with oscillators
        if (name === 'white') {
            // White noise
            const bufferSize = audioCtx.sampleRate * 2;
            const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
            const source = audioCtx.createBufferSource();
            source.buffer = buffer; source.loop = true;
            source.connect(gainNode); source.start();
            musicNode = source;
        } else if (name === 'rain') {
            // Rain-like filtered noise
            const bufferSize = audioCtx.sampleRate * 2;
            const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
            const source = audioCtx.createBufferSource();
            source.buffer = buffer; source.loop = true;
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'bandpass'; filter.frequency.value = 400; filter.Q.value = 0.5;
            source.connect(filter); filter.connect(gainNode); source.start();
            musicNode = source;
        } else if (name === 'lofi') {
            // Simple lo-fi: layered sine waves at warm frequencies
            const freqs = [130, 196, 261, 330, 392];
            const nodes = freqs.map(f => {
                const osc = audioCtx.createOscillator();
                const g = audioCtx.createGain();
                osc.type = 'sine'; osc.frequency.value = f;
                g.gain.value = 0.05;
                osc.connect(g); g.connect(gainNode); osc.start();
                return osc;
            });
            musicNode = { stop: () => nodes.forEach(n => n.stop()) };
        } else if (name === 'forest') {
            // Forest: filtered noise at higher frequency
            const bufferSize = audioCtx.sampleRate * 2;
            const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
            const source = audioCtx.createBufferSource();
            source.buffer = buffer; source.loop = true;
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'highpass'; filter.frequency.value = 800;
            source.connect(filter); filter.connect(gainNode); source.start();
            musicNode = source;
        }
    } catch(e) {
        console.log('Audio not supported:', e);
    }
}

function stopMusic() {
    try {
        if (musicNode) {
            if (musicNode.stop) musicNode.stop();
            else if (musicNode.disconnect) musicNode.disconnect();
        }
        if (audioCtx) { audioCtx.close(); audioCtx = null; }
        musicNode = null;
    } catch(e) {}
}

function setMusicVolume(val) {
    if (audioCtx && musicNode) {
        // Restart with new volume
        const track = currentTrack;
        playTrack(track);
    }
}

// ===== HISTORY =====
function renderHistory() {
    const stats = document.getElementById('historyStats');
    const list = document.getElementById('historyList');
    if (!sessionHistory.length) {
        stats.innerHTML = '<div class="no-history">No sessions yet. Start a focus session!</div>';
        list.innerHTML = ''; renderHeatmap(); return;
    }
    const avgScore = (sessionHistory.reduce((a,s)=>a+s.score,0)/sessionHistory.length).toFixed(1);
    const best = Math.max(...sessionHistory.map(s=>s.score)).toFixed(1);
    const totalMin = Math.round(sessionHistory.reduce((a,s)=>a+s.duration,0)/60);
    stats.innerHTML = `
        <div class="history-stat-card"><div class="hstat-val">${sessionHistory.length}</div><div class="hstat-label">Total Sessions</div></div>
        <div class="history-stat-card"><div class="hstat-val">${avgScore}%</div><div class="hstat-label">Avg Focus Score</div></div>
        <div class="history-stat-card"><div class="hstat-val">${best}%</div><div class="hstat-label">Best Session</div></div>
        <div class="history-stat-card"><div class="hstat-val">${totalMin}m</div><div class="hstat-label">Total Focus Time</div></div>
        <div class="history-stat-card"><div class="hstat-val">🔥${streakData.streak}</div><div class="hstat-label">Day Streak</div></div>
        <div class="history-stat-card"><div class="hstat-val">${xpData.xp}</div><div class="hstat-label">Total XP</div></div>`;
    renderHeatmap();
    drawHistoryChart();
    list.innerHTML = sessionHistory.slice(0,20).map(s => {
        const scoreColor = s.score>=80?'var(--green)':s.score>=50?'var(--yellow)':'var(--red)';
        return `<div class="history-item">
            <div class="hist-score" style="color:${scoreColor}">${s.score}%</div>
            <div class="hist-details"><div>${formatTime(s.duration)} · ${s.distractions} distraction${s.distractions!==1?'s':''}</div></div>
            <div class="hist-date">${esc(s.date)}</div>
        </div>`;
    }).join('');
}

function drawHistoryChart() {
    const canvas = document.getElementById('historyChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const data = sessionHistory.slice(0,10).reverse();
    const W = canvas.offsetWidth || 600; const H = 120;
    canvas.width = W; canvas.height = H;
    ctx.clearRect(0,0,W,H);
    const barW = (W/data.length)*0.6;
    const gap = W/data.length;
    data.forEach((s,i) => {
        const h = (s.score/100)*(H-20);
        const x = i*gap + gap*0.2;
        const y = H - h - 10;
        const color = s.score>=80?'#60f0a0':s.score>=50?'#f0c060':'#f06060';
        ctx.fillStyle = color + '44';
        ctx.fillRect(x,y,barW,h);
        ctx.fillStyle = color;
        ctx.fillRect(x,y,barW,3);
        ctx.fillStyle = color;
        ctx.font = '9px monospace';
        ctx.fillText(s.score+'%', x, y-3);
    });
}

function clearHistory() {
    if (!confirm('Clear all session history?')) return;
    sessionHistory = []; localStorage.removeItem('focusSessions'); renderHistory();
}

// ===== EXPORT =====
function exportPDF() { window.print(); }

async function copyToClipboard() {
    if (!lastResult) { alert('No analysis to copy yet!'); return; }
    const text = buildPlainText(lastResult);
    try {
        await navigator.clipboard.writeText(text);
        const btn = document.querySelector('.copy-btn');
        const orig = btn.innerHTML; btn.innerHTML = '✅ Copied!'; btn.classList.add('success');
        setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('success'); }, 2000);
    } catch { alert('Copy failed — please select and copy manually.'); }
}

function downloadFile() {
    if (!lastResult) { alert('No analysis yet!'); return; }
    const text = buildPlainText(lastResult);
    const lang = (lastResult.language||'code').toLowerCase().replace(/\s+/g,'-');
    const blob = new Blob([text], {type:'text/plain'});
    const a = Object.assign(document.createElement('a'), {href:URL.createObjectURL(blob), download:`focussense-${lang}-analysis.txt`});
    a.click(); URL.revokeObjectURL(a.href);
}

function buildPlainText(data) {
    const D = '='.repeat(60);
    const lines = (data.lines||[]).map(l=>`  Line ${l.lineNum}: ${l.icon||''} ${l.text}`).join('\n');
    const ov = data.overview||{};
    const concepts = Array.isArray(ov.concepts)?ov.concepts.join(', '):(ov.concepts||'—');
    const viva = (data.viva||[]).map((q,i)=>`  Q${i+1} [${q.difficulty}]: ${q.question}\n       Hint: ${q.hint}`).join('\n\n');
    return `FOCUSSENSE AI — CODE ANALYSIS REPORT\nGenerated: ${new Date().toLocaleString()}\nLanguage: ${data.language||'Unknown'}\n${D}\nLINE-BY-LINE\n${D}\n${lines}\n\n${D}\nOVERVIEW\n${D}\nPurpose: ${ov.purpose||'—'}\nInput: ${ov.input||'None'}\nOutput: ${ov.output||'—'}\nConcepts: ${concepts}\nDifficulty: ${ov.difficulty||'—'}\n\n${D}\nVIVA QUESTIONS\n${D}\n${viva}\n\n${D}\nGenerated by FocusSense AI v6.0\n`;
}

// ===== HELPERS =====
function esc(str) {
    return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function detectLangSimple(code) {
    if (/public\s+class|System\.out/.test(code)) return 'Java';
    if (/def\s+\w+|import\s+\w+/.test(code)) return 'Python';
    if (/function\s+\w+|const\s+\w+/.test(code)) return 'JavaScript';
    if (/<html|<div/.test(code)) return 'HTML';
    if (/SELECT.*FROM/i.test(code)) return 'SQL';
    return 'Code';
}

function showAssistant(msg) {
    const el = document.getElementById('assistantText');
    if (!el) return;
    el.style.opacity = '0';
    setTimeout(() => { el.textContent = msg; el.style.opacity = '1'; }, 150);
}

// ===== INIT =====
window.addEventListener('load', () => {
    showPage('homePage');
    renderHomeStats();
    updateTopBarXP();
    if (goalData.goalMins) updateGoalBanner();
    setTimeout(() => showAssistant('👋 Welcome to FocusSense AI v6.0!'), 500);
});
