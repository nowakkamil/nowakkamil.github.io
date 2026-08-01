import * as THREE from 'three';
import type { ResponsiveConfig } from '../../app/responsiveConfig';
import {
    DOM_INTERACTION_SELECTOR,
    TAP_MAX_DURATION,
    TAP_MOVE_TOLERANCE,
    TAP_SCROLL_TOLERANCE,
} from './constellationConstants';
import type { InteractionTarget, ProjectStarVisual, TapCandidate } from './constellationTypes';
import { sectionSelectors } from '../sectionIds';

export interface ConstellationInteractionCallbacks {
    getProjectStars(): ProjectStarVisual[];
    getInteractionObjects(): THREE.Object3D[];
    getCoarseInteractionObjects(): THREE.Object3D[];
    isProjectPanelBoundaryActive(): boolean;
    getActiveMobileSkillId(): string | undefined;
    getActiveProjectStar(): ProjectStarVisual | undefined;
    hasSelectedProjectInSkill(skillId: string): boolean;
    getSelectedProjectStar(): ProjectStarVisual | undefined;
    onHoverChange(
        hoveredObject: THREE.Object3D | undefined,
        hovered: InteractionTarget | undefined,
    ): void;
    onSelectionChange(
        selectedObject: THREE.Object3D | undefined,
        selected: InteractionTarget | undefined,
    ): void;
    onProjectStarSelect(projectStar: ProjectStarVisual): void;
    onProjectClear(): void;
    setCursorHovering(hovering: boolean): void;
    emitProjectPreviewState(): void;
    responsiveConfig(): ResponsiveConfig;
}

/**
 * Manages all DOM pointer/keyboard event listeners and raycasting for the
 * constellation. Constructed once and lives as long as the constellation.
 */
export class ConstellationInteraction {
    private readonly camera: THREE.Camera;
    private readonly domElement: HTMLElement;
    private readonly raycaster = new THREE.Raycaster();
    private readonly pointer = new THREE.Vector2();
    private readonly callbacks: ConstellationInteractionCallbacks;
    private readonly keyboardNavigator = document.createElement('nav');
    private readonly keyboardProjectButtons = new Map<string, HTMLButtonElement>();
    private readonly keyboardButtonGroups: HTMLButtonElement[][] = [];
    private readonly keyboardGroupsBySkill = new Map<string, HTMLElement>();
    private readonly keyboardButtonsBySkill = new Map<string, HTMLButtonElement[]>();
    private readonly combinedInteractionObjects: THREE.Object3D[] = [];
    private readonly intersections: THREE.Intersection<THREE.Object3D>[] = [];
    private readonly boundaryHitSkillIds = new Set<string>();

    private tapCandidate?: TapCandidate;
    private lastCoarseTapTime = -Infinity;
    private keyboardNavigationActive = false;
    private keyboardActiveSkillId?: string;

    constructor(
        camera: THREE.Camera,
        domElement: HTMLElement,
        callbacks: ConstellationInteractionCallbacks,
    ) {
        this.camera = camera;
        this.domElement = domElement;
        this.callbacks = callbacks;

        this.createKeyboardNavigator();
        window.addEventListener('pointermove', this.handlePointerMove, { passive: true });
        window.addEventListener('click', this.handleClick, { passive: true });
        window.addEventListener('pointerdown', this.handlePointerDown, { passive: true });
        window.addEventListener('pointerup', this.handlePointerUp, { passive: true });
        window.addEventListener('pointercancel', this.handlePointerCancel, { passive: true });
        window.addEventListener('keydown', this.handleConstellationEnter);
    }

    public dispose(): void {
        window.removeEventListener('pointermove', this.handlePointerMove);
        window.removeEventListener('click', this.handleClick);
        window.removeEventListener('pointerdown', this.handlePointerDown);
        window.removeEventListener('pointerup', this.handlePointerUp);
        window.removeEventListener('pointercancel', this.handlePointerCancel);
        window.removeEventListener('keydown', this.handleConstellationEnter);
        this.keyboardNavigator.removeEventListener('click', this.handleKeyboardNavigatorClick);
        this.keyboardNavigator.removeEventListener('keydown', this.handleKeyboardNavigatorKeyDown);
        this.keyboardNavigator.removeEventListener('focusin', this.handleKeyboardNavigatorFocusIn);
        this.keyboardNavigator.removeEventListener(
            'focusout',
            this.handleKeyboardNavigatorFocusOut,
        );
        this.keyboardNavigator.remove();
    }

