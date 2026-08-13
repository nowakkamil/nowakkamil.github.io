import * as THREE from 'three';
import type { ResponsiveConfig } from '../../app/responsiveConfig';

const LABEL_FONT_FAMILY = 'Urbanist';

function createCanvasLabelTexture(canvas: HTMLCanvasElement): THREE.Texture {
    const texture = new THREE.CanvasTexture(canvas);

    // These near-white canvases act as opacity masks and are tinted by their
    // SpriteMaterial. Avoid sRGB texture allocation and mipmap generation on
    // mobile ANGLE drivers, where they can produce vertical sampling streaks.
    texture.colorSpace = THREE.NoColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    return texture;
}

/**
 * Renders a single-line skill-category label (e.g. "Front-End")
 * into a CanvasTexture.
 */
export function createLabelTexture(
    label: string,
    responsiveConfig: Pick<ResponsiveConfig, 'renderer'>,
): THREE.Texture {
    const pixelRatio = Math.min(
        window.devicePixelRatio || 1,
        responsiveConfig.renderer.pixelRatioCap,
        2,
    );
    const width = 320;
    const height = 96;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const fontSize = 32;
    const weight = 560;

    canvas.width = width * pixelRatio;
    canvas.height = height * pixelRatio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    if (context) {
        context.save();
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        context.clearRect(0, 0, width, height);
        context.textAlign = 'center';
        context.textBaseline = 'middle';

        const y = height * 0.46;

        context.font = `${weight} ${fontSize}px "${LABEL_FONT_FAMILY}", Arial, sans-serif`;
        context.fillStyle = 'rgba(255, 255, 255, 0.98)';

        context.fillText(label, width * 0.5, y);
        context.restore();
    }

    return createCanvasLabelTexture(canvas);
}

/**
 * Renders a project title label (potentially word-wrapped into two lines)
 * into a CanvasTexture with a soft blue glow.
 */
export function createProjectLabelTexture(
    label: string,
    responsiveConfig: Pick<ResponsiveConfig, 'renderer'>,
): THREE.Texture {
    const pixelRatio = Math.min(
        window.devicePixelRatio || 1,
        responsiveConfig.renderer.pixelRatioCap,
        2,
    );
    const width = 360;
    const height = 88;
    const padding = 36;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = width * pixelRatio;
    canvas.height = height * pixelRatio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    if (context) {
        context.save();
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        context.clearRect(0, 0, width, height);
        context.textAlign = 'center';
        context.textBaseline = 'middle';

        const lines = wrapProjectLabel(context, label, LABEL_FONT_FAMILY, width - padding * 2);
        const centerY = height * 0.52;
        const lineHeight = 22;

        context.shadowColor = 'rgba(130, 186, 255, 0.48)';
        context.shadowBlur = 13;
        context.font = `540 ${lines.fontSize}px "${LABEL_FONT_FAMILY}", Arial, sans-serif`;
        context.fillStyle = 'rgba(244, 249, 255, 0.96)';

        lines.text.forEach((line, index) => {
            const y = centerY + (index - (lines.text.length - 1) * 0.5) * lineHeight;
            context.fillText(line, width * 0.5, y);
        });

        context.restore();
    }

    return createCanvasLabelTexture(canvas);
}

/**
 * Attempts to fit `label` on one line at decreasing font sizes; if it still
 * doesn't fit, splits the label in half across two lines.
 */
function wrapProjectLabel(
    context: CanvasRenderingContext2D,
    label: string,
    fontFamily: string,
    maxWidth: number,
): { text: string[]; fontSize: number } {
    for (let fontSize = 22; fontSize >= 16; fontSize -= 1) {
        context.font = `540 ${fontSize}px "${fontFamily}", Arial, sans-serif`;
        if (context.measureText(label).width <= maxWidth) {
            return { text: [label], fontSize };
        }
    }

    const words = label.split(' ');

    if (words.length < 2) {
        return { text: [label], fontSize: 16 };
    }

    const splitIndex = Math.ceil(words.length / 2);

    return {
        text: [words.slice(0, splitIndex).join(' '), words.slice(splitIndex).join(' ')],
        fontSize: 17,
    };
}
