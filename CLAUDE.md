# Web de Mada Apps

`https://madaapps.es`, en GitHub Pages (rama `main`, raíz), con el dominio en IONOS. El repositorio es
público porque Pages gratis lo exige: no subir nada que no pueda ser público.

## Textos legales

**`primrose-ai/*.html` y `aviso-legal.html` no se editan a mano.** Se generan con:

```
node _herramientas/generar-legales-primrose.mjs
```

Lee `res/raw/legal_*.txt` y `strings.xml` de la app (`../../MyGardenAI/MyGarden`) y
`_herramientas/contenido/`. Hay que ejecutarlo cada vez que cambie cualquiera de ellos, para que la
app y la web digan lo mismo.

La fecha de "Última actualización" solo se mueve si cambia el texto: `_herramientas/fechas-legales.json`
guarda una huella de lo publicado. Va al repositorio; no se toca a mano salvo para corregir una fecha.

Al añadir una app, el script se queda corto a propósito: hoy solo conoce Primrose AI.

## Direcciones

Si cambia la dirección de una página legal, hay que cambiarla también en:

- `web_url_*` en `values/strings.xml` de la app (y regenerar los textos de iOS),
- Play Console: política de privacidad y URL de eliminación de cuenta.

## Reglas

- **Solo fuentes con licencia que permita un repositorio público.** Cabinet Grotesk se quitó por eso.
- **`../assets/` no entra aquí**: es material de origen (99 MB).
- **Sin `.nojekyll`**: Jekyll es lo que impide publicar `_herramientas/`. `_config.yml` excluye este
  fichero.
- **Sin servicios externos**: las fuentes van alojadas aquí. El aviso legal dice que la web no usa
  cookies ni analítica; si eso cambia, hay que cambiar el aviso.
- **DNS en IONOS**: no tocar los MX ni el SPF, que son del correo, ni crear comodines (`*`).
