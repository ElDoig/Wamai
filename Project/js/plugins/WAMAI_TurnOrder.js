/*:
 * @target MZ
 * @plugindesc v1.0 Orden determinista por AGI con barra visual y reordenamiento dinámico.
 * @author Equipo Wamai
 *
 * @param MaxParticipantes
 * @text Máximo visible
 * @desc Cantidad máxima de participantes mostrados antes del indicador +N.
 * @type number
 * @min 3
 * @max 12
 * @default 8
 *
 * @param MostrarAgilidad
 * @text Mostrar AGI
 * @type boolean
 * @on Sí
 * @off No
 * @default true
 *
 * @param ColorAliado
 * @text Color de aliados
 * @type string
 * @default #2878b8
 *
 * @param ColorEnemigo
 * @text Color de enemigos
 * @type string
 * @default #a33b3b
 *
 * @command IniciarDemoTurnos
 * @text Iniciar demo de turnos
 * @desc Abre una batalla y presta temporalmente una habilidad que reduce AGI.
 *
 * @arg TroopId
 * @text Grupo enemigo
 * @type troop
 * @default 1
 *
 * @arg SkillId
 * @text Habilidad de ralentización
 * @type skill
 * @default 22
 *
 * @help
 * Elimina el factor aleatorio del orden de actuación en el sistema de turnos
 * normal. El orden se calcula únicamente con la AGI actual del combatiente.
 * En caso de empate se conserva un desempate fijo por bando e índice.
 *
 * La barra superior muestra el orden exacto. Cuando una habilidad aplica una
 * mejora o reducción de AGI, los participantes que todavía no han actuado se
 * reordenan inmediatamente.
 *
 * Comando "Iniciar demo de turnos":
 * - Abre el grupo enemigo elegido.
 * - Enseña temporalmente la habilidad indicada a los miembros del grupo.
 * - Elimina temporalmente su coste de PT para facilitar la prueba.
 * - Al terminar la batalla restaura habilidades y coste originales.
 *
 * Configuración recomendada para SANDBOX:
 * - Grupo enemigo: Duende*2 (ID 1).
 * - Habilidad: Moco (ID 22).
 * Lanza Moco al Duende A para verlo pasar detrás del Duende B en la barra.
 *
 * Este plugin está pensado para el sistema de batalla por turnos, no TPB.
 */

