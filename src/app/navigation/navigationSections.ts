import { sectionIds, type SectionId } from '../../sections/sectionIds';

export type SectionLanding =
    | {
          type: 'position';
          positions: {
              default: string;
              mobile?: string;
          };
      }
    | {
          type: 'page-end';
      };

export const sectionLandings: Record<SectionId, SectionLanding> = {
    intro: {
        type: 'position',
        positions: {
            default: 'top top',
        },
    },
    experience: {
        type: 'position',
        positions: {
            default: '17% top',
            mobile: '17%+=210 top',
        },
    },
    projects: {
        type: 'position',
        positions: {
            default: '62% top',
            mobile: '63% top',
        },
    },
    contact: {
        type: 'page-end',
    },
};

export const parseSectionId = (target: string): SectionId | undefined => {
    const normalizedTarget = target.replace(/^#/, '');

    return sectionIds.find((sectionId) => sectionId === normalizedTarget);
};

export const isPageEndNavigationTarget = (target: string): boolean => {
    const sectionId = parseSectionId(target);

    return sectionId !== undefined && sectionLandings[sectionId].type === 'page-end';
};
