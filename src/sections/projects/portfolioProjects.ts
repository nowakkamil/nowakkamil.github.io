import { type PortfolioProject } from './portfolioConstellation';
import { preloadImage } from '../../utils/assetLoaders';
import { portfolioSkills } from './portfolioSkills';
import {
    PROJECT_DETAILS_IMAGE_SIZES,
    PROJECT_PREVIEW_IMAGE_SIZES,
    projectImagesById,
} from './projectImageAssets';

const withProjectScreenshots = (projects: PortfolioProject[]): PortfolioProject[] =>
    projects.map((project) => ({
        ...project,
        screenshot: projectImagesById[project.id]?.preview,
        detailsScreenshot: projectImagesById[project.id]?.details,
        skills: project.skills.map(
            (skill) =>
                portfolioSkills[portfolioSkills.findIndex((s) => s.id === skill)]?.label ?? skill,
        ),
    }));

const getAdjacentProjects = (
    project: PortfolioProject,
    projects: PortfolioProject[],
): PortfolioProject[] => {
    const index = projects.findIndex((candidate) => candidate.id === project.id);
    if (index < 0 || projects.length < 2) {
        return [];
    }

    return [
        projects[(index - 1 + projects.length) % projects.length],
        projects[(index + 1) % projects.length],
    ];
};

export const preloadAdjacentProjectScreenshots = (project: PortfolioProject): void => {
    const constellationProjects = portfolioProjects.filter(
        (candidate) => candidate.constellation.id === project.constellation.id,
    );
    const adjacentProjects = new Set([
        ...getAdjacentProjects(project, portfolioProjects),
        ...getAdjacentProjects(project, constellationProjects),
    ]);

    adjacentProjects.forEach((candidate) => {
        if (candidate.screenshot) {
            preloadImage(candidate.screenshot, PROJECT_PREVIEW_IMAGE_SIZES);
        }
    });
};

export const preloadAdjacentProjectDetails = async (project: PortfolioProject): Promise<void> => {
    const adjacentScreenshots = getAdjacentProjects(project, portfolioProjects).flatMap(
        (candidate) => (candidate.detailsScreenshot ? [candidate.detailsScreenshot] : []),
    );

    await Promise.allSettled(
        adjacentScreenshots.map((source) => preloadImage(source, PROJECT_DETAILS_IMAGE_SIZES)),
    );
};

