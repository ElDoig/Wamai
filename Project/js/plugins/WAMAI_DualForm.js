/*:
 * @target MZ
 * @plugindesc v1.1 Cambio Usami/Michi con acción, habilidades y gráficos propios.
 * @author Equipo Wamai
 *
 * @param ActorId
 * @text Actor dual
 * @desc Actor de la base de datos que representa a Usami y Michi.
 * @type actor
 * @default 2
 *
 * @param NombreForma1
 * @text Primera forma
 * @type string
 * @default Usami
 *
 * @param NombreForma2
 * @text Segunda forma
 * @type string
 * @default Michi
 *
 * @param ReiniciarBatalla
 * @text Comenzar como Usami
 * @desc Reinicia a la primera forma al comenzar cada batalla.
 * @type boolean
 * @on Sí
 * @off No, conservar forma
 * @default true
 *
 * @param HabilidadesForma1
 * @text Habilidades de Usami
 * @desc IDs separados por comas. Vacío significa compartir todas por ahora.
 * @type string
 * @default
 *
 * @param HabilidadesForma2
 * @text Habilidades de Michi
 * @desc IDs separados por comas. Vacío significa compartir todas por ahora.
 * @type string
 * @default
 *
 * @param RostroMichi
 * @text Rostro de Michi
 * @desc Archivo de img/faces. Vacío conserva el rostro de Usami.
 * @type file
 * @dir img/faces/
 * @default
 *
 * @param IndiceRostroMichi
 * @text Índice del rostro de Michi
 * @type number
 * @min 0
 * @max 7
 * @default 0
 *
 * @param PersonajeMichi
 * @text Sprite de mapa de Michi
 * @desc Archivo de img/characters. Vacío conserva el sprite de Usami.
 * @type file
 * @dir img/characters/
 * @default
 *
 * @param IndicePersonajeMichi
 * @text Índice del sprite de Michi
 * @type number
 * @min 0
 * @max 7
 * @default 0
 *
 * @param BattlerMichi
 * @text Battler de Michi
 * @desc Archivo de img/sv_actors. Solo se ve usando batalla lateral.
 * @type file
 * @dir img/sv_actors/
 * @default
 *
 * @param AnimacionCambio
 * @text Animación de cambio
 * @type animation
 * @default 0
 *
 * @help
 * Añade al actor configurado una orden de batalla llamada "Cambiar a Michi"
 * o "Cambiar a Usami". Elegirla consume la acción completa de ese turno. La
 * forma nueva permanece activa hasta volver a usar la orden.
 *
 * Ambas formas son el mismo actor: comparten nivel, PV, PM, PT, estados,
 * equipo y posición en el grupo.
 *
 * Si las listas de habilidades se dejan vacías, ambas formas comparten el kit.
 * Cuando se configuran, las habilidades de la forma inactiva se ocultan y las
 * de la forma activa se conceden automáticamente.
 *
 * Los gráficos de Usami se toman directamente del Actor configurado. Elige
 * los archivos de Michi en los parámetros del plugin. Cada cambio actualiza
 * el rostro, el sprite del mapa y el battler sin crear un segundo actor.
 *
 * Opcionalmente cualquier actor puede sobrescribir los nombres en sus Notas:
 *
 *   <FormaDual: Usami, Michi>
 */

