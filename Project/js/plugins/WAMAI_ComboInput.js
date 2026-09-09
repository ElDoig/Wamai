/*:
 * @target MZ
 * @plugindesc v1.1 Ejecuta un combo sobre el enemigo seleccionado en Atacar.
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
 * El combo solo se acepta en la pantalla de selección de objetivo que aparece
 * después de elegir Atacar. Las flechas cambian el objetivo; al completar la
 * secuencia, se ataca automáticamente al enemigo resaltado sin pulsar Enter.
 * La secuencia se reinicia al salir de esa pantalla, al equivocarse o al
 * superar el tiempo límite.
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

    function emitInputEvent(name, detail = {}) {
        window.dispatchEvent(
            new CustomEvent(name, {
                detail: {
                    expectedCombo,
                    currentCombo,
                    ...detail
                }
            })
        );
    }

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
            scene._actorCommandWindow.currentSymbol() === "attack" &&
            scene._enemyWindow &&
            scene._enemyWindow.visible &&
            scene._enemyWindow.active &&
            scene._enemyWindow.enemy() &&
            scene._enemyWindow.enemy().isAlive()
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
        const target = scene._enemyWindow.enemy();

        if (!skill || !action || !target) {
            SoundManager.playBuzzer();
            emitInputEvent("wamaiComboError", {
                message: "No hay una acción o un objetivo disponible."
            });
            resetCombo(actor.actorId());
            return;
        }

        if (!actor.hasSkill(skillId)) {
            SoundManager.playBuzzer();
            emitInputEvent("wamaiComboError", {
                message: `A ${actor.name()} le falta la habilidad ${skillId}.`
            });
            resetCombo(actor.actorId());
            return;
        }

        if (!actor.canUse(skill)) {
            SoundManager.playBuzzer();
            emitInputEvent("wamaiComboError", {
                message: `${actor.name()} no puede usar ${skill.name}.`
            });
            resetCombo(actor.actorId());
            return;
        }

        action.setSkill(skillId);
        action.setTarget(target.index());
        actor.setLastTarget(target);
        emitInputEvent("wamaiComboExecuted", {
            combo: expectedCombo,
            skillId,
            targetName: target.name(),
            targetIndex: target.index()
        });
        resetCombo(actor.actorId());
        scene.hideSubInputWindows();
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
            const completed = registerKey(
                key,
                actor.actorId(),
                performance.now()
            );
            emitInputEvent("wamaiComboProgress", { key, completed });
            if (completed) {
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
        resetCombo(actor ? actor.actorId() : 0);
        emitInputEvent("wamaiComboWaiting", {
            actorName: actor ? actor.name() : "",
            message: "Selecciona Atacar para elegir objetivo."
        });
    };

    const _Scene_Battle_startEnemySelection =
        Scene_Battle.prototype.startEnemySelection;
    Scene_Battle.prototype.startEnemySelection = function() {
        _Scene_Battle_startEnemySelection.call(this);
        if (this._actorCommandWindow.currentSymbol() === "attack") {
            const actor = BattleManager.actor();
            resetCombo(actor ? actor.actorId() : 0);
            emitInputEvent("wamaiComboReady", {
                actorName: actor ? actor.name() : "",
                targetName: this._enemyWindow.enemy()
                    ? this._enemyWindow.enemy().name()
                    : ""
            });
        }
    };

    const _Scene_Battle_terminate = Scene_Battle.prototype.terminate;
    Scene_Battle.prototype.terminate = function() {
        resetCombo();
        _Scene_Battle_terminate.call(this);
    };
})();
