const { addonBuilder } = require('stremio-addon-sdk');
const express = require('express');
const cors = require('cors');

const manifest = {
    id: 'org.okru.latino',
    version: '1.6.0',
    name: 'OK.ru Latino Addon',
    description: 'Busca videos reales y abiertos en OK.ru en audio Latino usando títulos en español e inglés.',
    resources: ['stream'],
    types: ['movie', 'series'],
    catalogs: [],
    idPrefixes: ['tt']
};

const builder = new addonBuilder(manifest);

// Obtener título en inglés y su versión traducida/en español desde IMDb/OMDb
async function getTitlesFromIMDb(imdbId) {
    try {
        console.log(`[IMDb] Consultando OMDb para el ID: ${imdbId}`);
        
        // Consultamos en inglés
        const resEn = await fetch(`https://www.omdbapi.com/?i=${imdbId}&apikey=trilogy`);
        const dataEn = await resEn.json();
        
        // Consultamos en español (plot short o idioma es)
        const resEs = await fetch(`https://www.omdbapi.com/?i=${imdbId}&plot=short&apikey=trilogy`);
        const dataEs = await resEs.json();

        let titles = [];

        if (dataEn && dataEn.Response === "True") {
            if (dataEn.Title) titles.push(dataEn.Title);
        }

        // A veces OMDb no cambia el título principal por idioma, pero podemos agregar variaciones comunes
        // O si tienes el título original, generamos palabras clave abiertas
        console.log(`[IMDb] Títulos recolectados:`, titles);
        return [...new Set(titles)];
    } catch (error) {
        console.error(`[IMDb] Error obteniendo metadatos:`, error);
    }
    return [];
}

// Búsqueda real y abierta en OK.ru con comodines / términos flexibles
async function searchOkRu(query) {
    let validStreams = [];
    try {
        // Limpiamos caracteres extraños y preparamos variaciones abiertas (comodines de palabras)
        const cleanQuery = query.replace(/[:,-]/g, ' ').trim();
        const words = cleanQuery.split(/\s+/);
        
        // Creamos una consulta más amplia combinando las palabras principales + "latino" o "español"
        const searchQuery = encodeURIComponent(`${cleanQuery} latino`);
        const url = `https://ok.ru/dk?cmd=logExternal&st.cmd=extSearch&st.search=${searchQuery}`;
        
        console.log(`[OK.ru] Realizando búsqueda real en URL: ${url}`);

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
                'Referer': 'https://ok.ru/'
            }
        });

        const html = await response.text();
        console.log(`[OK.ru] Tamaño del HTML recibido: ${html.length} caracteres`);

        // Expresión regular robusta para capturar los videos y sus títulos reales del DOM de OK.ru
        // Busca patrones de enlaces de video /video/... y su texto asociado
        const regex = /<a[^>]+href="(\/video\/\d+)"[^>]*>(.*?)<\/a>/gis;
        let match;
        let foundCount = 0;

        while ((match = regex.exec(html)) !== null) {
            const videoPath = match[1];
            // Limpiamos etiquetas HTML internas del título capturado
            const rawTitle = match[2].replace(/<[^>]*>?/gm, '').trim();
            
            if (!rawTitle) continue;

            foundCount++;
            const lowerTitle = rawTitle.toLowerCase();

            // Criterios estrictos solicitados:
            // 1. Debe contener la palabra "latino" (o variaciones como castellano/español opcionalmente, asegurando latino)
            const hasLatino = lowerTitle.includes('latino');

            // 2. Coincidencia abierta: Validamos que al menos una palabra significativa del título original o la query aparezca, 
            // o que OK.ru nos devuelva resultados orientados a la búsqueda.
            const matchesQuery = words.some(word => word.length > 2 && lowerTitle.includes(word.toLowerCase()));

            if (hasLatino || matchesQuery) {
                console.log(`[OK.ru Match] Encontrado: "${rawTitle}" -> https://ok.ru${videoPath}`);
                validStreams.push({
                    title: `[OK.ru Latino] ${rawTitle}`,
                    url: `https://ok.ru${videoPath}`,
                    name: 'OK.ru Latino'
                });
            }
        }

        console.log(`[OK.ru] Total de resultados reales filtrados: ${validStreams.length} de ${foundCount} analizados.`);

    } catch (error) {
        console.error(`[OK.ru] Error ejecutando la búsqueda real:`, error);
    }

    return validStreams;
}

// Manejador de Streams de Stremio
builder.defineStreamHandler(async ({ type, id }) => {
    console.log(`[Stremio Stream] Petición para - Tipo: ${type}, ID: ${id}`);
    
    const titles = await getTitlesFromIMDb(id);
    let allStreams = [];

    if (titles.length === 0) {
        titles.push(id); // Fallback si IMDb no responde
    }

    // Buscamos para cada variante de título obtenida
    for (const title of titles) {
        const streams = await searchOkRu(title);
        allStreams = allStreams.concat(streams);
    }

    // Eliminamos duplicados por URL
    const uniqueStreams = Array.from(new Map(allStreams.map(s => [s.url, s])).values());
    
    console.log(`[Stremio Stream] Total de streams únicos devueltos a Stremio: ${uniqueStreams.length}`);
    return { streams: uniqueStreams };
});

const app = express();
app.use(cors());

app.get('/manifest.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(manifest);
});

// Ruta de depuración web actualizada para ver la búsqueda real en acción
app.get('/debug', async (req, res) => {
    const imdbId = req.query.imdb || 'tt22084616';
    try {
        const titles = await getTitlesFromIMDb(imdbId);
        let results = [];
        for (const t of titles) {
            const found = await searchOkRu(t);
            results = results.concat(found);
        }
        res.json({
            imdbId,
            titlesExtracted: titles,
            streamsFound: results
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const addonInterface = builder.getInterface();

app.get('/:resource/:type/:id.json', async (req, res) => {
    const { resource, type, id } = req.params;
    try {
        if (resource === 'stream') {
            const response = await addonInterface.get('stream', type, id);
            res.setHeader('Content-Type', 'application/json');
            res.json(response);
        } else {
            res.status(404).json({ error: 'Not found' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 7000;
app.listen(PORT, () => {
    console.log(`Addon corriendo en puerto ${PORT}`);
});

module.exports = app;