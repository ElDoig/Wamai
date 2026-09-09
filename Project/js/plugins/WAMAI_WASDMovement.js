/*:
 * @target MZ
 * @plugindesc v1.0 Permite mover al jugador con WASD sin interferir con los combos de batalla.
 * @author Equipo Wamai
 *
 * @help
 * Añade movimiento de cuatro direcciones con W, A, S y D en el mapa.
 * Las flechas continúan funcionando. Las teclas no se registran como
 * direcciones globales de RPG Maker, así que W/E/R puede seguir utilizándose
 * como combo durante el combate.
 */

(() => {
    "use strict";

    const codeToDirection = {
        KeyW: 8,
        KeyA: 4,
        KeyS: 2,
        KeyD: 6
    };
    const pressedCodes = [];

    function normalizedCode(event) {
        if (event.code && codeToDirection[event.code]) {
            return event.code;
        }
        const key = String(event.key || "").toLowerCase();
        return {
            w: "KeyW",
            a: "KeyA",
            s: "KeyS",
            d: "KeyD"
        }[key];
    }

    function press(code) {
        const index = pressedCodes.indexOf(code);
        if (index >= 0) {
            pressedCodes.splice(index, 1);
        }
        pressedCodes.push(code);
    }

    function release(code) {
        const index = pressedCodes.indexOf(code);
        if (index >= 0) {
            pressedCodes.splice(index, 1);
        }
    }

    document.addEventListener("keydown", event => {
        const code = normalizedCode(event);
        if (code && !event.repeat) {
            press(code);
        }
    });

    document.addEventListener("keyup", event => {
        const code = normalizedCode(event);
        if (code) {
            release(code);
        }
    });

    window.addEventListener("blur", () => {
        pressedCodes.length = 0;
    });

    const _Game_Player_getInputDirection =
        Game_Player.prototype.getInputDirection;
    Game_Player.prototype.getInputDirection = function() {
        const normalDirection = _Game_Player_getInputDirection.call(this);
        if (normalDirection > 0) {
            return normalDirection;
        }

        const code = pressedCodes[pressedCodes.length - 1];
        return codeToDirection[code] || 0;
    };
})();
