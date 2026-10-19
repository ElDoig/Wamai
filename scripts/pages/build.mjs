// Prepara una copia web sin modificar los archivos de RPG Maker ni usar npm.
import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { Script, runInNewContext } from 'node:vm';

export const repositoryRoot = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const sourceRoot = path.join(repositoryRoot, 'Project');
export const buildRoot = path.join(repositoryRoot, '.pages-build');
export const siteRoot = path.join(buildRoot, 'site');
const imageExtensions = ['.png', '.png_', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico'];
const audioExtensions = ['.ogg', '.ogg_', '.m4a', '.m4a_', '.mp3', '.wav'];
const allowedExtensions = {
    audio: audioExtensions,
    css: ['.css'],
    data: ['.json'],
    effects: [...imageExtensions, '.efkefc', '.efkmodel', '.efkmat', '.efkcurve'],
    fonts: ['.woff', '.woff2', '.ttf', '.otf'],
    icon: imageExtensions,
    img: imageExtensions,
    js: ['.js', '.wasm'],
    movies: ['.webm', '.mp4', '.ogv']
};

function git(...args) {
    return execFileSync('git', args, {
        cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024
    }).trimEnd();
}

export function readPlugins(source) {
    // plugins.js solo declara datos; el código de plugins nunca se ejecuta aquí.
    const context = { $plugins: undefined };
    runInNewContext(source, context, { timeout: 1000 });
    if (!Array.isArray(context.$plugins)) throw new Error('plugins.js no declara $plugins.');
    return JSON.parse(JSON.stringify(context.$plugins));
}

export function isRuntimeFile(relativePath, enabledPlugins) {
    const segments = relativePath.split('/');
    if (segments.some(segment =>
        !segment || segment === '..' || segment.startsWith('.') ||
        /^(?:node_modules|save|backup|backups|temp|tmp)$/i.test(segment)
    )) return false;
    if (/(?:^|\/)(?:credentials|secrets?|tokens?)(?:[._-]|$)/i.test(relativePath)) return false;
    if (relativePath === 'index.html') return true;
    const category = segments[0];
    // Conserva las condiciones de uso de los recursos que se distribuyen.
    if (/^(?:img|audio|effects|fonts|js)\//.test(relativePath) &&
        /^(?:licen[cs]e|copying|copyright|terms)(?:[._-].*)?$/i.test(path.posix.basename(relativePath))) {
        return true;
    }
    if (category === 'data' && /^(?:Test_.*|Event)\.json$/i.test(segments.at(-1))) return false;
    if (!allowedExtensions[category]?.includes(path.posix.extname(relativePath).toLowerCase())) return false;
    if (relativePath.startsWith('js/plugins/') && relativePath.endsWith('.js')) {
        return enabledPlugins.has(relativePath.slice('js/plugins/'.length, -3));
    }
    return true;
}

export function isLfsPointer(buffer) {
    return buffer.subarray(0, 150).toString('utf8').startsWith('version https://git-lfs.github.com/spec/v1');
}

export function caseConflicts(files) {
    const seen = new Map();
    const conflicts = [];
    for (const file of files) {
        // Incluye los directorios: Windows no representa bien Carpetas/carpeta.
        const segments = file.split('/');
        for (let count = 1; count <= segments.length; count++) {
            const entry = segments.slice(0, count).join('/');
            const key = entry.normalize('NFC').toLowerCase();
            if (seen.has(key) && seen.get(key) !== entry) {
                conflicts.push(`${seen.get(key)} / ${entry}`);
            } else seen.set(key, entry);
        }
    }
    return [...new Set(conflicts)];
}

function walkFiles(directory, prefix = '') {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const relativePath = prefix + entry.name;
        const absolutePath = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) throw new Error(`No se permiten enlaces: ${relativePath}`);
        return entry.isDirectory()
            ? walkFiles(absolutePath, `${relativePath}/`)
            : [relativePath];
    });
}

function prepareBuildRoot() {
    if (fs.existsSync(buildRoot) && fs.lstatSync(buildRoot).isSymbolicLink()) {
        throw new Error('.pages-build no puede ser un enlace.');
    }
    fs.mkdirSync(buildRoot, { recursive: true });
    if (fs.existsSync(siteRoot) && fs.lstatSync(siteRoot).isSymbolicLink()) {
        throw new Error('.pages-build/site no puede ser un enlace.');
    }
    // El único directorio que se limpia es esta salida fija, dentro del repositorio.
    fs.rmSync(siteRoot, { recursive: true, force: true });
    fs.mkdirSync(siteRoot);
}

