/**
 * FromScratch - Preview Scheduler
 * RAF-based coalescing scheduler for OCCT preview updates.
 *
 * Replaces setTimeout(..., 100) debounce with requestAnimationFrame coalescing.
 * Latency drops from fixed 100ms to ~16ms (next frame).
 * If a new value arrives during computation, it immediately reschedules.
 */

/**
 * Create a preview scheduler that coalesces rapid updates into single RAF callbacks.
 * @param {Function} computeFn - The (potentially expensive) function to call with the latest value.
 *                                Called as computeFn(value). May be synchronous.
 * @returns {{ schedule: Function, cancel: Function }}
 */
export function createPreviewScheduler(computeFn) {
    let pendingValue = undefined;
    let hasPending = false;
    let rafId = null;
    let computing = false;

    function tick() {
        rafId = null;
        if (!hasPending) return;

        const value = pendingValue;
        hasPending = false;
        pendingValue = undefined;

        computing = true;
        try {
            computeFn(value);
        } finally {
            computing = false;
        }

        // If a new value arrived during computation, schedule again
        if (hasPending && rafId === null) {
            rafId = requestAnimationFrame(tick);
        }
    }

    return {
        /**
         * Schedule computeFn to be called with this value on the next animation frame.
         * If called multiple times before the frame fires, only the latest value is used.
         */
        schedule(value) {
            pendingValue = value;
            hasPending = true;
            if (rafId === null && !computing) {
                rafId = requestAnimationFrame(tick);
            }
        },

        /**
         * Cancel any pending scheduled computation.
         */
        cancel() {
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
            pendingValue = undefined;
            hasPending = false;
        }
    };
}
