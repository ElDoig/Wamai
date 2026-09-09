/*:
 * @target MZ
 * @plugindesc v1.0 Parry activo con aviso visual, entrada cronometrada y contraataque.
 * @author Equipo Wamai
 *
 * @param VentanaFrames
 * @text Ventana de parry
 * @desc Duración disponible para pulsar Z. 60 fotogramas ≈ 1 segundo.
 * @type number
 * @min 15
 * @max 180
 * @default 60
 *
 * @param TextoPrompt
 * @text Texto del aviso
 * @type string
 * @default ¡PARRY!  [Z]
 *
 * @param SonidoParry
 * @text Sonido de parry
 * @type file
 * @dir audio/se/
 * @default Parry
 *
 * @param VolumenSonido
 * @text Volumen del sonido
 * @type number
 * @min 0
 * @max 100
 * @default 90
 *
 * @param Contraatacar
 * @text Contraatacar al acertar
 * @type boolean
 * @on Sí
 * @off No
 * @default true
 *
 * @param PuntoX
 * @text Posición X predeterminada
 * @desc Desplazamiento horizontal desde el centro del enemigo.
 * @type number
 * @min -500
 * @max 500
 * @default 0
 *
 * @param PuntoY
 * @text Posición Y predeterminada
 * @desc Desplazamiento vertical desde los pies del enemigo.
 * @type number
 * @min -500
 * @max 500
 * @default -100
 *
 * @help
 * Antes de que un enemigo ejecute un ataque físico de daño contra un solo
 * actor, aparece un punto rojo pulsante y el aviso para pulsar Z. En RPG
 * Maker, Z corresponde a la entrada "ok"; Enter y Espacio también funcionan.
 *
 * Si el jugador acierta, el daño se anula, se reproduce el sonido configurado
 * y el actor contraataca. Si falla, el ataque continúa normalmente.
 *
 * Para colocar el punto sobre el arma de un enemigo, usa en sus Notas:
 *
 *   <PuntoParry: 35, -90>
 *
 * El primer número mueve el punto horizontalmente y el segundo verticalmente.
 * Los valores se miden desde el centro inferior del gráfico del enemigo.
 *
 * Para impedir el parry en un enemigo o habilidad concreta, usa:
 *
 *   <SinParry>
 */

