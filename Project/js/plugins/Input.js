/*:
 * @target MZ
 * @plugindesc Combo WER ejecuta skill 230 durante el turno del actor (sin forceAction)
 */

(() => {
  Input.keyMapper[87] = 'w';
  Input.keyMapper[69] = 'e';
  Input.keyMapper[82] = 'r';

  let combo = '';

  function ensureInputtingAction(actor) {
    // Si el actor no tiene acciones, crear una
    if (!actor._actions || actor._actions.length === 0) {
      actor.makeActions();
    }
    // Si aún así no hay action “inputting”, crearla manualmente
    if (!actor.inputtingAction()) {
      actor._actions.push(new Game_Action(actor));
    }
  }

  function updateComboInput() {
    const actor = BattleManager.actor();
    if (!actor) return;

    if (Input.isTriggered('w')) combo += 'W';
    if (Input.isTriggered('e')) combo += 'E';
    if (Input.isTriggered('r')) combo += 'R';

    if (combo === 'WER') {
      console.log('[DEBUG] Combo WER detectado durante turno de', actor.name());

      // Asegurar slot de acción
      ensureInputtingAction(actor);

      // Colocar skill 230 en la acción actual
      const action = actor.inputtingAction();
      action.setSkill(230);

      // Seleccionar primer enemigo
      const enemy = $gameTroop.members()[0];
      if (enemy) {
        action.setTarget(enemy.index());
        actor.setLastTarget(enemy);
      }

      // Cerrar ventana comandos
      if (SceneManager._scene._actorCommandWindow) {
        SceneManager._scene._actorCommandWindow.close();
        SceneManager._scene._actorCommandWindow.deactivate();
      }

      // Pasar al siguiente comando para ejecutar la acción
      BattleManager.selectNextCommand();

      combo = '';
    }

    if (combo.length > 3) combo = '';
  }

  const _Scene_Battle_update = Scene_Battle.prototype.update;
  Scene_Battle.prototype.update = function () {
    _Scene_Battle_update.call(this);
    updateComboInput();
  };
})();
