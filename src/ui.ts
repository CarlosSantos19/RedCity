import { useSyncExternalStore } from 'react';

/**
 * Qué ventana está abierta (publicación, red, perfil, chat o negocio). Vive aparte del estado de
 * datos para que cualquier componente pueda abrir, por ejemplo, el perfil de un vecino
 * sin pasar funciones por todos los niveles.
 */
interface UI {
  postId: string | null;
  redId: string | null;
  perfilId: string | null;
  chatId: string | null;
  empresaId: string | null;
}

let ui: UI = { postId: null, redId: null, perfilId: null, chatId: null, empresaId: null };
const listeners = new Set<() => void>();
const set = (cambio: Partial<UI>) => { ui = { ...ui, ...cambio }; listeners.forEach((l) => l()); };

export function useUI(): UI {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => ui);
}

export const nav = {
  post: (postId: string | null) => set({ postId }),
  red: (redId: string | null) => set({ redId }),
  perfil: (perfilId: string | null) => set({ perfilId }),
  chat: (chatId: string | null) => set({ chatId }),
  empresa: (empresaId: string | null) => set({ empresaId }),
  cerrarTodo: () => set({ postId: null, redId: null, perfilId: null, chatId: null, empresaId: null }),
};
