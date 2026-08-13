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
        sourcemap: false,
        rolldownOptions: {
            input: {
                main: 'index.html',
                privacy: 'privacy.html',
            },
            output: {
                codeSplitting: {
                    groups: [
                        {
                            name: 'three',
                            test: /node_modules[\\/](?:three|meshline)(?:[\\/]|$)/,
                            priority: 20,
                        },
                    ],
                },
            },
        },
    },
});
