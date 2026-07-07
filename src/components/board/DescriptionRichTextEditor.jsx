import React, { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold,
  Code,
  Italic,
  Link2,
  List,
  ListOrdered,
  Redo2,
  Strikethrough,
  Undo2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { htmlToStoredMarkdown, storedDescriptionToHtml } from '@/lib/richTextConversion';

function EditorToolbar({ editor, readOnly }) {
  if (!editor || readOnly) return null;

  const runLink = () => {
    const prev = editor.getAttributes('link').href;
    const url = typeof window !== 'undefined' ? window.prompt('Link URL', prev || 'https://') : '';
    if (url === null) return;
    const u = String(url).trim();
    if (u === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: u }).run();
  };

  const btn = (props) => (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8 rounded-lg shrink-0"
      {...props}
    />
  );

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex flex-wrap items-center gap-0.5 border-b border-border/60 bg-muted/35 px-1 py-0.5"
    >
      {btn({
        title: 'Bold',
        'aria-label': 'Bold',
        onClick: () => editor.chain().focus().toggleBold().run(),
        disabled: !editor.can().chain().focus().toggleBold().run(),
        children: <Bold className="w-4 h-4" />,
      })}
      {btn({
        title: 'Italic',
        'aria-label': 'Italic',
        onClick: () => editor.chain().focus().toggleItalic().run(),
        disabled: !editor.can().chain().focus().toggleItalic().run(),
        children: <Italic className="w-4 h-4" />,
      })}
      {btn({
        title: 'Strikethrough',
        'aria-label': 'Strikethrough',
        onClick: () => editor.chain().focus().toggleStrike().run(),
        disabled: !editor.can().chain().focus().toggleStrike().run(),
        children: <Strikethrough className="w-4 h-4" />,
      })}
      {btn({
        title: 'Code',
        'aria-label': 'Code',
        onClick: () => editor.chain().focus().toggleCode().run(),
        disabled: !editor.can().chain().focus().toggleCode().run(),
        children: <Code className="w-4 h-4" />,
      })}
      <span className="mx-0.5 h-5 w-px bg-border/80 self-center shrink-0" aria-hidden />
      {btn({
        title: 'Bullet list',
        'aria-label': 'Bullet list',
        onClick: () => editor.chain().focus().toggleBulletList().run(),
        children: <List className="w-4 h-4" />,
      })}
      {btn({
        title: 'Numbered list',
        'aria-label': 'Numbered list',
        onClick: () => editor.chain().focus().toggleOrderedList().run(),
        children: <ListOrdered className="w-4 h-4" />,
      })}
      {btn({
        title: 'Link',
        'aria-label': 'Link',
        onClick: runLink,
        children: <Link2 className="w-4 h-4" />,
      })}
      <span className="mx-0.5 h-5 w-px bg-border/80 self-center shrink-0" aria-hidden />
      {btn({
        title: 'Undo',
        'aria-label': 'Undo',
        onClick: () => editor.chain().focus().undo().run(),
        disabled: !editor.can().chain().focus().undo().run(),
        children: <Undo2 className="w-4 h-4" />,
      })}
      {btn({
        title: 'Redo',
        'aria-label': 'Redo',
        onClick: () => editor.chain().focus().redo().run(),
        disabled: !editor.can().chain().focus().redo().run(),
        children: <Redo2 className="w-4 h-4" />,
      })}
    </div>
  );
}

/**
 * WYSIWYG editor; persists as Markdown via {@link htmlToStoredMarkdown}.
 *
 * @param {object} props
 * @param {string | undefined} props.cardId — remount editor when card changes
 * @param {string} props.markdown — initial markdown from card (or draft)
 * @param {(md: string) => void} props.onMarkdownChange — markdown updates (debounced unless debounceMs is 0)
 * @param {boolean} props.readOnly
 * @param {string} [props.placeholder]
 * @param {number} [props.debounceMs=450] — use 0 for immediate updates (e.g. comment drafts)
 * @param {'auto'|'manual'} [props.persistMode='auto'] — manual: no auto-save; use ref.getMarkdown() + Save
 * @param {(md: string) => void} [props.onDraftChange] — when persistMode is manual, called with current Markdown on each edit
 * @param {boolean} [props.compact] — tighter layout for inline composers
 * @param {() => void} [props.onModEnter] — ⌘/Ctrl+Enter (e.g. send comment)
 */
const DescriptionRichTextEditor = forwardRef(function DescriptionRichTextEditor(
  {
    cardId,
    markdown,
    onMarkdownChange,
    readOnly,
    placeholder = 'Add details to give this Item more context.',
    debounceMs = 450,
    persistMode = 'auto',
    onDraftChange,
    compact = false,
    onModEnter,
  },
  ref
) {
  const saveTimerRef = useRef(null);
  const onModEnterRef = useRef(onModEnter);
  onModEnterRef.current = onModEnter;
  const onDraftChangeRef = useRef(onDraftChange);
  onDraftChangeRef.current = onDraftChange;

  const initialHtml = storedDescriptionToHtml(markdown);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: { levels: [2, 3] },
        }),
        Link.configure({
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
        }),
        Placeholder.configure({
          placeholder,
        }),
      ],
      content: initialHtml,
      editable: !readOnly,
      editorProps: {
        attributes: {
          class: cn(
            'prose prose-sm dark:prose-invert max-w-none focus:outline-none px-3 py-2',
            compact ? 'min-h-[72px]' : 'min-h-[140px]',
            '[&_a]:text-primary [&_blockquote]:border-border [&_pre]:border [&_pre]:border-border/60 [&_pre]:bg-muted/40'
          ),
        },
        handleKeyDown: (_view, event) => {
          if (
            !readOnly &&
            onModEnterRef.current &&
            event.key === 'Enter' &&
            (event.metaKey || event.ctrlKey)
          ) {
            event.preventDefault();
            onModEnterRef.current();
            return true;
          }
          return false;
        },
      },
      onUpdate: ({ editor: ed }) => {
        if (readOnly) return;
        if (persistMode === 'manual') {
          onDraftChangeRef.current?.(htmlToStoredMarkdown(ed.getHTML()));
          return;
        }
        const emit = () => {
          onMarkdownChange?.(htmlToStoredMarkdown(ed.getHTML()));
        };
        if (debounceMs <= 0) {
          emit();
          return;
        }
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
          saveTimerRef.current = null;
          emit();
        }, debounceMs);
      },
    },
    [cardId]
  );

  useImperativeHandle(
    ref,
    () => ({
      getMarkdown: () => (editor ? htmlToStoredMarkdown(editor.getHTML()) : ''),
    }),
    [editor]
  );

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  if (!editor) {
    return (
      <div
        className={cn(
          'rounded-xl border border-input bg-muted/30 animate-pulse',
          compact ? 'min-h-[132px]' : 'min-h-[180px]'
        )}
        aria-busy="true"
        aria-label="Loading editor"
      />
    );
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-input bg-background overflow-hidden transition-shadow',
        !readOnly && 'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ring-offset-background'
      )}
    >
      <EditorToolbar editor={editor} readOnly={readOnly} />
      <EditorContent
        editor={editor}
        className={cn(
          'description-editor-content',
          compact ? '[&_.ProseMirror]:min-h-[72px]' : '[&_.ProseMirror]:min-h-[140px]'
        )}
      />
    </div>
  );
});

DescriptionRichTextEditor.displayName = 'DescriptionRichTextEditor';

export default DescriptionRichTextEditor;