(() => {
    "use strict";

    const pluginName = "WAMAI_ActiveParry";
    const parameters = PluginManager.parameters(pluginName);
    const windowFrames = Math.max(
        15,
        Number(parameters.VentanaFrames || 60)
    );
    const promptText = String(parameters.TextoPrompt || "¡PARRY!  [Z]");
    const parrySound = String(parameters.SonidoParry || "Parry");
    const soundVolume = Math.max(
        0,
        Math.min(100, Number(parameters.VolumenSonido || 90))
    );
    const counterAttack = parameters.Contraatacar !== "false";
    const defaultPointX = Number(parameters.PuntoX || 0);
    const defaultPointY = Number(parameters.PuntoY || -100);
    const pointPattern = /<PuntoParry\s*:\s*(-?\d+)\s*,\s*(-?\d+)\s*>/i;
    const noParryPattern = /<SinParry\s*>/i;

    const Parry = {
        active: null,
        result: null,
        markerSprite: null,
        promptSprite: null,
        barSprite: null,

        canStart(subject, action, target) {
            if (
                !subject ||
                !subject.isEnemy() ||
                !target ||
                !target.isActor() ||
                !target.isAlive() ||
                !action ||
                !action.item()
            ) {
                return false;
            }

            const item = action.item();
            const enemy = subject.enemy();
            const itemNote = String(item.note || "");
            const enemyNote = String((enemy && enemy.note) || "");
            return (
                action.isPhysical() &&
                action.isForOne() &&
                action.checkDamageType([1, 5]) &&
                !noParryPattern.test(itemNote) &&
                !noParryPattern.test(enemyNote)
            );
        },

        start(subject, action, target) {
            if (this.active || !this.canStart(subject, action, target)) {
                return;
            }

            this.result = null;
            this.active = {
                subject,
                action,
                target,
                elapsed: 0
            };
            this.createVisuals(subject);
        },

        update() {
            if (!this.active) {
                return;
            }

            this.active.elapsed++;
            this.updateVisuals();
            if (Input.isTriggered("ok")) {
                this.resolve(true);
            } else if (this.active.elapsed >= windowFrames) {
                this.resolve(false);
            }
        },

        resolve(success) {
            if (!this.active) {
                return;
            }

            this.result = {
                action: this.active.action,
                target: this.active.target,
                success
            };
            if (success && parrySound) {
                AudioManager.playSe({
                    name: parrySound,
                    volume: soundVolume,
                    pitch: 100,
                    pan: 0
                });
            }
            this.active = null;
            this.destroyVisuals();
        },

        isWaitingFor(action) {
            return !!this.active && this.active.action === action;
        },

        consumeResult(action, target) {
            if (
                !this.result ||
                this.result.action !== action ||
                this.result.target !== target
            ) {
                return null;
            }

            const result = this.result;
            this.result = null;
            return result;
        },

        pointOffset(subject) {
            const enemy = subject.enemy();
            const note = String((enemy && enemy.note) || "");
            const match = note.match(pointPattern);
            return match
                ? { x: Number(match[1]), y: Number(match[2]) }
                : { x: defaultPointX, y: defaultPointY };
        },

        createVisuals(subject) {
            const scene = SceneManager._scene;
            const spriteset = scene && scene._spriteset;
            const battlerSprite =
                spriteset && spriteset.findTargetSprite(subject);

            if (battlerSprite) {
                const bitmap = new Bitmap(64, 64);
                bitmap.drawCircle(32, 32, 21, "rgba(80, 0, 0, 0.85)");
                bitmap.drawCircle(32, 32, 15, "#ff2020");
                bitmap.drawCircle(27, 27, 5, "#ffffff");
                const marker = new Sprite(bitmap);
                const offset = this.pointOffset(subject);
                marker.anchor.set(0.5, 0.5);
                marker.x = offset.x;
                marker.y = offset.y;
                battlerSprite.addChild(marker);
                this.markerSprite = marker;
            }

            if (scene) {
                const width = 420;
                const height = 72;
                const bitmap = new Bitmap(width, height);
                bitmap.fillRect(0, 0, width, height, "rgba(0, 0, 0, 0.78)");
                bitmap.fillRect(0, 0, width, 3, "#ff3030");
                bitmap.fillRect(0, height - 3, width, 3, "#ff3030");
                bitmap.fontFace = $gameSystem.mainFontFace();
                bitmap.fontSize = 30;
                bitmap.fontBold = true;
                bitmap.textColor = "#ffffff";
                bitmap.outlineColor = "rgba(140, 0, 0, 1)";
                bitmap.outlineWidth = 5;
                bitmap.drawText(promptText, 0, 4, width, 54, "center");

                const prompt = new Sprite(bitmap);
                prompt.anchor.set(0.5, 0);
                prompt.x = Graphics.boxWidth / 2;
                prompt.y = 76;
                scene.addChild(prompt);
                this.promptSprite = prompt;

                const barBitmap = new Bitmap(width - 20, 6);
                barBitmap.fillRect(0, 0, width - 20, 6, "#ff3030");
                const bar = new Sprite(barBitmap);
                bar.anchor.set(0, 0.5);
                bar.x = -width / 2 + 10;
                bar.y = height - 10;
                prompt.addChild(bar);
                this.barSprite = bar;
            }
        },

        updateVisuals() {
            const progress = this.active.elapsed / windowFrames;
            const pulse = (Math.sin(this.active.elapsed * 0.35) + 1) / 2;
            if (this.markerSprite) {
                const scale = 0.82 + pulse * 0.28;
                this.markerSprite.scale.set(scale, scale);
                this.markerSprite.opacity = 205 + Math.round(pulse * 50);
            }
            if (this.promptSprite) {
                this.promptSprite.scale.x = 1 + pulse * 0.012;
                this.promptSprite.scale.y = 1 + pulse * 0.012;
            }
            if (this.barSprite) {
                this.barSprite.scale.x = Math.max(0, 1 - progress);
            }
        },

        destroyVisuals() {
            for (const sprite of [this.markerSprite, this.promptSprite]) {
                if (sprite && sprite.parent) {
                    sprite.parent.removeChild(sprite);
                }
                if (sprite) {
                    sprite.destroy({ children: true });
                }
            }
            this.markerSprite = null;
            this.promptSprite = null;
            this.barSprite = null;
        },

        clear() {
            this.active = null;
            this.result = null;
            this.destroyVisuals();
        }
    };

    const _BattleManager_startAction = BattleManager.startAction;
    BattleManager.startAction = function() {
        _BattleManager_startAction.call(this);
        Parry.start(this._subject, this._action, this._targets[0]);
    };

    const _BattleManager_updateAction = BattleManager.updateAction;
    BattleManager.updateAction = function() {
        if (Parry.isWaitingFor(this._action)) {
            return;
        }

        const target = this._targets[0];
        const parryResult = Parry.consumeResult(this._action, target);
        if (!parryResult) {
            _BattleManager_updateAction.call(this);
            return;
        }

        this._targets.shift();
        if (parryResult.success) {
            this._logWindow.push("pushBaseLine");
            this._logWindow.push(
                "addText",
                `${target.name()} ejecuta ¡PARRY!`
            );
            if (counterAttack) {
                this.invokeCounterAttack(this._subject, target);
            }
            this._subject.setLastTarget(target);
            this._logWindow.push("popBaseLine");
        } else {
            this.invokeAction(this._subject, target);
        }
    };

    const _BattleManager_endAction = BattleManager.endAction;
    BattleManager.endAction = function() {
        Parry.clear();
        _BattleManager_endAction.call(this);
    };

    const _Scene_Battle_update = Scene_Battle.prototype.update;
    Scene_Battle.prototype.update = function() {
        _Scene_Battle_update.call(this);
        if (this.isActive()) {
            Parry.update();
        }
    };

    const _Scene_Battle_terminate = Scene_Battle.prototype.terminate;
    Scene_Battle.prototype.terminate = function() {
        Parry.clear();
        _Scene_Battle_terminate.call(this);
    };
})();
