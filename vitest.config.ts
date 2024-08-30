import { defineConfig } from 'vitest/config'

// Pin the time zone so day boundaries in the history tests are deterministic.
// New York also has a DST switch, which the streak tests rely on.
process.env.TZ = 'America/New_York'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
    restoreMocks: true,
  },
})
