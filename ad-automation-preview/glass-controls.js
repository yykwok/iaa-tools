const controls = new WeakMap();
const fieldErrors = new WeakMap();
let pickerCount = 0;
let activePicker;

function element(tag, className, content) {
    const node = document.createElement(tag);
    node.className = className;
    if (content) node.textContent = content;
    return node;
}

function closePicker(focus = false) {
    if (!activePicker) return;
    const { trigger, menu } = activePicker;
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-activedescendant');
    activePicker = undefined;
    if (focus) trigger.focus({ preventScroll: true });
}

function placePicker() {
    if (!activePicker) return;
    const { trigger, menu } = activePicker;
    const anchor = trigger.getBoundingClientRect();
    if (anchor.bottom <= 0 || anchor.top >= window.innerHeight || !trigger.getClientRects().length) {
        closePicker();
        return;
    }

    const margin = 12;
    const gap = 6;
    const width = Math.min(Math.max(anchor.width, 190), document.documentElement.clientWidth - margin * 2);
    const left = Math.max(margin, Math.min(anchor.left, document.documentElement.clientWidth - width - margin));
    const below = window.innerHeight - anchor.bottom - gap - margin;
    const above = anchor.top - gap - margin;
    menu.style.width = `${width}px`;
    menu.style.left = `${left}px`;
    const opensUp = menu.scrollHeight > below && above > below;
    menu.style.maxHeight = `${Math.max(44, opensUp ? above : below)}px`;
    menu.style.top = `${opensUp ? Math.max(margin, anchor.top - gap - menu.offsetHeight) : anchor.bottom + gap}px`;
}

document.addEventListener('pointerdown', event => {
    if (!activePicker) return;
    const { trigger, menu } = activePicker;
    if (!trigger.contains(event.target) && !menu.contains(event.target)) closePicker();
}, true);

window.addEventListener('resize', placePicker);
window.addEventListener('scroll', event => {
    if (!(event.target instanceof Node) || !activePicker?.menu.contains(event.target)) placePicker();
}, true);