    public syncKeyboardNavigator(): void {
        const previouslyRovingProjectId = Array.from(this.keyboardProjectButtons.entries()).find(
            ([, button]) => button.tabIndex === 0,
        )?.[0];
        const starsBySkill = new Map<string, ProjectStarVisual[]>();

        for (const star of this.callbacks.getProjectStars()) {
            const stars = starsBySkill.get(star.skillId) ?? [];

            stars.push(star);
            starsBySkill.set(star.skillId, stars);
        }

        this.keyboardProjectButtons.clear();
        this.keyboardButtonGroups.length = 0;
        this.keyboardGroupsBySkill.clear();
        this.keyboardButtonsBySkill.clear();
        this.keyboardNavigator.replaceChildren();

        const heading = document.createElement('h2');
        const instructions = document.createElement('p');

        heading.id = 'constellation-keyboard-heading';
        heading.className = 'constellation-keyboard-nav__title';
        heading.textContent = 'Project constellation';
        instructions.id = 'constellation-keyboard-instructions';
        instructions.className = 'constellation-keyboard-nav__instructions';
        instructions.textContent =
            'Use Up and Down to move between projects, Left and Right to change constellation, then press Enter to open details.';
        this.keyboardNavigator.setAttribute('aria-labelledby', heading.id);
        this.keyboardNavigator.setAttribute('aria-describedby', instructions.id);
        this.keyboardNavigator.append(heading, instructions);

        let firstButton: HTMLButtonElement | undefined;
        let preferredButton: HTMLButtonElement | undefined;

        Array.from(starsBySkill.entries()).forEach(([skillId, stars], groupIndex) => {
            const group = document.createElement('div');
            const groupHeading = document.createElement('h3');
            const buttonList = document.createElement('div');
            const buttons: HTMLButtonElement[] = [];

            group.className = 'constellation-keyboard-nav__group';
            group.setAttribute('role', 'group');
            group.dataset.skillId = skillId;
            groupHeading.id = `constellation-keyboard-group-${skillId}`;
            groupHeading.className = 'constellation-keyboard-nav__group-title';
            groupHeading.textContent = stars[0]?.project.constellation.id
                .split('-')
                .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
                .join('-');
            group.setAttribute('aria-labelledby', groupHeading.id);
            buttonList.className = 'constellation-keyboard-nav__projects';

            stars.forEach((star, projectIndex) => {
                const button = document.createElement('button');

                button.className = 'constellation-keyboard-nav__project';
                button.type = 'button';
                button.tabIndex = -1;
                button.textContent = star.project.title;
                button.dataset.projectId = star.project.id;
                button.dataset.skillId = skillId;
                button.dataset.groupIndex = String(groupIndex);
                button.dataset.projectIndex = String(projectIndex);
                button.setAttribute('aria-haspopup', 'dialog');
                button.setAttribute('aria-controls', 'project-details-dialog');
                button.setAttribute('aria-expanded', 'false');
                buttonList.append(button);
                buttons.push(button);
                this.keyboardProjectButtons.set(star.project.id, button);
                firstButton ??= button;

                if (star.project.id === previouslyRovingProjectId) {
                    preferredButton = button;
                }
            });

            this.keyboardButtonGroups.push(buttons);
            this.keyboardGroupsBySkill.set(skillId, group);
            this.keyboardButtonsBySkill.set(skillId, buttons);
            group.append(groupHeading, buttonList);
            this.keyboardNavigator.append(group);
        });

        (preferredButton ?? firstButton)?.setAttribute('tabindex', '0');
        this.setKeyboardActiveSkill(this.keyboardActiveSkillId);
        this.setKeyboardNavigationActive(this.keyboardNavigationActive);
    }

    public setKeyboardNavigationActive(active: boolean): void {
        this.keyboardNavigationActive = active;
        const hasProjects = this.keyboardProjectButtons.size > 0;
        const shouldEnable = active && hasProjects && !this.callbacks.responsiveConfig().isMobile;
        const shouldRestoreFocus =
            !shouldEnable && this.keyboardNavigator.contains(document.activeElement);

        this.keyboardNavigator.hidden = !shouldEnable;
        this.keyboardNavigator.inert = !shouldEnable;

        if (shouldRestoreFocus) {
            document
                .querySelector<HTMLAnchorElement>(`.nav__link[href="${sectionSelectors.projects}"]`)
                ?.focus({ preventScroll: true });
        }
    }

