// Genera las páginas legales de Primrose AI a partir de los textos de la app.
//
//   node _herramientas/generar-legales-primrose.mjs
//
// Existe por un motivo concreto: **los textos legales tienen que decir lo mismo
// en la app y en la web**. La aplicación los lleva empaquetados en res/raw y
// Google Play exige publicarlos en una URL pública. Copiándolos a mano, el día
// que se retoque un párrafo la web se queda vieja sin que nadie se entere, y en
// un texto legal eso es decir dos cosas distintas sobre los datos de alguien.
//
// Hay que volver a ejecutarlo cada vez que cambie un fichero legal de res/raw,
// legal_owner, legal_contact, legal_nif o legal_address en strings.xml, o un
// texto de _herramientas/contenido/.
//
// Las carpetas que empiezan por "_" no se publican en GitHub Pages (por eso la
// web no lleva .nojekyll).
//
// ponytail: un solo script para una sola app. Cuando llegue la segunda, sacar
// PAGINAS y las rutas de la app a una configuración por app.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERRAMIENTAS = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERRAMIENTAS, '..');
const CONTENIDO = join(HERRAMIENTAS, 'contenido');
const DESTINO = join(WEB, 'primrose-ai');
const FECHAS = join(HERRAMIENTAS, 'fechas-legales.json');

// Dónde se publica. Solo para el canonical y las metas de compartir: los enlaces
// entre páginas son relativos.
const SITIO = 'https://madaapps.es/';

// La carpeta "res" de la app. Si la app cambia de sitio, esta línea es lo único
// que hay que cambiar.
const RES = join(WEB, '..', '..', 'MyGardenAI', 'MyGarden', 'app', 'src', 'main', 'res');
const RAW = join(RES, 'raw');

/**
 * Las páginas, en el orden en que salen en la web. `fuentes` se concatenan en
 * el orden dado. `indice` añade "En esta página" arriba: las páginas largas lo
 * piden; la de borrar datos no, porque lo que importa está ya a la vista.
 *
 * `destacar` lista títulos de apartado que se pintan en un recuadro aparte, para
 * lo que el lector tiene que hacer o no puede pasar por alto. Se identifican por
 * su título: si el texto de la app lo cambia, esto falla en vez de dejar de
 * destacarlo sin que nadie lo note. `asunto` es el asunto que llevan los enlaces
 * de correo dentro de esos recuadros.
 */
const PAGINAS = [
  {
    salida: 'privacidad.html',
    titulo: 'Protección de datos',
    entradilla: 'Qué datos registra Primrose AI, dónde se guardan y qué puedes hacer con ellos.',
    fuentes: [{ fichero: join(RAW, 'legal_datos.txt') }],
    indice: true,
  },
  {
    salida: 'terminos.html',
    titulo: 'Condiciones de uso',
    entradilla: 'Las condiciones que acepta quien usa la aplicación.',
    fuentes: [{ fichero: join(RAW, 'legal_terminos.txt') }],
    indice: true,
  },
  {
    salida: 'ia.html',
    titulo: 'Uso de inteligencia artificial',
    entradilla: 'Qué se envía al modelo, con qué límites, y hasta dónde llega lo que responde.',
    // Dos ficheros en una página: en la app son dos apartados plegables del
    // mismo bloque, y separarlos aquí obligaría a leer medio asunto. Cada
    // fichero abre con su título (h2) y sus apartados cuelgan de él (h3).
    fuentes: [
      { fichero: join(RAW, 'legal_ia.txt'), titulo: 'Cómo se tratan tus imágenes' },
      { fichero: join(RAW, 'legal_ia_limites.txt'), titulo: 'Límites de la información' },
    ],
    indice: true,
    // Lo único de la web que puede hacerle daño a alguien si se lee por encima:
    // la toxicidad y que la app no dice qué se puede comer ni tomar.
    destacar: ['Toxicidad', 'Consumo y usos medicinales'],
  },
  {
    salida: 'borrar-datos.html',
    titulo: 'Eliminar tus datos',
    entradilla: 'Cómo eliminar tu cuenta y todo lo que tenga asociado, con la aplicación instalada o sin ella.',
    fuentes: [{ fichero: join(CONTENIDO, 'primrose-borrar-datos.txt') }],
    // Las dos vías para pedir el borrado, que es a lo que se viene a esta
    // página, y lo que hay que hacer antes para no seguir pagando.
    destacar: ['Antes de borrar: cancela la suscripción', 'Desde la aplicación', 'Si ya la has desinstalado'],
    asunto: 'Eliminar mi cuenta',
  },
];

