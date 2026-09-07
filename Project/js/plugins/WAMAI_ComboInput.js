/*:
 * @target MZ
 * @plugindesc v1.0 Ejecuta una habilidad al introducir un combo durante la selección de acciones.
 * @author Equipo Wamai
 *
 * @param Combo
 * @text Secuencia del combo
 * @type string
 * @default WER
 *
 * @param SkillId
 * @text Habilidad
 * @type skill
 * @default 230
 *
 * @param TimeoutMs
 * @text Tiempo límite (ms)
 * @type number
 * @min 100
 * @default 1500
 *
 * @help
 * El combo solo se acepta mientras la ventana de comandos del actor está
 * activa. La secuencia se reinicia al cambiar de actor, al equivocarse o al
 * superar el tiempo límite. No reemplaza los controles normales de MZ.
 */

(() => {
    "use strict";

    const pluginName = "WAMAI_ComboInput";
    const parameters = PluginManager.parameters(pluginName);
    const expectedCombo = String(parameters.Combo || "WER")
        .trim()
        .toUpperCase();
    const skillId = Number(parameters.SkillId || 230);
    const timeoutMs = Math.max(100, Number(parameters.TimeoutMs || 1500));

    let currentCombo = "";
    let lastInputTime = 0;
    let currentActorId = 0;

    function resetCombo(actorId = 0) {
        currentCombo = "";
        lastInputTime = 0;
        currentActorId = actorId;
    }

    function canReceiveCombo(scene) {
        return (
            expectedCombo.length > 0 &&
            BattleManager.isInputting() &&
            BattleManager.actor() &&
            scene._actorCommandWindow &&
            scene._actorCommandWindow.active
        );
    }

    function registerKey(key, actorId, now) {
        if (currentActorId !== actorId || now - lastInputTime > timeoutMs) {
            resetCombo(actorId);
        }

        const candidate = currentCombo + key;
        if (expectedCombo.startsWith(candidate)) {
            currentCombo = candidate;
        } else {
            currentCombo = expectedCombo.startsWith(key) ? key : "";
        }
        lastInputTime = now;

        return currentCombo === expectedCombo;
    }

    function executeCombo(scene, actor) {
        const skill = $dataSkills[skillId];
        const action = BattleManager.inputtingAction();
        const target = $gameTroop.aliveMembers()[0];

        if (!skill || !action || !target || !actor.hasSkill(skillId) || !actor.canUse(skill)) {
            SoundManager.playBuzzer();
            resetCombo(actor.actorId());
            return;
        }

        action.setSkill(skillId);
        action.setTarget(target.index());
        actor.setLastTarget(target);
        resetCombo(actor.actorId());
        scene.selectNextCommand();
    }

    document.addEventListener(
        "keydown",
        event => {
            if (event.repeat) {
                return;
            }

            const scene = SceneManager._scene;
            if (!(scene instanceof Scene_Battle) || !canReceiveCombo(scene)) {
                return;
            }

            const key = String(event.key || "").toUpperCase();
            if (key.length !== 1) {
                return;
            }

            if (!expectedCombo.includes(key)) {
                resetCombo(BattleManager.actor().actorId());
                return;
            }

            event.preventDefault();
            event.stopImmediatePropagation();

            const actor = BattleManager.actor();
            if (registerKey(key, actor.actorId(), performance.now())) {
                executeCombo(scene, actor);
            }
        },
        true
    );

    const _Scene_Battle_startActorCommandSelection =
        Scene_Battle.prototype.startActorCommandSelection;
    Scene_Battle.prototype.startActorCommandSelection = function() {
        _Scene_Battle_startActorCommandSelection.call(this);
        const actor = BattleManager.actor();
        if (!actor || actor.actorId() !== currentActorId) {
            resetCombo(actor ? actor.actorId() : 0);
        }
    };

    const _Scene_Battle_terminate = Scene_Battle.prototype.terminate;
    Scene_Battle.prototype.terminate = function() {
        resetCombo();
        _Scene_Battle_terminate.call(this);
    };
})();
