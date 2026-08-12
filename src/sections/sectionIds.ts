export const sectionIds = ['intro', 'experience', 'projects', 'contact'] as const;

export type SectionId = (typeof sectionIds)[number];

type SectionSelectors = {
    readonly [Key in SectionId]: `#${Key}`;
};

export const sectionSelectors = Object.fromEntries(
    sectionIds.map((sectionId) => [sectionId, `#${sectionId}`]),
) as SectionSelectors;

export const getSectionSelector = <T extends SectionId>(sectionId: T): `#${T}` =>
    sectionSelectors[sectionId];
