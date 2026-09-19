const STORAGE_KEY = 'sa_case_progress_v1';

let allCases = [];
let currentCases = [];
let currentIndex = 0;
let mode = 'all';
let filters = { search: '', year: '', topic: '' };
let progress = createEmptyProgress();

const modeNames = {
    all: '全部题目',
    unfinished: '未完成',
    review: '待复习',
    favorite: '已收藏'
};

function createEmptyProgress() {
    return {
        version: 1,
        status: {},
        favorites: [],
        drafts: {},
        revealed: {},
        lastId: ''
    };
}

function byId(id) {
    return document.getElementById(id);
}

function makeElement(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

async function init() {
    bindStaticEvents();
    try {
        const response = await fetch('data.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        allCases = await response.json();
        loadProgress();
        populateFilters();
        updateCounts();
        refreshList(progress.lastId);
    } catch (error) {
        console.error(error);
        byId('case-title').textContent = '题库加载失败';
        byId('questions-list').textContent = '请通过本地 Web 服务器打开页面，并确认 data.json 存在。';
    }
}

function bindStaticEvents() {
    document.querySelectorAll('.nav-item').forEach(button => {
        button.addEventListener('click', () => setMode(button.dataset.mode));
    });

    byId('search-input').addEventListener('input', event => {
        filters.search = event.target.value.trim().toLowerCase();
        refreshList();
    });
    byId('year-filter').addEventListener('change', event => {
        filters.year = event.target.value;
        refreshList();
    });
    byId('topic-filter').addEventListener('change', event => {
        filters.topic = event.target.value;
        refreshList();
    });
    byId('clear-filter-btn').addEventListener('click', clearFilters);
    byId('empty-reset-btn').addEventListener('click', () => {
        clearFilters();
        setMode('all');
    });

    byId('prev-btn').addEventListener('click', () => navigate(-1));
    byId('next-btn').addEventListener('click', () => navigate(1));
    byId('reveal-all-btn').addEventListener('click', revealAllAnswers);
    byId('favorite-btn').addEventListener('click', toggleFavorite);
    byId('mastered-btn').addEventListener('click', () => setSelfCheck('mastered'));
    byId('review-btn').addEventListener('click', () => setSelfCheck('review'));
    byId('position-btn').addEventListener('click', jumpToPosition);
    byId('resume-btn').addEventListener('click', resumeLearning);

    byId('sheet-btn').addEventListener('click', openSheet);
    byId('close-sheet-btn').addEventListener('click', closeSheet);
    document.querySelector('.modal-backdrop').addEventListener('click', closeSheet);

    byId('export-btn').addEventListener('click', exportProgress);
    byId('import-btn').addEventListener('click', () => byId('import-input').click());
    byId('import-input').addEventListener('change', importProgress);
    byId('reset-btn').addEventListener('click', resetProgress);

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeSheet();
    });
}

function loadProgress() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        if (!saved || typeof saved !== 'object') return;
        progress = {
            ...createEmptyProgress(),
            ...saved,
            status: saved.status || {},
            favorites: Array.isArray(saved.favorites) ? saved.favorites : [],
            drafts: saved.drafts || {},
            revealed: saved.revealed || {}
        };
    } catch (error) {
        console.warn('Ignoring invalid saved progress.', error);
    }
}

