import { DurableObject } from 'cloudflare:workers';
import { accessAllowed } from './access.mjs';
import { createAdMob } from './ad-providers/admob.mjs';
import { createMintegral } from './ad-providers/mintegral.mjs';
import { createIronSource } from './ad-providers/ironsource.mjs';
import { createLiftoff } from './ad-providers/liftoff.mjs';
import { createPangle } from './ad-providers/pangle.mjs';
import { createUnity } from './ad-providers/unity.mjs';
import { validateInput } from './ad-providers/input.mjs';
import { AdError } from './ad-providers/shared.mjs';

const providers = {
    admob: createAdMob,
    ironsource: createIronSource,
    liftoff: createLiftoff,
    mintegral: createMintegral,
    pangle: createPangle,
    unity: createUnity,
};
const maxRequestBytes = 8192;

function json(payload, status) {
    return Response.json(payload, { status, headers: { 'Cache-Control': 'no-store' } });
}

function fail(message, status) {
    return json({ code: status, message }, status);
}

async function readInput(request) {
    if (!request.body) return null;
    const reader = request.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let size = 0;
    let text = '';
    try {
        for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > maxRequestBytes) return null;
            text += decoder.decode(value, { stream: true });
        }
        return JSON.parse(text + decoder.decode());
    } catch {
        return null;
    } finally {
        await reader.cancel().catch(() => {});
    }
}

export class AdPlacementLock extends DurableObject {
    running = false;

    async create(provider, input) {
        if (this.running) return { code: 409, message: '此平台还有建位请求正在处理，请稍后再提交。' };

        // The ad platform owns application and placement records. This lock only protects a live request.
        this.running = true;
        try {
            return { code: 200, data: await providers[provider](input, this.env) };
        } catch (error) {
            if (error instanceof AdError) return { code: error.status, message: error.message };
            console.error(JSON.stringify({ event: 'ad_placement_failed', provider }));
            return { code: 502, message: '建位结果未确认，请核对平台后台记录。' };
        } finally {
            this.running = false;
        }
    }
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const provider = url.pathname.match(/^\/api\/ad-placements\/([a-z]+)$/)?.[1];
        const origin = env.AD_PLACEMENTS_ORIGIN || 'https://hiyyk.com';
        if (url.origin !== origin || !Object.hasOwn(providers, provider)) return fail('未找到广告位接口。', 404);
        if (!(await accessAllowed(request, env))) return fail('请先登录 Cloudflare Access。', 401);

        if (request.method === 'GET') return json({ code: 200, message: 'Access 登录成功，请返回建位页面。' });
        if (request.method !== 'POST') return fail('该接口仅接受 POST。', 405);
        if (request.headers.get('Origin') !== origin) return fail('请求来源不正确。', 403);
        if (!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type') || '')) {
            return fail('请发送 JSON 格式的建位参数。', 415);
        }
        if (!env.AD_PLACEMENT_LOCKS) return fail('Cloudflare 尚未配置广告位并发绑定。', 503);

        try {
            const input = validateInput(await readInput(request), provider);
            const lock = env.AD_PLACEMENT_LOCKS.getByName(provider);
            const payload = await lock.create(provider, input);
            return json(payload, payload.code);
        } catch (error) {
            if (error instanceof AdError) return fail(error.message, error.status);
            console.error(JSON.stringify({ event: 'ad_placement_request_failed', provider }));
            return fail('建位结果未确认，请核对平台后台记录。', 502);
        }
    },
};
