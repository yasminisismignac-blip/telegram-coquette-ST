/**
 * Telegram Coquette — SillyTavern extension
 * v1.1 — esconde as barras nativas de forma garantida
 */

import { extension_settings, getContext } from '../../../extensions.js';
import { eventSource, event_types, saveSettingsDebounced } from '../../../../script.js';

const MODULE_NAME = 'telegram-coquette';

/* ------------------------------------------------------------------ *
 *  BOTÕES NATIVOS DO ST — chamados pelo menu "⋮"
 * ------------------------------------------------------------------ */
const ST_BUTTONS = {
    options:    'options_button',
    extensions: 'extensionsMenuButton',
    persona:    'persona-button',
    api:        'ai-config-button',
    settings:   'sys-settings-button',
    lore:       'rightNavHolder',
    chars:      'rm_button_characters',
};

/* ------------------------------------------------------------------ *
 *  BARRAS NATIVAS — todos os seletores candidatos.
 *  Se aparecer uma versão nova do ST, adicione o id/classe aqui.
 * ------------------------------------------------------------------ */
const BAR_SELECTORS = [
    '#top-bar',
    '#top-settings-holder',
    '#top-bar-container',
    '.top-bar',
];

const DEFAULTS = Object.freeze({
    enabled: true,
    hideTopBar: true,
    showAvatars: true,
    bubbleTail: true,
    typing: true,
    tint: 'rose',
});

let typingActive = false;
let barObserver = null;

/* ------------------------------ settings ------------------------------ */

function settings() {
    if (!extension_settings[MODULE_NAME] || typeof extension_settings[MODULE_NAME] !== 'object') {
        extension_settings[MODULE_NAME] = { ...DEFAULTS };
    }
    for (const [k, v] of Object.entries(DEFAULTS)) {
        if (extension_settings[MODULE_NAME][k] === undefined) {
            extension_settings[MODULE_NAME][k] = v;
        }
    }
    return extension_settings[MODULE_NAME];
}

/* --------------------------- BARRAS NATIVAS --------------------------- */

function collectBars() {
    const found = new Set();
    for (const sel of BAR_SELECTORS) {
        try {
            document.querySelectorAll(sel).forEach((el) => {
                if (el && el !== document.body && el !== document.documentElement) {
                    found.add(el);
                }
            });
        } catch (_) { /* seletor inválido: ignora */ }
    }
    return [...found];
}

/**
 * Esconde/mostra as barras do SillyTavern.
 * Usa style inline com !important — ganha de qualquer CSS do ST.
 * Retorna quantos elementos foram encontrados (para o debug).
 */
function applyBarsVisibility() {
    const s = settings();
    const shouldHide = !!(s.enabled && s.hideTopBar);
    const bars = collectBars();

    for (const el of bars) {
        if (shouldHide) {
            el.style.setProperty('display', 'none', 'important');
            el.style.setProperty('visibility', 'hidden', 'important');
            el.setAttribute('data-tgq-hidden', '1');
        } else if (el.hasAttribute('data-tgq-hidden')) {
            el.style.removeProperty('display');
            el.style.removeProperty('visibility');
            el.removeAttribute('data-tgq-hidden');
        }
    }

    document.body.classList.toggle('tgq-hide-topbar', shouldHide);
    document.body.dataset.tgqBars = String(bars.length);
    return bars.length;
}

/** Se o ST recriar a barra depois, a gente esconde de novo. */
function startBarWatch() {
    if (barObserver) return;
    barObserver = new MutationObserver(() => {
        if (!document.body.classList.contains('tgq-hide-topbar')) return;
        for (const el of collectBars()) {
            if (el.style.getPropertyValue('display') !== 'none') {
                el.style.setProperty('display', 'none', 'important');
                el.style.setProperty('visibility', 'hidden', 'important');
                el.setAttribute('data-tgq-hidden', '1');
            }
        }
    });
    barObserver.observe(document.body, { childList: true });
}

/* ---------------------------- tema / classes ---------------------------- */

function applyTheme() {
    const s = settings();
    const b = document.body;

    b.classList.toggle('tgq-on', !!s.enabled);
    b.classList.toggle('tgq-avatars', !!s.showAvatars);
    b.classList.toggle('tgq-tails', !!s.bubbleTail);
    b.dataset.tgqTint = s.tint || 'rose';

    applyBarsVisibility();
    updateTyping();
    updateHeader();
}