const frontEndProjects: PortfolioProject[] = [
    {
        id: 'interactive-3d-portfolio',
        title: 'Interactive 3D Developer Portfolio',
        label: '3D Portfolio',

        description:
            'An interactive portfolio that combines real-time 3D visuals with scroll-driven storytelling. A custom Three.js architecture powers the constellation-based project navigation, GLSL shader effects, responsive rendering, and fluid GSAP transitions.',

        period: 'May 2026 – August 2026',

        role: 'Independent Creative Developer',

        skills: [
            'front-end',
            'typescript',
            'vite',
            'three-js',
            'webgl',
            'glsl',
            'gsap',
            'scroll-trigger',
            'scroll-smoother',
            'split-text',
            'html',
            'scss',
            'responsive-design',
            'shader-development',
            '3d-interaction',
            'motion-design',
            'performance-optimization',
            'entity-component-system',
        ],

        domain: 'Creative Web Development / Interactive 3D',

        owner: 'Independent Personal Project',
        constellation: {
            id: 'front-end',
            position: [-1.02, 0.82, -0.18],
            links: ['taia-accelerator'],
        },
    },
    {
        id: 'it-services',

        title: 'IT Services Platform',
        label: 'IT Services',

        description:
            'A responsive customer-facing portal for presenting IT services and handling client enquiries. The project focused on clear information architecture, accessible navigation, and a consistent experience across screen sizes.',

        period: 'April 2019 – June 2019',
        role: 'Developer',

        skills: ['front-end', 'html', 'css', 'javascript', 'responsive-design', 'github-pages'],

        domain: 'IT Services / Web Portals',
        owner: 'Cracow University of Technology',

        constellation: {
            id: 'front-end',
            position: [-1.38, -0.81, 0.12],
            links: ['intouch'],
        },
    },
    {
        id: 'intouch',
        title: 'InTouch',
        label: 'InTouch',

        description:
            'An investor-relations platform that helps public companies manage shareholder data and analyze investor behavior. Delivered high-fidelity React interfaces, established maintainable front-end patterns, and integrated the application with RESTful services.',

        period: 'June 2023 – May 2024',
        role: 'Senior Full-Stack Developer',

        skills: [
            'front-end',
            'react',
            'material-ui',
            'restful-api',
            'eq-design-system',
            'typescript',
        ],

        domain: 'Investor Relations Consultancy / Shareholder Analytics',
        owner: 'Endava (Client: EQ RD:IR)',

        constellation: {
            id: 'front-end',
            position: [-0.42, -0.16, 0.02],
            links: ['equiniti-design-system', 'interactive-3d-portfolio'],
        },
    },
    {
        id: 'equiniti-design-system',

        title: 'Equiniti Design System',
        label: 'Design System',

        description:
            'Contributed reusable components to the EQ Design System and integrated them across products in the Equiniti ecosystem. Shared Material UI patterns improved visual consistency, accessibility, and reuse while reducing duplicated interface code.',

        period: 'June 2023 – May 2024',
        role: 'Senior Full-Stack Developer',

        skills: [
            'front-end',
            'react',
            'typescript',
            'material-ui',
            'design-system',
            'component-library',
            'responsive-design',
            'accessibility',
            'ui-architecture',
        ],

        domain: 'Design Systems / Financial Services',
        owner: 'Endava (Client: Equiniti)',

        constellation: {
            id: 'front-end',
            position: [0.52, 0.45, -0.1],
            links: ['taia-accelerator'],
        },
    },
    {
        id: 'power-analyser',
        title: 'Three-Phase Electric Power Analyser',
        label: 'Power Analyser',

        description:
            'A hardware-software IoT solution for capturing and analyzing data from three-phase electrical systems. Interactive graphs expose interference patterns in real time, helping users tune compensation settings and assess system performance.',

        period: 'October 2017 – February 2018',
        role: 'Developer',

        skills: [
            'front-end',
            'iot',
            'data-visualization',
            'graphs',
            'csharp',
            'dotnet',
            'real-time-monitoring',
        ],

        domain: 'Internet of Things / Power Electronics',
        owner: 'Cracow University of Technology',

        constellation: {
            id: 'front-end',
            position: [0.74, 2.1, -0.38],
            links: [],
        },
    },
    {
        id: 'taia-accelerator',
        title: 'Test AI Accelerator (TAIA)',
        label: 'TAIA',
        description:
            'An AI-assisted platform that accelerates acceptance test-driven development by turning project context into user stories, test cases, and automated test code. It maintains traceability from requirements to Allure results, reducing manual coordination across the delivery lifecycle.',
        period: 'August 2025 – March 2026',
        role: 'Senior Full-Stack Developer',
        skills: [
            'front-end',
            'typescript',
            'ai-integration',
            'llm',
            'atdd',
            'test-automation',
            'allure-reports',
            'jira-integration',
            'traceability-analysis',
        ],
        domain: 'Software Engineering / AI & Test Automation',
        owner: 'Endava',
        constellation: {
            id: 'front-end',
            position: [-0.08, 1.5, -0.28],
            links: ['power-analyser'],
        },
    },
];

