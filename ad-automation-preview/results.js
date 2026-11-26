import { readPlacements } from './providers.js';

function element(tag, text, className) {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    return node;
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

export function resultView(result, provider) {
    function showStatus(text, state) {
        result.replaceChildren(element('p', text, 'ad-status'));
        result.dataset.state = state;
        result.hidden = false;
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

    return { showStatus, showResult };
}