(() => {
    "use strict";

    const pluginName = "WAMAI_DualForm";
    const parameters = PluginManager.parameters(pluginName);
    const configuredActorId = Math.max(1, Number(parameters.ActorId || 2));
    const configuredNames = [
        String(parameters.NombreForma1 || "Usami"),
        String(parameters.NombreForma2 || "Michi")
    ];
    const resetEachBattle = parameters.ReiniciarBatalla !== "false";
    const changeAnimationId = Math.max(
        0,
        Number(parameters.AnimacionCambio || 0)
    );
    const dualFormPattern =
        /<FormaDual\s*:\s*([^,>]+)\s*,\s*([^>]+)\s*>/i;

    function parseSkillIds(value) {
        return [
            ...new Set(
                String(value || "")
                    .split(",")
                    .map(item => Number(item.trim()))
                    .filter(item => item > 0)
            )
        ];
    }

    const configuredSkillIds = [
        parseSkillIds(parameters.HabilidadesForma1),
        parseSkillIds(parameters.HabilidadesForma2)
    ];
    const michiGraphics = {
        faceName: String(parameters.RostroMichi || "").trim(),
        faceIndex: Math.max(
            0,
            Math.min(7, Number(parameters.IndiceRostroMichi || 0))
        ),
        characterName: String(parameters.PersonajeMichi || "").trim(),
        characterIndex: Math.max(
            0,
            Math.min(7, Number(parameters.IndicePersonajeMichi || 0))
        ),
        battlerName: String(parameters.BattlerMichi || "").trim()
    };

    const DualForms = {
        isDualActor(actor) {
            if (!actor || !actor.isActor || !actor.isActor()) {
                return false;
            }
            const data = actor.actor();
            const note = String((data && data.note) || "");
            return actor.actorId() === configuredActorId || dualFormPattern.test(note);
        },

        names(actor) {
            const data = actor && actor.actor ? actor.actor() : null;
            const note = String((data && data.note) || "");
            const match = note.match(dualFormPattern);
            return match
                ? [match[1].trim(), match[2].trim()]
                : configuredNames;
        },

        form(actor) {
            if (!this.isDualActor(actor)) {
                return 0;
            }
            return actor._wamaiDualForm === 1 ? 1 : 0;
        },

        graphics(actor, form) {
            const data = actor.actor();
            if (form !== 1) {
                return {
                    faceName: data.faceName,
                    faceIndex: data.faceIndex,
                    characterName: data.characterName,
                    characterIndex: data.characterIndex,
                    battlerName: data.battlerName
                };
            }
            return {
                faceName: michiGraphics.faceName || data.faceName,
                faceIndex: michiGraphics.faceName
                    ? michiGraphics.faceIndex
                    : data.faceIndex,
                characterName:
                    michiGraphics.characterName || data.characterName,
                characterIndex: michiGraphics.characterName
                    ? michiGraphics.characterIndex
                    : data.characterIndex,
                battlerName:
                    michiGraphics.battlerName || data.battlerName
            };
        },

        applyGraphics(actor, form) {
            const graphics = this.graphics(actor, form);
            actor.setFaceImage(graphics.faceName, graphics.faceIndex);
            actor.setCharacterImage(
                graphics.characterName,
                graphics.characterIndex
            );
            actor.setBattlerImage(graphics.battlerName);
            if ($gamePlayer) {
                $gamePlayer.refresh();
                if ($gamePlayer.followers()) {
                    $gamePlayer.followers().refresh();
                }
            }
        },

        setForm(actor, form) {
            if (!this.isDualActor(actor)) {
                return;
            }
            actor._wamaiDualForm = form === 1 ? 1 : 0;
            this.applyGraphics(actor, actor._wamaiDualForm);
            actor.refresh();
            $gameParty.requestMotionRefresh();
            const scene = SceneManager._scene;
            if (scene instanceof Scene_Battle && scene._statusWindow) {
                scene._statusWindow.refresh();
            }
        },

        nextForm(actor) {
            return this.form(actor) === 0 ? 1 : 0;
        },

        currentName(actor) {
            return this.names(actor)[this.form(actor)];
        },

        nextName(actor) {
            return this.names(actor)[this.nextForm(actor)];
        },

        skillIds(form) {
            return configuredSkillIds[form === 1 ? 1 : 0];
        },

        hasSeparatedKits() {
            return configuredSkillIds.some(list => list.length > 0);
        },

        performSwitch(actor, requestedForm) {
            const names = this.names(actor);
            const oldForm = this.form(actor);
            const newForm = requestedForm === 1 ? 1 : 0;
            this.setForm(actor, newForm);
            if ($gameScreen) {
                const color = newForm === 1
                    ? [160, 90, 255, 90]
                    : [90, 220, 255, 90];
                $gameScreen.startFlash(color, 12);
            }
            if (changeAnimationId > 0 && $gameTemp) {
                $gameTemp.requestAnimation([actor], changeAnimationId);
            }
            return `${names[oldForm]} cede el control a ${names[newForm]}.`;
        }
    };

    const _Game_Actor_name = Game_Actor.prototype.name;
    Game_Actor.prototype.name = function() {
        if (DualForms.isDualActor(this)) {
            return DualForms.currentName(this);
        }
        return _Game_Actor_name.call(this);
    };

    const _Game_Actor_skills = Game_Actor.prototype.skills;
    Game_Actor.prototype.skills = function() {
        const originalSkills = _Game_Actor_skills.call(this);
        if (!DualForms.isDualActor(this) || !DualForms.hasSeparatedKits()) {
            return originalSkills;
        }

        const form = DualForms.form(this);
        const activeIds = DualForms.skillIds(form);
        const inactiveIds = DualForms.skillIds(form === 0 ? 1 : 0);
        const result = originalSkills.filter(
            skill => !inactiveIds.includes(skill.id) || activeIds.includes(skill.id)
        );
        for (const skillId of activeIds) {
            const skill = $dataSkills[skillId];
            if (skill && !result.includes(skill)) {
                result.push(skill);
            }
        }
        return result.sort((left, right) => left.id - right.id);
    };

    function clearSwitchFlags(action) {
        delete action._wamaiDualSwitch;
        delete action._wamaiDualTargetForm;
    }

    const _Game_Action_setSkill = Game_Action.prototype.setSkill;
    Game_Action.prototype.setSkill = function(skillId) {
        clearSwitchFlags(this);
        _Game_Action_setSkill.call(this, skillId);
    };

    const _Game_Action_setItem = Game_Action.prototype.setItem;
    Game_Action.prototype.setItem = function(itemId) {
        clearSwitchFlags(this);
        _Game_Action_setItem.call(this, itemId);
    };

    const _Window_ActorCommand_makeCommandList =
        Window_ActorCommand.prototype.makeCommandList;
    Window_ActorCommand.prototype.makeCommandList = function() {
        _Window_ActorCommand_makeCommandList.call(this);
        if (this._actor && DualForms.isDualActor(this._actor)) {
            const command = {
                name: `Cambiar a ${DualForms.nextName(this._actor)}`,
                symbol: "wamaiDualSwitch",
                enabled: this._actor.canMove(),
                ext: DualForms.nextForm(this._actor)
            };
            this._list.splice(Math.min(1, this._list.length), 0, command);
        }
    };

    const _Scene_Battle_createActorCommandWindow =
        Scene_Battle.prototype.createActorCommandWindow;
    Scene_Battle.prototype.createActorCommandWindow = function() {
        _Scene_Battle_createActorCommandWindow.call(this);
        this._actorCommandWindow.setHandler(
            "wamaiDualSwitch",
            this.commandWamaiDualSwitch.bind(this)
        );
    };

    Scene_Battle.prototype.commandWamaiDualSwitch = function() {
        const actor = BattleManager.actor();
        const action = BattleManager.inputtingAction();
        if (!actor || !action || !DualForms.isDualActor(actor)) {
            SoundManager.playBuzzer();
            return;
        }
        action.setGuard();
        action._wamaiDualSwitch = true;
        action._wamaiDualTargetForm = DualForms.nextForm(actor);
        this.selectNextCommand();
    };

    const _BattleManager_startAction = BattleManager.startAction;
    BattleManager.startAction = function() {
        const subject = this._subject;
        const action = subject ? subject.currentAction() : null;
        if (
            subject &&
            subject.isActor() &&
            action &&
            action._wamaiDualSwitch
        ) {
            this._phase = "action";
            this._action = action;
            this._targets = [];
            subject.cancelMotionRefresh();
            const message = DualForms.performSwitch(
                subject,
                action._wamaiDualTargetForm
            );
            this._logWindow.push("pushBaseLine");
            this._logWindow.push("addText", message);
            this._logWindow.push("wait");
            this._logWindow.push("popBaseLine");
            return;
        }
        _BattleManager_startAction.call(this);
    };

    const _BattleManager_startBattle = BattleManager.startBattle;
    BattleManager.startBattle = function() {
        if (resetEachBattle) {
            for (const actor of $gameParty.battleMembers()) {
                if (DualForms.isDualActor(actor)) {
                    DualForms.setForm(actor, 0);
                }
            }
        }
        _BattleManager_startBattle.call(this);
    };
})();