function updateTyping() {
    const s = settings();
    document.body.classList.toggle('tgq-bot-typing', !!(s.enabled && s.typing && typingActive));
}

/* -------------------------------- header -------------------------------- */

function buildHeader() {
    if (document.getElementById('tgq-header')) return;

    const header = document.createElement('header');
    header.id = 'tgq-header';
    header.innerHTML = `
        <button class="tgq-icon-btn" id="tgq-back" title="Conversas">☰</button>
        <div class="tgq-chat-info">
            <div class="tgq-avatar" id="tgq-avatar">T</div>
            <div class="tgq-titles">
                <div class="tgq-name" id="tgq-name">Telegram</div>
                <div class="tgq-status" id="tgq-status">online</div>
            </div>
        </div>
        <div class="tgq-actions">
            <button class="tgq-icon-btn" id="tgq-search" title="Buscar">🔍</button>
            <button class="tgq-icon-btn" id="tgq-menu" title="Menu">⋮</button>
            <div class="tgq-dropdown" id="tgq-dropdown">
                <button data-st="${ST_BUTTONS.options}">⚙️ Opções do chat</button>
                <button data-st="${ST_BUTTONS.chars}">🗂️ Conversas / Personagens</button>
                <button data-st="${ST_BUTTONS.lore}">📚 Lorebook</button>
                <button data-st="${ST_BUTTONS.persona}">🎀 Persona</button>
                <button data-st="${ST_BUTTONS.api}">🤖 API e modelos</button>
                <button data-st="${ST_BUTTONS.extensions}">🧩 Extensões</button>
                <button data-st="${ST_BUTTONS.settings}">🛠️ Configurações</button>
                <button id="tgq-toggle-bars" class="tgq-sep">🙈 Esconder / mostrar barra do ST</button>
            </div>
        </div>`;
    document.body.appendChild(header);

    header.querySelector('#tgq-menu').addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('tgq-dropdown')?.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#tgq-actions')) {
            document.getElementById('tgq-dropdown')?.classList.remove('open');
        }
    });

    header.querySelectorAll('#tgq-dropdown button[data-st]').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.getElementById('tgq-dropdown')?.classList.remove('open');
            const target = document.getElementById(btn.dataset.st);
            if (target) target.click();
        });
    });

    header.querySelector('#tgq-toggle-bars').addEventListener('click', () => {
        const s = settings();
        s.hideTopBar = !s.hideTopBar;
        const cb = document.getElementById('tgq-hide-topbar');
        if (cb) cb.checked = s.hideTopBar;
        saveSettingsDebounced();
        applyTheme();
        document.getElementById('tgq-dropdown')?.classList.remove('open');
    });

    header.querySelector('#tgq-back').addEventListener('click', () => {
        for (const id of [ST_BUTTONS.chars, 'rightNavHolder', 'leftNavHolder']) {
            const el = document.getElementById(id);
            if (el) { el.click(); return; }
        }
    });

    header.querySelector('#tgq-search').addEventListener('click', () => {
        const el = document.getElementById('search_button')
            || document.querySelector('.mes_search_button, [data-i18n="Search"]');
        if (el) el.click();
    });
}

function updateHeader() {
    const nameEl = document.getElementById('tgq-name');
    const avatarEl = document.getElementById('tgq-avatar');
    const statusEl = document.getElementById('tgq-status');
    if (!nameEl || !avatarEl || !statusEl) return;

    const context = getContext();
    const char = context.characters?.[context.characterId];
    const name = char?.name || 'Telegram';
    nameEl.textContent = name;

    const imgs = document.querySelectorAll('#chat .mes:not(.is_user):not(.is_system) .avatar img');
    const last = imgs.length ? imgs[imgs.length - 1] : null;

    if (last?.getAttribute('src')) {
        const img = document.createElement('img');
        img.src = last.getAttribute('src');
        img.alt = name;
        avatarEl.replaceChildren(img);
    } else {
        avatarEl.textContent = name.trim().charAt(0).toUpperCase() || 'T';
    }

    statusEl.textContent = (settings().typing && typingActive) ? 'digitando…' : 'online';
}

/* ------------------------------ painel de settings ------------------------------ */

