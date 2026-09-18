import { useEffect } from 'react';

// 为探索路径提供完整键盘操作：
//   ↑/↓ 或 ←/→ 在选项间移动焦点；Enter/Space 原生按钮即可选择
//   Backspace / Alt+←  返回上一节（返回上一个节点，而非离开页面）
//   Esc                 在输入框之外也触发返回
// 屏幕阅读器用户同样能用 Tab 顺序逐项抵达，这里只做增强、不替代原生语义。
export function useJourneyKeys({
  enabled,
  optionCount,
  canGoBack,
  onChoose,
  onBack,
  listRef,
  busy,
}) {
  useEffect(() => {
    if (!enabled) return undefined;

    const focusableOptions = () => {
      const node = listRef.current;
      if (!node) return [];
      return [...node.querySelectorAll('button[data-option-id]:not([disabled])')];
    };

    const onKeyDown = (event) => {
      const target = event.target;
      const typing = target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (typing || busy) return;

      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        const options = focusableOptions();
        if (!options.length) return;
        event.preventDefault();
        const index = options.indexOf(document.activeElement);
        const next = options[Math.min(index + 1, options.length - 1)] ?? options[0];
        next.focus();
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        const options = focusableOptions();
        if (!options.length) return;
        event.preventDefault();
        const index = options.indexOf(document.activeElement);
        const nextIndex = index <= 0 ? options.length - 1 : index - 1;
        options[nextIndex].focus();
      } else if ((event.key === 'Backspace' || event.key === 'Escape') && canGoBack) {
        // Alt+← 交给浏览器历史；单独的 Backspace/Esc 在探索内返回一节
        if (event.key === 'Backspace' && event.altKey) return;
        event.preventDefault();
        onBack();
      } else if (event.key === 'Home') {
        const options = focusableOptions();
        if (options.length) { event.preventDefault(); options[0].focus(); }
      } else if (event.key === 'End') {
        const options = focusableOptions();
        if (options.length) { event.preventDefault(); options[options.length - 1].focus(); }
      } else if (/^[1-9]$/.test(event.key)) {
        // 数字键直达第 N 个选项
        const options = focusableOptions();
        const picked = options[Number(event.key) - 1];
        if (picked) {
          event.preventDefault();
          picked.click();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, optionCount, canGoBack, onChoose, onBack, listRef, busy]);
}
