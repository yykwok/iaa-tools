import { providers, requestPlacements, workerEndpoint } from './providers.js';
import { resultView } from './results.js';

const form = document.getElementById('adForm');
const result = document.getElementById('result-box');
const button = document.getElementById('submitBtn');
const providerName = form.dataset.provider;
const provider = form.dataset.worker === 'true'
    ? { ...providers[providerName], endpoint: workerEndpoint(providerName) }
    : providers[providerName];

const { showStatus, showResult } = resultView(result, provider);

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