function fileParameters(source) {
    const entries = [];
    let entry;
    for (const line of source.split(/\r?\n/)) {
        const match = line.match(/^\s*\*\s*@(param|arg|type|dir|default)\s*(.*)$/);
        if (!match) continue;
        if (match[1] === 'param' || match[1] === 'arg') {
            entry = { kind: match[1], name: match[2].trim() };
            entries.push(entry);
        } else if (entry) entry[match[1]] = match[2].trim();
    }
    return entries.filter(item => item.type === 'file' && item.dir);
}

function validateReferences(files, plugins, errors, warnings) {
    const fileSet = new Set(files);
    const lowerPaths = new Map(files.map(file => [file.toLowerCase(), file]));
    const checked = new Set();
    const pendingAssets = [];
    const references = [];
    const database = new Map();
    const requireFile = (file, context, critical = true) => {
        if (fileSet.has(file)) return true;
        const caseMatch = lowerPaths.get(file.toLowerCase());
        const message = caseMatch
            ? `Mayúsculas/minúsculas: ${context} pide "${file}", existe "${caseMatch}".`
            : `Falta "${file}" (${context}).`;
        (caseMatch || critical ? errors : warnings).push(message);
        return false;
    };
    const reference = (directory, name, extension, context, critical = false) => {
        if (typeof name !== 'string' || !name) return;
        pendingAssets.push({ directory, name, extension, context, critical });
    };

    const html = fs.readFileSync(path.join(sourceRoot, 'index.html'), 'utf8');
    for (const match of html.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)) {
        const url = match[1];
        if (/^(?:[a-z]+:|\/|#)/i.test(url)) {
            errors.push(`index.html debe usar rutas relativas: ${url}`);
        } else {
            const localPath = decodeURIComponent(url.split(/[?#]/)[0]);
            requireFile(localPath, 'index.html');
            references.push(localPath);
        }
    }
    for (const file of files.filter(file => file.endsWith('.json'))) {
        try {
            database.set(file, JSON.parse(fs.readFileSync(path.join(sourceRoot, file), 'utf8').replace(/^\uFEFF/, '')));
        } catch (error) { errors.push(`JSON inválido ${file}: ${error.message}`); }
    }
    const system = database.get('data/System.json');
    if (!system) return { references, database };

    const managers = fs.readFileSync(path.join(sourceRoot, 'js/rmmz_managers.js'), 'utf8');
    const dbBlock = managers.match(/DataManager\._databaseFiles\s*=\s*\[([\s\S]*?)\];/)?.[1];
    if (!dbBlock) errors.push('No se pudo reconocer la lista de bases de datos del motor.');
    for (const match of (dbBlock || '').matchAll(/src:\s*["']([^"']+)["']/g)) {
        requireFile(`data/${match[1]}`, 'base de datos del motor');
        references.push(`data/${match[1]}`);
    }
    const main = fs.readFileSync(path.join(sourceRoot, 'js/main.js'), 'utf8');
    for (const match of main.matchAll(/["'](js\/[^"']+\.(?:js|wasm))["']/g)) {
        requireFile(match[1], 'main.js');
        references.push(match[1]);
    }
    for (const key of ['mainFontFilename', 'numberFontFilename']) {
        const name = system.advanced?.[key];
        if (name) {
            requireFile(`fonts/${name}`, `System.advanced.${key}`);
            references.push(`fonts/${name}`);
        }
    }
    const startMap = `data/Map${String(system.startMapId).padStart(3, '0')}.json`;
    requireFile(startMap, 'mapa inicial');
    references.push(startMap);
    for (const map of database.get('data/MapInfos.json') || []) {
        if (map) requireFile(`data/Map${String(map.id).padStart(3, '0')}.json`, `MapInfos: ${map.name}`);
    }
    for (const name of ['Window', 'IconSet', 'Balloon', 'Shadow1', 'Shadow2', 'GameOver', 'States', 'Weapons1', 'Weapons2', 'Weapons3', 'ButtonSet']) {
        reference('img/system', name, '.png', 'recursos del motor', true);
    }

    const pluginMetadata = new Map();
    for (const plugin of plugins.filter(item => item.status)) {
        const filename = `js/plugins/${plugin.name}.js`;
        if (!requireFile(filename, 'plugin activo')) continue;
        references.push(filename);
        const source = fs.readFileSync(path.join(sourceRoot, filename), 'utf8');
        new Script(source, { filename });
        if (/\brequire\s*\(/.test(source) && !/Utils\.isNwjs\s*\(/.test(source)) {
            warnings.push(`${filename} usa require(); revisar compatibilidad con navegador.`);
        }
        const metadata = fileParameters(source);
        pluginMetadata.set(plugin.name, metadata);
        for (const item of metadata.filter(item => item.kind === 'param')) {
            const value = plugin.parameters?.[item.name] ?? item.default;
            const extension = item.dir.startsWith('audio/') ? '.ogg' : '.png';
            reference(item.dir, value, extension, `${plugin.name}.${item.name}`, true);
        }
    }

    const imageFields = {
        characterName: 'characters', faceName: 'faces', parallaxName: 'parallaxes',
        battleback1Name: 'battlebacks1', battleback2Name: 'battlebacks2',
        title1Name: 'titles1', title2Name: 'titles2',
        animation1Name: 'animations', animation2Name: 'animations'
    };
    function walk(value, context, dbFile) {
        if (!value || typeof value !== 'object') return;
        if (Array.isArray(value)) {
            value.forEach((item, index) => walk(item, `${context}[${index}]`, dbFile));
            return;
        }
        for (const [key, item] of Object.entries(value)) {
            if (imageFields[key]) reference(`img/${imageFields[key]}`, item, '.png', context);
            if (key === 'tilesetNames' && Array.isArray(item)) {
                item.forEach(name => reference('img/tilesets', name, '.png', context));
            }
            if (key === 'battlerName') {
                if (dbFile === 'data/Actors.json') reference('img/sv_actors', item, '.png', context);
                if (dbFile === 'data/Enemies.json') reference(`img/${system.optSideView ? 'sv_enemies' : 'enemies'}`, item, '.png', context);
            }
            if (key === 'effectName') reference('effects', item, '.efkefc', context);
            const audioKind = /bgm$/i.test(key) ? 'bgm'
                : /bgs$/i.test(key) ? 'bgs' : /me$/i.test(key) ? 'me'
                    : key === 'se' ? 'se' : null;
            if (audioKind && item?.name) reference(`audio/${audioKind}`, item.name, '.ogg', context);
            if (key === 'sounds' && Array.isArray(item)) {
                item.forEach(sound => reference('audio/se', sound?.name, '.ogg', context));
            }
            walk(item, `${context}.${key}`, dbFile);
        }
        const p = value.parameters;
        if (!Array.isArray(p)) return;
        if (value.code === 101) reference('img/faces', p[0], '.png', context);
        if (value.code === 231) reference('img/pictures', p[1], '.png', context);
        if (value.code === 41) reference('img/characters', p[0], '.png', context);
        if (value.code === 322) {
            reference('img/characters', p[1], '.png', context);
            reference('img/faces', p[3], '.png', context);
            reference('img/sv_actors', p[5], '.png', context);
        }
        if (value.code === 323) reference('img/characters', p[1], '.png', context);
        if (value.code === 283) {
            reference('img/battlebacks1', p[0], '.png', context);
            reference('img/battlebacks2', p[1], '.png', context);
        }
        if (value.code === 284) reference('img/parallaxes', p[0], '.png', context);
        if (value.code === 261) reference('movies', p[0], '.webm', context);
        const audioCommands = { 132: 'bgm', 133: 'me', 139: 'me', 241: 'bgm', 245: 'bgs', 249: 'me', 250: 'se' };
        if (audioCommands[value.code]) reference(`audio/${audioCommands[value.code]}`, p[0]?.name, '.ogg', context);
        if (value.code === 357) {
            for (const item of pluginMetadata.get(p[0]) || []) {
                if (item.kind === 'arg') reference(item.dir, p[3]?.[item.name], item.dir.startsWith('audio/') ? '.ogg' : '.png', context);
            }
        }
    }
    for (const [filename, data] of database) walk(data, filename, filename);
    for (const asset of pendingAssets) {
        const directory = asset.directory.replace(/\/$/, '');
        const file = `${directory}/${asset.name}${asset.extension}`;
        const key = `${file}:${asset.critical}`;
        if (checked.has(key)) continue;
        checked.add(key);
        const encrypted = (asset.extension === '.png' && system.hasEncryptedImages) ||
            (asset.extension === '.ogg' && system.hasEncryptedAudio);
        const resolved = encrypted ? `${file}_` : file;
        requireFile(resolved, asset.context, asset.critical);
        if (fileSet.has(resolved)) references.push(resolved);
    }
    return { references: [...new Set(references)], database };
}

export function build() {
    prepareBuildRoot();
    const errors = [];
    const warnings = [];
    const plugins = readPlugins(fs.readFileSync(path.join(sourceRoot, 'js/plugins.js'), 'utf8'));
    const enabledPlugins = new Set(plugins.filter(item => item.status).map(item => item.name));
    const tracked = git('ls-files', '-z', '--', 'Project').split('\0').filter(Boolean);
    const selected = tracked.map(file => file.slice('Project/'.length))
        .filter(file => isRuntimeFile(file, enabledPlugins)).sort();
    const selectedSet = new Set(selected);
    const localFiles = walkFiles(sourceRoot);
    for (const file of localFiles) {
        if (isRuntimeFile(file, enabledPlugins) && !selectedSet.has(file)) {
            warnings.push(`No está en Git y no se publicará: Project/${file} (puede estar ignorado o sin añadir).`);
        }
    }
    for (const file of ['index.html', 'js/main.js', 'js/plugins.js', 'js/rmmz_managers.js', 'data/System.json']) {
        if (!selectedSet.has(file)) throw new Error(`Archivo esencial no versionado: Project/${file}`);
    }
    for (const conflict of caseConflicts(selected)) errors.push(`Colisión de nombres: ${conflict}`);

    let totalBytes = 0;
    let largestFile = { path: '', bytes: 0 };
    let lfsFiles = 0;
    const lfs = git('ls-files', '--', '.gitattributes');
    if (lfs && /filter=lfs/.test(fs.readFileSync(path.join(repositoryRoot, '.gitattributes'), 'utf8'))) {
        warnings.push('Git LFS activo: checkout descarga los binarios; revisar cuota de almacenamiento y transferencia.');
    }
    for (const file of selected) {
        const absolutePath = path.join(sourceRoot, file);
        if (!fs.existsSync(absolutePath)) {
            errors.push(`Archivo versionado ausente: Project/${file}`);
            continue;
        }
        const data = fs.readFileSync(absolutePath);
        if (isLfsPointer(data)) {
            lfsFiles++;
            errors.push(`Puntero LFS sin descargar: Project/${file}`);
        }
        totalBytes += data.length;
        if (data.length > largestFile.bytes) largestFile = { path: file, bytes: data.length };
        if (data.length > 100 * 1024 * 1024) errors.push(`Archivo mayor a 100 MiB: Project/${file}. Revisar LFS/cuotas.`);
        else if (data.length > 50 * 1024 * 1024) warnings.push(`Archivo mayor a 50 MiB: Project/${file}.`);
    }
    if (totalBytes >= 1024 ** 3) errors.push('El juego alcanza o supera el límite de 1 GiB de GitHub Pages.');
    const { references } = validateReferences(selected, plugins, errors, warnings);
    const report = {
        commit: git('rev-parse', 'HEAD'), builtAt: new Date().toISOString(),
        files: selected.length, totalBytes, largestFile, unresolvedLfsPointers: lfsFiles,
        enabledPlugins: [...enabledPlugins], referencesChecked: references.length,
        errors: [...new Set(errors)], warnings: [...new Set(warnings)]
    };
    fs.writeFileSync(path.join(buildRoot, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    const lines = [
        '# Demo web de Wamai', '',
        `Commit: \`${report.commit}\``, '',
        `${report.files} archivos; ${(totalBytes / 1024 ** 2).toFixed(2)} MiB; ${report.referencesChecked} rutas verificadas.`, '',
        `Errores: ${report.errors.length}. Avisos: ${report.warnings.length}.`, '',
        ...report.errors.map(message => `- ERROR: ${message}`),
        ...report.warnings.map(message => `- AVISO: ${message}`)
    ];
    fs.writeFileSync(path.join(buildRoot, 'report.md'), lines.join('\n') + '\n');
    for (const message of report.errors) console.error(`ERROR: ${message}`);
    for (const message of report.warnings) console.warn(`AVISO: ${message}`);
    if (report.errors.length) throw new Error('No se publicará: revisar .pages-build/report.md.');

    for (const file of selected) {
        const destination = path.join(siteRoot, file);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.copyFileSync(path.join(sourceRoot, file), destination);
    }
    fs.writeFileSync(path.join(siteRoot, '.nojekyll'), '');
    fs.writeFileSync(path.join(siteRoot, 'demo-build.json'), JSON.stringify({
        commit: report.commit, builtAt: report.builtAt, files: report.files,
        totalBytes: report.totalBytes
    }, null, 2) + '\n');
    console.log(`Web lista: ${report.files} archivos, ${(totalBytes / 1024 ** 2).toFixed(2)} MiB.`);
    console.log('Salida: .pages-build/site | Informe: .pages-build/report.md');
    return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try { build(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
