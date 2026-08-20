import { FontLoader, type Font } from 'three/addons/loaders/FontLoader.js';

import { loadJsonAsset } from '../utils/assetLoaders';

export const loadFontAsset = async (source: string, fontName: string): Promise<Font> => {
    const data = await loadJsonAsset<Parameters<FontLoader['parse']>[0]>(
        source,
        `${fontName} font`,
    );
    return new FontLoader().parse(data);
};