function buildSettingsPanel() {
    const holder = document.querySelector('#extensions_settings2')
        || document.querySelector('#extensions_settings');
    if (!holder || document.getElementById('tgq-settings')) return;

    holder.insertAdjacentHTML('beforeend', `
    <div id="tgq-settings" class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>🎀 Telegram Coquette</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
            <label class="checkbox_label"><input type="checkbox" id="tgq-enabled"> Ativar o tema</label>
            <label class="checkbox_label"><input type="checkbox" id="tgq-hide-topbar"> Esconder a barra do SillyTavern</label>
            <label class="checkbox_label"><input type="checkbox" id="tgq-avatars"> Mostrar avatares redondos</label>
            <label class="checkbox_label"><input type="checkbox" id="tgq-tails"> Rabinho nas bolhas</label>
            <label class="checkbox_label"><input type="checkbox" id="tgq-typing"> Mostrar "digitando…"</label>
            <label class="checkbox_label" style="margin-top:8px;">
                Paleta:
                <select id="tgq-tint" class="text_pole" style="margin-left:8px;">
                    <option value="rose">Rosa escuro (coquette)</option>
                    <option value="lilac">Lilás suave</option>
                    <option value="noir">Preto & rosa chiclete</option>
                </select>
            </label>
            <small style="opacity:.65; display:block; margin-top:8px;">
                Os botões do SillyTavern estão no "⋮" do cabeçalho do chat.
            </small>
        </div>
    </div>`);

    const bind = (id, key, type = 'checkbox') => {
        const el = document.getElementById(id);
        if (!el) return;
        if (type === 'checkbox') el.checked = !!settings()[key];
        else el.value = settings()[key];
        el.addEventListener('change', () => {
            settings()[key] = type === 'checkbox' ? el.checked : el.value;
            saveSettingsDebounced();
            applyTheme();
        });
    };

    bind('tgq-enabled', 'enabled');
    bind('tgq-hide-topbar', 'hideTopBar');
    bind('tgq-avatars', 'showAvatars');
    bind('tgq-tails', 'bubbleTail');
    bind('tgq-typing', 'typing');
    bind('tgq-tint', 'tint', 'select');
}

/* -------------------------------- FAB -------------------------------- */

function buildFab() {
    if (document.getElementById('tgq-fab')) return;
    const fab = document.createElement('button');
    fab.id = 'tgq-fab';
    fab.title = 'Ligar/desligar Telegram Coquette';
    fab.textContent = '🎀';
    fab.addEventListener('click', () => {
        settings().enabled = !settings().enabled;
        const cb = document.getElementById('tgq-enabled');
        if (cb) cb.checked = settings().enabled;
        saveSettingsDebounced();
        applyTheme();
    });
    document.body.appendChild(fab);
}

/* -------------------------------- eventos -------------------------------- */

function on(name, fn) {
    if (name) eventSource.on(name, fn);
}

function bindEvents() {
    on(event_types.CHAT_CHANGED, () => { updateHeader(); });
    on(event_types.CHARACTER_SELECTED, () => setTimeout(updateHeader, 250));
    on(event_types.MESSAGE_RENDERED, () => updateHeader());
    on(event_types.GENERATION_STARTED, () => { typingActive = true; updateTyping(); updateHeader(); });
    on(event_types.GENERATION_ENDED, () => { typingActive = false; updateTyping(); updateHeader(); });
    on(event_types.GENERATION_STOPPED, () => { typingActive = false; updateTyping(); updateHeader(); });
}

/* -------------------------------- init -------------------------------- */

jQuery(async () => {
    settings();
    buildSettingsPanel();
    buildHeader();
    buildFab();
    bindEvents();
    applyTheme();
    startBarWatch();

    // o ST termina de montar a UI depois — reforça em alguns momentos
    [300, 800, 1500, 3000].forEach((t) => setTimeout(() => {
        applyBarsVisibility();
        updateHeader();
    }, t));

    // API de debug no console
    window.tgq = {
        applyTheme,
        applyBarsVisibility,
        settings,
        updateHeader,
        debugBars() {
            const bars = collectBars();
            console.table(bars.map((el) => ({
                alvo: el.id ? '#' + el.id : '.' + [...el.classList].join('.'),
                tag: el.tagName,
                display: getComputedStyle(el).display,
                inline: el.style.getPropertyValue('display') || '(vazio)',
                height: getComputedStyle(el).height,
                zIndex: getComputedStyle(el).zIndex,
            })));
            console.log('Se o elemento da barra NÃO estiver nessa lista,',
                'rode: document.querySelectorAll("[id*=top], [class*=top]")');
            return bars;
        },
    };

    console.log('[Telegram Coquette] carregado 🎀 v1.1');
});
