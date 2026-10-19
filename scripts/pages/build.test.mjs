import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';
import { isRuntimeFile, isLfsPointer, caseConflicts, readPlugins, buildRoot } from './build.mjs';
import { createPreviewServer } from './serve.mjs';

const enabled = new Set(['WAMAI_ActiveParry', 'WAMAI_DualForm']);

test('conserva datos, mapas, recursos y dependencias de animaciones', () => {
    for (const file of [
        'index.html', 'js/main.js', 'js/plugins.js', 'js/libs/effekseer.wasm',
        'js/plugins/WAMAI_ActiveParry.js', 'data/System.json', 'data/Map018.json',
        'img/characters/$Miwa_Walk.png', 'audio/se/Parry.ogg',
        'effects/Texture/Particle01.png', 'effects/Model/Sword.efkmodel',
        'effects/HitPhysical.efkefc', 'fonts/mplus-1m-regular.woff',
        'movies/Intro.webm', 'img/tilesets/sch/Terms.txt'
    ]) assert.equal(isRuntimeFile(file, enabled), true, file);
});

test('no publica saves, configuración local, código inactivo ni materiales de edición', () => {
    for (const file of [
        'save/file1.rmmzsave', 'package.json', 'game.rmmzproject', '.env',
        'data/.env.json', 'data/credentials.json', 'js/.aws/config',
        'js/plugins/Input Combo Skills.js', 'data/Test_System.json', 'data/Event.json',
        'img/tilesets/sch.zip', 'img/tilesets/Inside_A1.txt', 'img/source.psd',
        'js/node_modules/library/index.js', 'js/main.js.map'
    ]) assert.equal(isRuntimeFile(file, enabled), false, file);
});

test('detecta conflictos de mayúsculas en archivos y directorios', () => {
    assert.deepEqual(caseConflicts(['img/Faces/A.png', 'img/faces/B.png']), ['img/Faces / img/faces']);
    assert.equal(caseConflicts(['img/A.png', 'img/a.png']).length, 1);
    assert.deepEqual(caseConflicts(['img/faces/A.png', 'img/faces/B.png']), []);
});

test('rechaza punteros LFS sin materializar y lee la configuración sin cargar plugins', () => {
    assert.equal(isLfsPointer(Buffer.from('version https://git-lfs.github.com/spec/v1\noid sha256:test\nsize 100\n')), true);
    assert.equal(isLfsPointer(Buffer.from([0x89, 0x50, 0x4e, 0x47])), false);
    assert.deepEqual(readPlugins('var $plugins = [{name:"A",status:true,parameters:{}}];'), [
        { name: 'A', status: true, parameters: {} }
    ]);
});

test('sirve rutas relativas en /Wamai/, espacios, símbolos y WASM; no expone el repositorio', async () => {
    fs.mkdirSync(buildRoot, { recursive: true });
    const fixture = fs.mkdtempSync(path.join(buildRoot, 'http-test-'));
    fs.mkdirSync(path.join(fixture, 'img'));
    fs.writeFileSync(path.join(fixture, 'index.html'), '<img src="img/$Miwa Walk.png">');
    fs.writeFileSync(path.join(fixture, 'img', '$Miwa Walk.png'), 'sprite');
    fs.writeFileSync(path.join(fixture, 'effect.wasm'), 'wasm');
    const server = createPreviewServer(fixture);
    try {
        server.listen(0, '127.0.0.1');
        await once(server, 'listening');
        const base = `http://127.0.0.1:${server.address().port}`;
        const index = await fetch(`${base}/Wamai/`);
        assert.equal(index.status, 200);
        const html = await index.text();
        const imageUrl = new URL(html.match(/src="([^"]+)"/)[1], `${base}/Wamai/`);
        assert.equal(await (await fetch(imageUrl)).text(), 'sprite');
        assert.equal((await fetch(`${base}/Wamai/effect.wasm`)).headers.get('content-type'), 'application/wasm');
        assert.equal((await fetch(`${base}/Wamai/img/$miwa%20Walk.png`)).status, 404);
        assert.equal((await fetch(`${base}/Wamai/.git/config`)).status, 403);
        assert.equal((await fetch(`${base}/Project/data/System.json`)).status, 404);
    } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
        // fixture fue creada con mkdtemp dentro de la salida ignorada del build.
        fs.rmSync(fixture, { recursive: true, force: true });
    }
});
