/*:
 * @target MZ
 * @plugindesc v1.1 Muestra etiquetas animadas sobre eventos de prueba.
 * @author Equipo Wamai
 *
 * @param SoloPlaytest
 * @text Solo durante playtest
 * @type boolean
 * @on Sí
 * @off No
 * @default true
 *
 * @param TamanoFuente
 * @text Tamaño de fuente
 * @type number
 * @min 10
 * @max 48
 * @default 18
 *
 * @param DesplazamientoY
 * @text Desplazamiento vertical
 * @type number
 * @min -200
 * @max 200
 * @default -52
 *
 * @param AmplitudFlotacion
 * @text Amplitud de flotación
 * @desc Cantidad de píxeles que la etiqueta sube y baja.
 * @type number
 * @min 0
 * @max 20
 * @default 3
 *
 * @param DuracionFlotacion
 * @text Duración de flotación
 * @desc Duración de un ciclo completo, medida en fotogramas.
 * @type number
 * @min 30
 * @max 300
 * @default 90
 *
 * @param ColorTexto
 * @text Color del texto
 * @type string
 * @default #ffffff
 *
 * @param ColorFondo
 * @text Color del fondo
 * @type string
 * @default rgba(0, 0, 0, 0.75)
 *
 * @help
 * Añade una etiqueta flotante a cualquier evento que tenga esta etiqueta
 * en el campo Notas:
 *
 *   <Etiqueta: DIÁLOGO>
 *
 * La etiqueta sigue al evento y flota suavemente. No cambia la prioridad ni
 * el desencadenante del evento.
 * Por defecto solo aparece al ejecutar el juego desde el editor (playtest),
 * para que las ayudas del mapa de pruebas no salgan en la versión publicada.
 */

(() => {
    "use strict";

    const pluginName = "WAMAI_SandboxLabels";
    const parameters = PluginManager.parameters(pluginName);
    const onlyPlaytest = parameters.SoloPlaytest !== "false";
    const fontSize = Math.max(10, Number(parameters.TamanoFuente || 18));
    const offsetY = Number(parameters.DesplazamientoY || -52);
    const floatAmplitude = Math.max(
        0,
        Number(parameters.AmplitudFlotacion || 3)
    );
    const floatDuration = Math.max(
        30,
        Number(parameters.DuracionFlotacion || 90)
    );
    const textColor = String(parameters.ColorTexto || "#ffffff");
    const backgroundColor = String(
        parameters.ColorFondo || "rgba(0, 0, 0, 0.75)"
    );
    const labelPattern = /<Etiqueta\s*:\s*([^>]+)>/i;

    function labelsAreEnabled() {
        return !onlyPlaytest || Utils.isOptionValid("test");
    }

    function eventLabel(character) {
        if (!(character instanceof Game_Event)) {
            return "";
        }

        const data = character.event();
        const match = data && String(data.note || "").match(labelPattern);
        return match ? match[1].trim() : "";
    }

    const _Sprite_Character_initialize = Sprite_Character.prototype.initialize;
    Sprite_Character.prototype.initialize = function(character) {
        _Sprite_Character_initialize.call(this, character);
        this.createWamaiSandboxLabel();
    };

    Sprite_Character.prototype.createWamaiSandboxLabel = function() {
        if (!labelsAreEnabled()) {
            return;
        }

        const label = eventLabel(this._character);
        if (!label) {
            return;
        }

        const padding = 10;
        const maxWidth = 280;
        const height = fontSize + 14;
        const bitmap = new Bitmap(maxWidth, height);
        bitmap.fontFace = $gameSystem.mainFontFace();
        bitmap.fontSize = fontSize;
        bitmap.fontBold = true;
        bitmap.textColor = textColor;
        bitmap.outlineColor = "rgba(0, 0, 0, 0.95)";
        bitmap.outlineWidth = 3;

        const boxWidth = Math.min(
            maxWidth,
            Math.ceil(bitmap.measureTextWidth(label)) + padding * 2
        );
        const boxX = Math.floor((maxWidth - boxWidth) / 2);
        bitmap.fillRect(boxX, 0, boxWidth, height, backgroundColor);
        bitmap.drawText(label, 0, 0, maxWidth, height, "center");

        const sprite = new Sprite(bitmap);
        sprite.anchor.set(0.5, 1);
        sprite.y = offsetY;
        this.addChild(sprite);
        this._wamaiSandboxLabel = sprite;
        this._wamaiSandboxLabelPhase = this._character.eventId() * 17;
    };

    const _Sprite_Character_update = Sprite_Character.prototype.update;
    Sprite_Character.prototype.update = function() {
        _Sprite_Character_update.call(this);
        this.updateWamaiSandboxLabel();
    };

    Sprite_Character.prototype.updateWamaiSandboxLabel = function() {
        const sprite = this._wamaiSandboxLabel;
        if (!sprite) {
            return;
        }

        const angle =
            ((Graphics.frameCount + this._wamaiSandboxLabelPhase) /
                floatDuration) *
            Math.PI *
            2;
        const wave = Math.sin(angle);
        sprite.y = offsetY + wave * floatAmplitude;
        sprite.opacity = 248 + Math.round(wave * 7);
    };
})();