(() => {
    "use strict";

    const pluginName = "WAMAI_TurnOrder";
    const parameters = PluginManager.parameters(pluginName);
    const maxParticipants = Math.max(
        3,
        Math.min(12, Number(parameters.MaxParticipantes || 8))
    );
    const showAgility = parameters.MostrarAgilidad !== "false";
    const allyColor = String(parameters.ColorAliado || "#2878b8");
    const enemyColor = String(parameters.ColorEnemigo || "#a33b3b");
    const barHeight = 72;

    const TurnOrder = {
        revision: 0,
        demo: null,

        battlerKey(battler) {
            if (battler.isActor()) {
                return `A${String(battler.actorId()).padStart(4, "0")}`;
            }
            return `E${String(battler.index()).padStart(4, "0")}`;
        },

        compareBattlers(left, right) {
            const agilityDifference = right.agi - left.agi;
            if (agilityDifference !== 0) {
                return agilityDifference;
            }
            return this.battlerKey(left).localeCompare(this.battlerKey(right));
        },

        sortBattlers(battlers) {
            return battlers.sort(this.compareBattlers.bind(this));
        },

        eligibleBattlers() {
            const battlers = [];
            if (!BattleManager._surprise) {
                battlers.push(...$gameParty.battleMembers());
            }
            if (!BattleManager._preemptive) {
                battlers.push(...$gameTroop.members());
            }
            return battlers.filter(battler => battler && battler.isAlive());
        },

        previewOrder() {
            if (!$gameParty.inBattle() || BattleManager.isTpb()) {
                return [];
            }

            const phase = BattleManager._phase;
            if (phase === "input" || phase === "start") {
                return this.sortBattlers(this.eligibleBattlers());
            }

            const order = [];
            const subject = BattleManager._subject;
            if (subject && subject.isAlive()) {
                order.push(subject);
            }
            const remaining = (BattleManager._actionBattlers || []).filter(
                battler => battler && battler.isAlive()
            );
            order.push(...remaining);
            return order;
        },

        resortRemaining() {
            if (BattleManager.isTpb() || !BattleManager._actionBattlers) {
                return;
            }
            for (const battler of BattleManager._actionBattlers) {
                battler._speed = battler.agi;
            }
            this.sortBattlers(BattleManager._actionBattlers);
            this.requestRefresh();
        },

        requestRefresh() {
            this.revision++;
        },

        beginDemo(troopId, skillId) {
            if (!$dataTroops[troopId] || !$dataSkills[skillId]) {
                SoundManager.playBuzzer();
                return false;
            }

            const skill = $dataSkills[skillId];
            const actors = $gameParty.battleMembers();
            this.demo = {
                skillId,
                originalTpCost: skill.tpCost,
                actorSkills: actors.map(actor => ({
                    actorId: actor.actorId(),
                    knewSkill: actor.isLearnedSkill(skillId)
                }))
            };
            skill.tpCost = 0;
            for (const actor of actors) {
                actor.learnSkill(skillId);
            }
            BattleManager.setup(troopId, true, false);
            SceneManager.push(Scene_Battle);
            return true;
        },

        endDemo() {
            if (!this.demo) {
                return;
            }
            const demo = this.demo;
            const skill = $dataSkills[demo.skillId];
            if (skill) {
                skill.tpCost = demo.originalTpCost;
            }
            for (const record of demo.actorSkills) {
                const actor = $gameActors.actor(record.actorId);
                if (actor && !record.knewSkill) {
                    actor.forgetSkill(demo.skillId);
                }
            }
            this.demo = null;
        }
    };

    function Sprite_WamaiTurnOrder() {
        this.initialize(...arguments);
    }

    Sprite_WamaiTurnOrder.prototype = Object.create(Sprite.prototype);
    Sprite_WamaiTurnOrder.prototype.constructor = Sprite_WamaiTurnOrder;

    Sprite_WamaiTurnOrder.prototype.initialize = function() {
        Sprite.prototype.initialize.call(this);
        this.bitmap = new Bitmap(Graphics.boxWidth, barHeight);
        this._lastSignature = "";
        this._lastOrder = "";
        this._changeFlash = 0;
    };

    Sprite_WamaiTurnOrder.prototype.update = function() {
        Sprite.prototype.update.call(this);
        this.visible = $gameParty.inBattle() && !BattleManager.isTpb();
        if (!this.visible) {
            return;
        }

        const order = TurnOrder.previewOrder();
        const orderKey = order.map(TurnOrder.battlerKey.bind(TurnOrder)).join(",");
        const subjectKey = BattleManager._subject
            ? TurnOrder.battlerKey(BattleManager._subject)
            : "";
        const signature = [
            TurnOrder.revision,
            BattleManager._phase,
            subjectKey,
            ...order.map(
                battler =>
                    `${TurnOrder.battlerKey(battler)}:${battler.name()}:${battler.agi}`
            )
        ].join("|");
        if (signature !== this._lastSignature) {
            if (this._lastOrder && orderKey && this._lastOrder !== orderKey) {
                this._changeFlash = 18;
            }
            this._lastSignature = signature;
            this._lastOrder = orderKey;
            this.refresh(order);
        }
        if (this._changeFlash > 0) {
            this._changeFlash--;
            this.opacity = 235 + Math.round(
                (Math.sin(this._changeFlash * 0.7) + 1) * 10
            );
        } else {
            this.opacity = 255;
        }
    };

    Sprite_WamaiTurnOrder.prototype.refresh = function(order) {
        const bitmap = this.bitmap;
        bitmap.clear();
        if (order.length === 0) {
            return;
        }

        const width = Graphics.boxWidth;
        const visibleOrder = order.slice(0, maxParticipants);
        const hiddenCount = Math.max(0, order.length - visibleOrder.length);
        const leftArea = 102;
        const rightArea = hiddenCount > 0 ? 48 : 8;
        const gap = 5;
        const usableWidth = width - leftArea - rightArea;
        const cardWidth = Math.max(
            72,
            Math.min(
                132,
                Math.floor(usableWidth / visibleOrder.length) - gap
            )
        );
        const totalWidth =
            visibleOrder.length * (cardWidth + gap) - gap +
            (hiddenCount > 0 ? 44 : 0);

        bitmap.fillRect(0, 0, width, barHeight, "rgba(8, 12, 22, 0.84)");
        bitmap.fillRect(0, barHeight - 3, width, 3, "rgba(160, 205, 255, 0.8)");
        bitmap.fontFace = "Arial";
        bitmap.fontBold = true;
        bitmap.fontSize = 18;
        bitmap.textColor = "#d9edff";
        bitmap.outlineColor = "rgba(0, 0, 0, 0.9)";
        bitmap.outlineWidth = 1;
        bitmap.drawText("ORDEN", 8, 7, 86, 28, "center");
        bitmap.fontBold = false;
        bitmap.fontSize = 13;
        bitmap.textColor = "#9bb6cc";
        bitmap.drawText("por AGI", 8, 35, 86, 22, "center");

        let x = Math.max(leftArea, Math.floor((width - totalWidth + leftArea) / 2));
        const currentSubject = BattleManager._subject;
        for (let index = 0; index < visibleOrder.length; index++) {
            const battler = visibleOrder[index];
            const isCurrent = battler === currentSubject;
            const color = battler.isActor() ? allyColor : enemyColor;
            this.drawBattlerCard(
                bitmap,
                battler,
                x,
                cardWidth,
                color,
                isCurrent,
                index
            );
            x += cardWidth + gap;
        }

        if (hiddenCount > 0) {
            bitmap.fontBold = true;
            bitmap.fontSize = 18;
            bitmap.textColor = "#ffffff";
            bitmap.drawText(`+${hiddenCount}`, x, 22, 42, 28, "center");
        }
    };

    Sprite_WamaiTurnOrder.prototype.drawBattlerCard = function(
        bitmap,
        battler,
        x,
        cardWidth,
        color,
        isCurrent,
        index
    ) {
        const y = 7;
        const height = 56;
        const borderColor = isCurrent ? "#ffd75a" : "rgba(255,255,255,0.32)";
        bitmap.fillRect(x, y, cardWidth, height, borderColor);
        bitmap.fillRect(x + 2, y + 2, cardWidth - 4, height - 4, color);
        bitmap.fillRect(
            x + 2,
            y + 2,
            cardWidth - 4,
            15,
            isCurrent ? "rgba(255,215,90,0.38)" : "rgba(0,0,0,0.2)"
        );

        bitmap.fontFace = "Arial";
        bitmap.fontBold = true;
        bitmap.fontSize = 12;
        bitmap.textColor = isCurrent ? "#fff2ad" : "#dcecff";
        bitmap.outlineColor = "rgba(0,0,0,0.9)";
        bitmap.outlineWidth = 1;
        bitmap.drawText(isCurrent ? "AHORA" : `TURNO ${index + 1}`, x + 4, y, cardWidth - 8, 18, "center");

        bitmap.fontSize = cardWidth < 92 ? 14 : 16;
        bitmap.textColor = "#ffffff";
        bitmap.drawText(battler.name(), x + 5, y + 17, cardWidth - 10, 22, "center");
        bitmap.fontBold = false;
        bitmap.fontSize = 12;
        bitmap.textColor = "#e5edf4";
        const detail = showAgility
            ? `AGI ${Math.round(battler.agi)}`
            : battler.isActor()
                ? "ALIADO"
                : "ENEMIGO";
        bitmap.drawText(detail, x + 5, y + 37, cardWidth - 10, 17, "center");
    };

    PluginManager.registerCommand(
        pluginName,
        "IniciarDemoTurnos",
        function(args) {
            const troopId = Math.max(1, Number(args.TroopId || 1));
            const skillId = Math.max(1, Number(args.SkillId || 22));
            if (TurnOrder.beginDemo(troopId, skillId)) {
                this.setWaitMode("battle");
            }
        }
    );

    const _BattleManager_makeActionOrders = BattleManager.makeActionOrders;
    BattleManager.makeActionOrders = function() {
        if (this.isTpb()) {
            _BattleManager_makeActionOrders.call(this);
            return;
        }
        const battlers = TurnOrder.eligibleBattlers();
        for (const battler of battlers) {
            battler._speed = battler.agi;
        }
        this._actionBattlers = TurnOrder.sortBattlers(battlers);
        TurnOrder.requestRefresh();
    };

    const _Game_Action_apply = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function(target) {
        const agilityBefore = target ? target.agi : 0;
        _Game_Action_apply.call(this, target);
        const agilityAfter = target ? target.agi : 0;
        if (agilityBefore !== agilityAfter) {
            TurnOrder.resortRemaining();
        }
    };

    const _BattleManager_getNextSubject = BattleManager.getNextSubject;
    BattleManager.getNextSubject = function() {
        const subject = _BattleManager_getNextSubject.call(this);
        TurnOrder.requestRefresh();
        return subject;
    };

    const _BattleManager_endAction = BattleManager.endAction;
    BattleManager.endAction = function() {
        _BattleManager_endAction.call(this);
        TurnOrder.resortRemaining();
    };

    const _BattleManager_endBattle = BattleManager.endBattle;
    BattleManager.endBattle = function(result) {
        _BattleManager_endBattle.call(this, result);
        TurnOrder.endDemo();
    };

    const _Scene_Battle_createAllWindows = Scene_Battle.prototype.createAllWindows;
    Scene_Battle.prototype.createAllWindows = function() {
        _Scene_Battle_createAllWindows.call(this);
        if (this._helpWindow) {
            this._helpWindow.y += barHeight;
        }
        if (this._wamaiTrainingWindow) {
            this._wamaiTrainingWindow.y = Math.max(
                this._wamaiTrainingWindow.y,
                barHeight + 8
            );
        }
        this._wamaiTurnOrderSprite = new Sprite_WamaiTurnOrder();
        this.addChild(this._wamaiTurnOrderSprite);
    };
})();
