// Eigenes Modul ohne Importe — wird auch von mcp/tokens.ts genutzt (kein Zirkelbezug).

/** Vergleich nach RFC 8707: Schema/Host ohne Groß-/Kleinschreibung, ohne Schrägstrich am Ende. */
export function sameResource(a: string, b: string): boolean {
  const norm = (u: string) => {
    try {
      const x = new URL(u);
      return `${x.protocol.toLowerCase()}//${x.host.toLowerCase()}${x.pathname.replace(/\/+$/, "")}`;
    } catch {
      return u;
    }
  };
  return norm(a) === norm(b);
}
