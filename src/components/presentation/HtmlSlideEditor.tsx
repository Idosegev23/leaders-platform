'use client'

import { useRef, useCallback, useEffect, useState } from 'react'

/**
 * HtmlSlideEditor — editable HTML slide in an iframe.
 *
 * Injects a thin editing layer into GPT-generated HTML:
 * - Text elements become contentEditable on double-click
 * - Elements can be dragged (single click + drag)
 * - Parent receives updated HTML via onHtmlChange callback
 */

interface HtmlSlideEditorProps {
  html: string
  scale?: number
  onHtmlChange?: (newHtml: string) => void
  className?: string
}

// Editing script injected into the iframe
const EDITOR_SCRIPT = `
<script>
(function() {
  const slide = document.querySelector('.slide') || document.body.firstElementChild || document.body;
  let dragTarget = null;
  let dragStartX = 0, dragStartY = 0;
  let elemStartX = 0, elemStartY = 0;
  let isEditing = false;

  // Detect actual scale from CSS transform on the iframe
  function getScale() {
    try {
      const iframe = window.frameElement;
      if (iframe) {
        const transform = iframe.style.transform || '';
        const match = transform.match(/scale\\(([\\d.]+)\\)/);
        if (match) return parseFloat(match[1]);
      }
    } catch(e) {}
    return 1;
  }

  // Make all positioned elements interactive
  function initElements() {
    const elements = slide.querySelectorAll('[style*="position"]');
    elements.forEach(el => {
      const style = window.getComputedStyle(el);
      if (style.position !== 'absolute' && style.position !== 'relative') return;
      if (el === slide) return;
      if (el.tagName === 'IMG' && el.style.opacity && parseFloat(el.style.opacity) < 0.3) return; // skip bg images

      el.style.cursor = 'grab';

      // Visual hover indicator
      el.addEventListener('mouseenter', () => {
        if (!isEditing && !dragTarget) el.style.outline = '2px dashed rgba(59,130,246,0.5)';
      });
      el.addEventListener('mouseleave', () => {
        if (!isEditing && el !== dragTarget) el.style.outline = '';
      });

      // Double-click to edit text
      el.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const text = el.textContent && el.textContent.trim();
        if (!text) return;
        // Don't edit watermarks or decorative giant text
        const fs = parseFloat(window.getComputedStyle(el).fontSize) || 0;
        const op = parseFloat(window.getComputedStyle(el).opacity) || 1;
        if (fs > 200 && op < 0.15) return; // watermark

        el.contentEditable = 'true';
        el.style.outline = '2px solid #3b82f6';
        el.style.boxShadow = '0 0 0 4px rgba(59,130,246,0.2)';
        el.style.cursor = 'text';
        el.focus();
        isEditing = true;

        // Select all text for easy replacement
        try {
          const range = document.createRange();
          range.selectNodeContents(el);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        } catch(e) {}

        const exitEdit = () => {
          el.contentEditable = 'false';
          el.style.outline = '';
          el.style.boxShadow = '';
          el.style.cursor = 'grab';
          isEditing = false;
          notifyParent();
        };
        el.addEventListener('blur', exitEdit, { once: true });
        el.addEventListener('keydown', (ke) => {
          if (ke.key === 'Escape') { ke.preventDefault(); el.blur(); }
        });
      });

      // Single click + drag to move
      el.addEventListener('mousedown', (e) => {
        if (isEditing) return;
        if (e.detail >= 2) return;
        e.preventDefault();
        e.stopPropagation();
        dragTarget = el;
        dragStartX = e.pageX;
        dragStartY = e.pageY;
        elemStartX = parseInt(el.style.left) || el.offsetLeft;
        elemStartY = parseInt(el.style.top) || el.offsetTop;
        el.style.outline = '2px solid #3b82f6';
        el.style.boxShadow = '0 0 0 4px rgba(59,130,246,0.15)';
        el.style.cursor = 'grabbing';
        el.style.zIndex = '9999';
        el.style.transition = 'none';
      });
    });
  }

  document.addEventListener('mousemove', (e) => {
    if (!dragTarget) return;
    e.preventDefault();
    // Use pageX/pageY — these are in the iframe's native coordinate space (1920x1080)
    const dx = e.pageX - dragStartX;
    const dy = e.pageY - dragStartY;
    dragTarget.style.left = (elemStartX + dx) + 'px';
    dragTarget.style.top = (elemStartY + dy) + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (dragTarget) {
      dragTarget.style.outline = '';
      dragTarget.style.boxShadow = '';
      dragTarget.style.cursor = 'grab';
      dragTarget.style.zIndex = '';
      dragTarget.style.transition = '';
      dragTarget = null;
      notifyParent();
    }
  });

  // Click on empty space = deselect
  slide.addEventListener('click', (e) => {
    if (e.target === slide || e.target === document.body) {
      document.querySelectorAll('[contenteditable="true"]').forEach(el => el.blur());
      // Remove all outlines
      slide.querySelectorAll('[style*="outline"]').forEach(el => { el.style.outline = ''; el.style.boxShadow = ''; });
    }
  });

  function notifyParent() {
    // Clean up editor artifacts before saving
    slide.querySelectorAll('[style*="outline"]').forEach(el => { el.style.outline = ''; el.style.boxShadow = ''; });
    slide.querySelectorAll('[contenteditable]').forEach(el => { el.removeAttribute('contenteditable'); });

    const fullHtml = document.documentElement.outerHTML;
    window.parent.postMessage({ type: 'slide-html-update', html: '<!DOCTYPE html>' + fullHtml }, window.location.ancestorOrigins?.[0] || '*');
  }

  // Init after styles settle
  setTimeout(initElements, 200);

  // Re-init on dynamic content changes
  const observer = new MutationObserver(() => { setTimeout(initElements, 100); });
  observer.observe(slide, { childList: true, subtree: true });
})();
<\/script>
`;

