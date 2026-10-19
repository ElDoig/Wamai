// Vista previa local bajo /Wamai/, igual que un proyecto en GitHub Pages.
import * as fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { siteRoot } from './build.mjs';

const mimeTypes = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
    '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
    '.webm': 'video/webm', '.mp4': 'video/mp4'
};

export function createPreviewServer(root = siteRoot) {
    const absoluteRoot = path.resolve(root);
    return createServer((request, response) => {
        const respond = (status, text) => {
            response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
            response.end(request.method === 'HEAD' ? undefined : text);
        };
        if (!['GET', 'HEAD'].includes(request.method)) return respond(405, 'Solo GET y HEAD.');
        let pathname;
        try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
        catch { return respond(400, 'Ruta inválida.'); }
        if (pathname === '/Wamai') {
            response.writeHead(302, { Location: '/Wamai/' });
            return response.end();
        }
        if (!pathname.startsWith('/Wamai/')) return respond(404, 'Usa /Wamai/.');
        const relativePath = pathname.slice('/Wamai/'.length) || 'index.html';
        if (relativePath.includes('\\') || relativePath.includes('\0') ||
            relativePath.split('/').some(part => part === '..' || part.startsWith('.'))) {
            return respond(403, 'Ruta no publicada.');
        }
        const filename = path.resolve(absoluteRoot, relativePath);
        if (!filename.startsWith(absoluteRoot + path.sep)) return respond(403, 'Ruta no publicada.');
        // Verificación exacta incluso en Windows: reproduce el servidor Linux.
        let currentDirectory = absoluteRoot;
        for (const segment of relativePath.split('/')) {
            if (!fs.existsSync(currentDirectory) ||
                !fs.statSync(currentDirectory).isDirectory() ||
                !fs.readdirSync(currentDirectory).includes(segment)) return respond(404, 'Archivo no encontrado.');
            currentDirectory = path.join(currentDirectory, segment);
            if (fs.lstatSync(currentDirectory).isSymbolicLink()) return respond(403, 'Enlace no publicado.');
        }
        if (!fs.statSync(filename).isFile()) return respond(404, 'Archivo no encontrado.');
        response.writeHead(200, {
            'Content-Type': mimeTypes[path.extname(filename)] || 'application/octet-stream',
            'Content-Length': fs.statSync(filename).size,
            'Cache-Control': 'no-store'
        });
        if (request.method === 'HEAD') return response.end();
        const stream = fs.createReadStream(filename);
        stream.on('error', () => response.destroy());
        stream.pipe(response);
    });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    if (!fs.existsSync(path.join(siteRoot, 'index.html'))) {
        console.error('Primero ejecuta: node scripts/pages/build.mjs');
        process.exitCode = 1;
    } else {
        createPreviewServer().listen(4173, '127.0.0.1', () => {
            console.log('Vista previa: http://127.0.0.1:4173/Wamai/ (Ctrl+C para terminar)');
        });
    }
}
