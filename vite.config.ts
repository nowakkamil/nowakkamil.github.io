import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';

export default defineConfig({
    plugins: [
        glsl({
            include: ['**/*.glsl', '**/*.vert', '**/*.frag'],
            defaultExtension: 'glsl',
            warnDuplicatedImports: true,
            minify: true,
        }),
    ],
    server: {
        host: true,
    },
    build: {
        sourcemap: true,
        rolldownOptions: {
            output: {
                codeSplitting: {
                    groups: [
                        {
                            name: 'three',
                            test: /node_modules[\\/](?:three|meshline)(?:[\\/]|$)/,
                            priority: 20,
                        },
                        {
                            name: 'gsap',
                            test: /node_modules[\\/]gsap(?:[\\/]|$)/,
                            priority: 20,
                        },
                    ],
                },
            },
        },
    },
});
