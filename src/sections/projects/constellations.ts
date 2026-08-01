import type { Constellation } from './constellationTypes';
import { PORTFOLIO_CONSTELLATION_FOG_COLORS } from './portfolioConstellation';

export const constellations: Constellation[] = [
    { id: 'front-end', label: 'Front-end' },
    { id: 'full-stack', label: 'Full-Stack' },
    { id: 'back-end', label: 'Back-end' },
];

export const getConstellationColorRgb = (constellationId: Constellation['id']): string => {
    const constellationIndex = constellations.findIndex(
        (constellation) => constellation.id === constellationId,
    );
    const color =
        PORTFOLIO_CONSTELLATION_FOG_COLORS[
            Math.max(0, constellationIndex) % PORTFOLIO_CONSTELLATION_FOG_COLORS.length
        ];

    return `${(color >> 16) & 0xff}, ${(color >> 8) & 0xff}, ${color & 0xff}`;
};
