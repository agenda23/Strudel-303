import { EditorView, basicSetup } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { keymap } from '@codemirror/view';
import { activeStepField, activeStepTheme } from './highlight';

export interface EditorCallbacks {
  onEvaluate: (code: string) => void;
  onStop: () => void;
}

export function createCodeEditor(
  parentElement: HTMLElement,
  initialCode: string,
  callbacks: EditorCallbacks
): EditorView {
  const evalKeymap = keymap.of([
    {
      key: 'Ctrl-Enter',
      mac: 'Cmd-Enter',
      run: (view) => {
        callbacks.onEvaluate(view.state.doc.toString());
        return true;
      },
    },
    {
      key: 'Ctrl-.',
      mac: 'Cmd-.',
      run: () => {
        callbacks.onStop();
        return true;
      },
    },
    {
      key: 'Escape',
      run: () => {
        callbacks.onStop();
        return true;
      },
    },
  ]);

  const view = new EditorView({
    doc: initialCode,
    extensions: [
      basicSetup,
      javascript(),
      oneDark,
      evalKeymap,
      activeStepField,
      activeStepTheme,
      EditorView.theme({
        '&': {
          height: '100%',
          fontSize: '14.5px',
          fontFamily: "'JetBrains Mono', monospace",
          backgroundColor: 'transparent',
        },
        '.cm-scroller': {
          overflow: 'auto',
          lineHeight: '1.6',
        },
        '.cm-gutters': {
          backgroundColor: '#0d0e11',
          color: '#555b68',
          borderRight: '1px solid #1f2229',
        },
        '&.cm-focused .cm-cursor': {
          borderLeftColor: '#39ff14',
        },
      }),
    ],
    parent: parentElement,
  });

  return view;
}
