/*:
 * @target MZ
 * @plugindesc v1.4 Parry activo con impacto, pausa táctica y cámara dinámica.
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
 * @param PTConcentracion
 * @text PT de Concentración
 * @desc PT que obtiene el actor al elegir R después del parry perfecto.
 * @type number
 * @min 0
 * @max 100
 * @default 20
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
 * - Perfecto: se anula el daño, aparece un impacto de espadas y permite
 *   elegir sin límite: W Represalia, E Desvío o R Concentración.
 * - Tardío o sin pulsar: el ataque continúa con todo su daño.
 *
 * Respuestas del parry perfecto:
 *
 * - W Represalia: contraataca inmediatamente al agresor.
 * - E Desvío: redirige el golpe a otro enemigo o al propio atacante.
 * - R Concentración: gana PT sin causar daño adicional.
 * La cámara mantiene un movimiento sutil mientras espera la respuesta. El
 * combate no continúa hasta que el jugador pulse W, E o R.
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
    const concentrationTp = Math.max(
        0,
        Math.min(100, Number(parameters.PTConcentracion || 20))
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
    const promptWidth = 680;
    const promptHeight = 92;

    const Parry = {
        active: null,
        result: null,
        markerSprite: null,
        promptSprite: null,
        barSprite: null,
        impactContainer: null,
        impactParticles: [],
        impactElapsed: 0,
        previousCamera: null,
        focusCamera: null,
        damageModifier: null,
        displayedTiming: "",
        queuedResponse: "",

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
                elapsed: 0,
                phase: "timing"
            };
            this.queuedResponse = "";
            this.createVisuals(subject);
            this.startCinematicFocus(subject);
        },

        update() {
            if (!this.active) {
                return;
            }

            this.active.elapsed++;
            this.updateVisuals();
            if (this.active.phase === "response") {
                if (this.queuedResponse) {
                    this.resolve("perfect", this.queuedResponse);
                }
            } else if (Input.isTriggered("ok")) {
                const timing = this.currentTiming();
                if (timing === "perfect") {
                    this.beginResponseSelection();
                } else {
                    this.resolve(timing);
                }
            } else if (this.active.elapsed >= windowFrames) {
                this.resolve("late");
            }
        },

        currentTiming() {
            if (!this.active || this.active.phase !== "timing") {
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

        beginResponseSelection() {
            if (!this.active || this.active.phase !== "timing") {
                return;
            }

            if (parrySound) {
                AudioManager.playSe({
                    name: parrySound,
                    volume: soundVolume,
                    pitch: 100,
                    pan: 0
                });
            }
            $gameScreen.startFlash([255, 255, 255, 180], 6);
            this.active.phase = "response";
            this.active.elapsed = 0;
            this.queuedResponse = "";
            this.createPerfectImpact(this.active.subject);
            this.redrawResponsePrompt();
        },

        queueResponse(key) {
            if (
                this.active &&
                this.active.phase === "response" &&
                ["W", "E", "R"].includes(key)
            ) {
                this.queuedResponse = key;
                return true;
            }
            return false;
        },

        resolve(timing, response = "") {
            if (!this.active) {
                return;
            }

            this.result = {
                action: this.active.action,
                target: this.active.target,
                timing,
                response
            };
            if (timing === "early") {
                $gameScreen.startFlash([255, 190, 40, 80], 8);
            } else if (timing === "late") {
                SoundManager.playBuzzer();
                $gameScreen.startFlash([255, 30, 30, 80], 8);
            }
            this.active = null;
            this.queuedResponse = "";
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
            this.focusCamera = { x: focusX, y: focusY };
            $gameScreen.startZoom(focusX, focusY, focusZoom, zoomInFrames);
            $gameScreen.startTint([-24, -24, -12, 0], zoomInFrames);
        },

        updateResponseCamera() {
            if (
                !$gameScreen ||
                !this.active ||
                this.active.phase !== "response" ||
                !this.focusCamera
            ) {
                return;
            }

            const time = this.active.elapsed;
            const driftX = Math.sin(time * 0.025) * 4;
            const driftY = Math.cos(time * 0.021) * 3;
            const breathingZoom = Math.sin(time * 0.032) * 0.008;
            $gameScreen.setZoom(
                this.focusCamera.x + driftX,
                this.focusCamera.y + driftY,
                focusZoom + breathingZoom
            );
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
            this.focusCamera = null;
        },

        createPerfectImpact(subject) {
            this.destroyImpactEffect();
            const scene = SceneManager._scene;
            if (!scene || !subject) {
                return;
            }

            const offset = this.pointOffset(subject);
            const container = new Sprite();
            container.x = subject.screenX() + offset.x;
            container.y = subject.screenY() + offset.y;
            scene.addChild(container);

            const glowBitmap = new Bitmap(112, 112);
            glowBitmap.drawCircle(56, 56, 48, "rgba(255, 220, 105, 0.22)");
            glowBitmap.drawCircle(56, 56, 28, "rgba(255, 248, 210, 0.65)");
            glowBitmap.drawCircle(56, 56, 12, "#ffffff");
            const glow = new Sprite(glowBitmap);
            glow.anchor.set(0.5, 0.5);
            glow.scale.set(0.55, 0.55);
            glow._wamaiImpactGlow = true;
            container.addChild(glow);

            const particles = [];
            const sparkCount = 16;
            for (let index = 0; index < sparkCount; index++) {
                const angle =
                    (Math.PI * 2 * index) / sparkCount +
                    (Math.random() - 0.5) * 0.22;
                const length = 18 + Math.random() * 26;
                const sparkBitmap = new Bitmap(Math.ceil(length), 5);
                sparkBitmap.gradientFillRect(
                    0,
                    0,
                    Math.ceil(length),
                    5,
                    "#ffffff",
                    "#f4b83f"
                );
                const spark = new Sprite(sparkBitmap);
                const speed = 3.5 + Math.random() * 4.5;
                spark.anchor.set(0.12, 0.5);
                spark.rotation = angle;
                spark._wamaiVx = Math.cos(angle) * speed;
                spark._wamaiVy = Math.sin(angle) * speed;
                spark._wamaiSpin = (Math.random() - 0.5) * 0.035;
                container.addChild(spark);
                particles.push(spark);
            }

            this.impactContainer = container;
            this.impactParticles = particles;
            this.impactElapsed = 0;
        },

        updateImpactEffect() {
            if (!this.impactContainer) {
                return;
            }

            this.impactElapsed++;
            const duration = 16;
            const life = Math.max(0, 1 - this.impactElapsed / duration);
            const glow = this.impactContainer.children.find(
                child => child._wamaiImpactGlow
            );
            if (glow) {
                const scale = 0.55 + this.impactElapsed * 0.075;
                glow.scale.set(scale, scale);
                glow.opacity = Math.round(255 * life);
            }
            for (const spark of this.impactParticles) {
                spark.x += spark._wamaiVx;
                spark.y += spark._wamaiVy;
                spark._wamaiVx *= 0.92;
                spark._wamaiVy *= 0.92;
                spark.rotation += spark._wamaiSpin;
                spark.opacity = Math.round(255 * life);
                spark.scale.x = 0.65 + life * 0.55;
            }
            if (this.impactElapsed >= duration) {
                this.destroyImpactEffect();
            }
        },

        destroyImpactEffect() {
            if (this.impactContainer && this.impactContainer.parent) {
                this.impactContainer.parent.removeChild(this.impactContainer);
            }
            if (this.impactContainer) {
                this.impactContainer.destroy({ children: true });
            }
            this.impactContainer = null;
            this.impactParticles = [];
            this.impactElapsed = 0;
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
                const width = promptWidth;
                const height = promptHeight;
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
                bitmap.drawText(promptText, 0, 10, width, 54, "center");

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

            const width = promptWidth;
            const height = promptHeight;
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
            bitmap.drawText(style.text, 0, 10, width, 54, "center");
            if (this.barSprite) {
                this.barSprite.tint = Number(`0x${style.color.slice(1)}`);
            }
            this.displayedTiming = timing;
        },

        redrawResponsePrompt() {
            if (!this.promptSprite) {
                return;
            }

            const bitmap = this.promptSprite.bitmap;
            bitmap.clear();
            bitmap.fillRect(
                0,
                0,
                promptWidth,
                promptHeight,
                "rgba(0, 0, 0, 0.86)"
            );
            bitmap.fillRect(0, 0, promptWidth, 3, "#f7d154");
            bitmap.fillRect(
                0,
                promptHeight - 3,
                promptWidth,
                3,
                "#f7d154"
            );
            bitmap.fontFace = $gameSystem.mainFontFace();
            bitmap.fontBold = true;
            bitmap.outlineColor = "rgba(0, 0, 0, 1)";
            bitmap.outlineWidth = 4;
            bitmap.textColor = "#f7d154";
            bitmap.fontSize = 24;
            bitmap.drawText(
                "PARRY PERFECTO — ELIGE RESPUESTA",
                0,
                3,
                promptWidth,
                36,
                "center"
            );
            bitmap.textColor = "#ffffff";
            bitmap.fontSize = 21;
            bitmap.drawText(
                "W: REPRESALIA   E: DESVÍO   R: CONCENTRACIÓN",
                0,
                38,
                promptWidth,
                36,
                "center"
            );
            if (this.barSprite) {
                this.barSprite.tint = 0xf7d154;
                this.barSprite.scale.x = 1;
            }
            this.displayedTiming = "response";
        },

        updateVisuals() {
            const choosingResponse = this.active.phase === "response";
            const progress = this.active.elapsed / windowFrames;
            const pulse = (Math.sin(this.active.elapsed * 0.35) + 1) / 2;
            this.updateImpactEffect();
            if (choosingResponse) {
                this.updateResponseCamera();
            }
            if (!choosingResponse) {
                const timing = this.currentTiming();
                if (timing !== this.displayedTiming) {
                    this.redrawPrompt(timing);
                }
            } else if (this.displayedTiming !== "response") {
                this.redrawResponsePrompt();
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
                this.barSprite.scale.x = choosingResponse
                    ? 1
                    : Math.max(0, 1 - progress);
                this.barSprite.opacity = choosingResponse
                    ? 185 + Math.round(pulse * 70)
                    : 255;
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
            this.destroyImpactEffect();
        },

        clear() {
            this.active = null;
            this.result = null;
            this.damageModifier = null;
            this.queuedResponse = "";
            this.destroyVisuals();
            this.endCinematicFocus();
        }
    };

    document.addEventListener(
        "keydown",
        event => {
            if (event.repeat) {
                return;
            }
            const key = String(event.key || "").toUpperCase();
            if (Parry.queueResponse(key)) {
                event.preventDefault();
                event.stopImmediatePropagation();
            }
        },
        true
    );

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
            if (parryResult.response === "E") {
                const redirectTarget =
                    $gameTroop
                        .aliveMembers()
                        .find(enemy => enemy !== this._subject) || this._subject;
                this._logWindow.push(
                    "addText",
                    `${target.name()} desvía el ataque hacia ${redirectTarget.name()}.`
                );
                this._logWindow.push(
                    "showAnimation",
                    this._subject,
                    [redirectTarget],
                    this._action.item().animationId
                );
                this._action.apply(redirectTarget);
                this._logWindow.displayActionResults(
                    this._subject,
                    redirectTarget
                );
                this._subject.setLastTarget(redirectTarget);
            } else if (parryResult.response === "R") {
                target.gainTp(concentrationTp);
                this._logWindow.push(
                    "addText",
                    `${target.name()} se concentra y obtiene ${concentrationTp} PT.`
                );
                this._subject.setLastTarget(target);
            } else {
                this._logWindow.push(
                    "addText",
                    `${target.name()} responde con una represalia.`
                );
                if (counterAttack) {
                    this.invokeCounterAttack(this._subject, target);
                }
                this._subject.setLastTarget(target);
            }
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
