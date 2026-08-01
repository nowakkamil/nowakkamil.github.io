import downloadIcon from '../../assets/icons/download.svg';
import emailIcon from '../../assets/icons/email.svg';
import githubIcon from '../../assets/icons/github.svg';
import linkedInIcon from '../../assets/icons/linkedin.svg';

const SOCIAL_LINK_PLACEHOLDERS = {
    emailAddress: 'YOUR_EMAIL_ADDRESS',
    githubProfileUrl: 'https://github.com/nowakkamil',
    linkedInProfileUrl: 'https://www.linkedin.com/in/nowakkamil',
    cvFilePath: '/assets/YOUR_CV_FILE.pdf',
} as const;

export type SocialLinksOptions = {
    emailAddress: string;
    githubProfileUrl: string;
    linkedInProfileUrl: string;
    cvFilePath: string;
};

const icons = {
    email: emailIcon,
    github: githubIcon,
    linkedIn: linkedInIcon,
    download: downloadIcon,
} as const;

const createLinkMarkup = (
    label: string,
    accessibleLabel: string,
    href: string,
    iconSrc: string,
    attributes = '',
): string => `
  <a class="social-links__link" href="${href}" aria-label="${accessibleLabel}" ${attributes}>
    <span class="social-links__icon" style="--social-icon: url(&quot;${iconSrc}&quot;)" aria-hidden="true"></span>
    <span class="social-links__label">${label}</span>
  </a>`;

export function createSocialLinks(
    options: SocialLinksOptions = SOCIAL_LINK_PLACEHOLDERS,
    root: ParentNode = document,
): HTMLElement | null {
    const mount = root.querySelector<HTMLElement>('[data-social-links]');

    if (!mount) {
        return null;
    }

    mount.classList.add('social-links');
    mount.setAttribute('aria-label', 'Social and professional links');
    mount.innerHTML = [
        createLinkMarkup(
            'Email',
            'Send an email to Kamil (opens email application)',
            `mailto:${options.emailAddress}`,
            icons.email,
        ),
        createLinkMarkup(
            'GitHub',
            "Visit Kamil's GitHub profile (opens in a new tab)",
            options.githubProfileUrl,
            icons.github,
            'target="_blank" rel="noopener noreferrer"',
        ),
        createLinkMarkup(
            'LinkedIn',
            "Visit Kamil's LinkedIn profile (opens in a new tab)",
            options.linkedInProfileUrl,
            icons.linkedIn,
            'target="_blank" rel="noopener noreferrer"',
        ),
        createLinkMarkup(
            'CV',
            "Download Kamil's CV as a PDF",
            options.cvFilePath,
            icons.download,
            'download',
        ),
    ].join('');

    return mount;
}
