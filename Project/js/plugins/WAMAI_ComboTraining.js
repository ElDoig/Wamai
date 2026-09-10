/*:
 * @target MZ
 * @plugindesc v1.1 Entrenamiento para una paleta de combos y medición de daño.
 * @author Equipo Wamai
 *
 * @command IniciarEntrenamiento
 * @text Iniciar entrenamiento
 * @desc Abre una batalla segura contra el grupo enemigo seleccionado.
 *
 * @arg TroopId
 * @text Grupo enemigo
 * @type troop
 * @default 1
 *
 * @param TroopId
 * @text Grupo predeterminado
 * @type troop
 * @default 1
 *
 * @param CurarEnemigos
 * @text Restaurar PV tras cada golpe
 * @type boolean
 * @on Sí
 * @off No
 * @default true
 *
 * @param SkillCombo
 * @text Habilidad temporal de combo
 * @desc Se enseña solo durante el entrenamiento y se retira al salir.
 * @type skill
 * @default 230
 *
 * @param SkillsComboDemo
 * @text Habilidades de la paleta
 * @desc IDs separados por comas que se prestan y no consumen PM/PT en la demo.
 * @type string
 * @default 230,172,174,22,206
 *
 * @param SkillDano
 * @text Habilidad que causa el daño
 * @desc Habilidad final de la cadena usada para medir el daño.
 * @type skill
 * @default 231
 *
 * @param FormulaEntrenamiento
 * @text Fórmula temporal de daño
 * @desc Solo sustituye fórmulas vacías o iguales a 0 durante la práctica.
 * @type string
 * @default Math.max(1, a.atk * 4 - b.def * 2)
 *
 * @help
 * En un evento del mapa, usa el comando de plugin:
 *
 *   WAMAI_ComboTraining > Iniciar entrenamiento
 *
 * Durante esa batalla los enemigos no actúan, no pueden morir y recuperan
 * sus PV después de cada golpe. Una ventana muestra golpes, daño total, mayor
 * golpe, última acción y último combo. Usa Huir para terminar la práctica.
 *
 * Este comportamiento solo se aplica a batallas iniciadas con el comando del
 * plugin; las batallas normales no cambian.
 */

