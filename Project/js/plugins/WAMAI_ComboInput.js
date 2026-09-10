/*:
 * @target MZ
 * @plugindesc v2.0 Paleta de técnicas por combinaciones durante la selección de objetivo.
 * @author Equipo Wamai
 *
 * @param Combinaciones
 * @text Catálogo de combinaciones
 * @desc Formato: COMBO:ID:NOMBRE separado por comas.
 * @type string
 * @default WER:230:Cadena ascendente,WEE:172:Golpe potente,WRR:174:Ataque dual,EWR:22:Moco ralentizador,REW:206:Golpe cegador
 *
 * @param TimeoutMs
 * @text Tiempo entre teclas (ms)
 * @desc Si se supera este tiempo, la secuencia actual vuelve a comenzar.
 * @type number
 * @min 250
 * @default 1500
 *
 * @param ColorPrincipal
 * @text Color principal
 * @type string
 * @default #ffd400
 *
 * @help
 * Después de elegir Atacar aparece la selección de enemigo y una paleta de
 * técnicas. Las flechas cambian el objetivo. En vez de navegar por la lista,
 * escribe la combinación indicada para ejecutar la técnica inmediatamente.
 * No es necesario pulsar Enter.
 *
 * El catálogo usa este formato:
 *
 *   COMBO:ID_DE_HABILIDAD:NOMBRE MOSTRADO
 *
 * Separa cada técnica con una coma. Ejemplo:
 *
 *   WER:230:Cadena,WEE:172:Golpe potente
 *
 * Solo aparecen las técnicas aprendidas por el actor. Las que no pueda pagar
 * siguen visibles, pero se muestran bloqueadas. El entrenamiento de combos
 * presta temporalmente todas las habilidades de prueba configuradas.
 */

