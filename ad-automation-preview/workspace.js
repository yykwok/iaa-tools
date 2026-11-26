import { providers, requestPlacements, workerEndpoint } from './providers.js';
import { resultView } from './results.js';

const platforms = [
    { id: 'unity', name: 'Unity Ads', icon: 'U', detail: 'Game ID · Placement ID' },
    { id: 'pangle', name: 'Pangle', icon: 'P', detail: 'App ID · 代码位 ID', fields: ['category-field'] },
    { id: 'moloco', name: 'Moloco', icon: 'Mo', detail: '后台建位 · 整理 ID', fields: ['moloco-fields'] },
    { id: 'mintegral', name: 'Mintegral', icon: 'M', detail: 'Placement ID · Unit ID',
        fields: ['mode-field', 'store-id-field'] },
    { id: 'liftoff', name: 'Liftoff Monetize', icon: 'L', detail: 'App ID · Reference ID',
        fields: ['mode-field', 'taxonomy-field'] },
    { id: 'ironsource', name: 'ironSource Ads', icon: 'iS', detail: 'App Key · Instance ID',
        fields: ['mode-field', 'taxonomy-field', 'ccpa-field'] },
    { id: 'admob', name: 'AdMob', icon: 'A', detail: 'App ID · Ad Unit ID', fields: ['link-store-field'] },
];

const sharedForm = document.getElementById('shared-app');
const appName = sharedForm.elements.namedItem('app_name');
const storeUrl = sharedForm.elements.namedItem('download_url');
const coppa = sharedForm.elements.namedItem('coppa');
const list = document.getElementById('platform-list');
const count = document.getElementById('enabled-count');
const cardTemplate = document.getElementById('platform-template');
const conditionalFields = [];

function showValidation(control, message) {
    control.setCustomValidity(message);
    control.reportValidity();
    control.setCustomValidity('');
    return false;
}

function validateSharedInput(platformId, provider) {
    if (!sharedForm.reportValidity()) return false;
    if (!appName.value.trim()) return showValidation(appName, '请输入应用名称。');
    if (platformId === 'pangle' && !storeUrl.value.trim()) {
        return showValidation(storeUrl, 'Pangle 需要 App Store 或 Google Play 链接。');
    }
    if (!provider.manual && platformId !== 'admob' && !coppa.value) {
        return showValidation(coppa, '请选择应用是否面向儿童。');
    }
    return true;
}

function syncStoreFields() {
    const hasUrl = Boolean(storeUrl.value.trim());
    for (const { input, showWithUrl } of conditionalFields) {
        const show = hasUrl === showWithUrl;
        input.closest('label').hidden = !show;
        input.disabled = !show;
    }
}

sharedForm.addEventListener('submit', event => event.preventDefault());
sharedForm.addEventListener('input', event => {
    if (event.target !== storeUrl && event.target.name !== 'platform') return;
    const consent = list.querySelector('[name="link_store"]');
    consent.checked = false;
    syncStoreFields();
});

for (const platform of platforms) {
    const { id, name, icon, detail, fields } = platform;
    const provider = { ...providers[id], endpoint: workerEndpoint(id) };
    const card = cardTemplate.content.firstElementChild.cloneNode(true);
    const toggle = card.querySelector('input[role="switch"]');
    const body = card.querySelector('.build-platform-body');
    const form = body.querySelector('form');
    const options = form.querySelector('.build-platform-fields');
    const button = form.querySelector('button');
    const link = form.querySelector('a');
    const result = resultView(body.querySelector('.result-box'), provider);
    card.dataset.platform = id;
    card.querySelector('.build-icon').textContent = icon;
    const heading = card.querySelector('h3');
    heading.id = `platform-${id}`;
    heading.textContent = name;
    card.setAttribute('aria-labelledby', heading.id);
    card.querySelector('.build-platform-name p').textContent = detail;
    body.id = `platform-fields-${id}`;
    toggle.setAttribute('aria-label', `启用 ${name}`);
    toggle.setAttribute('aria-controls', body.id);
    button.textContent = provider.manual ? '整理 ID' : '创建或复用广告位';
    link.href = provider.manual ? 'https://publisher.moloco.cloud/' : provider.endpoint;
    link.textContent = provider.manual ? '打开 Moloco 后台' : '检查接口或登录 Access';

    for (const field of fields || []) options.append(document.getElementById(field).content.cloneNode(true));
    for (const input of form.querySelectorAll('[name="link_store"], [name="taxonomy"], [name="store_id"]')) {
        conditionalFields.push({ input, showWithUrl: input.name !== 'store_id' });
    }

    toggle.addEventListener('change', () => {
        body.hidden = !toggle.checked;
        count.textContent = `${list.querySelectorAll('input[role="switch"]:checked').length} 个已开启`;
    });

    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (!toggle.checked || button.disabled || !validateSharedInput(id, provider)) return;

        const input = Object.fromEntries([...new FormData(sharedForm), ...new FormData(form)]);
        input.app_name = input.app_name.trim();
        if (input.app_category_code) input.app_category_code = Number(input.app_category_code);
        if (provider.manual) {
            result.showResult({
                app_id: input.app_id,
                placements: {
                    reward: { id: input.reward_id },
                    inter: { id: input.inter_id },
                    banner: { id: input.banner_id },
                },
            }, input);
            return;
        }

        const category = form.elements.namedItem('app_category_code')?.selectedOptions[0]?.text;
        const buttonText = button.textContent;
        toggle.disabled = true;
        button.disabled = true;
        button.textContent = '正在提交…';
        result.showStatus('正在提交建位请求…', 'pending');
        try {
            result.showResult(await requestPlacements(provider, input), input, category);
        } catch (error) {
            result.showStatus(error.message, 'error');
        } finally {
            button.disabled = false;
            toggle.disabled = false;
            button.textContent = buttonText;
        }
    });
    list.append(card);
}
syncStoreFields();
