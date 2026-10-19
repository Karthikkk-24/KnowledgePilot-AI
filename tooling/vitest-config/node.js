import { defineConfig } from 'vitest/config';

export const nodeVitestConfig = defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    passWithNoTests: true,
  },
});

export default nodeVitestConfig;
