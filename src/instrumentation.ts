// Wird von Next.js einmal beim Serverstart aufgerufen.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startTakt } = await import("./lib/app-takt");
    startTakt();
  }
}