function enhancePicker(select) {
    let label = select.labels[0];
    const number = ++pickerCount;
    const trigger = element('button', 'glass-picker');
    trigger.type = 'button';
    trigger.id = `glass-trigger-${number}`;
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');

    const caption = element('span', 'glass-picker-value');
    caption.id = `glass-value-${number}`;
    const arrow = element('span', 'glass-disclosure');
    arrow.setAttribute('aria-hidden', 'true');
    trigger.append(caption, arrow);
    const menu = element('div', 'glass-menu');
    menu.id = `glass-menu-${number}`;
    menu.hidden = true;
    menu.setAttribute('role', 'listbox');
    trigger.setAttribute('aria-controls', menu.id);

    if (label?.contains(select)) {
        const wrapper = element('div', label.className);
        const visualLabel = element('label', 'glass-caption', label.querySelector(':scope > span').textContent.trim());
        label.replaceWith(wrapper);
        wrapper.append(visualLabel, select);
        label = visualLabel;
    }
    if (label) {
        label.id ||= `glass-label-${number}`;
        label.htmlFor = trigger.id;
        trigger.setAttribute('aria-labelledby', `${label.id} ${caption.id}`);
        menu.setAttribute('aria-labelledby', label.id);
    }

    select.before(trigger);
    select.classList.add('glass-native-select');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    document.body.append(menu);
    controls.set(select, trigger);

    const choices = Array.from(select.options).filter(option => option.value !== '' && !option.disabled);
    let activeIndex = -1;
    const rows = choices.map((option, index) => {
        const row = element('div', 'glass-option', option.label);
        row.id = `glass-option-${number}-${index}`;
        row.setAttribute('role', 'option');
        row.addEventListener('pointerdown', event => event.preventDefault());
        row.addEventListener('click', () => choose(option));
        menu.append(row);
        return row;
    });

    function sync() {
        caption.textContent = select.selectedOptions[0]?.label || '';
        trigger.disabled = select.disabled;
        trigger.toggleAttribute('data-placeholder', select.value === '');
        for (const [index, option] of choices.entries()) {
            rows[index].setAttribute('aria-selected', String(option.selected));
        }
        if (activePicker?.trigger === trigger) placePicker();
    }

    function highlight(index) {
        if (!rows.length) return;
        activeIndex = (index + rows.length) % rows.length;
        rows.forEach((row, rowIndex) => row.toggleAttribute('data-highlighted', rowIndex === activeIndex));
        trigger.setAttribute('aria-activedescendant', rows[activeIndex].id);
        const row = rows[activeIndex];
        if (row.offsetTop < menu.scrollTop) menu.scrollTop = row.offsetTop;
        if (row.offsetTop + row.offsetHeight > menu.scrollTop + menu.clientHeight) {
            menu.scrollTop = row.offsetTop + row.offsetHeight - menu.clientHeight;
        }
    }

    function openPicker(keyboard = false) {
        if (!rows.length || trigger.matches(':disabled')) return;
        closePicker();
        activePicker = { trigger, menu };
        menu.toggleAttribute('data-keyboard', keyboard);
        menu.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        placePicker();
        highlight(Math.max(choices.findIndex(option => option.selected), 0));
    }

    function choose(option) {
        if (!option) return;
        select.value = option.value;
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
        closePicker(true);
    }

    trigger.addEventListener('click', event => {
        if (activePicker?.trigger === trigger) closePicker();
        else openPicker(event.detail === 0);
    });
    trigger.addEventListener('keydown', event => {
        const open = activePicker?.trigger === trigger;
        const { key } = event;
        if (!open && ['ArrowDown', 'ArrowUp'].includes(key)) {
            event.preventDefault();
            openPicker(true);
            return;
        }
        if (!open) return;
        if (key === 'Tab') closePicker();
        if (key === 'Escape') {
            event.preventDefault();
            closePicker(true);
        }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) {
            event.preventDefault();
            menu.setAttribute('data-keyboard', '');
            if (key === 'Home') highlight(0);
            if (key === 'End') highlight(rows.length - 1);
            if (key === 'ArrowDown') highlight(activeIndex + 1);
            if (key === 'ArrowUp') highlight(activeIndex - 1);
        }
        if (key === 'Enter' || key === ' ') {
            event.preventDefault();
            choose(choices[activeIndex]);
        }
        if (key.length === 1 && key !== ' ' && !event.metaKey && !event.ctrlKey && !event.altKey) {
            const index = choices.findIndex(option => option.label.toLowerCase().startsWith(key.toLowerCase()));
            if (index !== -1) {
                menu.setAttribute('data-keyboard', '');
                highlight(index);
            }
        }
    });

    menu.addEventListener('pointermove', () => menu.removeAttribute('data-keyboard'));
    trigger.addEventListener('blur', () => {
        if (activePicker?.trigger === trigger) closePicker();
    });
    select.addEventListener('change', sync);
    select.addEventListener('focus', () => trigger.focus());
    sync();
}

function clearFieldError(control) {
    const error = fieldErrors.get(control);
    if (!error) return;
    const focusTarget = controls.get(control) || control;
    error.hidden = true;
    focusTarget.removeAttribute('aria-invalid');
    focusTarget.removeAttribute('aria-errormessage');
}

function setFieldError(control) {
    const focusTarget = controls.get(control) || control;
    let error = fieldErrors.get(control);
    if (!error) {
        error = element('small', 'glass-field-error');
        error.id = `glass-error-${++pickerCount}`;
        const field = focusTarget.closest('.build-field, .build-consent, .form-group, .ad-check') || focusTarget.parentElement;
        field.append(error);
        fieldErrors.set(control, error);
    }
    error.textContent = control.validity.customError ? control.validationMessage
        : control.validity.typeMismatch ? '请输入有效的商店链接。'
        : control.validity.valueMissing ? (control.matches('select, [type="checkbox"]') ? '请选择一项后继续。' : '请填写此项。')
        : control.validationMessage;
    error.hidden = false;
    focusTarget.setAttribute('aria-invalid', 'true');
    focusTarget.setAttribute('aria-errormessage', error.id);
    return focusTarget;
}

export function enhanceForm(form) {
    for (const select of form.querySelectorAll('select')) enhancePicker(select);

    let firstInvalid;
    form.addEventListener('invalid', event => {
        event.preventDefault();
        const focusTarget = setFieldError(event.target);
        if (firstInvalid) return;
        firstInvalid = focusTarget;
        queueMicrotask(() => {
            firstInvalid.focus();
            firstInvalid = undefined;
        });
    }, true);
    form.addEventListener('input', event => clearFieldError(event.target));
    form.addEventListener('change', event => clearFieldError(event.target));
}
