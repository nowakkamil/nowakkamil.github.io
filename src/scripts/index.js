import '../styles/index.scss';
import { animateMarks } from '../scripts/gsap';
import '@iconfu/svg-inject';
import { CSSPlugin } from "gsap/all";

// Prevent the webpack from performing tree shaking
const plugin = CSSPlugin;
const ICONS_COUNT = 4;

const getSvgNode = (className, src) => {
    let svg = document.createElement('img');
    return Object.assign(svg, {
        className: className,
        src: src,
        onload: () => SVGInject(svg)
    });
};

const getSvgNodes = () => {
    let svgNodes = document.createDocumentFragment();

    for (let i = 0; i < ICONS_COUNT; i++) {
        let svgNode = getSvgNode('landing-section__mark-icon', 'public/icon-code.svg');
        svgNodes.appendChild(svgNode);
    }

    return svgNodes;
};

document
    .querySelectorAll(".landing-section__mark")
    .forEach(mark => mark.appendChild(getSvgNodes()));

document
    .querySelector(".experience-section__image--abb")
    .appendChild(getSvgNode('experience-section__mark-icon experience-section__mark-icon--abb', 'public/abb-logo.svg'));

document
    .querySelector(".social-bar__logo--facebook")
    .appendChild(getSvgNode(null, 'public/social-facebook.svg'));

document
    .querySelector(".social-bar__logo--instagram")
    .appendChild(getSvgNode(null, 'public/social-instagram.svg'));

document
    .querySelector(".social-bar__logo--twitter")
    .appendChild(getSvgNode(null, 'public/social-twitter.svg'));

document
    .querySelector(".social-bar__logo--whatsapp")
    .appendChild(getSvgNode(null, 'public/social-whatsapp.svg'));

window.mutationObserver = new MutationObserver((_mutations, observer) => {
    animateMarks();
    observer.disconnect();
    delete window.mutationObserver;
});

mutationObserver.observe(document.querySelector(".landing-section__mark"), { subtree: true, childList: true });

const handleSubmit = e => {
    e.preventDefault();
    navigator.clipboard.writeText("nowakkamil@yahoo.com");
    alert("Please send an e-mail to: nowakkamil@yahoo.com. E-mail address copied to clipboard");
};

const form = document.getElementsByTagName("form")[0];

if (form) {
    form.addEventListener("submit", handleSubmit);
}
