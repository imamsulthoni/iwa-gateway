export function createCredsHandler(saveCreds: () => Promise<void>): () => void {
  return () => {
    void saveCreds()
  }
}
