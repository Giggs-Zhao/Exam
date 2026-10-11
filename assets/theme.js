(function () {
    const STORAGE_KEY = 'sa-theme';
    const root = document.documentElement;

    function getTheme() {
        return root.dataset.theme === 'dark' ? 'dark' : 'light';
    }

    function applyTheme(theme) {
        const next = theme === 'dark' ? 'dark' : 'light';
        root.dataset.theme = next;
        root.style.colorScheme = next;
        try { localStorage.setItem(STORAGE_KEY, next); } catch (_) { /* storage unavailable */ }
        document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
            const isDark = next === 'dark';
            button.setAttribute('aria-pressed', String(isDark));
            button.textContent = isDark ? '☀️ 白天模式' : '🌙 夜间模式';
            button.title = isDark ? '切换到白天模式' : '切换到夜间模式';
        });
    }

    function init() {
        let saved = 'light';
        try { saved = localStorage.getItem(STORAGE_KEY) || 'light'; } catch (_) { /* storage unavailable */ }
        applyTheme(saved);
        document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
            button.addEventListener('click', () => applyTheme(getTheme() === 'dark' ? 'light' : 'dark'));
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
