import '../styles/index.scss';
import { animateMarks } from '../scripts/gsap';
import '@iconfu/svg-inject';
import { CSSPlugin } from "gsap/all";

// Prevent the webpack from performing tree shaking
const plugin = CSSPlugin;
const ICONS_COUNT = 4;

const getSvgNode = () => {
    let svg = document.createElement('img');
    return Object.assign(svg, {
        className: 'landing-section__mark-icon',
        src: 'public/icon-code.svg',
        onload: () => SVGInject(svg)
    });
};

const getSvgNodes = () => {
    let svgNodes = document.createDocumentFragment();

    for (let i = 0; i < ICONS_COUNT; i++) {
        let svgNode = getSvgNode();
        svgNodes.appendChild(svgNode);
    }

    return svgNodes;
};

var marks = document.querySelectorAll(".landing-section__mark");

marks.forEach(mark => mark.appendChild(getSvgNodes()));

window.mutationObserver = new MutationObserver(function (mutations, observer) {
    let i = 0;

    mutations.forEach(function (mutation) {
        console.log(mutation);
        i++;
    });

    console.log(i);

    if (i === ICONS_COUNT) {
        animateMarks();
        delete window.mutationObserver;
        observer.disconnect();
        stop(); // TODO: Verify if needed
    }
});

mutationObserver.observe(document.querySelector(".landing-section__mark"), { subtree: true, childList: true });

const stop = () => mutationObserver.disconnect();

setTimeout(() => {
    mutationObserver.disconnect();
    console.log(mutationObserver);
}, 4000);
