import { deepEqual, equal } from 'node:assert/strict';
import { test } from 'node:test';
import { providers, readPlacements } from './providers.js';

test('Pangle keeps reused IDs and reports placement errors as text', () => {
    const { slots } = readPlacements({
        pangle_app_id: 4321,
        slots: {
            reward: { id: 123, is_new: false },
            inter: { id: 456, is_new: true },
            banner: { id: '创建失败: 权限不足', is_new: false },
        },
    }, providers.pangle);
    deepEqual(slots.map(slot => slot.id), ['123', '456', undefined]);
    deepEqual(slots.map(slot => slot.status), ['已复用', '新建', '创建失败: 权限不足']);
});

test('Vungle requires a confirmed placement reference ID', () => {
    const { slots } = readPlacements({
        placements: {
            reward: { id: 'REWARD-12345', is_new: true },
            inter: { id: '5ebe59be5e11600001aa6454', is_new: true },
            banner: { id: '配置成功', is_new: false },
        },
    }, providers.vungle);
    deepEqual(slots.map(slot => slot.id), ['REWARD-12345', undefined, undefined]);
});

test('Unity distinguishes its application ID and unconfirmed placement names', () => {
    const { appId, slots } = readPlacements({
        unity_project_id: 'project-id',
        unity_app_id: 'application-id',
        placements: {
            reward: { id: 'reward', name: 'reward', status: 'created' },
            inter: { id: 'inter', name: 'inter' },
        },
    }, providers.unity);
    equal(appId, 'application-id');
    deepEqual(slots.map(slot => slot.id), ['reward', undefined, undefined]);
    equal(readPlacements({ unity_project_id: 'old-application-id' }, providers.unity).appId, 'old-application-id');
});
