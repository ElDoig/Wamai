# Demo web automática con GitHub Pages

El proyecto de RPG Maker MZ está en `Project/` y su entrada web es
`Project/index.html`. El motor ya carga scripts, JSON, imágenes, sonidos,
fuentes y animaciones mediante rutas relativas. No hace falta exportar desde
RPG Maker para cada actualización, instalar dependencias npm ni tener backend.

El remoto configurado es `https://github.com/ElDoig/Wamai.git` y la rama
principal actual es `main`. La URL esperada, sin dominio personalizado, es:

**https://eldoig.github.io/Wamai/**

La URL empezará a funcionar después de habilitar Pages y completar el primer
despliegue. Respeta la mayúscula de `Wamai` y la barra final.

## Activación inicial en GitHub

1. Guarda y sube estos cambios mediante tu flujo habitual. La configuración
   debe estar en `main`. Este trabajo no realiza commits ni push automáticamente.
2. En el repositorio abre **Settings → Pages**.
3. En **Build and deployment → Source**, selecciona **GitHub Actions**.
   No necesitas crear otro workflow ni una rama `gh-pages`.
4. Si GitHub Actions está desactivado para el repositorio, habilítalo en
   **Settings → Actions → General**. Si usas una lista de acciones permitidas,
   permite las acciones oficiales `actions/checkout`, `actions/setup-node`,
   `actions/configure-pages`, `actions/upload-pages-artifact` y `actions/deploy-pages`.
5. Abre **Actions → Publicar demo web → Run workflow**, elige `main` y ejecútalo.
   También se ejecutará solo con el siguiente push a `main`.
6. Si el entorno `github-pages` tiene revisores obligatorios, requerirá su
   aprobación. Para despliegue automático, la configuración de ese entorno debe
   permitir desplegar `main` sin aprobación manual. No cambies protecciones de
   otros entornos.

No se requieren contraseñas, tokens personales ni secretos nuevos. El workflow
usa el `GITHUB_TOKEN` efímero y permisos de publicación solo en el job de despliegue.
No habilita Pages ni cambia la visibilidad del repositorio por su cuenta.

**Costo:** GitHub Pages está disponible con GitHub Free en repositorios públicos.
En repositorios privados requiere un plan compatible (Pro/Team/Enterprise), y
Actions está sujeto a la cuota del plan. La consulta pública al remoto devolvió
404 durante la preparación; eso no permite confirmar su visibilidad ni el plan
de la cuenta. Si el repositorio es privado y la cuenta solo tiene GitHub Free,
esta combinación no satisface S/0 manteniendo el repositorio privado. No se ha
cambiado la visibilidad. La demo de Pages normalmente es pública, no una beta
protegida con contraseña.

## Qué publica

El script copia únicamente archivos versionados de `Project/` a
`.pages-build/site/`, que es la única carpeta que recibe GitHub Pages:

- `index.html`, CSS, motor JavaScript, librerías y WebAssembly.
- `js/plugins.js` y los scripts de plugins actualmente activos.
- Los JSON de base de datos y mapas (incluyen eventos y diálogos).
- Imágenes, audio, fuentes, efectos con sus texturas/modelos y videos.
- Archivos de licencia/condiciones asociados a los recursos.

Se conservan todos los recursos de las carpetas del juego, aunque el análisis
estático no los encuentre referenciados. Esto cubre recursos cargados
dinámicamente por plugins. Solo se seleccionan extensiones de ejecución conocidas;
si incorporas un plugin que usa otro formato, actualiza la tabla
`allowedExtensions` del script y sus comprobaciones.

Quedan fuera `Project/save/`, `package.json` de NW.js, `game.rmmzproject`, bases
`Test_*.json`, archivos de prueba `Event.json`, plugins inactivos, ZIP, archivos
de edición, metadatos ocultos, credenciales con nombres reconocibles y las
carpetas de materiales que están fuera de `Project/`.

El proceso copia los archivos del juego sin modificar su contenido. Agrega solo
`.nojekyll` y `demo-build.json` al artefacto. No cambia mapas, lógica, mecánicas,
inicio del juego, parámetros de plugins ni configuración del editor.

## Desarrollo y actualizaciones

1. Edita en RPG Maker y guarda el proyecto como siempre.
2. Añade los archivos nuevos a Git, haz commit y push a `main`.
3. Actions valida y prepara la copia web, la sube y despliega en la misma URL.
4. Comparte el enlace: no cambia con cada versión.

