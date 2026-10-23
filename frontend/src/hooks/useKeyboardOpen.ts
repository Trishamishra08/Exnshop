import { useEffect, useState } from 'react';

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
const isEditable = (el: EventTarget | null): boolean => {
  const node = el as HTMLElement | null;
  if (!node) return false;
  if (EDITABLE_TAGS.has(node.tagName)) {
    // A disabled/readonly/checkbox/radio/file field never opens the on-screen keyboard.
    const input = node as HTMLInputElement;
    if (input.disabled || input.readOnly) return false;
    if (node.tagName === 'INPUT' && ['checkbox', 'radio', 'file', 'range', 'button', 'submit'].includes(input.type)) return false;
    return true;
  }
  return node.isContentEditable === true;
};

/**
 * True while a text field on the page has focus, i.e. the on-screen keyboard
 * is (almost certainly) open. A `position: fixed` bottom bar anchored to the
 * layout viewport can end up rendered mid-screen, floating above the
 * keyboard instead of at the real bottom, once the keyboard resizes the
 * visible area — tracking focus (not viewport size, which behaves
 * inconsistently across Android/iOS browsers) is what lets a fixed nav hide
 * itself for exactly that window instead of fighting the keyboard.
 */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      if (isEditable(e.target)) setOpen(true);
    };
    const onFocusOut = (e: FocusEvent) => {
      if (isEditable(e.target)) {
        // The next element (if any) can already be focused by the time this fires;
        // only close if focus didn't land on another editable field.
        requestAnimationFrame(() => {
          if (!isEditable(document.activeElement)) setOpen(false);
        });
      }
    };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  return open;
}
