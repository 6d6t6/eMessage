/**
 * Modular gesture handling for mobile bottom sheets and overlays.
 * Ensures consistent swipe-to-dismiss behavior across the application.
 */

const BottomSheetGestures = (function() {
    /**
     * Initialize swipe-to-dismiss gestures for a bottom sheet element.
     * @param {Object} config Configuration object
     * @param {HTMLElement} config.element The sheet element to drag (e.g., .context-menu)
     * @param {HTMLElement} config.overlay The overlay container (e.g., #contextMenuOverlay)
     * @param {Function} config.onClose Callback when sheet is dismissed
     * @param {Function} config.canDrag Optional check to see if dragging is allowed
     */
    function init(config) {
        const { element, overlay, onClose, canDrag } = config;
        if (!element) return;

        let startY = 0;
        let currentY = 0;
        let isDragging = false;
        let isClosing = false;
        let rafId = null;
        
        const THRESHOLD = 120;
        const VELOCITY_THRESHOLD = 0.5;
        const ANIMATION_DURATION = 300;
        const CURVE = 'cubic-bezier(0.1, 0.9, 0.2, 1)';

        element.addEventListener('touchstart', (e) => {
            if (isClosing || window.innerWidth > 900) return;
            
            // Custom drag check (e.g., check scroll position)
            if (canDrag && !canDrag(e)) return;

            startY = e.touches[0].clientY;
            currentY = startY;
            isDragging = true;
            
            // Prepare for dragging
            element.style.transition = 'none';
            element.style.willChange = 'transform';
            if (overlay) {
                overlay.style.transition = 'none';
                overlay.style.willChange = 'opacity';
            }
        }, { passive: true });

        element.addEventListener('touchmove', (e) => {
            if (!isDragging || isClosing) return;
            
            currentY = e.touches[0].clientY;
            
            if (rafId) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(update);
        }, { passive: true });

        function update() {
            if (!isDragging || isClosing) return;
            
            const deltaY = Math.max(0, currentY - startY);
            element.style.transform = `translateY(${deltaY}px)`;
            
            if (overlay) {
                // Subtle dimming: fade from 1.0 to 0.6 as we drag
                const progress = Math.min(deltaY / (element.offsetHeight || 400), 1);
                overlay.style.opacity = (1 - progress * 0.4).toString();
            }
        }

        element.addEventListener('touchend', (e) => {
            if (!isDragging || isClosing) return;
            isDragging = false;
            if (rafId) cancelAnimationFrame(rafId);
            
            const deltaY = currentY - startY;
            const velocity = deltaY / 100; // rough velocity
            
            const shouldClose = deltaY > THRESHOLD || (deltaY > 50 && velocity > VELOCITY_THRESHOLD);

            if (shouldClose) {
                close();
            } else {
                snapBack();
            }
        }, { passive: true });

        /**
         * Perform closing animation and trigger callback
         */
        function close() {
            if (isClosing) return;
            isClosing = true;

            element.style.transition = `transform ${ANIMATION_DURATION}ms ${CURVE}`;
            element.style.transform = 'translateY(100%)';
            
            if (overlay) {
                overlay.style.transition = `opacity ${ANIMATION_DURATION}ms ease`;
                overlay.style.opacity = '0';
            }

            setTimeout(() => {
                if (onClose) onClose();
                
                // Clean up state and styles after the animation is fully complete
                setTimeout(() => {
                    resetStyles();
                    isClosing = false;
                }, 50);
            }, ANIMATION_DURATION);
        }

        /**
         * Snap back to original position
         */
        function snapBack() {
            element.style.transition = `transform ${ANIMATION_DURATION}ms ${CURVE}`;
            element.style.transform = 'translateY(0)';
            
            if (overlay) {
                overlay.style.transition = `opacity ${ANIMATION_DURATION}ms ease`;
                overlay.style.opacity = '1';
            }

            // Clear inline styles after snap-back so they don't override CSS classes
            setTimeout(() => {
                if (!isDragging && !isClosing) {
                    resetStyles();
                }
            }, ANIMATION_DURATION);
        }

        function resetStyles() {
            element.style.transform = '';
            element.style.transition = '';
            element.style.willChange = '';
            if (overlay) {
                overlay.style.opacity = '';
                overlay.style.transition = '';
                overlay.style.willChange = '';
            }
        }
    }

    return {
        init
    };
})();

// Global registration
window.BottomSheetGestures = BottomSheetGestures;