    public setKeyboardSelectedProject(projectStar?: ProjectStarVisual): void {
        for (const [projectId, button] of this.keyboardProjectButtons) {
            button.setAttribute('aria-expanded', String(projectId === projectStar?.project.id));
        }
    }

    public setKeyboardActiveProjectByScroll(projectStar?: ProjectStarVisual): void {
        if (!projectStar) {
            return;
        }

        const button = this.keyboardProjectButtons.get(projectStar.project.id);

        if (!button) {
            return;
        }

        this.setRovingKeyboardButton(button);

        if (this.keyboardNavigator.contains(document.activeElement)) {
            button.focus({ preventScroll: true });
            this.scrollKeyboardButtonIntoView(button);
        }
    }

    public setKeyboardActiveSkill(skillId?: string): void {
        this.keyboardActiveSkillId = skillId;
        const focusedButton = this.getKeyboardProjectButton(document.activeElement);

        for (const [groupSkillId, group] of this.keyboardGroupsBySkill) {
            group.hidden = skillId !== undefined && groupSkillId !== skillId;
        }

        const availableButtons = skillId
            ? (this.keyboardButtonsBySkill.get(skillId) ?? [])
            : Array.from(this.keyboardProjectButtons.values());
        const rovingButton = availableButtons.find((button) => button.tabIndex === 0);
        const nextButton = rovingButton ?? availableButtons[0];

        if (nextButton) {
            this.setRovingKeyboardButton(nextButton);
        }

        const instructions = this.keyboardNavigator.querySelector<HTMLElement>(
            '#constellation-keyboard-instructions',
        );
        if (instructions) {
            instructions.textContent = skillId
                ? 'Use Up and Down to move between projects, then press Enter to open details.'
                : 'Use Up and Down to move between projects, Left and Right to change constellation, then press Enter to open details.';
        }

        if (
            focusedButton &&
            nextButton &&
            !availableButtons.includes(focusedButton) &&
            this.keyboardNavigationActive
        ) {
            nextButton.focus({ preventScroll: true });
            this.scrollKeyboardButtonIntoView(nextButton);
        }
    }

    private createKeyboardNavigator(): void {
        this.keyboardNavigator.className = 'constellation-keyboard-nav';
        this.keyboardNavigator.hidden = true;
        this.keyboardNavigator.inert = true;
        this.keyboardNavigator.setAttribute('aria-label', 'Project constellation');
        this.keyboardNavigator.setAttribute('data-three-ignore', '');
        this.keyboardNavigator.addEventListener('click', this.handleKeyboardNavigatorClick);
        this.keyboardNavigator.addEventListener('keydown', this.handleKeyboardNavigatorKeyDown);
        this.keyboardNavigator.addEventListener('focusin', this.handleKeyboardNavigatorFocusIn);
        this.keyboardNavigator.addEventListener('focusout', this.handleKeyboardNavigatorFocusOut);
        const primaryNavigation = document.querySelector<HTMLElement>('.nav');

        if (primaryNavigation) {
            primaryNavigation.after(this.keyboardNavigator);
        } else {
            document.body.append(this.keyboardNavigator);
        }
    }

    private handlePointerMove = (event: PointerEvent): void => {
        if (
            this.tapCandidate?.pointerId === event.pointerId &&
            Math.hypot(
                event.clientX - this.tapCandidate.startX,
                event.clientY - this.tapCandidate.startY,
            ) > TAP_MOVE_TOLERANCE
        ) {
            this.tapCandidate.moved = true;
        }

        if (
            !this.callbacks.responsiveConfig().hasFinePointer ||
            event.pointerType !== 'mouse' ||
            this.isDomInteractionBlocked(event)
        ) {
            this.clearHoverState();
            return;
        }

        const hit = this.pickHitTarget(event, false);

        this.callbacks.onHoverChange(hit?.object, this.getTargetFromHit(hit));
        this.callbacks.setCursorHovering(this.getHoveredProjectStar(hit?.object) !== undefined);
        this.callbacks.emitProjectPreviewState();
    };

    private handleClick = (event: MouseEvent): void => {
        if (!this.callbacks.responsiveConfig().hasFinePointer) {
            return;
        }
        if (performance.now() - this.lastCoarseTapTime < 700) {
            return;
        }

        this.handleSelectionInput(event, false);
    };

