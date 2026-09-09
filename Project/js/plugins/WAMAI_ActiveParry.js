/*:
 * @target MZ
 * @plugindesc v1.2 Parry activo con tres resultados y enfoque cinematográfico.
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
 * @param FinTemprano
 * @text Fin de bloqueo temprano
 * @desc Porcentaje de la ventana donde pulsar produce un bloqueo parcial.
 * @type number
 * @min 10
 * @max 70
 * @default 40
 *
 * @param FinPerfecto
 * @text Fin de parry perfecto
 * @desc Porcentaje donde termina la ventana perfecta y empieza el fallo.
 * @type number
 * @min 30
 * @max 95
 * @default 75
 *
 * @param DanoBloqueo
 * @text Daño del bloqueo temprano
 * @desc Porcentaje del daño normal que se recibe al bloquear temprano.
 * @type number
 * @min 0
 * @max 100
 * @default 40
 *
 * @param ZoomEscala
 * @text Zoom de enfoque
 * @desc 1.12 equivale a un acercamiento sutil del 12%.
 * @type number
 * @decimals 2
 * @min 1.00
 * @max 1.50
 * @default 1.12
 *
 * @param ZoomEntradaFrames
 * @text Entrada del zoom
 * @type number
 * @min 1
 * @max 60
 * @default 18
 *
 * @param ZoomSalidaFrames
 * @text Salida del zoom
 * @type number
 * @min 1
 * @max 60
 * @default 12
 *
 * @param EscalaTiempo
 * @text Velocidad de la animación
 * @desc 0.35 reproduce las animaciones al 35% durante el enfoque.
 * @type number
 * @decimals 2
 * @min 0.10
 * @max 1.00
 * @default 0.35
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
 * actor, la cámara se acerca al enemigo, la animación se ralentiza y aparece
 * un punto rojo pulsante con el aviso para pulsar Z. En RPG Maker, Z
 * corresponde a la entrada "ok"; Enter y Espacio también funcionan.
 *
 * Hay tres resultados según el momento de la pulsación:
 *
 * - Temprano: bloqueo parcial; por defecto se recibe 40% del daño.
 * - Perfecto: se anula el daño, suena el parry y el actor contraataca.
 * - Tardío o sin pulsar: el ataque continúa con todo su daño.
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
    const earlyEnd = Math.max(
        0.1,
        Math.min(0.7, Number(parameters.FinTemprano || 40) / 100)
    );
    const perfectEnd = Math.max(
        earlyEnd + 0.05,
        Math.min(0.95, Number(parameters.FinPerfecto || 75) / 100)
    );
    const earlyDamageRate = Math.max(
        0,
        Math.min(1, Number(parameters.DanoBloqueo || 40) / 100)
    );
    const focusZoom = Math.max(
        1,
        Math.min(1.5, Number(parameters.ZoomEscala || 1.12))
    );
    const zoomInFrames = Math.max(
        1,
        Number(parameters.ZoomEntradaFrames || 18)
    );
    const zoomOutFrames = Math.max(
        1,
        Number(parameters.ZoomSalidaFrames || 12)
    );
    const animationTimeScale = Math.max(
        0.1,
        Math.min(1, Number(parameters.EscalaTiempo || 0.35))
    );
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
        previousCamera: null,
        damageModifier: null,
        displayedTiming: "",

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
            this.startCinematicFocus(subject);
        },

        update() {
            if (!this.active) {
                return;
            }

            this.active.elapsed++;
            this.updateVisuals();
            if (Input.isTriggered("ok")) {
                this.resolve(this.currentTiming());
            } else if (this.active.elapsed >= windowFrames) {
                this.resolve("late");
            }
        },

        currentTiming() {
            if (!this.active) {
                return "late";
            }
            const progress = this.active.elapsed / windowFrames;
            if (progress < earlyEnd) {
                return "early";
            } else if (progress <= perfectEnd) {
                return "perfect";
            } else {
                return "late";
            }
        },

        resolve(timing) {
            if (!this.active) {
                return;
            }

            this.result = {
                action: this.active.action,
                target: this.active.target,
                timing
            };
            if (timing === "perfect" && parrySound) {
                AudioManager.playSe({
                    name: parrySound,
                    volume: soundVolume,
                    pitch: 100,
                    pan: 0
                });
                $gameScreen.startFlash([255, 255, 255, 150], 8);
            } else if (timing === "early") {
                $gameScreen.startFlash([255, 190, 40, 80], 8);
            } else {
                SoundManager.playBuzzer();
                $gameScreen.startFlash([255, 30, 30, 80], 8);
            }
            this.active = null;
            this.destroyVisuals();
            this.endCinematicFocus();
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

        withDamageModifier(action, target, rate, callback) {
            this.damageModifier = { action, target, rate };
            try {
                callback();
            } finally {
                this.damageModifier = null;
            }
        },

        adjustDamage(action, target, value) {
            const modifier = this.damageModifier;
            if (
                modifier &&
                modifier.action === action &&
                modifier.target === target
            ) {
                return Math.round(value * modifier.rate);
            }
            return value;
        },

        startCinematicFocus(subject) {
            if (!$gameScreen) {
                return;
            }

            this.previousCamera = {
                x: $gameScreen.zoomX(),
                y: $gameScreen.zoomY(),
                scale: $gameScreen.zoomScale(),
                tone: $gameScreen.tone().slice()
            };
            const focusX = subject.screenX();
            const focusY = subject.screenY() - 48;
            $gameScreen.startZoom(focusX, focusY, focusZoom, zoomInFrames);
            $gameScreen.startTint([-24, -24, -12, 0], zoomInFrames);
        },

        endCinematicFocus() {
            if (!$gameScreen || !this.previousCamera) {
                return;
            }

            const camera = this.previousCamera;
            $gameScreen.startZoom(
                camera.x,
                camera.y,
                camera.scale,
                zoomOutFrames
            );
            $gameScreen.startTint(camera.tone, zoomOutFrames);
            this.previousCamera = null;
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
                this.displayedTiming = "";
                this.redrawPrompt("early");
            }
        },

        redrawPrompt(timing) {
            if (!this.promptSprite) {
                return;
            }

            const width = 420;
            const height = 72;
            const styles = {
                early: {
                    color: "#e5a323",
                    text: "PREPÁRATE...  [Z]"
                },
                perfect: {
                    color: "#ff3030",
                    text: promptText
                },
                late: {
                    color: "#8e2020",
                    text: "¡TARDE!  [Z]"
                }
            };
            const style = styles[timing];
            const bitmap = this.promptSprite.bitmap;
            bitmap.clear();
            bitmap.fillRect(0, 0, width, height, "rgba(0, 0, 0, 0.78)");
            bitmap.fillRect(0, 0, width, 3, style.color);
            bitmap.fillRect(0, height - 3, width, 3, style.color);
            bitmap.fontFace = $gameSystem.mainFontFace();
            bitmap.fontSize = 30;
            bitmap.fontBold = true;
            bitmap.textColor = "#ffffff";
            bitmap.outlineColor = "rgba(90, 0, 0, 1)";
            bitmap.outlineWidth = 5;
            bitmap.drawText(style.text, 0, 4, width, 54, "center");
            if (this.barSprite) {
                this.barSprite.tint = Number(`0x${style.color.slice(1)}`);
            }
            this.displayedTiming = timing;
        },

        updateVisuals() {
            const progress = this.active.elapsed / windowFrames;
            const pulse = (Math.sin(this.active.elapsed * 0.35) + 1) / 2;
            const timing = this.currentTiming();
            if (timing !== this.displayedTiming) {
                this.redrawPrompt(timing);
            }
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
            this.displayedTiming = "";
        },

        clear() {
            this.active = null;
            this.result = null;
            this.damageModifier = null;
            this.destroyVisuals();
            this.endCinematicFocus();
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
        if (parryResult.timing === "perfect") {
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
        } else if (parryResult.timing === "early") {
            this._logWindow.push("pushBaseLine");
            this._logWindow.push(
                "addText",
                `${target.name()} bloquea antes de tiempo.`
            );
            Parry.withDamageModifier(
                this._action,
                target,
                earlyDamageRate,
                () => this.invokeAction(this._subject, target)
            );
            this._logWindow.push("popBaseLine");
        } else {
            this._logWindow.push(
                "addText",
                `¡Tarde! ${target.name()} no logra bloquear.`
            );
            this.invokeAction(this._subject, target);
        }
    };

    const _Game_Action_makeDamageValue = Game_Action.prototype.makeDamageValue;
    Game_Action.prototype.makeDamageValue = function(target, critical) {
        const value = _Game_Action_makeDamageValue.call(this, target, critical);
        return Parry.adjustDamage(this, target, value);
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

    const _Sprite_Animation_updateEffectGeometry =
        Sprite_Animation.prototype.updateEffectGeometry;
    Sprite_Animation.prototype.updateEffectGeometry = function() {
        _Sprite_Animation_updateEffectGeometry.call(this);
        if (Parry.active && this._handle) {
            const normalSpeed = this._animation.speed / 100;
            this._handle.setSpeed(normalSpeed * animationTimeScale);
        }
    };

    const _Sprite_Animation_updateMain = Sprite_Animation.prototype.updateMain;
    Sprite_Animation.prototype.updateMain = function() {
        if (!Parry.active || animationTimeScale >= 1) {
            this._wamaiParryTime = 0;
            _Sprite_Animation_updateMain.call(this);
            return;
        }

        this._wamaiParryTime =
            (this._wamaiParryTime || 0) + animationTimeScale;
        if (this._wamaiParryTime >= 1) {
            this._wamaiParryTime -= 1;
            _Sprite_Animation_updateMain.call(this);
        }
    };

    if (typeof Sprite_AnimationMV !== "undefined") {
        const _Sprite_AnimationMV_updateMain =
            Sprite_AnimationMV.prototype.updateMain;
        Sprite_AnimationMV.prototype.updateMain = function() {
            if (!Parry.active || animationTimeScale >= 1) {
                this._wamaiParryTime = 0;
                _Sprite_AnimationMV_updateMain.call(this);
                return;
            }

            this._wamaiParryTime =
                (this._wamaiParryTime || 0) + animationTimeScale;
            if (this._wamaiParryTime >= 1) {
                this._wamaiParryTime -= 1;
                _Sprite_AnimationMV_updateMain.call(this);
            }
        };
    }
})();