export default function HtmlSlideEditor({
  html,
  scale = 0.55,
  onHtmlChange,
  className = '',
}: HtmlSlideEditorProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [isReady, setIsReady] = useState(false)
  const W = 1920
  const H = 1080

  // Inject editor script into HTML (robust: handle missing </body>)
  const editableHtml = html.includes('</body>')
    ? html.replace('</body>', EDITOR_SCRIPT + '</body>')
    : html.includes('</html>')
    ? html.replace('</html>', EDITOR_SCRIPT + '</html>')
    : html + EDITOR_SCRIPT

  // Listen for messages from iframe
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'slide-html-update' && onHtmlChange) {
        // Strip our editor script before saving
        const cleanHtml = event.data.html.replace(/<script>[\s\S]*?<\/script>/g, '')
        onHtmlChange(cleanHtml)
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [onHtmlChange])

  // Detect iframe load
  const handleLoad = useCallback(() => {
    setIsReady(true)
  }, [])

  return (
    <div className={`relative ${className}`}>
      {/* Toolbar */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-2 px-3 py-1.5 bg-gray-900/90 backdrop-blur-sm border-b border-gray-700 rounded-t-lg">
        <span className="text-[10px] text-emerald-400 font-medium">עריכה חיה</span>
        <span className="text-[10px] text-gray-500">|</span>
        <span className="text-[10px] text-gray-400">לחיצה כפולה = עריכת טקסט</span>
        <span className="text-[10px] text-gray-500">|</span>
        <span className="text-[10px] text-gray-400">גרירה = הזזת אלמנט</span>
        {!isReady && <span className="text-[10px] text-amber-400 animate-pulse mr-auto">טוען...</span>}
      </div>

      {/* Scaled iframe container */}
      <div
        style={{
          width: Math.round(W * scale),
          height: Math.round(H * scale),
          marginTop: 32, // toolbar height
          position: 'relative',
          overflow: 'hidden',
          borderRadius: '0 0 8px 8px',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <iframe
          ref={iframeRef}
          srcDoc={editableHtml}
          sandbox="allow-scripts allow-same-origin"
          onLoad={handleLoad}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: W,
            height: H,
            border: 'none',
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
          title="Slide Editor"
        />
      </div>
    </div>
  )
}