(() => {
    "use strict";

    const pluginName = "WAMAI_ComboInput";
    const parameters = PluginManager.parameters(pluginName);
    const defaultCatalog =
        "WER:230:Cadena ascendente," +
        "WEE:172:Golpe potente," +
        "WRR:174:Ataque dual," +
        "EWR:22:Moco ralentizador," +
        "REW:206:Golpe cegador";
    const catalogText = String(parameters.Combinaciones || defaultCatalog);
    const timeoutMs = Math.max(250, Number(parameters.TimeoutMs || 1500));
    const accentColor = String(parameters.ColorPrincipal || "#ffd400");
    const panelWidth = 660;
    const panelHeight = 390;

    function parseCatalog(text) {
        const definitions = [];
        const usedCombos = new Set();
        for (const rawEntry of String(text).split(",")) {
            const parts = rawEntry.split(":");
            const combo = String(parts.shift() || "")
                .trim()
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, "");
            const skillId = Number(String(parts.shift() || "").trim());
            const label = parts.join(":").trim();
            if (
                combo &&
                skillId > 0 &&
                !usedCombos.has(combo)
            ) {
                definitions.push({ combo, skillId, label });
                usedCombos.add(combo);
            }
        }
        return definitions;
    }

    const comboDefinitions = parseCatalog(catalogText);
    window.WAMAIComboCatalog = Object.freeze(
        comboDefinitions.map(definition => Object.freeze({ ...definition }))
    );
    const inputKeys = new Set(
        comboDefinitions.flatMap(definition => [...definition.combo])
    );
    let currentCombo = "";
    let lastInputTime = 0;
    let currentActorId = 0;

    function publicCatalog(actor = null) {
        return comboDefinitions.map(definition => {
            const skill = $dataSkills[definition.skillId];
            return {
                combo: definition.combo,
                skillId: definition.skillId,
                name:
                    definition.label ||
                    (skill ? skill.name : `Habilidad ${definition.skillId}`),
                description: skill ? skill.description : "",
                learned: !!(actor && actor.hasSkill(definition.skillId)),
                usable: !!(actor && skill && actor.canUse(skill))
            };
        });
    }

    function emitInputEvent(name, detail = {}) {
        const actor = BattleManager.actor ? BattleManager.actor() : null;
        window.dispatchEvent(
            new CustomEvent(name, {
                detail: {
                    expectedCombo:
                        detail.expectedCombo ||
                        (comboDefinitions[0]
                            ? comboDefinitions[0].combo
                            : ""),
                    currentCombo,
                    combos: publicCatalog(actor),
                    maxLength: Math.max(
                        0,
                        ...comboDefinitions.map(item => item.combo.length)
                    ),
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

    function learnedDefinitions(actor) {
        return comboDefinitions.filter(
            definition =>
                $dataSkills[definition.skillId] &&
                actor.hasSkill(definition.skillId)
        );
    }

    function canReceiveCombo(scene) {
        return (
            comboDefinitions.length > 0 &&
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

    function registerKey(key, actor, now) {
        if (
            currentActorId !== actor.actorId() ||
            (lastInputTime > 0 && now - lastInputTime > timeoutMs)
        ) {
            resetCombo(actor.actorId());
        }

        const definitions = learnedDefinitions(actor);
        let candidate = currentCombo + key;
        let matches = definitions.filter(definition =>
            definition.combo.startsWith(candidate)
        );
        if (matches.length === 0) {
            candidate = key;
            matches = definitions.filter(definition =>
                definition.combo.startsWith(candidate)
            );
        }

        currentCombo = matches.length > 0 ? candidate : "";
        lastInputTime = currentCombo ? now : 0;
        return {
            completed: matches.find(
                definition => definition.combo === currentCombo
            ),
            matches
        };
    }

    function executeCombo(scene, actor, definition) {
        const skill = $dataSkills[definition.skillId];
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

        if (!actor.hasSkill(definition.skillId)) {
            SoundManager.playBuzzer();
            emitInputEvent("wamaiComboError", {
                message: `${actor.name()} todavía no conoce ${skill.name}.`
            });
            resetCombo(actor.actorId());
            return;
        }

        if (!actor.canUse(skill)) {
            SoundManager.playBuzzer();
            emitInputEvent("wamaiComboError", {
                expectedCombo: definition.combo,
                message: `${actor.name()} no tiene recursos para ${skill.name}.`
            });
            resetCombo(actor.actorId());
            return;
        }

        action.setSkill(definition.skillId);
        action.setTarget(target.index());
        actor.setLastTarget(target);
        SoundManager.playOk();
        emitInputEvent("wamaiComboExecuted", {
            combo: definition.combo,
            expectedCombo: definition.combo,
            skillId: definition.skillId,
            skillName: definition.label || skill.name,
            targetName: target.name(),
            targetIndex: target.index()
        });
        resetCombo(actor.actorId());
        scene.hideSubInputWindows();
        scene.selectNextCommand();
    }

    function resourceText(skill) {
        const pieces = [];
        if (skill.mpCost > 0) {
            pieces.push(`${skill.mpCost} PM`);
        }
        if (skill.tpCost > 0) {
            pieces.push(`${skill.tpCost} PT`);
        }
        return pieces.length > 0 ? pieces.join(" / ") : "LIBRE";
    }

    function Sprite_WamaiComboPalette() {
        this.initialize(...arguments);
    }

    Sprite_WamaiComboPalette.prototype = Object.create(Sprite.prototype);
    Sprite_WamaiComboPalette.prototype.constructor =
        Sprite_WamaiComboPalette;

    Sprite_WamaiComboPalette.prototype.initialize = function(scene) {
        Sprite.prototype.initialize.call(this);
        this._scene = scene;
        this.bitmap = new Bitmap(panelWidth, panelHeight);
        this.x = 18;
        this.y = 84;
        this._lastSignature = "";
        this.visible = false;
    };

    Sprite_WamaiComboPalette.prototype.update = function() {
        Sprite.prototype.update.call(this);
        const active = canReceiveCombo(this._scene);
        this.visible = active;
        if (!active) {
            this._lastSignature = "";
            return;
        }

        const actor = BattleManager.actor();
        if (
            currentCombo &&
            lastInputTime > 0 &&
            performance.now() - lastInputTime > timeoutMs
        ) {
            resetCombo(actor.actorId());
            emitInputEvent("wamaiComboProgress", {
                expectedCombo: "",
                matchingCombos: [],
                completed: false,
                message: "Tiempo agotado; secuencia reiniciada."
            });
        }
        const target = this._scene._enemyWindow.enemy();
        const definitions = learnedDefinitions(actor);
        const signature = [
            actor.actorId(),
            target ? target.index() : -1,
            currentCombo,
            ...definitions.map(definition => {
                const skill = $dataSkills[definition.skillId];
                return `${definition.combo}:${definition.skillId}:${
                    skill && actor.canUse(skill) ? 1 : 0
                }`;
            })
        ].join("|");
        if (signature !== this._lastSignature) {
            this._lastSignature = signature;
            this.refresh(actor, target, definitions);
        }
    };

    Sprite_WamaiComboPalette.prototype.refresh = function(
        actor,
        target,
        definitions
    ) {
        const bitmap = this.bitmap;
        bitmap.clear();
        const rowHeight = 48;
        const contentHeight = Math.min(
            panelHeight,
            100 + definitions.length * rowHeight + 42
        );

        bitmap.fillRect(
            0,
            0,
            panelWidth,
            contentHeight,
            "rgba(7, 9, 14, 0.94)"
        );
        bitmap.fillRect(0, 0, panelWidth, 58, accentColor);
        bitmap.fillRect(0, contentHeight - 4, panelWidth, 4, accentColor);
        bitmap.fontFace = "Arial";
        bitmap.outlineColor = "rgba(0,0,0,0.85)";
        bitmap.outlineWidth = 0;
        bitmap.fontBold = true;
        bitmap.fontSize = 25;
        bitmap.textColor = "#101010";
        bitmap.drawText(
            `TÉCNICAS // ${actor.name().toUpperCase()}`,
            20,
            7,
            390,
            40,
            "left"
        );
        bitmap.fontSize = 15;
        bitmap.drawText(
            `OBJETIVO: ${target ? target.name() : "—"}`,
            405,
            13,
            235,
            30,
            "right"
        );

        bitmap.fontBold = false;
        bitmap.fontSize = 16;
        bitmap.outlineWidth = 1;
        bitmap.textColor = "#f4f4f4";
        const maxLength = Math.max(
            3,
            ...comboDefinitions.map(item => item.combo.length)
        );
        const entered = [...currentCombo];
        const inputDisplay = Array.from(
            { length: maxLength },
            (_, index) => entered[index] || "_"
        ).join("  ");
        bitmap.drawText(
            `ENTRADA:  ${inputDisplay}`,
            20,
            62,
            panelWidth - 40,
            30,
            "left"
        );

        if (definitions.length === 0) {
            bitmap.fontSize = 20;
            bitmap.textColor = "#bbbbbb";
            bitmap.drawText(
                "Este personaje todavía no tiene técnicas de combo.",
                20,
                126,
                panelWidth - 40,
                36,
                "center"
            );
        }

        definitions.forEach((definition, index) => {
            const skill = $dataSkills[definition.skillId];
            const usable = actor.canUse(skill);
            const matches =
                currentCombo.length > 0 &&
                definition.combo.startsWith(currentCombo);
            const y = 98 + index * rowHeight;
            const rowColor = matches
                ? accentColor
                : usable
                    ? "rgba(37, 42, 52, 0.98)"
                    : "rgba(55, 30, 32, 0.96)";
            bitmap.fillRect(14, y, panelWidth - 28, rowHeight - 4, rowColor);
            bitmap.fillRect(
                14,
                y,
                7,
                rowHeight - 4,
                matches ? "#ffffff" : accentColor
            );

            let keyX = 32;
            for (const key of definition.combo) {
                bitmap.fillRect(
                    keyX,
                    y + 8,
                    30,
                    28,
                    matches ? "#141414" : accentColor
                );
                bitmap.fontBold = true;
                bitmap.fontSize = 17;
                bitmap.outlineWidth = 0;
                bitmap.textColor = matches ? accentColor : "#111111";
                bitmap.drawText(key, keyX, y + 7, 30, 28, "center");
                keyX += 35;
            }

            const textX = 150;
            bitmap.fontBold = true;
            bitmap.fontSize = 17;
            bitmap.outlineWidth = 1;
            bitmap.textColor = matches ? "#111111" : "#ffffff";
            bitmap.drawText(
                definition.label || skill.name,
                textX,
                y + 1,
                315,
                25,
                "left"
            );
            bitmap.fontBold = false;
            bitmap.fontSize = 13;
            bitmap.outlineWidth = 0;
            bitmap.textColor = matches ? "#292929" : "#bfc8d2";
            bitmap.drawText(
                String(skill.description || "").split("\n")[0],
                textX,
                y + 22,
                355,
                18,
                "left"
            );
            bitmap.fontBold = true;
            bitmap.fontSize = 13;
            bitmap.outlineWidth = 0;
            bitmap.textColor = usable
                ? matches
                    ? "#111111"
                    : accentColor
                : "#ff7777";
            bitmap.drawText(
                usable ? resourceText(skill) : "SIN RECURSOS",
                510,
                y + 9,
                125,
                24,
                "right"
            );
        });

        bitmap.fontBold = false;
        bitmap.fontSize = 13;
        bitmap.outlineWidth = 0;
        bitmap.textColor = "#d9d9d9";
        bitmap.drawText(
            "ESCRIBE LA SECUENCIA  •  FLECHAS: OBJETIVO  •  ESC: VOLVER",
            18,
            contentHeight - 38,
            panelWidth - 36,
            28,
            "center"
        );
    };

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
            if (key.length !== 1 || !inputKeys.has(key)) {
                return;
            }

            event.preventDefault();
            event.stopImmediatePropagation();
            const actor = BattleManager.actor();
            const result = registerKey(key, actor, performance.now());
            const expectedCombo = result.matches[0]
                ? result.matches[0].combo
                : "";
            emitInputEvent("wamaiComboProgress", {
                key,
                expectedCombo,
                matchingCombos: result.matches.map(item => item.combo),
                completed: !!result.completed
            });
            if (result.completed) {
                executeCombo(scene, actor, result.completed);
            } else if (currentCombo === "") {
                SoundManager.playBuzzer();
            } else {
                SoundManager.playCursor();
            }
        },
        true
    );

    const _Scene_Battle_createAllWindows =
        Scene_Battle.prototype.createAllWindows;
    Scene_Battle.prototype.createAllWindows = function() {
        _Scene_Battle_createAllWindows.call(this);
        this._wamaiComboPalette = new Sprite_WamaiComboPalette(this);
        this.addChild(this._wamaiComboPalette);
    };

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
                    : "",
                message: "Introduce una combinación."
            });
        }
    };

    const _Scene_Battle_onEnemyCancel = Scene_Battle.prototype.onEnemyCancel;
    Scene_Battle.prototype.onEnemyCancel = function() {
        resetCombo(BattleManager.actor() ? BattleManager.actor().actorId() : 0);
        _Scene_Battle_onEnemyCancel.call(this);
    };

    const _Scene_Battle_terminate = Scene_Battle.prototype.terminate;
    Scene_Battle.prototype.terminate = function() {
        resetCombo();
        _Scene_Battle_terminate.call(this);
    };
})();