    private handlePointerDown = (event: PointerEvent): void => {
        if (
            !this.callbacks.responsiveConfig().hasCoarsePointer ||
            event.pointerType === 'mouse' ||
            !event.isPrimary ||
            this.isDomInteractionBlocked(event)
        ) {
            return;
        }

        this.tapCandidate = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startScrollY: window.scrollY,
            startTime: performance.now(),
            moved: false,
        };
    };

    private handlePointerUp = (event: PointerEvent): void => {
        const tapCandidate = this.tapCandidate;

        if (!tapCandidate || tapCandidate.pointerId !== event.pointerId) {
            return;
        }

        this.tapCandidate = undefined;
        const moved =
            tapCandidate.moved ||
            Math.hypot(event.clientX - tapCandidate.startX, event.clientY - tapCandidate.startY) >
                TAP_MOVE_TOLERANCE ||
            Math.abs(window.scrollY - tapCandidate.startScrollY) > TAP_SCROLL_TOLERANCE;
        const heldTooLong = performance.now() - tapCandidate.startTime > TAP_MAX_DURATION;
        this.lastCoarseTapTime = performance.now();

        if (moved || heldTooLong || this.isDomInteractionBlocked(event)) {
            return;
        }

        this.handleSelectionInput(event, true);
    };

    private handlePointerCancel = (event: PointerEvent): void => {
        if (this.tapCandidate?.pointerId === event.pointerId) {
            this.tapCandidate = undefined;
        }
    };

    private handleConstellationEnter = (event: KeyboardEvent): void => {
        if (
            event.key !== 'Enter' ||
            event.defaultPrevented ||
            !this.callbacks.isProjectPanelBoundaryActive() ||
            this.isDomInteractionBlocked(event)
        ) {
            return;
        }

        const hit = this.pickHitTarget({ clientX: 0, clientY: 0 } as MouseEvent, false, true);
        const projectStar =
            this.getHoveredProjectStar(hit?.object) ?? this.callbacks.getActiveProjectStar();

        if (!projectStar) {
            return;
        }

        event.preventDefault();
        this.callbacks.onProjectStarSelect(projectStar);
    };

    private handleKeyboardNavigatorClick = (event: MouseEvent): void => {
        const button = this.getKeyboardProjectButton(event.target);

        if (!button || !this.keyboardNavigationActive) {
            return;
        }

        const projectStar = this.getProjectStarForKeyboardButton(button);

        if (!projectStar) {
            return;
        }

        this.setRovingKeyboardButton(button);
        this.callbacks.onProjectStarSelect(projectStar);
    };

    private handleKeyboardNavigatorKeyDown = (event: KeyboardEvent): void => {
        const button = this.getKeyboardProjectButton(event.target);

        if (!button || !this.keyboardNavigationActive) {
            return;
        }

        if (event.key === 'Enter') {
            const projectStar = this.getProjectStarForKeyboardButton(button);

            if (!projectStar) {
                return;
            }

            event.preventDefault();
            this.setRovingKeyboardButton(button);
            this.callbacks.onProjectStarSelect(projectStar);
            return;
        }

        const groupIndex = Number(button.dataset.groupIndex);
        const projectIndex = Number(button.dataset.projectIndex);
        let nextButton: HTMLButtonElement | undefined;

        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            const group = this.keyboardButtonGroups[groupIndex];
            const direction = event.key === 'ArrowDown' ? 1 : -1;

            nextButton =
                group?.[THREE.MathUtils.euclideanModulo(projectIndex + direction, group.length)];
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            if (this.keyboardActiveSkillId) {
                event.preventDefault();
                return;
            }

            const direction = event.key === 'ArrowRight' ? 1 : -1;
            const nextGroupIndex = THREE.MathUtils.euclideanModulo(
                groupIndex + direction,
                this.keyboardButtonGroups.length,
            );
            const nextGroup = this.keyboardButtonGroups[nextGroupIndex];

            nextButton = nextGroup?.[Math.min(projectIndex, nextGroup.length - 1)];
        } else if (event.key === 'Home' || event.key === 'End') {
            const group = this.keyboardButtonGroups[groupIndex];

            nextButton = event.key === 'Home' ? group?.[0] : group?.at(-1);
        }

        if (!nextButton) {
            return;
        }

        event.preventDefault();
        this.setRovingKeyboardButton(nextButton);
        nextButton.focus({ preventScroll: true });
        this.scrollKeyboardButtonIntoView(nextButton);
    };

    private handleKeyboardNavigatorFocusIn = (event: FocusEvent): void => {
        const button = this.getKeyboardProjectButton(event.target);

        if (!button) {
            return;
        }

        const projectStar = this.getProjectStarForKeyboardButton(button);

        if (!projectStar) {
            return;
        }

        this.setRovingKeyboardButton(button);
        this.callbacks.onHoverChange(
            projectStar.hitTarget,
            projectStar.hitTarget.userData.constellationTarget as InteractionTarget,
        );
        this.callbacks.setCursorHovering(false);
        this.callbacks.emitProjectPreviewState();
    };

    private handleKeyboardNavigatorFocusOut = (): void => {
        queueMicrotask(() => {
            if (!this.keyboardNavigator.contains(document.activeElement)) {
                this.clearHoverState();
            }
        });
    };

    private getKeyboardProjectButton(target: EventTarget | null): HTMLButtonElement | undefined {
        if (!(target instanceof Element)) {
            return undefined;
        }

        const button = target.closest<HTMLButtonElement>('.constellation-keyboard-nav__project');

        return button && this.keyboardNavigator.contains(button) ? button : undefined;
    }

    private getProjectStarForKeyboardButton(
        button: HTMLButtonElement,
    ): ProjectStarVisual | undefined {
        const projectId = button.dataset.projectId;

        return this.callbacks
            .getProjectStars()
            .find((projectStar) => projectStar.project.id === projectId);
    }

    private setRovingKeyboardButton(activeButton: HTMLButtonElement): void {
        for (const button of this.keyboardProjectButtons.values()) {
            button.tabIndex = button === activeButton ? 0 : -1;
        }
    }

    private scrollKeyboardButtonIntoView(button: HTMLButtonElement): void {
        const navigatorRect = this.keyboardNavigator.getBoundingClientRect();
        const buttonRect = button.getBoundingClientRect();
        const scrollMargin = 12;
        const visibleTop = navigatorRect.top + scrollMargin;
        const visibleBottom = navigatorRect.bottom - scrollMargin;

        if (buttonRect.top < visibleTop) {
            this.keyboardNavigator.scrollTop -= visibleTop - buttonRect.top;
        } else if (buttonRect.bottom > visibleBottom) {
            this.keyboardNavigator.scrollTop += buttonRect.bottom - visibleBottom;
        }
    }

    private handleSelectionInput(
        event: MouseEvent | PointerEvent,
        includeCoarseTargets: boolean,
    ): void {
        if (this.isDomInteractionBlocked(event)) {
            return;
        }

        const hit = this.pickHitTarget(event, includeCoarseTargets);
        const projectStar = this.getProjectStarFromHit(hit);

        if (projectStar) {
            if (!this.callbacks.isProjectPanelBoundaryActive()) {
                this.callbacks.onProjectClear();
                return;
            }

            this.callbacks.onProjectStarSelect(projectStar);
            return;
        }

        this.callbacks.onSelectionChange(hit?.object, this.getTargetFromHit(hit));

        if (!hit) {
            this.callbacks.onProjectClear();
        }
    }

    private clearHoverState(): void {
        this.callbacks.onHoverChange(undefined, undefined);
        this.callbacks.setCursorHovering(false);
        this.callbacks.emitProjectPreviewState();
    }

    /**
     * Casts a ray from the mouse/pointer position and returns the best
     * intersection — project stars are preferred over the broad cluster boundary.
     *
     * When `useLastPointer` is true the raycaster is not updated (used for
     * keyboard-triggered selection where we have no new event coordinates).
     */
    public pickHitTarget(
        event: MouseEvent | PointerEvent,
        includeCoarseTargets: boolean,
        useLastPointer = false,
    ): THREE.Intersection<THREE.Object3D> | undefined {
        if (!useLastPointer) {
            const rect = this.domElement.getBoundingClientRect();
            const x = (event.clientX - rect.left) / rect.width;
            const y = (event.clientY - rect.top) / rect.height;

            if (x < 0 || x > 1 || y < 0 || y > 1) {
                return undefined;
            }

            this.pointer.set(x * 2 - 1, -(y * 2 - 1));
            this.raycaster.setFromCamera(this.pointer, this.camera);
        }

        let interactionObjects = this.callbacks.getInteractionObjects();
        if (includeCoarseTargets) {
            const combinedInteractionObjects = this.combinedInteractionObjects;
            combinedInteractionObjects.length = 0;
            combinedInteractionObjects.push(...interactionObjects);
            combinedInteractionObjects.push(...this.callbacks.getCoarseInteractionObjects());
            interactionObjects = combinedInteractionObjects;
        }

        const intersects = this.intersections;
        intersects.length = 0;
        this.raycaster.intersectObjects(interactionObjects, false, intersects);
        const boundaryHitSkillIds = this.getBoundaryHitSkillIds(intersects);

        let firstEnabledHit: THREE.Intersection<THREE.Object3D> | undefined;
        for (const hit of intersects) {
            if (!this.isHitInsideActiveBoundary(hit, boundaryHitSkillIds)) {
                continue;
            }
            if (!this.isInteractionObjectEnabled(hit.object)) {
                continue;
            }

            firstEnabledHit ??= hit;
            if (this.isProjectStarHitObject(hit.object)) {
                return hit;
            }
        }

        return firstEnabledHit;
    }

    private getBoundaryHitSkillIds(intersects: THREE.Intersection<THREE.Object3D>[]): Set<string> {
        const skillIds = this.boundaryHitSkillIds;
        skillIds.clear();

        if (!this.callbacks.isProjectPanelBoundaryActive()) {
            return skillIds;
        }

        for (const hit of intersects) {
            if (!hit.object.name.startsWith('SkillClusterHitArea:')) {
                continue;
            }

            const target = this.getTargetFromObject(hit.object);

            if (target) {
                skillIds.add(target.id);
            }
        }

        return skillIds;
    }

    private isHitInsideActiveBoundary(
        hit: THREE.Intersection<THREE.Object3D>,
        boundaryHitSkillIds: Set<string>,
    ): boolean {
        if (!this.callbacks.isProjectPanelBoundaryActive()) {
            return true;
        }

        const target = this.getTargetFromObject(hit.object);

        return target !== undefined && boundaryHitSkillIds.has(target.id);
    }

    private isInteractionObjectEnabled(object: THREE.Object3D): boolean {
        const target = object.userData.constellationTarget as InteractionTarget | undefined;

        const activeMobileSkillId = this.callbacks.getActiveMobileSkillId();
        if (target && activeMobileSkillId && target.id !== activeMobileSkillId) {
            return false;
        }

        if (
            object.name.startsWith('SkillClusterHitArea:') &&
            !this.callbacks.isProjectPanelBoundaryActive()
        ) {
            return false;
        }

        if (!target || !this.callbacks.getSelectedProjectStar()) {
            return true;
        }

        return this.callbacks.hasSelectedProjectInSkill(target.id);
    }

    public getHoveredProjectStar(hoveredObject?: THREE.Object3D): ProjectStarVisual | undefined {
        if (
            !this.callbacks.isProjectPanelBoundaryActive() ||
            !hoveredObject?.name.startsWith('SkillStarHit:')
        ) {
            return undefined;
        }

        return this.callbacks
            .getProjectStars()
            .find((projectStar) => projectStar.hitTarget === hoveredObject);
    }

    public getProjectStarFromHit(
        hit: THREE.Intersection<THREE.Object3D> | undefined,
    ): ProjectStarVisual | undefined {
        if (!hit || !this.isProjectStarHitObject(hit.object)) {
            return undefined;
        }

        return this.callbacks
            .getProjectStars()
            .find(
                (projectStar) =>
                    projectStar.hitTarget === hit.object ||
                    projectStar.touchHitTarget === hit.object,
            );
    }

    public isProjectStarHitObject(object: THREE.Object3D): boolean {
        return (
            object.name.startsWith('SkillStarHit:') || object.name.startsWith('SkillStarTouchHit:')
        );
    }

    public getTargetFromHit(
        hit: THREE.Intersection<THREE.Object3D> | undefined,
    ): InteractionTarget | undefined {
        if (!hit) {
            return undefined;
        }
        return this.getTargetFromObject(hit.object);
    }

    public getTargetFromObject(object: THREE.Object3D): InteractionTarget | undefined {
        return object.userData.constellationTarget as InteractionTarget | undefined;
    }

    private isDomInteractionBlocked(event: Event): boolean {
        const target = event.target;
        const activeModal = document.querySelector<HTMLElement>(
            '[aria-modal="true"]:not([aria-hidden="true"])',
        );

        return (
            (activeModal !== null && target instanceof Node && !activeModal.contains(target)) ||
            (target instanceof Element && target.closest(DOM_INTERACTION_SELECTOR) !== null)
        );
    }
}