const fullStackProjects: PortfolioProject[] = [
    {
        id: 'masters-thesis',
        title: 'Master’s Thesis: Real-time Groupware Synchronization Application (Collab)',
        label: 'Collab Sync',

        description:
            'A research-driven groupware application exploring real-time synchronization across distributed clients. The project focused on conflict handling, data consistency, and the architectural trade-offs required for reliable collaborative editing.',

        period: 'February 2020 – July 2021',
        role: 'Master of Engineering Student',

        skills: [
            'full-stack',
            'computer-science-research',
            'synchronization-logic',
            'groupware',
            'distributed-systems',
            'complex-technical-communication',
        ],

        domain: 'Computer Science / Distributed Systems',
        owner: 'AGH University of Krakow',

        constellation: {
            id: 'full-stack',
            position: [0.153, 0.3, 0.12],
            links: ['shareowner-online'],
        },
    },
    {
        id: 'bachelors-thesis',
        title: 'Bachelor’s Thesis: A web-based groupware application that provides a knowledge management solution (Collab)',
        label: 'Collab Knowledge',

        description:
            'A web-based knowledge-management platform designed to help project teams organize and share information. Led a student development team while shaping the architecture, data model, and full-stack implementation.',

        period: 'October 2016 – January 2020',
        role: 'BE Student / .NET Students Scientific Association Leader',

        skills: [
            'full-stack',
            'knowledge-management',
            'web-architecture',
            'csharp',
            'entity-framework-core',
            'sql-server',
            'technical-leadership',
        ],

        domain: 'Computer Science / Knowledge Management',
        owner: 'Cracow University of Technology',

        constellation: {
            id: 'full-stack',
            position: [0.814, 1.292, -0.06],
            links: ['help-and-support'],
            labelOffset: [0, -0.18],
        },
    },
    {
        id: 'shareowner-online',
        title: 'ShareOwner Online',
        label: 'ShareOwner',

        description:
            'A fintech platform for managing shareholder accounts, transactions, and dividend reinvestment workflows. Delivered business-critical features and strengthened maintainability through component testing, production monitoring, and developer documentation.',

        period: 'June 2024 – September 2025',
        role: 'Senior Full-Stack Developer',

        skills: [
            'full-stack',
            'csharp',
            'dotnet-api',
            'aspnet-mvc',
            'react',
            'material-ui',
            'cypress',
            'new-relic',
            'mkdocs',
            'typescript',
            'performance-analysis',
        ],

        domain: 'Investment Management / Fintech',
        owner: 'Endava',

        constellation: {
            id: 'full-stack',
            position: [0.383, -0.714, -0.08],
            links: ['equiniti-website'],
            labelOffset: [0, 0.12],
        },
    },
    {
        id: 'abb-cynk-portal',
        title: 'CYNK (Group-level Web Portal)',
        label: 'CYNK',

        description:
            'An internal communications hub for ABB’s Krakow office, bringing employee initiatives, case studies, news, and corporate resources into one place. Contributed across the Angular interface, ASP.NET Core backend, and supporting data layer.',

        period: 'October 2018 – June 2019',
        role: 'Junior Full-Stack .NET Developer',

        skills: [
            'full-stack',
            'csharp',
            'aspnet-core',
            'angular',
            'sql-server',
            'entity-framework-core',
            'html',
            'scss',
            'javascript',
            'enterprise-communications',
        ],

        domain: 'Corporate Communications / Enterprise Internal Portal',
        owner: 'ABB',

        constellation: {
            id: 'full-stack',
            position: [-1.009, 0.088, 0.1],
            links: ['masters-thesis'],
        },
    },
    {
        id: 'equiniti-website',
        title: 'Equiniti.com Website',
        label: 'Equiniti.com',

        description:
            'A large corporate website presenting Equiniti’s financial services through an Umbraco-based content platform. Delivered features spanning React components and ASP.NET MVC, connected legacy systems, and supported deployment and observability in Azure.',

        period: 'October 2021 – June 2023',
        role: 'Senior Full-Stack Developer',

        skills: [
            'full-stack',
            'csharp',
            'dotnet',
            'umbraco-cms',
            'mvc',
            'azure',
            'react',
            'typescript',
            'api-bridge',
        ],

        domain: 'Corporate Services / Financial Ecosystem',
        owner: 'Endava (Client: Equiniti)',

        constellation: {
            id: 'full-stack',
            position: [-0.773, -0.9, 0],
            links: ['abb-cynk-portal'],
            labelOffset: [0, 0.12],
        },
    },
    {
        id: 'help-and-support',
        title: 'Help & Support Center',
        label: 'Help Center',

        description:
            'A responsive single-page support application for investment-account and employee-scheme customers. Built React interfaces from detailed designs and integrated them with a .NET API gateway that exposed content from a legacy knowledge system.',

        period: 'October 2021 – June 2023',
        role: 'Senior Full-Stack Developer',

        skills: [
            'front-end',
            'react',
            'html',
            'scss',
            'cypress',
            'eq-design-system',
            'typescript',
            'spa-architecture',
        ],

        domain: 'Corporate Services / Financial Support',
        owner: 'Endava (Client: Equiniti)',

        constellation: {
            id: 'full-stack',
            position: [0.45, 0.8, 0.14],
            links: ['masters-thesis'],
        },
    },
];