function saveProgress() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function populateFilters() {
    const years = [...new Set(allCases.map(item => item.year))].sort((a, b) => a - b);
    years.forEach(year => {
        const option = makeElement('option', '', `${year} 年`);
        option.value = String(year);
        byId('year-filter').appendChild(option);
    });

    const topics = [...new Set(allCases.map(item => item.topic))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
    topics.forEach(topic => {
        const option = makeElement('option', '', topic);
        option.value = topic;
        byId('topic-filter').appendChild(option);
    });
}

function clearFilters() {
    filters = { search: '', year: '', topic: '' };
    byId('search-input').value = '';
    byId('year-filter').value = '';
    byId('topic-filter').value = '';
    refreshList();
}

function setMode(nextMode) {
    mode = nextMode;
    document.querySelectorAll('.nav-item').forEach(button => {
        button.classList.toggle('active', button.dataset.mode === mode);
    });
    byId('mode-eyebrow').textContent = modeNames[mode];
    byId('page-title').textContent = mode === 'all' ? '案例分析题库' : `${modeNames[mode]}案例题`;
    refreshList();
}

function getModeCases() {
    const favorites = new Set(progress.favorites);
    if (mode === 'unfinished') return allCases.filter(item => !progress.status[item.id]);
    if (mode === 'review') return allCases.filter(item => progress.status[item.id] === 'review');
    if (mode === 'favorite') return allCases.filter(item => favorites.has(item.id));
    return allCases;
}

function matchesFilters(item) {
    if (filters.year && String(item.year) !== filters.year) return false;
    if (filters.topic && item.topic !== filters.topic) return false;
    if (!filters.search) return true;

    const questionText = item.questions.map(question => [
        question.prompt,
        question.answer,
        question.analysis,
        question.knowledgeSummary
    ].join(' ')).join(' ');
    const searchable = [item.title, item.topic, item.stem, questionText].join(' ').toLowerCase();
    return searchable.includes(filters.search);
}

function refreshList(preferredId) {
    const previous = preferredId || currentCases[currentIndex]?.id;
    currentCases = getModeCases().filter(matchesFilters);
    const preferredIndex = previous ? currentCases.findIndex(item => item.id === previous) : -1;
    currentIndex = preferredIndex >= 0 ? preferredIndex : Math.min(currentIndex, Math.max(0, currentCases.length - 1));
    renderCurrent();
}

function renderCurrent() {
    const hasCases = currentCases.length > 0;
    byId('case-view').classList.toggle('hidden', !hasCases);
    byId('empty-state').classList.toggle('hidden', hasCases);
    byId('position-btn').textContent = hasCases ? `${currentIndex + 1} / ${currentCases.length}` : `0 / 0`;
    if (!hasCases) return;

    const item = currentCases[currentIndex];
    progress.lastId = item.id;
    saveProgress();

    byId('case-number').textContent = `案例 ${item.number}`;
    byId('case-date').textContent = `${item.year} 年 ${item.month} 月`;
    byId('case-title').textContent = `${item.title}（${item.topic}）`;
    renderMeta(item);
    renderStem(item);
    renderImages(item);
    renderQuestions(item);
    renderFavorite(item);
    renderSelfCheck(item);

    byId('prev-btn').disabled = currentIndex === 0;
    byId('next-btn').disabled = currentIndex === currentCases.length - 1;
    byId('next-btn').textContent = currentIndex === currentCases.length - 1 ? '已到最后一题' : '下一题';
    byId('reveal-all-btn').textContent = progress.status[item.id] ? '答案已显示' : '提交并对照答案';
}

function renderMeta(item) {
    const container = byId('case-meta');
    container.replaceChildren();
    [
        `知识点：${item.topic}`,
        `难度：${item.difficulty || '未标注'}`,
        `频率：${item.frequency || '未标注'}`,
        `${item.questions.length} 个小问`,
        `题号：${item.id}`
    ].forEach(text => container.appendChild(makeElement('span', 'meta-chip', text)));
}

function renderStem(item) {
    const section = byId('stem-section');
    section.classList.toggle('hidden', !item.stem);
    byId('case-stem').textContent = item.stem || '';
}

function renderImages(item) {
    const container = byId('case-images');
    container.replaceChildren();
    item.images.forEach((source, index) => {
        const link = makeElement('a');
        link.href = source;
        link.target = '_blank';
        link.rel = 'noopener';
        link.title = '打开原图';
        const image = makeElement('img');
        image.src = source;
        image.alt = `${item.title}题图 ${index + 1}`;
        image.loading = 'lazy';
        link.appendChild(image);
        container.appendChild(link);
    });
}

function renderQuestions(item) {
    const container = byId('questions-list');
    container.replaceChildren();
    const caseDrafts = progress.drafts[item.id] || {};
    const statusRevealsAll = Boolean(progress.status[item.id]);
    const revealed = new Set(progress.revealed[item.id] || []);

    item.questions.forEach(question => {
        const block = makeElement('section', 'question-block');
        const title = makeElement('h4', 'question-title', `问题 ${question.number}`);
        const prompt = makeElement('div', 'question-prompt preserve-lines', question.prompt);
        const label = makeElement('label', 'answer-label', '我的答案');
        label.htmlFor = `draft-${item.id}-${question.number}`;
        const textarea = makeElement('textarea', 'draft-input');
        textarea.id = label.htmlFor;
        textarea.placeholder = '在这里整理答题要点，内容会自动保存在本机。';
        textarea.value = caseDrafts[question.number] || '';
        textarea.addEventListener('input', () => saveDraft(item.id, question.number, textarea.value));

        const questionActions = makeElement('div', 'question-actions');
        const revealButton = makeElement('button', 'button quiet', '查看本题答案');
        revealButton.type = 'button';
        const isRevealed = statusRevealsAll || revealed.has(question.number);
        revealButton.classList.toggle('hidden', isRevealed);
        revealButton.addEventListener('click', () => revealQuestion(item.id, question.number));
        questionActions.appendChild(revealButton);

        block.append(title, prompt, label, textarea, questionActions);
        if (isRevealed) block.appendChild(createAnswerPanel(question));
        container.appendChild(block);
    });
}

function createAnswerPanel(question) {
    const panel = makeElement('div', 'answer-panel');

    const answerSection = makeElement('section', 'answer-section');
    answerSection.append(
        makeElement('h6', '', '参考答案'),
        makeElement('div', 'preserve-lines', question.answer)
    );

    const analysisSection = makeElement('section', 'answer-section');
    const analysisDetails = makeElement('details');
    const analysisSummary = makeElement('summary', '', '查看答案解析');
    analysisDetails.append(analysisSummary, makeElement('div', 'preserve-lines', question.analysis));
    analysisSection.appendChild(analysisDetails);

    const knowledgeSection = makeElement('section', 'answer-section');
    const knowledgeDetails = makeElement('details');
    const knowledgeSummary = makeElement('summary', '', '查看浓缩知识点');
    knowledgeDetails.append(knowledgeSummary, makeElement('div', 'preserve-lines', question.knowledgeSummary));
    knowledgeSection.appendChild(knowledgeDetails);

    panel.append(answerSection, analysisSection, knowledgeSection);
    return panel;
}

function saveDraft(caseId, questionNumber, value) {
    if (!progress.drafts[caseId]) progress.drafts[caseId] = {};
    if (value.trim()) {
        progress.drafts[caseId][questionNumber] = value;
    } else {
        delete progress.drafts[caseId][questionNumber];
        if (Object.keys(progress.drafts[caseId]).length === 0) delete progress.drafts[caseId];
    }
    saveProgress();
}

function revealQuestion(caseId, questionNumber) {
    const values = new Set(progress.revealed[caseId] || []);
    values.add(questionNumber);
    progress.revealed[caseId] = [...values].sort((a, b) => a - b);
    saveProgress();
    renderCurrent();
}

function revealAllAnswers() {
    const item = currentCases[currentIndex];
    if (!item) return;
    progress.revealed[item.id] = item.questions.map(question => question.number);
    if (!progress.status[item.id]) progress.status[item.id] = 'unrated';
    saveProgress();
    updateCounts();
    renderCurrent();
}

function setSelfCheck(value) {
    const item = currentCases[currentIndex];
    if (!item) return;
    progress.status[item.id] = value;
    saveProgress();
    updateCounts();
    renderSelfCheck(item);
    if (mode === 'unfinished' || (mode === 'review' && value !== 'review')) {
        refreshList();
    }
}

function renderSelfCheck(item) {
    const status = progress.status[item.id];
    byId('self-check').classList.toggle('hidden', !status);
    byId('mastered-btn').classList.toggle('active-choice', status === 'mastered');
    byId('review-btn').classList.toggle('active-choice', status === 'review');
    byId('mastered-btn').textContent = status === 'mastered' ? '已标记掌握' : '已经掌握';
    byId('review-btn').textContent = status === 'review' ? '已加入复习' : '需要复习';
}

function renderFavorite(item) {
    const active = progress.favorites.includes(item.id);
    const button = byId('favorite-btn');
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
    button.querySelector('span:first-child').textContent = active ? '★' : '☆';
    button.querySelector('.favorite-label').textContent = active ? '已收藏' : '收藏';
}

function toggleFavorite() {
    const item = currentCases[currentIndex];
    if (!item) return;
    const values = new Set(progress.favorites);
    if (values.has(item.id)) values.delete(item.id); else values.add(item.id);
    progress.favorites = [...values];
    saveProgress();
    updateCounts();
    if (mode === 'favorite' && !values.has(item.id)) refreshList(); else renderFavorite(item);
}

function navigate(delta) {
    const target = currentIndex + delta;
    if (target < 0 || target >= currentCases.length) return;
    currentIndex = target;
    renderCurrent();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function jumpToPosition() {
    if (!currentCases.length) return;
    const value = window.prompt(`输入题号（1 - ${currentCases.length}）`, String(currentIndex + 1));
    if (value === null) return;
    const target = Number.parseInt(value, 10);
    if (!Number.isInteger(target) || target < 1 || target > currentCases.length) {
        window.alert('请输入有效的题号。');
        return;
    }
    currentIndex = target - 1;
    renderCurrent();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resumeLearning() {
    setMode('all');
    const target = allCases.find(item => !progress.status[item.id]) || allCases[0];
    refreshList(target?.id);
}

function updateCounts() {
    const completed = allCases.filter(item => Boolean(progress.status[item.id])).length;
    const unfinished = allCases.length - completed;
    const review = allCases.filter(item => progress.status[item.id] === 'review').length;
    const favorites = new Set(progress.favorites).size;

    byId('all-count').textContent = allCases.length;
    byId('unfinished-count').textContent = unfinished;
    byId('review-count').textContent = review;
    byId('favorite-count').textContent = favorites;
    byId('progress-label').textContent = `${completed} / ${allCases.length}`;
    byId('progress-bar').style.width = allCases.length ? `${(completed / allCases.length) * 100}%` : '0%';
}

function caseState(item) {
    const status = progress.status[item.id];
    if (status === 'review') return 'review';
    if (status) return 'complete';
    if (progress.drafts[item.id] && Object.keys(progress.drafts[item.id]).length) return 'draft';
    return 'untouched';
}

function openSheet() {
    const counts = { untouched: 0, draft: 0, complete: 0, review: 0 };
    const grid = byId('sheet-grid');
    grid.replaceChildren();

    allCases.forEach(item => {
        const state = caseState(item);
        counts[state] += 1;
        const button = makeElement('button', `sheet-item ${state}`, String(item.number));
        button.type = 'button';
        button.title = `${item.title} ${item.topic}`;
        button.addEventListener('click', () => {
            mode = 'all';
            filters = { search: '', year: '', topic: '' };
            byId('search-input').value = '';
            byId('year-filter').value = '';
            byId('topic-filter').value = '';
            document.querySelectorAll('.nav-item').forEach(nav => nav.classList.toggle('active', nav.dataset.mode === 'all'));
            byId('mode-eyebrow').textContent = modeNames.all;
            byId('page-title').textContent = '案例分析题库';
            closeSheet();
            refreshList(item.id);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
        grid.appendChild(button);
    });

    const completed = counts.complete + counts.review;
    byId('sheet-summary').textContent = `已完成 ${completed} 题，待复习 ${counts.review} 题，有草稿 ${counts.draft} 题，未开始 ${counts.untouched} 题。`;
    byId('sheet-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeSheet() {
    byId('sheet-modal').classList.add('hidden');
    document.body.style.overflow = '';
}

function exportProgress() {
    const payload = {
        app: 'sa_case',
        exportedAt: new Date().toISOString(),
        progress
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sa_case_progress_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
}

function importProgress(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener('load', () => {
        try {
            const payload = JSON.parse(reader.result);
            if (payload.app !== 'sa_case' || !payload.progress) throw new Error('文件格式不匹配');
            progress = { ...createEmptyProgress(), ...payload.progress };
            saveProgress();
            updateCounts();
            refreshList(progress.lastId);
            window.alert('学习进度已导入。');
        } catch (error) {
            window.alert(`导入失败：${error.message}`);
        }
    });
    reader.readAsText(file);
}

function resetProgress() {
    if (!window.confirm('确定清除案例题的草稿、完成状态、复习标记和收藏吗？')) return;
    progress = createEmptyProgress();
    localStorage.removeItem(STORAGE_KEY);
    mode = 'all';
    filters = { search: '', year: '', topic: '' };
    byId('search-input').value = '';
    byId('year-filter').value = '';
    byId('topic-filter').value = '';
    document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.mode === 'all'));
    byId('mode-eyebrow').textContent = modeNames.all;
    byId('page-title').textContent = '案例分析题库';
    updateCounts();
    refreshList();
}

init();
