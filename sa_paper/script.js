const STORAGE_KEY = 'sa_paper_progress_v1';

let allPapers = [];
let currentPapers = [];
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
        allPapers = await response.json();
        loadProgress();
        populateFilters();
        updateCounts();
        refreshList(progress.lastId);
    } catch (error) {
        console.error(error);
        byId('paper-title').textContent = '题库加载失败';
        byId('paper-prompt').textContent = '请通过本地 Web 服务器打开页面，并确认 data.json 存在。';
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
    byId('reveal-btn').addEventListener('click', revealAnswer);
    byId('favorite-btn').addEventListener('click', toggleFavorite);
    byId('mastered-btn').addEventListener('click', () => setSelfCheck('mastered'));
    byId('review-btn').addEventListener('click', () => setSelfCheck('review'));
    byId('position-btn').addEventListener('click', jumpToPosition);
    byId('resume-btn').addEventListener('click', resumeLearning);
    byId('draft-input').addEventListener('input', saveCurrentDraft);
    byId('copy-draft-btn').addEventListener('click', copyDraft);
    byId('clear-draft-btn').addEventListener('click', clearDraft);

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
    const years = [...new Set(allPapers.map(item => item.year))].sort((a, b) => a - b);
    years.forEach(year => {
        const option = makeElement('option', '', `${year} 年`);
        option.value = String(year);
        byId('year-filter').appendChild(option);
    });

    const topics = [...new Set(allPapers.map(item => item.topic))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
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
    byId('page-title').textContent = mode === 'all' ? '论文题库' : `${modeNames[mode]}论文题`;
    refreshList();
}

function getModePapers() {
    const favorites = new Set(progress.favorites);
    if (mode === 'unfinished') return allPapers.filter(item => !progress.status[item.id]);
    if (mode === 'review') return allPapers.filter(item => progress.status[item.id] === 'review');
    if (mode === 'favorite') return allPapers.filter(item => favorites.has(item.id));
    return allPapers;
}

function matchesFilters(item) {
    if (filters.year && String(item.year) !== filters.year) return false;
    if (filters.topic && item.topic !== filters.topic) return false;
    if (!filters.search) return true;

    const searchable = [
        item.title,
        item.topic,
        item.prompt,
        item.analysis,
        item.knowledgeSummary,
        ...(item.tags || [])
    ].join(' ').toLowerCase();
    return searchable.includes(filters.search);
}

function refreshList(preferredId) {
    const previous = preferredId || currentPapers[currentIndex]?.id;
    currentPapers = getModePapers().filter(matchesFilters);
    const preferredIndex = previous ? currentPapers.findIndex(item => item.id === previous) : -1;
    currentIndex = preferredIndex >= 0 ? preferredIndex : Math.min(currentIndex, Math.max(0, currentPapers.length - 1));
    renderCurrent();
}

function renderCurrent() {
    const hasPapers = currentPapers.length > 0;
    byId('paper-view').classList.toggle('hidden', !hasPapers);
    byId('empty-state').classList.toggle('hidden', hasPapers);
    byId('position-btn').textContent = hasPapers ? `${currentIndex + 1} / ${currentPapers.length}` : '0 / 0';
    if (!hasPapers) return;

    const item = currentPapers[currentIndex];
    progress.lastId = item.id;
    saveProgress();

    byId('paper-number').textContent = `论文 ${item.number}`;
    byId('paper-date').textContent = `${item.year} 年 ${item.month} 月`;
    byId('paper-title').textContent = `${item.title}（${item.topic}）`;
    byId('paper-prompt').textContent = item.prompt;
    renderMeta(item);
    renderImages(item);
    renderDraft(item);
    renderAnswer(item);
    renderFavorite(item);
    renderSelfCheck(item);

    byId('prev-btn').disabled = currentIndex === 0;
    byId('next-btn').disabled = currentIndex === currentPapers.length - 1;
    byId('next-btn').textContent = currentIndex === currentPapers.length - 1 ? '已到最后一题' : '下一题';
}

function renderMeta(item) {
    const container = byId('paper-meta');
    container.replaceChildren();
    [
        `知识点：${item.topic}`,
        `难度：${item.difficulty || '未标注'}`,
        `频率：${item.frequency || '未标注'}`,
        `题号：${item.id}`
    ].forEach(text => container.appendChild(makeElement('span', 'meta-chip', text)));
}

function renderImages(item) {
    const container = byId('paper-images');
    container.replaceChildren();
    (item.images || []).forEach((source, index) => {
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

function renderDraft(item) {
    const value = progress.drafts[item.id] || '';
    byId('draft-input').value = value;
    updateWordCount(value);
    byId('save-state').textContent = '已自动保存';
}

function saveCurrentDraft(event) {
    const item = currentPapers[currentIndex];
    if (!item) return;
    const value = event.target.value;
    if (value.trim()) progress.drafts[item.id] = value;
    else delete progress.drafts[item.id];
    saveProgress();
    updateWordCount(value);
    byId('save-state').textContent = '已自动保存';
    updateCounts();
}

function updateWordCount(value) {
    const count = value.replace(/\s/g, '').length;
    byId('word-count').textContent = `${count} 字`;
}

async function copyDraft() {
    const value = byId('draft-input').value;
    if (!value) {
        window.alert('当前草稿为空。');
        return;
    }
    try {
        await navigator.clipboard.writeText(value);
        byId('save-state').textContent = '草稿已复制';
    } catch (error) {
        byId('draft-input').select();
        document.execCommand('copy');
        byId('save-state').textContent = '草稿已复制';
    }
}

function clearDraft() {
    const item = currentPapers[currentIndex];
    if (!item || !byId('draft-input').value) return;
    if (!window.confirm('确定清空本题草稿吗？此操作无法撤销。')) return;
    delete progress.drafts[item.id];
    saveProgress();
    renderDraft(item);
    updateCounts();
}

function renderAnswer(item) {
    const revealed = Boolean(progress.revealed[item.id] || progress.status[item.id]);
    byId('answer-panel').classList.toggle('hidden', !revealed);
    byId('analysis-text').textContent = item.analysis || '暂无参考思路。';
    byId('knowledge-summary').textContent = item.knowledgeSummary || '暂无浓缩知识点。';
    byId('reveal-btn').classList.toggle('hidden', revealed);
}

function revealAnswer() {
    const item = currentPapers[currentIndex];
    if (!item) return;
    progress.revealed[item.id] = true;
    if (!progress.status[item.id]) progress.status[item.id] = 'unrated';
    saveProgress();
    updateCounts();
    renderAnswer(item);
    renderSelfCheck(item);
    byId('answer-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setSelfCheck(value) {
    const item = currentPapers[currentIndex];
    if (!item) return;
    progress.status[item.id] = value;
    progress.revealed[item.id] = true;
    saveProgress();
    updateCounts();
    renderSelfCheck(item);
    if (mode === 'unfinished' || (mode === 'review' && value !== 'review')) refreshList();
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
    const item = currentPapers[currentIndex];
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
    if (target < 0 || target >= currentPapers.length) return;
    currentIndex = target;
    renderCurrent();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function jumpToPosition() {
    if (!currentPapers.length) return;
    const value = window.prompt(`输入题号（1 - ${currentPapers.length}）`, String(currentIndex + 1));
    if (value === null) return;
    const target = Number.parseInt(value, 10);
    if (!Number.isInteger(target) || target < 1 || target > currentPapers.length) {
        window.alert('请输入有效的题号。');
        return;
    }
    currentIndex = target - 1;
    renderCurrent();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resumeLearning() {
    setMode('all');
    const target = allPapers.find(item => !progress.status[item.id]) || allPapers[0];
    refreshList(target?.id);
}

function updateCounts() {
    const completed = allPapers.filter(item => Boolean(progress.status[item.id])).length;
    const unfinished = allPapers.length - completed;
    const review = allPapers.filter(item => progress.status[item.id] === 'review').length;
    const favorites = new Set(progress.favorites).size;

    byId('all-count').textContent = allPapers.length;
    byId('unfinished-count').textContent = unfinished;
    byId('review-count').textContent = review;
    byId('favorite-count').textContent = favorites;
    byId('progress-label').textContent = `${completed} / ${allPapers.length}`;
    byId('progress-bar').style.width = allPapers.length ? `${(completed / allPapers.length) * 100}%` : '0%';
}

function paperState(item) {
    const status = progress.status[item.id];
    if (status === 'review') return 'review';
    if (status) return 'complete';
    if (progress.drafts[item.id]) return 'draft';
    return 'untouched';
}

function openSheet() {
    const counts = { untouched: 0, draft: 0, complete: 0, review: 0 };
    const grid = byId('sheet-grid');
    grid.replaceChildren();

    allPapers.forEach(item => {
        const state = paperState(item);
        counts[state] += 1;
        const button = makeElement('button', `sheet-item ${state}`, String(item.number));
        button.type = 'button';
        button.title = `${item.title} ${item.topic}`;
        button.addEventListener('click', () => openPaperFromSheet(item));
        grid.appendChild(button);
    });

    const completed = counts.complete + counts.review;
    byId('sheet-summary').textContent = `已完成 ${completed} 题，待复习 ${counts.review} 题，有草稿 ${counts.draft} 题，未开始 ${counts.untouched} 题。`;
    byId('sheet-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function openPaperFromSheet(item) {
    mode = 'all';
    filters = { search: '', year: '', topic: '' };
    byId('search-input').value = '';
    byId('year-filter').value = '';
    byId('topic-filter').value = '';
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.toggle('active', nav.dataset.mode === 'all'));
    byId('mode-eyebrow').textContent = modeNames.all;
    byId('page-title').textContent = '论文题库';
    closeSheet();
    refreshList(item.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closeSheet() {
    byId('sheet-modal').classList.add('hidden');
    document.body.style.overflow = '';
}

function exportProgress() {
    const payload = {
        app: 'sa_paper',
        exportedAt: new Date().toISOString(),
        progress
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sa_paper_progress_${new Date().toISOString().slice(0, 10)}.json`;
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
            if (payload.app !== 'sa_paper' || !payload.progress) throw new Error('文件格式不匹配');
            progress = {
                ...createEmptyProgress(),
                ...payload.progress,
                status: payload.progress.status || {},
                favorites: Array.isArray(payload.progress.favorites) ? payload.progress.favorites : [],
                drafts: payload.progress.drafts || {},
                revealed: payload.progress.revealed || {}
            };
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
    if (!window.confirm('确定清除论文题的草稿、完成状态、复习标记和收藏吗？')) return;
    progress = createEmptyProgress();
    localStorage.removeItem(STORAGE_KEY);
    mode = 'all';
    filters = { search: '', year: '', topic: '' };
    byId('search-input').value = '';
    byId('year-filter').value = '';
    byId('topic-filter').value = '';
    document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.mode === 'all'));
    byId('mode-eyebrow').textContent = modeNames.all;
    byId('page-title').textContent = '论文题库';
    updateCounts();
    refreshList();
}

init();
