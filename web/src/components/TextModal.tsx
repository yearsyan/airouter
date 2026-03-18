import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface ModalState {
  open: boolean;
  title: string;
  content: string;
}

interface ModalContextType {
  show: (title: string, content: string) => void;
}

const ModalContext = createContext<ModalContextType>({
  show: () => {},
});

export function useTextModal() {
  return useContext(ModalContext);
}

export function TextModalProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ModalState>({
    open: false,
    title: "",
    content: "",
  });

  const show = useCallback((title: string, content: string) => {
    setState({ open: true, title, content });
  }, []);

  const close = () => setState((s) => ({ ...s, open: false }));

  return (
    <ModalContext.Provider value={{ show }}>
      {children}
      {state.open && (
        <div className="modal-overlay" onMouseDown={close}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{state.title}</span>
              <button className="btn-close" onClick={close}>
                &times;
              </button>
            </div>
            <pre className="modal-body">{state.content}</pre>
          </div>
        </div>
      )}
    </ModalContext.Provider>
  );
}