(() => {
    "use strict";

    const pluginName = "WAMAI_ComboTraining";
    const parameters = PluginManager.parameters(pluginName);
    const defaultTroopId = Math.max(1, Number(parameters.TroopId || 1));
    const healEnemies = parameters.CurarEnemigos !== "false";
    const comboSkillId = Math.max(1, Number(parameters.SkillCombo || 230));
    const demoComboSkillIds = [
        ...new Set(
            String(parameters.SkillsComboDemo || "230,172,174,22,206")
                .split(",")
                .map(value => Number(value.trim()))
                .filter(value => value > 0)
                .concat(comboSkillId)
        )
    ];
    const damageSkillId = Math.max(1, Number(parameters.SkillDano || 231));
    const trainingDamageFormula = String(
        parameters.FormulaEntrenamiento ||
            "Math.max(1, a.atk * 4 - b.def * 2)"
    );

    function skillsForTraining() {
        const catalogIds = Array.isArray(window.WAMAIComboCatalog)
            ? window.WAMAIComboCatalog.map(item => Number(item.skillId))
            : [];
        return [
            ...new Set(
                demoComboSkillIds
                    .concat(catalogIds)
                    .filter(skillId => skillId > 0 && $dataSkills[skillId])
            )
        ];
    }

    const Training = {
        active: false,
        combos: 0,
        hits: 0,
        totalDamage: 0,
        maxDamage: 0,
        lastAction: "—",
        lastCombo: "—",
        comboExpected: "WER",
        comboProgress: "",
        comboMaxLength: 3,
        comboStatus: "Selecciona Atacar para elegir objetivo",
        revision: 0,
        temporaryLearners: [],
        originalSkillCosts: [],
        originalDamageFormula: null,

        start() {
            this.active = true;
            this.combos = 0;
            this.hits = 0;
            this.totalDamage = 0;
            this.maxDamage = 0;
            this.lastAction = "—";
            this.lastCombo = "—";
            this.comboExpected = "WER";
            this.comboProgress = "";
            this.comboMaxLength = 3;
            this.comboStatus = "Selecciona Atacar para elegir objetivo";
            this.temporaryLearners = [];
            this.originalSkillCosts = [];
            const trainingSkillIds = skillsForTraining();
            for (const actor of $gameParty.members()) {
                for (const skillId of trainingSkillIds) {
                    if ($dataSkills[skillId] && !actor.hasSkill(skillId)) {
                        actor.learnSkill(skillId);
                        this.temporaryLearners.push({
                            actorId: actor.actorId(),
                            skillId
                        });
                    }
                }
            }
            for (const skillId of trainingSkillIds) {
                const skill = $dataSkills[skillId];
                if (skill) {
                    this.originalSkillCosts.push({
                        skillId,
                        mpCost: skill.mpCost,
                        tpCost: skill.tpCost
                    });
                    skill.mpCost = 0;
                    skill.tpCost = 0;
                }
            }
            const damageSkill = $dataSkills[damageSkillId];
            if (
                damageSkill &&
                damageSkill.damage &&
                ["", "0"].includes(
                    String(damageSkill.damage.formula || "").trim()
                )
            ) {
                this.originalDamageFormula = damageSkill.damage.formula;
                damageSkill.damage.formula = trainingDamageFormula;
            }
            this.revision++;
        },

        stop() {
            for (const record of this.temporaryLearners) {
                const actor = $gameActors.actor(record.actorId);
                if (actor) {
                    actor.forgetSkill(record.skillId);
                }
            }
            this.temporaryLearners = [];
            for (const record of this.originalSkillCosts) {
                const skill = $dataSkills[record.skillId];
                if (skill) {
                    skill.mpCost = record.mpCost;
                    skill.tpCost = record.tpCost;
                }
            }
            this.originalSkillCosts = [];
            if (this.originalDamageFormula !== null) {
                const damageSkill = $dataSkills[damageSkillId];
                if (damageSkill && damageSkill.damage) {
                    damageSkill.damage.formula = this.originalDamageFormula;
                }
                this.originalDamageFormula = null;
            }
            this.active = false;
            this.revision++;
        },

        recordAction(action, target) {
            if (!this.active || !target || !target.isEnemy()) {
                return;
            }

            const result = target.result();
            const damage = Math.max(0, Number(result.hpDamage || 0));
            const item = action.item();
            this.lastAction = item ? item.name : "—";
            if (damage > 0) {
                this.hits++;
                this.totalDamage += damage;
                this.maxDamage = Math.max(this.maxDamage, damage);
            }
            if (healEnemies && target.isAlive()) {
                target.setHp(target.mhp);
            }
            this.revision++;
        },

        recordCombo(combo) {
            if (this.active) {
                this.lastCombo = combo || "—";
                this.combos++;
                this.comboProgress = this.comboExpected;
                this.comboStatus = "¡Combo completado!";
                this.revision++;
            }
        },

        recordReady(detail) {
            if (this.active) {
                this.comboExpected = detail.expectedCombo || "WER";
                this.comboProgress = "";
                this.comboMaxLength = Number(detail.maxLength || 3);
                this.comboStatus =
                    detail.message || "Introduce una combinación";
                this.revision++;
            }
        },

        recordProgress(detail) {
            if (this.active) {
                this.comboExpected = detail.expectedCombo || "WER";
                this.comboProgress = detail.currentCombo || "";
                this.comboMaxLength = Number(detail.maxLength || 3);
                this.comboStatus = detail.completed
                    ? "¡Combo completado!"
                    : this.comboProgress
                      ? `Entrada actual: ${this.comboProgress}`
                      : "Secuencia reiniciada";
                this.revision++;
            }
        },

        recordError(detail) {
            if (this.active) {
                this.comboStatus = detail.message || "No se pudo ejecutar.";
                this.revision++;
            }
        },

        recordWaiting(detail) {
            if (this.active) {
                this.comboProgress = "";
                this.comboStatus =
                    detail.message || "Selecciona Atacar para elegir objetivo.";
                this.revision++;
            }
        },

        formattedSequence() {
            return Array.from({ length: this.comboMaxLength }, (_, index) =>
                this.comboProgress[index]
                    ? `[${this.comboProgress[index]}]`
                    : `[ ]`
            )
                .join(" ");
        }
    };

    PluginManager.registerCommand(
        pluginName,
        "IniciarEntrenamiento",
        function(args) {
            const troopId = Math.max(
                1,
                Number(args.TroopId || defaultTroopId)
            );
            if (!$dataTroops[troopId]) {
                console.error(
                    `[${pluginName}] No existe el grupo enemigo ${troopId}.`
                );
                SoundManager.playBuzzer();
                return;
            }

            BattleManager.setup(troopId, true, false);
            Training.start();
            SceneManager.push(Scene_Battle);
            this.setWaitMode("battle");
        }
    );

    window.addEventListener("wamaiComboExecuted", event => {
        const detail = event.detail || {};
        Training.recordCombo(String(detail.combo || ""));
    });

    window.addEventListener("wamaiComboReady", event => {
        Training.recordReady(event.detail || {});
    });

    window.addEventListener("wamaiComboProgress", event => {
        Training.recordProgress(event.detail || {});
    });

    window.addEventListener("wamaiComboError", event => {
        Training.recordError(event.detail || {});
    });

    window.addEventListener("wamaiComboWaiting", event => {
        Training.recordWaiting(event.detail || {});
    });

    const _Game_Enemy_makeActions = Game_Enemy.prototype.makeActions;
    Game_Enemy.prototype.makeActions = function() {
        _Game_Enemy_makeActions.call(this);
        if (Training.active) {
            this.clearActions();
            this.setActionState("waiting");
        }
    };

    const _Game_Action_executeHpDamage = Game_Action.prototype.executeHpDamage;
    Game_Action.prototype.executeHpDamage = function(target, value) {
        let adjustedValue = value;
        if (
            Training.active &&
            target &&
            target.isEnemy() &&
            adjustedValue >= target.hp
        ) {
            adjustedValue = Math.max(0, target.hp - 1);
        }
        _Game_Action_executeHpDamage.call(this, target, adjustedValue);
    };

    const _Game_Action_apply = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function(target) {
        _Game_Action_apply.call(this, target);
        if (Training.active && this.subject() && this.subject().isActor()) {
            Training.recordAction(this, target);
        }
    };

    const _BattleManager_processEscape = BattleManager.processEscape;
    BattleManager.processEscape = function() {
        if (!Training.active) {
            return _BattleManager_processEscape.call(this);
        }

        $gameParty.performEscape();
        SoundManager.playEscape();
        this.displayEscapeSuccessMessage();
        this._escaped = true;
        this.processAbort();
        return true;
    };

    function Window_WamaiTrainingStats() {
        this.initialize(...arguments);
    }

    Window_WamaiTrainingStats.prototype = Object.create(Window_Base.prototype);
    Window_WamaiTrainingStats.prototype.constructor =
        Window_WamaiTrainingStats;

    Window_WamaiTrainingStats.prototype.initialize = function(rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this._lastRevision = -1;
        this.opacity = 210;
        this.refresh();
    };

    Window_WamaiTrainingStats.prototype.update = function() {
        Window_Base.prototype.update.call(this);
        if (this._lastRevision !== Training.revision) {
            this.refresh();
        }
    };

    Window_WamaiTrainingStats.prototype.refresh = function() {
        this._lastRevision = Training.revision;
        this.contents.clear();
        this.changeTextColor(ColorManager.systemColor());
        this.drawText("ENTRENAMIENTO DE COMBOS", 0, 0, this.innerWidth);
        this.resetTextColor();
        const lineHeight = this.lineHeight();
        this.drawText(
            `Secuencia: ${Training.formattedSequence()}`,
            0,
            lineHeight
        );
        this.changeTextColor(ColorManager.systemColor());
        this.drawText(Training.comboStatus, 0, lineHeight * 2);
        this.resetTextColor();
        this.drawText(`Último combo: ${Training.lastCombo}`, 0, lineHeight * 3);
        this.drawText(
            `Combos completados: ${Training.combos}`,
            0,
            lineHeight * 4
        );
        this.drawText(`Última acción: ${Training.lastAction}`, 0, lineHeight * 5);
        this.drawText(`Golpes: ${Training.hits}`, 0, lineHeight * 6);
        this.drawText(
            `Daño total: ${Training.totalDamage}`,
            0,
            lineHeight * 7
        );
        this.drawText(
            `Mayor golpe: ${Training.maxDamage}`,
            0,
            lineHeight * 8
        );
    };

    const _Scene_Battle_createAllWindows =
        Scene_Battle.prototype.createAllWindows;
    Scene_Battle.prototype.createAllWindows = function() {
        _Scene_Battle_createAllWindows.call(this);
        if (Training.active) {
            const width = 390;
            const height = this.calcWindowHeight(9, false) + 16;
            const rect = new Rectangle(
                Graphics.boxWidth - width - 12,
                12,
                width,
                height
            );
            this._wamaiTrainingWindow = new Window_WamaiTrainingStats(rect);
            this.addWindow(this._wamaiTrainingWindow);
        }
    };

    const _Scene_Battle_startPartyCommandSelection =
        Scene_Battle.prototype.startPartyCommandSelection;
    Scene_Battle.prototype.startPartyCommandSelection = function() {
        _Scene_Battle_startPartyCommandSelection.call(this);
        if (Training.active) {
            this.commandFight();
        }
    };

    const _Window_ActorCommand_makeCommandList =
        Window_ActorCommand.prototype.makeCommandList;
    Window_ActorCommand.prototype.makeCommandList = function() {
        _Window_ActorCommand_makeCommandList.call(this);
        if (Training.active && this._actor) {
            this.addCommand("Salir de práctica", "wamaiTrainingExit");
        }
    };

    const _Scene_Battle_createActorCommandWindow =
        Scene_Battle.prototype.createActorCommandWindow;
    Scene_Battle.prototype.createActorCommandWindow = function() {
        _Scene_Battle_createActorCommandWindow.call(this);
        this._actorCommandWindow.setHandler(
            "wamaiTrainingExit",
            this.commandWamaiTrainingExit.bind(this)
        );
    };

    Scene_Battle.prototype.commandWamaiTrainingExit = function() {
        BattleManager.processEscape();
        this.changeInputWindow();
    };

    const _Scene_Battle_terminate = Scene_Battle.prototype.terminate;
    Scene_Battle.prototype.terminate = function() {
        _Scene_Battle_terminate.call(this);
        Training.stop();
    };
})();
