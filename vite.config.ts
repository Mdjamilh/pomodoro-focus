import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'

/**
 * A new id per build changes the bytes of sw.js, which is what makes the
 * browser install the new worker and drop the old cache.
 */
function buildId(): string {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA
  if (sha) return sha.slice(0, 12)
  try {
    return execSync('git rev-parse --short=12 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return Date.now().toString(36)
  }
}

export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(buildId()),
  },
  build: {
    rollupOptions: {
      // The service worker is a second entry point, emitted as /sw.js at the
      // site root so its scope covers the whole app.
      input: {
        index: 'index.html',
        sw: 'src/sw.ts',
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
})
