/**
 * FromScratch - Context Menu Module
 * Right-click context menu with context-sensitive options.
 * Shows different actions based on what's under the cursor.
 */

let menuEl = null;
let backdropEl = null;
let isVisible = false;

/**
 * Initialize the context menu.
 * @param {HTMLElement} container - Parent element to append menu to
 */
export function initContextMenu(container) {
    // Create backdrop (invisible click catcher to close menu)
    backdropEl = document.createElement('div');
    backdropEl.className = 'context-menu-backdrop';
    backdropEl.addEventListener('mousedown', hide);
    backdropEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        hide();
    });
    container.appendChild(backdropEl);

    // Create menu element
    menuEl = document.createElement('div');
    menuEl.className = 'context-menu';
    container.appendChild(menuEl);
}

/**
 * Show the context menu at a screen position with given items.
 * @param {number} x - Screen X position
 * @param {number} y - Screen Y position
 * @param {Array<{label: string, icon?: string, action: Function, separator?: boolean}>} items
 */
export function showContextMenu(x, y, items) {
    if (!menuEl) return;

    // Build menu items
    menuEl.innerHTML = '';

    for (const item of items) {
        if (item.separator) {
            const sep = document.createElement('div');
            sep.className = 'context-menu-separator';
            menuEl.appendChild(sep);
            continue;
        }

        const menuItem = document.createElement('div');
        menuItem.className = 'context-menu-item';

        if (item.icon) {
            const icon = document.createElement('span');
            icon.className = 'context-menu-icon';
            icon.textContent = item.icon;
            menuItem.appendChild(icon);
        }

        const label = document.createElement('span');
        label.className = 'context-menu-label';
        label.textContent = item.label;
        menuItem.appendChild(label);

        if (item.shortcut) {
            const shortcut = document.createElement('span');
            shortcut.className = 'context-menu-shortcut';
            shortcut.textContent = item.shortcut;
            menuItem.appendChild(shortcut);
        }

        menuItem.addEventListener('click', (e) => {
            e.stopPropagation();
            hide();
            item.action();
        });

        menuEl.appendChild(menuItem);
    }

    // Position the menu, keeping it on screen
    menuEl.style.left = x + 'px';
    menuEl.style.top = y + 'px';

    // Show
    backdropEl.classList.add('visible');
    menuEl.classList.add('visible');
    isVisible = true;

    // Adjust if off-screen (after visible so we can measure)
    requestAnimationFrame(() => {
        const rect = menuEl.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        if (rect.right > vw) {
            menuEl.style.left = (x - rect.width) + 'px';
        }
        if (rect.bottom > vh) {
            menuEl.style.top = (y - rect.height) + 'px';
        }
    });
}

/**
 * Hide the context menu.
 */
export function hide() {
    if (!menuEl) return;
    backdropEl.classList.remove('visible');
    menuEl.classList.remove('visible');
    isVisible = false;
}

/**
 * Check if the context menu is currently visible.
 * @returns {boolean}
 */
export function isContextMenuVisible() {
    return isVisible;
}