const backEndProjects: PortfolioProject[] = [
    {
        id: 'groupware-knowledge-platform',
        title: 'Knowledge Management & Collaborative Groupware',
        label: 'Groupware',
        description:
            'A collaborative knowledge platform for organizing and exchanging information within project teams. Led the student team and contributed to the React interface, ASP.NET Core services, persistence model, and overall application architecture.',
        period: 'March 2019 – May 2019',
        role: 'A leader of .NET students scientific association | Group representative',
        skills: [
            'back-end',
            'csharp',
            'aspnet-core',
            'mvc',
            'react',
            'sql-server',
            'entity-framework-core',
            'technical-leadership',
        ],
        domain: 'Computer Science / Knowledge Management / Collaborative Systems',
        owner: 'Cracow University of Technology',

        constellation: {
            id: 'back-end',
            position: [0.64, 1.14, -0.3],
            links: ['kvl-security-device', 'onboarding-solution'],
        },
    },
    {
        id: 'kvl-security-device',
        title: 'Security Device (KVL)',
        label: 'Security Device (KVL)',

        description:
            'An Android-based Key Variable Loader for securely managing encryption keys used by communication systems. Contributed to implementation, automated testing, local persistence, and cryptographic workflows in a security-sensitive environment.',

        period: 'July 2018 – September 2018',
        role: 'Intern C# .NET Software Developer',

        skills: [
            'back-end',
            'csharp',
            'android-platform',
            'xamarin',
            'mvvmcross',
            'jenkins',
            'cryptography',
            'security',
            'sqlite',
            'api-security',
        ],

        domain: 'Cybersecurity / Key Management',
        owner: 'Motorola Solutions',

        constellation: {
            id: 'back-end',
            position: [-0.48, -0.92, -0.02],
            labelOffset: [0.28, 0],
            links: ['onboarding-solution'],
        },
    },
    {
        id: 'onboarding-solution',
        title: 'FOREX.COM Onboarding Solution',
        label: 'Onboarding',

        description:
            'A regulated fintech platform supporting client acquisition, onboarding, and lifecycle management. Developed RESTful services and business workflows that connected client-facing applications with internal systems and operational processes.',

        period: 'July 2019 – September 2021',
        role: '.NET Software Engineer',

        skills: [
            'back-end',
            'csharp',
            'aspnet-core',
            'tsql',
            'activemq',
            'specflow',
            'teamcity',
            'fluent-assertions',
            'rest-web-services',
        ],

        domain: 'Fintech / Client Acquisition',
        owner: 'StoneX',

        constellation: {
            id: 'back-end',
            position: [-1, 0.66, 0.1],
            labelOffset: [-0.05, 0.05],
            links: [],
        },
    },
];

const constellationScrollOrder = {
    'front-end': 0,
    'full-stack': 1,
    'back-end': 2,
} satisfies Record<PortfolioProject['constellation']['id'], number>;

const compareProjectScrollOrder = (a: PortfolioProject, b: PortfolioProject): number =>
    constellationScrollOrder[a.constellation.id] - constellationScrollOrder[b.constellation.id] ||
    a.constellation.position[0] - b.constellation.position[0] ||
    b.constellation.position[1] - a.constellation.position[1];

const portfolioProjectsWithoutScreenshots: PortfolioProject[] = [
    ...frontEndProjects,
    ...fullStackProjects,
    ...backEndProjects,
].sort(compareProjectScrollOrder);

export const portfolioProjects: PortfolioProject[] = withProjectScreenshots(
    portfolioProjectsWithoutScreenshots,
);
