import { providers, requestPlacements, readPlacements, workerEndpoint } from './providers.js';

const form = document.getElementById('adForm');
const result = document.getElementById('result-box');
const button = document.getElementById('submitBtn');
const providerName = form.dataset.provider;
const provider = form.dataset.worker === 'true'
    ? { ...providers[providerName], endpoint: workerEndpoint(providerName) }
    : providers[providerName];

function element(tag, text, className) {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    return node;
}

function showStatus(text, state) {
    result.replaceChildren(element('p', text, 'ad-status'));
    result.dataset.state = state;
    result.hidden = false;
}

function addResultRow(list, label, value, state) {
    const row = element('div', '', 'ad-result-row');
    row.append(element('dt', label));
    const details = element('dd', '');
    details.append(value);
    if (state) details.append(element('small', state));
    row.append(details);
    list.append(row);
}

function showResult(response, input, category) {
    const { appId, gameId, appName, appStatus, slots } = readPlacements(response, provider);
    const confirmed = slots.filter(slot => slot.id);
    const inactive = slots.filter(slot => slot.needsActivation).length;
    if (provider.manual) {
        showStatus(`已录入 ${confirmed.length}/${slots.length} 个广告位 ID，请对照 Moloco 后台核对。`, 'partial');
    } else if (!appId && confirmed.length === 0) {
        showStatus('接口未返回可确认的应用或广告位 ID。', 'error');
    } else if (!appId || confirmed.length < slots.length) {
        showStatus(`已确认 ${confirmed.length}/${slots.length} 个广告位，请核对其余结果。`, 'partial');
    } else if (inactive) {
        showStatus(`已返回全部 ID，${inactive} 个实例需要在平台后台启用。`, 'partial');
    } else {
        showStatus('应用和 3 个广告位已确认。', 'success');
    }

    const list = element('dl', '', 'ad-results');
    const platform = input.platform === 'android' ? 'Android' : 'iOS';
    addResultRow(list, '应用', element('span', appName || input.app_name));
    addResultRow(list, '所选平台', element('span', platform));
    if (category) addResultRow(list, '应用类别', element('span', category));
    if (gameId) addResultRow(list, provider.gameIdLabel, element('code', gameId));
    addResultRow(list, provider.appIdLabel, appId ? element('code', appId) : element('span', '未确认'), appStatus);
    for (const { label, name, id, placementId, status } of slots) {
        const detail = name && id && name !== id ? `${name} · ${status}` : status;
        const value = id ? element('code', id) : element('span', '未确认');
        if (placementId) {
            const pair = document.createDocumentFragment();
            pair.append(element('small', provider.placementIdLabel), element('code', placementId),
                element('small', provider.slotIdLabel), value);
            addResultRow(list, label, pair, detail);
        } else {
            addResultRow(list, label, value, detail);
        }
    }
    result.append(list);

    const identifiers = confirmed.flatMap(({ label, id, placementId }) => placementId
        ? [`${label} ${provider.placementIdLabel}\t${placementId}`, `${label} ${provider.slotIdLabel}\t${id}`]
        : [`${label}\t${id}`]);
    if (appId) identifiers.unshift(`${provider.appIdLabel}\t${appId}`);
    if (gameId) identifiers.unshift(`${provider.gameIdLabel}\t${gameId}`);
    if (!identifiers.length || !navigator.clipboard) return;

    const copy = element('button', provider.manual ? '复制录入的 ID' : '复制已确认的 ID', 'ad-copy');
    copy.type = 'button';
    const feedback = element('span', '', 'ad-copy-status');
    copy.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(identifiers.join('\n'));
            feedback.textContent = '已复制';
        } catch {
            feedback.textContent = '复制失败，请手动选中 ID。';
        }
    });
    result.append(copy, feedback);
}

form.addEventListener('submit', async event => {
    event.preventDefault();
    if (button.disabled) return;

    const input = Object.fromEntries(new FormData(form));
    input.app_name = input.app_name.trim();
    if (!input.app_name) {
        const name = form.elements.namedItem('app_name');
        name.value = '';
        name.reportValidity();
        return;
    }

    if (input.download_url && !/^https?:\/\//i.test(input.download_url)) {
        const url = form.elements.namedItem('download_url');
        url.setCustomValidity('请输入以 https:// 或 http:// 开头的应用商店链接。');
        url.reportValidity();
        url.setCustomValidity('');
        return;
    }

    if (input.user_id) input.user_id = Number(input.user_id);
    if (input.app_category_code) input.app_category_code = Number(input.app_category_code);

    if (provider.manual) {
        showResult({
            app_id: input.app_id,
            placements: {
                reward: { id: input.reward_id },
                inter: { id: input.inter_id },
                banner: { id: input.banner_id },
            },
        }, input);
        return;
    }

    const buttonText = button.textContent;
    const category = form.elements.namedItem('app_category_code')?.selectedOptions[0]?.text;
    button.disabled = true;
    button.textContent = '正在生成…';
    showStatus('正在提交建位请求…', 'pending');
    try {
        showResult(await requestPlacements(provider, input), input, category);
    } catch (error) {
        showStatus(error.message, 'error');
    } finally {
        button.disabled = false;
        button.textContent = buttonText;
    }
});
