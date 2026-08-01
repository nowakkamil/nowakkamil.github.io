import type { PortfolioSkill } from './portfolioConstellation';

const coreDisciplineSkills: PortfolioSkill[] = [
    { id: 'interface', label: 'Interface' },
    { id: 'systems', label: 'Systems' },
    { id: 'motion-3d', label: 'Motion 3D' },
];

const frontendSkills: PortfolioSkill[] = [
    { id: 'react', label: 'React' },
    { id: 'angular', label: 'Angular' },
    { id: 'javascript', label: 'JavaScript' },
    { id: 'typescript', label: 'TypeScript' },
    { id: 'html', label: 'HTML' },
    { id: 'css', label: 'CSS' },
    { id: 'scss', label: 'SCSS' },
    { id: 'material-ui', label: 'Material UI' },
    { id: 'responsive-web-design', label: 'Responsive Web Design' },
    { id: 'eq-design-system', label: 'EQ Design System' },
    { id: 'accessibility', label: 'Accessibility' },
];

const backendAndDataSkills: PortfolioSkill[] = [
    { id: 'csharp-dotnet', label: 'C# / .NET' },
    { id: 'csharp', label: 'C#' },
    { id: 'aspnet-core', label: 'ASP.NET Core' },
    { id: 'aspnet-mvc', label: 'ASP.NET MVC' },
    { id: 'entity-framework-core', label: 'Entity Framework Core' },
    { id: 'rest-api', label: 'REST APIs' },
    { id: 'microsoft-sql-server', label: 'Microsoft SQL Server' },
    { id: 't-sql', label: 'T-SQL' },
    { id: 'postgresql', label: 'PostgreSQL' },
    { id: 'sqlite', label: 'SQLite' },
    { id: 'message-queues', label: 'Message Queues' },
    { id: 'activemq', label: 'ActiveMQ' },
    { id: 'background-processing', label: 'Background Processing' },
];

const cloudCmsTestingAndDeliverySkills: PortfolioSkill[] = [
    { id: 'azure', label: 'Azure' },
    { id: 'umbraco-cms', label: 'Umbraco CMS' },
    { id: 'cypress', label: 'Cypress' },
    { id: 'specflow', label: 'SpecFlow' },
    { id: 'fluent-assertions', label: 'Fluent Assertions' },
    { id: 'teamcity', label: 'TeamCity' },
    { id: 'jenkins', label: 'Jenkins' },
    { id: 'new-relic', label: 'New Relic' },
    { id: 'mkdocs', label: 'MkDocs' },
];

const architectureAndResearchSkills: PortfolioSkill[] = [
    { id: 'distributed-systems', label: 'Distributed Systems' },
    { id: 'real-time-synchronization', label: 'Real-Time Synchronization' },
    { id: 'groupware', label: 'Groupware' },
    { id: 'computer-science-research', label: 'Computer Science Research' },
    { id: 'knowledge-management', label: 'Knowledge Management' },
    { id: 'web-architecture', label: 'Web Architecture' },
    { id: 'team-leadership', label: 'Team Leadership' },
];

const iotAndSecuritySkills: PortfolioSkill[] = [
    { id: 'iot', label: 'IoT' },
    { id: 'data-visualization', label: 'Data Visualization' },
    { id: 'interactive-graphs', label: 'Interactive Graphs' },
    { id: 'android', label: 'Android' },
    { id: 'xamarin', label: 'Xamarin' },
    { id: 'mvvmcross', label: 'MvvmCross' },
    { id: 'cryptography', label: 'Cryptography' },
    { id: 'scrum', label: 'Scrum' },
];

const searchAndObservabilitySkills: PortfolioSkill[] = [
    { id: 'search-indexing', label: 'Search Indexing' },
    { id: 'observability', label: 'Observability' },
    { id: 'telemetry', label: 'Telemetry' },
    { id: 'opentelemetry', label: 'OpenTelemetry' },
];

const motionAndRealTimeGraphicsSkills: PortfolioSkill[] = [
    { id: 'gsap', label: 'GSAP' },
    { id: 'gsap-scrolltrigger', label: 'GSAP ScrollTrigger' },
    { id: 'gsap-scrollsmoother', label: 'GSAP ScrollSmoother' },
    { id: 'animation-architecture', label: 'Animation Architecture' },
    { id: 'interaction-design', label: 'Interaction Design' },
    { id: 'pointer-events', label: 'Pointer Events' },
    { id: 'three-js', label: 'Three.js' },
    { id: 'webgl', label: 'WebGL' },
    { id: 'glsl', label: 'GLSL' },
    { id: 'particle-systems', label: 'Particle Systems' },
    { id: 'shader-programming', label: 'Shader Programming' },
    { id: 'camera-animation', label: 'Camera Animation' },
    { id: 'fog-rendering', label: 'Fog Rendering' },
    { id: 'post-processing', label: 'Post-Processing' },
];

export const portfolioSkills: PortfolioSkill[] = [
    ...coreDisciplineSkills,
    ...frontendSkills,
    ...backendAndDataSkills,
    ...cloudCmsTestingAndDeliverySkills,
    ...architectureAndResearchSkills,
    ...iotAndSecuritySkills,
    ...searchAndObservabilitySkills,
    ...motionAndRealTimeGraphicsSkills,
];