Si el build o la verificación falla, el job de despliegue no se ejecuta y la
versión anterior sigue publicada. Los resultados aparecen en el resumen del
workflow. Las ejecuciones se agrupan para evitar publicaciones simultáneas.
`Run workflow` permite repetir una publicación sin crear cambios artificiales.

Los recursos solo presentes en tu PC no llegarán a GitHub: el empaquetador avisa
de archivos de ejecución locales que están ignorados o aún no se añadieron a Git.
Un archivo esencial no versionado impide construir la demo.

## Comprobación local (opcional)

Con Git y Node.js 24, ejecuta desde la raíz del repositorio:

```powershell
node --test scripts/pages/build.test.mjs
node scripts/pages/build.mjs
node scripts/pages/verify.mjs
node scripts/pages/serve.mjs
```

Abre **http://127.0.0.1:4173/Wamai/**. El servidor local reproduce la subruta de
Pages y la sensibilidad a mayúsculas incluso en Windows. Termínalo con Ctrl+C.
No intentes probar la web abriendo `index.html` como `file://`.

La salida, los informes y los archivos temporales de pruebas quedan dentro de
`.pages-build/`, excluida por `.gitignore`. El directorio `site/` se regenera en
cada build. Los scripts no escriben dentro de `Project/`.

## Comprobar la demo publicada

1. En **Actions** comprueba que los jobs de preparación y despliegue estén verdes.
2. Usa el enlace del entorno `github-pages` o el mostrado en **Settings → Pages**.
3. Abre `https://eldoig.github.io/Wamai/demo-build.json`: el campo `commit` debe
   coincidir con el commit que acabas de subir. No contiene credenciales.
4. Inicia una partida nueva y prueba movimiento, diálogo, combate, audio,
   combos, parry, barra de turnos y cambio Usami/Michi. Haz clic en el juego
   para que reciba el teclado y el navegador habilite el audio.
5. Si aparece una versión anterior, recarga con Ctrl+F5. Las partidas se guardan
   en el almacenamiento de ese navegador; no se suben partidas de tu PC ni se
   sincronizan entre amigos. Un save antiguo puede conservar datos anteriores.

En caso de un recurso ausente, F12 → Network permite identificar su ruta exacta.
Comprueba mayúsculas, espacios y extensión: en Linux `Actor1.png` y `actor1.png`
son archivos diferentes. El empaquetador detecta colisiones y referencias que
solo coinciden ignorando mayúsculas y detiene la publicación.

## Validación y límites

En la preparación inicial se generaron **1,398 archivos / 112.11 MiB**, con
**408 referencias de recursos verificadas**, sin avisos de recursos ausentes,
colisiones ni punteros LFS. Los nombres con espacios y `$` se mantienen.
El plugin antiguo `Input Combo Skills` usa `require()` de Node pero está
desactivado y se excluye. Si lo activas, revisa su compatibilidad web.

La revisión estática comprueba arranque, JSON, mapa inicial, mapas de MapInfos,
fuentes, recursos del motor, plugins activos, parámetros de archivo y referencias
habituales de la base de datos y eventos. No interpreta scripts arbitrarios ni
reemplaza probar las mecánicas dentro del navegador.

La comprobación HTTP solicita todos los archivos publicados bajo `/Wamai/`,
verifica que respondan correctamente, comprueba que los excluidos no se sirvan y
compara cada archivo del juego byte por byte contra el original. Las pruebas
cubren exclusiones, mayúsculas, símbolos, WebAssembly y punteros LFS.

- Actualmente `.gitattributes` no configura Git LFS y no hay archivos LFS.
  El checkout tiene `lfs: true` y la validación rechaza punteros sin descargar.
  Si adoptas LFS, revisa sus cuotas de almacenamiento/transferencia para conservar S/0.
- El archivo publicado más grande es `js/libs/pixi.js`, de aproximadamente
  1.36 MiB. GitHub advierte por archivos mayores a 50 MiB y bloquea los mayores
  a 100 MiB en Git normal. El empaquetador también comprueba esos tamaños.
- Pages admite sitios de hasta 1 GB y tiene un límite flexible de 100 GB de
  transferencia mensual. Los tamaños actuales están muy por debajo del límite
  del sitio; todos los recursos se descargan desde el navegador según se usan.
- Pages sirve el juego y sus recursos al público. Revisa qué contenido decides
  añadir a `Project/`; una lista de formatos no detecta secretos escritos dentro
  de código, diálogos o imágenes.

Fuentes oficiales:

- [Configurar GitHub Actions como origen de Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).
- [Workflow de Pages y permisos de despliegue](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
- [Planes compatibles y límites de Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).
- [Límites de archivos en GitHub](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github).