/**
 * El responsable y el correo salen de strings.xml, que es de donde los saca
 * también la aplicación. Leerlos de ahí y no repetirlos aquí es lo que evita que
 * la web nombre a un responsable y la app a otro.
 */
function valorDeStrings(nombre) {
  const xml = readFileSync(join(RES, 'values', 'strings.xml'), 'utf8');
  const encontrado = xml.match(new RegExp(`<string name="${nombre}"[^>]*>([^<]*)</string>`));
  if (!encontrado) throw new Error(`Falta ${nombre} en strings.xml`);
  return encontrado[1].trim();
}

const responsable = valorDeStrings('legal_owner');
const contacto = valorDeStrings('legal_contact');
const nif = valorDeStrings('legal_nif');
const domicilio = valorDeStrings('legal_address');

function escapar(texto) {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Parte el formato de res/raw en trozos de texto: los que empiezan por "# " son
 * subtítulos y el resto párrafos. Es deliberadamente pobre, igual que el que
 * pinta la aplicación: párrafos separados por una línea en blanco, y nada más,
 * porque nada más hay.
 *
 * Las líneas de dentro de un párrafo van cortadas a lo ancho del fichero y se
 * vuelven a unir: los saltos son del fichero, no del texto.
 *
 * **Un subtítulo se lleva solo su primera línea.** En los ficheros el "# " no
 * lleva línea en blanco detrás, así que el título y el párrafo que le sigue caen
 * en el mismo bloque; sin separarlos, el párrafo entero se pinta como título.
 */
function trozos(texto) {
  return texto
    .replace(/\r\n/g, '\n')
    .trim()
    .split(/\n\s*\n/)
    .flatMap((bloque) => {
      const limpio = bloque.trim();
      if (!limpio.startsWith('# ')) return [limpio];
      const salto = limpio.indexOf('\n');
      return salto === -1 ? [limpio] : [limpio.slice(0, salto), limpio.slice(salto + 1)];
    })
    .map((trozo) => trozo.trim().split('\n').map((l) => l.trim()).join(' '))
    .filter((trozo) => trozo.length > 0);
}

/**
 * El id de un título, para poder enlazarlo: en minúsculas, sin tildes y con
 * guiones. Si ya hay uno igual en la página se numera, porque un id repetido
 * lleva siempre al primero sin avisar.
 */
function idDe(texto, usados) {
  const base =
    texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'apartado';
  let id = base;
  for (let n = 2; usados.has(id); n++) id = `${base}-${n}`;
  usados.add(id);
  return id;
}

/**
 * Negrita entre dobles asteriscos, para marcar los nombres de la interfaz en los
 * textos propios de la web. Los textos de la app no llevan asteriscos; si alguno
 * los llevara, saldrían en negrita aquí y no en la app.
 */
function enNegrita(html) {
  return html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

/**
 * Los dos únicos enlaces que aparecen en estos textos, puestos a mano y no
 * detectando direcciones por su forma: un detector se equivoca con los puntos
 * finales y aquí solo hay dos casos. Se hace después de escapar para no romper
 * las comillas del atributo.
 *
 * Con `asunto`, el correo se abre ya con el asunto puesto.
 */
function enlazar(html, asunto) {
  const consulta = asunto ? `?subject=${encodeURIComponent(asunto)}` : '';
  return html
    .replaceAll(contacto, `<a href="mailto:${contacto}${consulta}">${contacto}</a>`)
    .replaceAll('www.aepd.es', '<a href="https://www.aepd.es" rel="noopener">www.aepd.es</a>');
}

/**
 * Pasa los trozos a html. Cada uno es `{ nivel, texto }` si es un título (2 o 3)
 * o `{ texto }` si es un párrafo. Devuelve también los títulos con su id, que es
 * lo que necesita el índice de la página.
 *
 * Un apartado de `destacar` va entero (título y párrafos hasta el siguiente
 * título) dentro de un recuadro. El `asunto` solo se pone a los correos de esos
 * recuadros: son los que dicen "escribe a…" para hacer algo, y el de otro
 * apartado, como "si algo no funciona", es otro asunto.
 */
function apartados(items, { destacar = [], asunto } = {}) {
  const usados = new Set();
  const titulos = [];
  const salida = [];
  let destacado = false;
  const cerrar = () => {
    if (destacado) salida.push('</div>');
    destacado = false;
  };

  for (const { nivel, texto } of items) {
    if (!nivel) {
      salida.push(`<p>${enNegrita(enlazar(escapar(texto), destacado ? asunto : undefined))}</p>`);
      continue;
    }
    cerrar();
    const id = idDe(texto, usados);
    titulos.push({ nivel, texto, id });
    destacado = destacar.includes(texto);
    if (destacado) salida.push('<div class="destacado">');
    salida.push(`<h${nivel} id="${id}">${enlazar(escapar(texto))}</h${nivel}>`);
  }
  cerrar();

  for (const t of destacar) {
    if (!titulos.some((x) => x.texto === t)) {
      throw new Error(`No hay ningún apartado "${t}" que destacar`);
    }
  }
  return { html: salida.join('\n'), titulos };
}

/**
 * "En esta página", plegado: las páginas largas son decenas de pantallas en un
 * móvil, pero desplegado empujaría el texto hacia abajo antes de empezar. Los
 * apartados de segundo nivel van sangrados, nada más: la lista es plana.
 */
function indicePagina(titulos) {
  const enlaces = titulos
    .map(({ nivel, texto, id }) => `    <li${nivel === 3 ? ' class="sub"' : ''}><a href="#${id}">${escapar(texto)}</a></li>`)
    .join('\n');
  return `<nav class="contenido" aria-label="En esta página">
  <details>
    <summary>En esta página</summary>
    <ul>
${enlaces}
    </ul>
  </details>
</nav>`;
}

/**
 * La fecha de "Última actualización" es la del último cambio del texto legal, y
 * no la de ejecutar este script: una regeneración por un cambio de diseño no
 * puede decir que la política cambió. Por eso se guarda una huella del texto
 * publicado en fechas-legales.json (va al repositorio) y la fecha solo se mueve
 * cuando la huella cambia.
 *
 * La huella sale del texto ya con los datos sustituidos, de modo que también
 * detecta un cambio de NIF o de domicilio, y sin las etiquetas, de modo que
 * retocar el html no mueve la fecha.
 */
function fechaDe(salida, html, fechas) {
  const huella = createHash('sha256')
    .update(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    .digest('hex');
  if (fechas[salida]?.huella !== huella) {
    fechas[salida] = { huella, fecha: new Date().toISOString().slice(0, 10) };
  }
  return new Date(`${fechas[salida].fecha}T12:00:00`).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Una página completa. `ruta` es su dirección dentro de la web y `raiz` el camino
 * relativo hasta la raíz, porque las de cada app van en su carpeta y el aviso
 * legal no. Las de una app añaden la vuelta a su ficha y sus otros documentos.
 *
 * El canonical y las metas de compartir llevan el dominio entero: quien lee esas
 * metas (WhatsApp, Telegram, Slack…) no resuelve rutas relativas.
 */
function pagina({ ruta, raiz, marca, titulo, entradilla, cuerpo, actualizado, esDeApp }) {
  const otras = PAGINAS.filter((p) => `primrose-ai/${p.salida}` !== ruta)
    .map((p) => `        <li><a href="${p.salida}">${escapar(p.titulo)}</a></li>`)
    .join('\n');
  const descripcion = escapar(entradilla);
  const nombre = `${escapar(titulo)} · ${marca}`;
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<!-- Generado por _herramientas/generar-legales-primrose.mjs. No editar a mano. -->
<title>${nombre}</title>
<meta name="description" content="${descripcion}">
<link rel="canonical" href="${SITIO}${ruta}">
<meta name="theme-color" content="#ffffff">
<link rel="icon" href="${raiz}assets/icono.png" type="image/png">
<link rel="apple-touch-icon" href="${raiz}assets/icono.png">
<meta property="og:site_name" content="Mada Apps">
<meta property="og:type" content="website">
<meta property="og:locale" content="es_ES">
<meta property="og:title" content="${nombre}">
<meta property="og:description" content="${descripcion}">
<meta property="og:url" content="${SITIO}${ruta}">
<meta property="og:image" content="${SITIO}assets/primrose-logo.jpg">
<meta property="og:image:width" content="1024">
<meta property="og:image:height" content="926">
<meta property="og:image:alt" content="Primrose AI">
<link rel="preload" as="font" type="font/woff2" href="${raiz}assets/fonts/InstrumentSans-Variable-latin.woff2" crossorigin>
<link rel="stylesheet" href="${raiz}assets/legal.css">
</head>
<body>

<header class="cabecera">
  <a href="${raiz}index.html" class="logo">Mada Apps</a>
  <nav>
    <a href="${raiz}index.html#aplicaciones" class="active">Aplicaciones</a>
    <a href="${raiz}index.html#contacto">Contacto</a>
  </nav>
</header>

<div class="pagina">${
    esDeApp
      ? `
  <a class="volver" href="${raiz}index.html#app/primrose-ai" aria-label="Volver a Primrose AI">
    <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M46 24H3M19 8 3 24l16 16"/></svg>
    <span>Primrose AI</span>
  </a>`
      : ''
  }
  <h1>${escapar(titulo)}</h1>
  <p class="entradilla">${descripcion}</p>

  <main class="legal">
${cuerpo}
  </main>

  <footer class="pie">${
    esDeApp
      ? `
    <nav aria-label="Otros documentos de Primrose AI">
      <p class="pie-titulo">Más sobre Primrose AI</p>
      <ul>
${otras}
      </ul>
    </nav>`
      : ''
  }
    <p>Responsable: ${escapar(responsable)} &middot; <a href="mailto:${contacto}">${contacto}</a></p>
    <p>Última actualización: ${actualizado}</p>${
      esDeApp
        ? `
    <p><a href="${raiz}aviso-legal.html">Aviso legal</a></p>`
        : ''
    }
  </footer>
</div>

<button class="arriba" type="button" aria-label="Volver arriba">
  <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 46V3M8 19 24 3l16 16"/></svg>
</button>
<script>
  document.querySelector('.arriba').addEventListener('click', () =>
    scrollTo({top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'}));
</script>

</body>
</html>
`;
}

function itemsDe(fuentes) {
  return fuentes.flatMap(({ fichero, titulo }) => {
    const texto = readFileSync(fichero, 'utf8')
      .replaceAll('{responsable}', responsable)
      .replaceAll('{contacto}', contacto)
      .replaceAll('{nif}', nif)
      .replaceAll('{domicilio}', domicilio);
    // Un marcador nuevo en los textos que no se sustituya aquí saldría tal cual
    // en la página legal; mejor que la web no se genere.
    const suelto = texto.match(/\{[a-z]+\}/);
    if (suelto) throw new Error(`${fichero}: ${suelto[0]} sin sustituir`);
    // Un fichero con título propio es un grupo (h2) y sus apartados cuelgan de
    // él (h3); sin título, los apartados son el primer nivel de la página.
    const nivel = titulo ? 3 : 2;
    return [
      ...(titulo ? [{ nivel: 2, texto: titulo }] : []),
      ...trozos(texto).map((t) => (t.startsWith('# ') ? { nivel, texto: t.slice(2) } : { texto: t })),
    ];
  });
}

const fechas = existsSync(FECHAS) ? JSON.parse(readFileSync(FECHAS, 'utf8')) : {};
mkdirSync(DESTINO, { recursive: true });

for (const p of PAGINAS) {
  const { html, titulos } = apartados(itemsDe(p.fuentes), p);
  const cuerpo = (p.indice ? indicePagina(titulos) + '\n' : '') + html;
  const actualizado = fechaDe(p.salida, cuerpo, fechas);
  const ruta = `primrose-ai/${p.salida}`;
  writeFileSync(
    join(DESTINO, p.salida),
    pagina({ ...p, ruta, raiz: '../', marca: 'Primrose AI · Mada Apps', cuerpo, actualizado, esDeApp: true })
  );
  console.log('✓', ruta);
}

// El aviso legal es de la web entera y no de una app. Sale de aquí para que el
// NIF y el domicilio vengan de strings.xml, igual que en las páginas de la app.
const { html: aviso } = apartados(itemsDe([{ fichero: join(CONTENIDO, 'aviso-legal.txt') }]));
writeFileSync(
  join(WEB, 'aviso-legal.html'),
  pagina({
    ruta: 'aviso-legal.html',
    raiz: '',
    marca: 'Mada Apps',
    titulo: 'Aviso legal',
    entradilla: 'Quién hay detrás de esta web y qué datos recoge.',
    cuerpo: aviso,
    actualizado: fechaDe('aviso-legal.html', aviso, fechas),
    esDeApp: false,
  })
);
console.log('✓ aviso-legal.html');

writeFileSync(FECHAS, JSON.stringify(fechas, null, 2) + '\n');
