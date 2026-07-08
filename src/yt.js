// yt.js — detecção de vídeo do YouTube (módulo puro, testável).

// Extrai o id de vídeo de URLs youtube.com/watch?v=ID e youtu.be/ID.
// Retorna null quando a URL não aponta para um vídeo do YouTube.
export function ytId(u) {
  const m = String(u || '').match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}
