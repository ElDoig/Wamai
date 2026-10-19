// Comprueba el artefacto completo por HTTP sin arrancar ni modificar el juego.
import * as fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { repositoryRoot, siteRoot } from './build.mjs';
import { createPreviewServer } from './serve.mjs';

function filesIn(directory, prefix = '') {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
        entry.isDirectory()
            ? filesIn(path.join(directory, entry.name), `${prefix}${entry.name}/`)
            : [prefix + entry.name]
    );
}

const files = filesIn(siteRoot);
const generated = new Set(['.nojekyll', 'demo-build.json']);
for (const file of files.filter(file => !generated.has(file))) {
    const source = fs.readFileSync(path.join(repositoryRoot, 'Project', file));
    const published = fs.readFileSync(path.join(siteRoot, file));
    assert.equal(source.equals(published), true, `El build cambió el contenido: ${file}`);
}
const server = createPreviewServer();
try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}/Wamai/`;
    const queue = files.filter(file => file !== '.nojekyll');
    let checked = 0;
    await Promise.all(Array.from({ length: 12 }, async () => {
        while (queue.length) {
            const file = queue.pop();
            const url = new URL(file.split('/').map(encodeURIComponent).join('/'), base);
            const response = await fetch(url, { method: 'HEAD' });
            assert.equal(response.status, 200, `HTTP ${response.status}: ${url.pathname}`);
            checked++;
        }
    }));
    assert.equal((await fetch(base)).status, 200, 'La raíz /Wamai/ debe abrir index.html.');
    for (const file of ['package.json', 'game.rmmzproject', 'save/config.rmmzsave', 'img/tilesets/sch.zip', 'js/plugins/Input Combo Skills.js']) {
        assert.equal((await fetch(new URL(file, base))).status, 404, `Se publicó un archivo excluido: ${file}`);
    }
    const version = await (await fetch(new URL('demo-build.json', base))).json();
    assert.match(version.commit, /^[a-f0-9]{40}$/);
    console.log(`OK: ${checked} archivos sirven HTTP 200 bajo /Wamai/.`);
    console.log('OK: archivos del juego idénticos byte por byte; guardados y material excluido inaccesibles.');
    console.log(`Commit del artefacto: ${version.commit}`);
} finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
}
